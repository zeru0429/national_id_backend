const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");
const { OUTPUT_DIR } = require("../config/paths");

/**
 * Remove background using Pixian API
 *
 * @param {Buffer|string} file - Buffer or URL of the image
 * @param {Object} options - Optional settings
 * @param {string} options.saveFolder - Folder to save the result (default: output/result)
 * @param {string} options.filename - Output filename (default: bgRemoved_TIMESTAMP.png)
 * @param {number} options.width - Desired width (default: 400)
 * @param {number} options.height - Desired height (default: 550)
 * @param {string} options.format - Image format (default: png)
 * @param {string} options.colorMode - Color mode (default: rgba)
 * @returns {Promise<string>} - Returns saved file path
 */
async function removeBackground(file, options = {}) {
  const {
    saveFolder = path.join(OUTPUT_DIR, "result"),
    filename,
    width = 400,
    height = 550,
    format = "png",
    colorMode = "rgba",
  } = options;

  if (!fs.existsSync(saveFolder)) {
    fs.mkdirSync(saveFolder, { recursive: true });
  }

  const PIXIAN_API_ID = process.env.PIXIAN_API_ID;
  const PIXIAN_API_SECRET = process.env.PIXIAN_API_SECRET;
  const authToken = Buffer.from(
    `${PIXIAN_API_ID}:${PIXIAN_API_SECRET}`,
  ).toString("base64");

  const form = new FormData();

  if (Buffer.isBuffer(file)) {
    form.append("image", file, {
      filename: "image.png",
      contentType: "image/png",
    });
  } else if (typeof file === "string") {
    // file is a URL → download it first
    const response = await axios.get(file, { responseType: "arraybuffer" });
    form.append("image", Buffer.from(response.data), {
      filename: path.basename(file),
      contentType: "image/png",
    });
  } else {
    throw new Error("Invalid file input: must be Buffer or URL string");
  }

  // Build query params
  const params = new URLSearchParams();
  params.append("format", format);
  params.append("width", width.toString());
  params.append("height", height.toString());
  params.append("color_mode", colorMode);
  console.log("===>>> Api lanching with params:", params.toString());

  const apiResponse = await axios.post(
    `https://api.pixian.ai/api/v2/remove-background?${params.toString()}`,
    form,
    {
      headers: {
        Authorization: `Basic ${authToken}`,
        ...form.getHeaders(),
      },
      responseType: "arraybuffer",
    },
  );

  const timestamp = Date.now();
  const outputFileName = filename || `bgRemoved_${timestamp}.${format}`;
  const outputPath = path.join(saveFolder, outputFileName);

  fs.writeFileSync(outputPath, apiResponse.data);

  return outputPath; // return full path
}

module.exports = { removeBackground };
