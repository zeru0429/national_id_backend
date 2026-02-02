const fs = require("fs");
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf");

// Use the bundled worker (legacy build works fine for Node)
pdfjsLib.GlobalWorkerOptions.workerSrc =
  require.resolve("pdfjs-dist/legacy/build/pdf.worker.js");

function cleanValue(value) {
  return value
    .replace(/\s+/g, " ") // replace multiple spaces with single space
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // remove invisible unicode chars
    .trim(); // remove leading/trailing spaces
}

/**
 * Normalize extracted text for consistent parsing
 */
function normalizeText(text) {
  return (
    text
      // Normalize Unicode (important for Amharic)
      .normalize("NFC")
      // Replace multiple spaces/tabs with single space
      .replace(/[ \t]+/g, " ")
      // Normalize line breaks
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      // Remove zero-width characters that can interfere with matching
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .trim()
  );
}

async function extractTextFromPDF(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const items = textContent.items;

    // Sort items by Y position (top to bottom), then X (left to right)
    const sortedItems = items
      .filter((item) => item.str && item.str.trim())
      .sort((a, b) => {
        const yDiff = b.transform[5] - a.transform[5]; // Y is inverted in PDF
        if (Math.abs(yDiff) > 5) return yDiff;
        return a.transform[4] - b.transform[4]; // X position
      });

    // Group items by Y position to preserve line structure
    let lastY = null;
    const pageLines = [];
    let currentLine = "";

    for (const item of sortedItems) {
      const y = item.transform[5];
      const text = item.str;

      if (lastY !== null && Math.abs(y - lastY) > 8) {
        // New line detected
        if (currentLine.trim()) {
          pageLines.push(currentLine.trim());
        }
        currentLine = text;
      } else {
        // Same line - add space between spans if needed
        currentLine +=
          (currentLine && !currentLine.endsWith(" ") ? " " : "") + text;
      }
      lastY = y;
    }

    // Don't forget the last line
    if (currentLine.trim()) {
      pageLines.push(currentLine.trim());
    }

    fullText += pageLines.join("\n") + "\n";
  }

  return normalizeText(fullText);
}

function extractFCN(text) {
  // FCN format: 4 groups of 4 digits, may have various separators
  const patterns = [
    /FCN[:\s]*(\d{4}[\s.-]*\d{4}[\s.-]*\d{4}[\s.-]*\d{4})/i,
    /nce[:\s]*(\d{4}[\s.-]*\d{4}[\s.-]*\d{4}[\s.-]*\d{4})/i,
    // Look for standalone 16-digit pattern with flexible separators
    /\b(\d{4}[\s.-]+\d{4}[\s.-]+\d{4}[\s.-]+\d{4})\b/,
    // Continuous 16 digits
    /\b(\d{16})\b/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      // Normalize: extract only digits and format with spaces
      const digits = match[1].replace(/\D/g, "");
      if (digits.length === 16) {
        return `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8, 12)} ${digits.slice(12, 16)}`;
      }
    }
  }

  return "";
}

function extractNames(text) {
  let name_am = "";
  let name_en = "";

  // Amharic name (next line after label)
  const amMatch = text.match(/ሙሉ\s*ስም.*?\n([ሀ-ፚ\s]+)\n/u);

  if (amMatch) {
    name_am = cleanValue(amMatch[1]);
  }

  // English name appears after FCN and ends before newline
  const enMatch = text.match(
    /FCN:\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s+([A-Za-z\s]+)\n/,
  );

  if (enMatch) {
    name_en = cleanValue(enMatch[1]);
  }

  return { name_am, name_en };
}

function extractDates(text) {
  let date_of_birth_am = "";
  let date_of_birth_en = "";

  const match = text.match(
    /Date of Birth\s*.*?\n(\d{2}\/\d{2}\/\d{4})\s+.*?\n(\d{4}\/\d{2}\/\d{2})/u,
  );

  if (match) {
    date_of_birth_am = match[1];
    date_of_birth_en = match[2];
  }

  return { date_of_birth_am, date_of_birth_en };
}

function extractSex(text) {
  let sex_am = "";
  let sex_en = "";

  const match = text.match(
    /ፆታ\s*\/\s*SEX[\s\S]*?\n(ሴት|ወንድ).*?Disclaimer:.*?\b(Female|Male)\b/u,
  );

  if (match) {
    sex_am = match[1].trim();
    sex_en = match[2].trim();
  }

  return { sex_am, sex_en };
}

