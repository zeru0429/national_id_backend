const Tesseract = require("tesseract.js");
const fs = require("fs");

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

module.exports = { readImageText };
