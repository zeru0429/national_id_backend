const fs = require("fs");
const path = require("path");

/**
 * Save a buffer to disk
 * @param {Buffer} buffer
 * @param {string} destPath
 */
const saveBufferToDisk = async (buffer, destPath) => {
  return await fs.promises.writeFile(destPath, buffer);
};

/**
 * Rename a file
 * @param {string} oldPath
 * @param {string} newPath
 */
const renameFile = async (oldPath, newPath) => {
  return fs.promises.rename(oldPath, newPath);
};

/**
 * Delete a file
 * @param {string} filePath
 */
const deleteFile = async (filePath) => {
  if (fs.existsSync(filePath)) {
    return fs.promises.unlink(filePath);
  }
};

/**
 * Move a file
 * @param {string} source
 * @param {string} destination
 */
const moveFile = async (source, destination) => {
  await fs.promises.mkdir(path.dirname(destination), { recursive: true });
  return fs.promises.rename(source, destination);
};

/**
 * Copy a file
 * @param {string} source
 * @param {string} destination
 */
const copyFile = async (source, destination) => {
  await fs.promises.mkdir(path.dirname(destination), { recursive: true });
  return fs.promises.copyFile(source, destination);
};

/**
 * Generate unique filename
 * @param {string} originalName
 */
const generateFileName = (originalName) => {
  const ext = path.extname(originalName);
  const name = path.basename(originalName, ext);
  return `${name}-${Date.now()}${ext}`;
};

/**
 * Ensure directory exists
 * @param {string} dirPath
 */
const ensureDirExists = async (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    await fs.promises.mkdir(dirPath, { recursive: true });
  }
};

module.exports = {
  saveBufferToDisk,
  renameFile,
  deleteFile,
  moveFile,
  copyFile,
  generateFileName,
  ensureDirExists,
};