function extractNationality(text) {
  let nationality_am = "";
  let nationality_en = "";

  // Check for Ethiopian nationality
  if (/Ethiopian/i.test(text)) {
    nationality_en = "Ethiopian";
  }

  if (/ኢትዮጵያዊ/.test(text)) {
    nationality_am = "ኢትዮጵያዊ";
  }

  // Default to Ethiopian if ID card context is detected
  if (!nationality_en && /Ethiopia|Ethiopian\s*Digital|ኢትዮጵያ/i.test(text)) {
    nationality_en = "Ethiopian";
  }
  if (!nationality_am && nationality_en === "Ethiopian") {
    nationality_am = "ኢትዮጵያዊ";
  }

  return { nationality_am, nationality_en };
}

function extractPhoneNumber(text) {
  // Ethiopian phone patterns: 09XXXXXXXX, +2519XXXXXXXX, 2519XXXXXXXX
  const phonePatterns = [
    /Phone\s*(?:Number)?[:\s]*((?:\+251|251|0)9\d{8})/i,
    /ስልክ[:\s]*((?:\+251|251|0)9\d{8})/u,
    /\b(09\d{8})\b/,
    /(\+2519\d{8})/,
    /(2519\d{8})/,
  ];

  for (const pattern of phonePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      // Normalize to 09XXXXXXXX format
      let phone = match[1].replace(/^\+251/, "0").replace(/^251/, "0");
      return phone;
    }
  }

  return "";
}
function extractRegion(text) {
  let region_am = "";
  let region_en = "";

  // === 1️⃣ Try to extract directly after Date of Birth lines ===
  // Many IDs have this format:
  // 25/09/1981 ደቡብ ኢትዮጵያ ክልል
  // 1989/06/02 South Ethiopia Region
  const dobRegionMatch = text.match(
    /\d{2}\/\d{2}\/\d{4}\s*([ሀ-ፚ\s]+ክልል)\s*\n\d{4}\/\d{2}\/\d{2}\s*([A-Za-z\s]+Region)/u,
  );

  if (dobRegionMatch) {
    region_am = dobRegionMatch[1].trim();
    region_en = dobRegionMatch[2].trim();
    return { region_am, region_en };
  }

  // === 2️⃣ If above fails, use pattern mapping for common regions ===
  const regionMappings = [
    {
      en: "Addis Ababa",
      am: "አዲስ አበባ",
      patterns: [/Addis\s*Ababa/i, /አዲስ\s*አበባ/u],
    },
    { en: "Dire Dawa", am: "ድሬ ዳዋ", patterns: [/Dire\s*Dawa/i, /ድሬ\s*ዳዋ/u] },
    { en: "Afar Region", am: "አፋር ክልል", patterns: [/Afar/i, /አፋር/u] },
    { en: "Amhara Region", am: "አማራ ክልል", patterns: [/Amhara/i, /አማራ/u] },
    {
      en: "Benishangul-Gumuz Region",
      am: "ቤንሻንጉል ጉሙዝ ክልል",
      patterns: [/Benishangul/i, /ቤንሻንጉል/u],
    },
    { en: "Gambela Region", am: "ጋምቤላ ክልል", patterns: [/Gambela/i, /ጋምቤላ/u] },
    { en: "Harari Region", am: "ሐረሪ ክልል", patterns: [/Harari/i, /ሐረሪ/u] },
    { en: "Oromia Region", am: "ኦሮሚያ ክልል", patterns: [/Oromia/i, /ኦሮሚያ/u] },
    { en: "Somali Region", am: "ሶማሌ ክልል", patterns: [/Somali/i, /ሶማሌ/u] },
    { en: "Tigray Region", am: "ትግራይ ክልል", patterns: [/Tigray/i, /ትግራይ/u] },

    // New regions formed from the former SNNPR
    { en: "Sidama Region", am: "ሲዳማ ክልል", patterns: [/Sidama/i, /ሲዳማ/u] },
    {
      en: "South West Ethiopia Peoples' Region",
      am: "ደቡብ ምዕራብ ኢትዮጵያ ክልል",
      patterns: [/South\s*West/i, /ደቡብ\s*ምዕራብ/u],
    },
    {
      en: "South Ethiopia Regional State",
      am: "ደቡብ ኢትዮጵያ ክልል",
      patterns: [/South\s*Ethiopia/i, /ደቡብ\s*ኢትዮጵያ/u],
    },
    {
      en: "Central Ethiopia Regional State",
      am: "መካከለኛ ኢትዮጵያ ክልል",
      patterns: [/Central\s*Ethiopia/i, /መካከለኛ\s*ኢትዮጵያ/u],
    },
  ];

  for (const region of regionMappings) {
    for (const pattern of region.patterns) {
      if (pattern.test(text)) {
        region_am = region.am;
        region_en = region.en;
        return { region_am, region_en };
      }
    }
  }

  // === 3️⃣ Generic fallback using regex ===
  const regionEnMatch = text.match(/([A-Za-z]+(?:\s+[A-Za-z]+)?)\s+Region/i);
  if (regionEnMatch) {
    region_en = `${regionEnMatch[1]} Region`;
  }

  const regionAmMatch = text.match(/([ሀ-ፚ]+(?:\s+[ሀ-ፚ]+)?)\s*ክልል/u);
  if (regionAmMatch) {
    region_am = `${regionAmMatch[1]} ክልል`;
  }

  return { region_am, region_en };
}


