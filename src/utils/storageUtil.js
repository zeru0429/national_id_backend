// file: storageUtil.js
const fs = require("fs");
const path = require("path");
const {
  ensureDirExists,
  saveBufferToDisk,
  generateFileName,
} = require("../utils/fileUtils"); // adjust path
const { ACL_TYPES, uploadFile } = require("../middleware/obsService");

/**
 * Store a buffer either on disk or OBS.
 * @param {Buffer} buffer - file buffer
 * @param {Object} options
 * @param {string} options.originalName - original file name
 * @param {string} options.folder - folder path (disk or OBS)
 * @param {string} [options.storageType] - "disk" | "obs"
 * @param {string} [options.acl] - ACL type for OBS
 * @param {string} [options.diskBaseDir] - base dir for disk storage
 * @returns {Object} - stored file info { fileName, path/url, objectKey, acl }
 */
async function storeFile(
  buffer,
  {
    originalName,
    folder,
    storageType = process.env.STORAGE_TYPE || "disk",
    acl = ACL_TYPES.PUBLIC_READ_WRITE,
    diskBaseDir = path.join(process.cwd(), "public/uploads"),
  }
) {
  if (!buffer || !originalName)
    throw new Error("Buffer and originalName are required");

  // generate safe file name
  const fileName = generateFileName(originalName);

  if (storageType === "disk") {
    const uploadDir = path.join(diskBaseDir, folder);
    await ensureDirExists(uploadDir);
    const filePath = path.join(uploadDir, fileName);
    await saveBufferToDisk(buffer, filePath);

    return {
      fileName,
      path: path.join("/", path.relative(process.cwd(), filePath)),
    };
  }

  if (storageType === "obs") {
    const result = await uploadFile({
      buffer,
      objectKey: fileName,
      folder,
      contentType: "",
      acl,
    });

    return {
      fileName,
      objectKey: result.objectKey,
      acl: result.acl,
      url: result.url,
    };
  }
  return { fileName, buffer };
}

module.exports = { storeFile };
