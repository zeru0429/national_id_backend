// idCardGenerator.js (replace generateIDCard with this)
const fs = require("fs");
const { createCanvas, loadImage, registerFont } = require("canvas");
const path = require("path");
const {
  MYRIAD_PRO,
  EBRIMA,
  FRONT_TEMPLATE,
  BACK_TEMPLATE,
  OUTPUT_DIR,
} = require("../config/paths");

/* ============================
   REGISTER MYRIAD PRO FONTS
============================ */

registerFont(MYRIAD_PRO.regular, { family: "MyriadPro", weight: "normal" });
registerFont(MYRIAD_PRO.bold, { family: "MyriadPro", weight: "bold" });
registerFont(MYRIAD_PRO.semibold, { family: "MyriadPro", weight: "600" });
registerFont(MYRIAD_PRO.light, { family: "MyriadPro", weight: "300" });

/* ============================
   REGISTER EBRIMA FONTS
============================ */

registerFont(EBRIMA.regular, { family: "Ebrima", weight: "normal" });
registerFont(EBRIMA.bold, { family: "Ebrima", weight: "bold" });

const CARD_WIDTH = 1760;
const CARD_HEIGHT = 1110;

async function loadLocalImage(filePath) {
  return await loadImage(filePath);
}
const PLACEMENTS = {
  front: {
    photo: { x: 100, y: 270, width: 570, height: 750 },
    samll_photo: { x: 1410, y: 785, width: 215, height: 235 },
    barcode: { x: 750, y: 864, width: 590, height: 155 },
  },
  back: { qrCode: { x: 800, y: 48, width: 900, height: 914 } },
};

const TEXT_POSITIONS = {
  front: {
    fullName: {
      x: 705,
      y: 320,
      maxWidth: 880,
      fontSize: 48,
      font: "Ebrima",
      fontWeight: "bold",
    },
    dateOfBirth: {
      x: 705,
      y: 530,
      maxWidth: 880,
      fontSize: 48,
      font: "Ebrima",
      fontWeight: "bold",
    },
    sex: {
      x: 705,
      y: 645,
      maxWidth: 880,
      fontSize: 48,
      font: "Ebrima",
      fontWeight: "bold",
    },
    dateOfExpiry: {
      x: 705,
      y: 755,
      maxWidth: 880,
      fontSize: 48,
      font: "Ebrima",
      fontWeight: "bold",
    },
    issueDate_en: {
      x: 20,
      y: 440,
      maxWidth: 880,
      fontSize: 38,
      font: "Ebrima",
      fontWeight: "400",
      rotate: -90,
    },
    issueDate_am: {
      x: 20,
      y: 890,
      maxWidth: 880,
      fontSize: 38,
      font: "Ebrima",
      fontWeight: "400",
      rotate: -90,
    },
  },
  back: {
    phoneNumber: {
      x: 50,
      y: 140,
      maxWidth: 880,
      fontSize: 48,
      font: "Ebrima",
      fontWeight: "bold",
    },
    address: {
      x: 50,
      y: 400,
      maxWidth: 880,
      fontSize: 40,
      font: "Ebrima",
      fontWeight: "bold",
    },
    fin: {
      x: 240,
      y: 913,
      maxWidth: 450,
      fontSize: 40,
      font: "Ebrima",
      fontWeight: "600",
    },
    sn: {
      x: 1450,
      y: 1002,
      maxWidth: 450,
      fontSize: 40,
      font: "Ebrima",
      fontWeight: "600",
    },
  },
};
function extractRegion(data = {}) {
  return [
    data.region_am,
    data.region_en,
    data.zone_am,
    data.zone_en,
    data.woreda_am,
    data.woreda_en,
  ]
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .join("\n"); // ✅ newline between each line
}
function extractFullName(data = {}) {
  return [data.name_am, data.name_en]
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .join("\n"); // ✅ newline between Amharic and English
}

// Combine with | for horizontal (like sex)
function combineWithPipe(dataAm, dataEn) {
  const am = String(dataAm || "").trim();
  const en = String(dataEn || "").trim();
  if (!am && !en) return "";
  if (!am) return en;
  if (!en) return am;
  return `${am} | ${en}`;
}