function extractWoreda(text) {
  let woreda_am = "";
  let woreda_en = "";

  // Capture 2 lines after "Woreda"
  const match = text.match(/ወረዳ\s*\/\s*Woreda\s*\n(.+)\n(.+)/u);

  if (match) {
    const line1 = match[1].trim(); // Ethiopia + Amharic woreda
    const line2 = match[2].trim(); // Ethiopian + English woreda

    // Remove "Ethiopia" prefix from Amharic line
    woreda_am = line1.replace(/^Ethiopia\s*/i, "").trim();

    // Remove "Ethiopian" prefix from English line
    woreda_en = line2.replace(/^Ethiopian\s*/i, "").trim();
  }

  return { woreda_am, woreda_en };
}

function extractZone(text) {
  let zone_am = "";
  let zone_en = "";

  // Match Amharic zone after SEX, English after Disclaimer
  const match = text.match(
    /ፆታ\s*\/\s*SEX\s*.*\n([ሀ-ፚ\s]+)\s+.*Disclaimer:\s*(Female|Male)\s+([A-Za-z\s]+)\b/,
  );
  if (match) {
    // Zone Amharic may include sex, so remove sex if present
    zone_am = match[1].replace(/ሴት|ወንድ/, "").trim();
    zone_en = match[3].trim();
  }

  return { zone_am, zone_en };
}

async function extractDataFromPDF(file) {
  try {
    // Validate file type for Node.js string paths
    const filePath = typeof file === "string" ? file : file.name;
    if (!filePath.toLowerCase().endsWith(".pdf")) {
      return {
        success: false,
        error: "Invalid file type. Please upload a PDF file.",
      };
    }

    // If file is a path string, read it as a buffer
    let buffer;
    if (typeof file === "string") {
      buffer = fs.readFileSync(file);
      // Convert buffer to a pseudo "file" object compatible with extractTextFromPDF
      file = {
        arrayBuffer: async () =>
          buffer.buffer.slice(
            buffer.byteOffset,
            buffer.byteOffset + buffer.byteLength,
          ),
      };
    }

    const text = await extractTextFromPDF(file);

    // console.log("Extracted text:", text); // Debug: log extracted text

    if (!text || text.trim().length < 50) {
      return {
        success: false,
        error:
          "Could not extract text from the PDF. The file may be empty, corrupted, or contain only images.",
      };
    }

    const { name_am, name_en } = extractNames(text);
    const { date_of_birth_am, date_of_birth_en } = extractDates(text);
    const { sex_am, sex_en } = extractSex(text);
    const { nationality_am, nationality_en } = extractNationality(text);
    const phone_number = extractPhoneNumber(text);
    const { region_am, region_en } = extractRegion(text);
    const { zone_am, zone_en } = extractZone(text);
    const { woreda_am, woreda_en } = extractWoreda(text);
    const fcn = extractFCN(text);

    // Ensure all fields exist (empty string if not found)
    const data = {
      name_am: name_am || "",
      name_en: name_en || "",
      date_of_birth_am: date_of_birth_am || "",
      date_of_birth_en: date_of_birth_en || "",
      sex_am: sex_am || "",
      sex_en: sex_en || "",
      nationality_am: nationality_am || "",
      nationality_en: nationality_en || "",
      phone_number: phone_number || "",
      region_am: region_am || "",
      region_en: region_en || "",
      zone_am: zone_am || "",
      zone_en: zone_en || "",
      woreda_am: woreda_am || "",
      woreda_en: woreda_en || "",
      fcn: fcn || "",
    };
    console.log("data: ", data);

    // Check if we extracted any meaningful data
    const hasData = Object.values(data).some(
      (value) => value && value.trim().length > 0,
    );

    if (!hasData) {
      return {
        success: false,
        error:
          "Could not find Ethiopian ID information in this PDF. Please ensure you uploaded a valid Ethiopian Digital ID PDF.",
      };
    }

    return {
      success: true,
      data,
    };
  } catch (error) {
    console.error("PDF extraction error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? `Failed to process PDF: ${error.message}`
          : "An unexpected error occurred while processing the PDF. Please try again.",
    };
  }
}

module.exports = {
  extractDataFromPDF,
  extractTextFromPDF,
};
