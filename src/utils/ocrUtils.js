const Tesseract = require("tesseract.js");
const fs = require("fs");
const { createCanvas, loadImage } = require("canvas");
const fsPromiises = require("fs/promises");
const { extractCardNumber } = require("./extractCardNumber");
/**
 * Perform OCR on a PNG/JPG image file or base64 string
 * @param {string|Buffer} input - file path or base64 string of image
 * @param {string} lang - language(s), default "eng+amh"
 * @returns {Promise<string>} - extracted text
 */
async function readImageText(input, lang = "eng+amh") {
  let imageData;

  // If input is base64, convert to buffer
  if (typeof input === "string" && input.startsWith("data:image")) {
    imageData = Buffer.from(input.split(",")[1], "base64");
  } else if (typeof input === "string" && fs.existsSync(input)) {
    // If input is a file path
    imageData = fs.readFileSync(input);
  } else if (Buffer.isBuffer(input)) {
    imageData = input;
  } else {
    throw new Error(
      "Invalid input for OCR: must be file path, base64, or Buffer",
    );
  }

  const {
    data: { text },
  } = await Tesseract.recognize(imageData, lang, {
    logger: (m) => {
      // Optional: log progress
      // console.log(m);
    },
  });

  return text.trim();
}

/**
 * Crop bottom portion of image
 * @param {string} imagePath
 * @param {number} ratio - bottom ratio (e.g. 0.3 = bottom 30%)
 * @returns {string} cropped image path
 */
async function cropBottom(imagePath, ratio = 0.3) {
  const img = await loadImage(imagePath);

  const cropHeight = Math.floor(img.height * ratio);
  const cropY = img.height - cropHeight;

  const canvas = createCanvas(img.width, cropHeight);
  const ctx = canvas.getContext("2d");

  ctx.drawImage(
    img,
    0,
    cropY,
    img.width,
    cropHeight,
    0,
    0,
    img.width,
    cropHeight,
  );

  const croppedPath = imagePath.replace(/(\.\w+)$/, "_bottom$1");
  await fsPromiises.writeFile(croppedPath, canvas.toBuffer("image/png"));

  return croppedPath;
}

async function extractCardNumberFromImage(imagePath) {
  // Crop bottom 30%
  const croppedPath = await cropBottom(imagePath, 0.3);

  // OCR cropped section
  const ocrText = await readImageText(croppedPath, "eng+amh");

  const cardNumber = extractCardNumber(ocrText);

  return {
    cardNumber,
    rawOcrText: ocrText,
    croppedPath,
  };
}

const { createWorker } = require("tesseract.js");

async function extractCardNumberFromBuffer(buffer) {
  const worker = await createWorker("eng");

  const { data } = await worker.recognize(buffer);

  await worker.terminate();

  const cardNumber = data.text.match(/\d{16}/)?.[0] || null;

  return {
    cardNumber,
    rawOcrText: data.text,
  };
}


module.exports = {
  readImageText,
  cropBottom,
  extractCardNumberFromImage,
  extractCardNumberFromBuffer,
};
