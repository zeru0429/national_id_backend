const path = require("path");
const fs = require("fs");
const { renderAndCropPage } = require("../utils/pdfUtils");
const { extractDataFromPDF } = require("../utils/pdfExtractor");
const { readImageText } = require("../utils/ocrUtils");

const outputDir = path.join(__dirname, "../../public/output");

// Ensure output directory exists
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

/**
 * Process PDF and return extracted images and data
 * @param {string} pdfPath - Path to PDF file
 * @param {number} userId - User ID for image URLs
 * @returns {Promise<{ images: object, data: object }>}
 */
async function processPDF(pdfPath, userId) {
  const isProductBgRemoval = (process.env.ENV = "production" ? true : false);
  const cropRegions = {
    profile: {
      x: 55,
      y: 100,
      width: 80,
      height: 110,
      removeWhiteBg: true,
      isLocalBgRemoval: true, //!isProductBgRemoval,
      scale: 5,
    },
    // profile: { x: 438, y: 122, width: 68, height: 83, removeWhiteBg: true, scale: 5 },
    qr: {
      x: 110,
      y: 410,
      width: 165,
      height: 163,
      removeWhiteBg: false,
      isLocalBgRemoval: true,
      scale: 10,
    },
    barcode: {
      x: 432,
      y: 290,
      width: 80,
      height: 23,
      removeWhiteBg: true,
      isLocalBgRemoval: true,
      scale: 5,
    },
    fin: {
      x: 496,
      y: 493,
      width: 44,
      height: 9,
      removeWhiteBg: true,
      isLocalBgRemoval: true,
      scale: 5,
    },
    issueDate: {
      x: 535,
      y: 128,
      width: 10,
      height: 83,
      removeWhiteBg: true,
      isLocalBgRemoval: true,
      scale: 5,
    },
  };
  // console.log(cropRegions)

  const images = {};
  let finText = "";
  let issueDateText = "";

  for (const [key, opts] of Object.entries(cropRegions)) {
    const rotate = key === "issueDate" ? 90 : 0;

    const base64 = await renderAndCropPage(
      pdfPath,
      1,
      { x: opts.x, y: opts.y, width: opts.width, height: opts.height },
      opts.scale,
      opts.removeWhiteBg,
      rotate,
      opts.isLocalBgRemoval,
    );

    const buffer = Buffer.from(base64, "base64");
    const filename = `${key}.png`;
    const filepath = path.join(outputDir, filename);
    fs.writeFileSync(filepath, buffer);

    images[key] = `http://localhost:${process.env.PORT}/output/${filename}`;

    if (key === "fin") finText = await readImageText(buffer, "eng+amh");
    if (key === "issueDate")
      issueDateText = await readImageText(buffer, "eng+amh");
  }

  const extractedData = await extractDataFromPDF(pdfPath);

  // Split issueDate into Amharic and English
  let issueDateAm = "";
  let issueDateEn = "";
  if (issueDateText) {
    const parts = issueDateText.split("|").map((p) => p.trim());
    issueDateAm = parts[0] || "";
    issueDateEn = parts[1] || "";
  }

  return {
    images,
    data: {
      ...extractedData.data,
      fin: finText,
      issueDate_am: issueDateAm,
      issueDate_en: issueDateEn,
    },
  };
}

module.exports = { processPDF };