const sanitizeFileName = (str) =>
  String(str || "")
    .replace(/\s+/g, "_") // replace spaces with _
    .replace(/[\/\\?%*:|"<>]/g, "") // remove invalid chars
    .trim();

function drawText(ctx, text, x, y, maxWidth, fontSize, font, fontWeight) {
  ctx.font = `${fontWeight || "normal"} ${fontSize}px "${font}"`;
  ctx.fillStyle = "#000000";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  const lineHeight = fontSize * 1.3;

  // ✅ if text contains new lines, draw line-by-line
  const paragraphs = String(text).split("\n");

  let yOffset = y;

  for (const paragraph of paragraphs) {
    const words = paragraph.split(" ");
    let line = "";

    for (const word of words) {
      const testLine = line + (line ? " " : "") + word;
      const metrics = ctx.measureText(testLine);

      if (metrics.width > maxWidth && line) {
        ctx.fillText(line, x, yOffset);
        line = word;
        yOffset += lineHeight;
      } else {
        line = testLine;
      }
    }

    if (line) {
      ctx.fillText(line, x, yOffset);
      yOffset += lineHeight;
    }
  }
}

/**
 * generateIDCard
 * options:
 *   side: 'front'|'back'
 *   data: object
 *   photoPath, barcodePath, qrCodePath: local file paths (optional)
 *   outputPath: where to write final image
 *   outputFormat: 'png'|'jpg' (default 'png')
 *   jpegQuality: 0..1 (only for jpg)
 */

async function generateIDCard({
  side = "front",
  data = {},
  photoPath,
  barcodePath,
  qrCodePath,
  outputDir = path.join(OUTPUT_DIR, "result"),
  outputFormat = "jpg",
  jpegQuality = 0.95,
  customFileName, // optional: if provided, ignore auto-naming
}) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Auto-generate filename if not provided
  const fileName =
    customFileName ||
    `${side}-${sanitizeFileName(data.fin)}-${sanitizeFileName(
      data.name_am,
    )}-${sanitizeFileName(data.name_en)}.${outputFormat}`;

  const outputPath = path.join(outputDir, fileName);

  // --- rest of your existing generateIDCard code ---
  const templatePath = side === "front" ? FRONT_TEMPLATE : BACK_TEMPLATE;
  const template = await loadLocalImage(templatePath);

  const canvas = createCanvas(template.width, template.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(template, 0, 0, template.width, template.height);

  const scaleX = template.width / CARD_WIDTH;
  const scaleY = template.height / CARD_HEIGHT;
  const scale = (scaleX + scaleY) / 2;
  ctx.save();
  ctx.scale(scale, scale);

  // Draw images
  async function drawIfExists(localPath, placement) {
    if (!localPath) return;
    try {
      const img = await loadLocalImage(localPath);
      ctx.drawImage(
        img,
        placement.x,
        placement.y,
        placement.width,
        placement.height,
      );
    } catch (err) {
      console.warn("Failed to draw image", localPath, err.message || err);
    }
  }

  if (side === "front") {
    if (photoPath) await drawIfExists(photoPath, PLACEMENTS.front.photo);
    if (photoPath) await drawIfExists(photoPath, PLACEMENTS.front.samll_photo);
    if (barcodePath) await drawIfExists(barcodePath, PLACEMENTS.front.barcode);
  } else {
    if (qrCodePath) await drawIfExists(qrCodePath, PLACEMENTS.back.qrCode);
  }

  // Draw text fields
  const textFields = TEXT_POSITIONS[side];
  for (const key in textFields) {
    const field = textFields[key];
    let value = "";

    if (key === "phoneNumber") value = data.phone_number;
    else if (key === "fullName") value = extractFullName(data);
    else if (key === "dateOfBirth")
      value = combineWithPipe(data.date_of_birth_am, data.date_of_birth_en);
    else if (key === "sex") value = combineWithPipe(data.sex_am, data.sex_en);
    else if (key === "dateOfExpiry")
      value = combineWithPipe(data.issueDate_am, data.issueDate_en);
    else if (key === "address") value = extractRegion(data);
    else value = data[key];

    if (value) {
      if (field.rotate) {
        ctx.save();
        ctx.translate(field.x, field.y);
        ctx.rotate((field.rotate * Math.PI) / 180);
        drawText(
          ctx,
          String(value),
          0,
          0,
          field.maxWidth,
          field.fontSize,
          field.font,
          field.fontWeight,
        );
        ctx.restore();
      } else {
        drawText(
          ctx,
          String(value),
          field.x,
          field.y,
          field.maxWidth,
          field.fontSize,
          field.font,
          field.fontWeight,
        );
      }
    }
  }

  ctx.restore();

  // Export
  let buffer;
  if (outputFormat === "jpg" || outputFormat === "jpeg") {
    buffer = canvas.toBuffer("image/jpeg", {
      quality: jpegQuality,
      progressive: true,
    });
  } else {
    buffer = canvas.toBuffer("image/png");
  }

  fs.writeFileSync(outputPath, buffer);
  console.log(`✅ ID card saved: ${outputPath} (${outputFormat})`);

  return outputPath;
}

module.exports = { generateIDCard };
