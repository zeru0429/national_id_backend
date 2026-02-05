const { writeFile, unlink } = require("fs/promises");

const path = require("path");
const os = require("os");
const crypto = require("crypto");
async function saveTempImage(buffer) {
  const fileName = `qr_${crypto.randomUUID()}.png`;
  const filePath = path.join(os.tmpdir(), fileName);

  await writeFile(filePath, buffer);
  return filePath;
}

module.exports = { saveTempImage };
