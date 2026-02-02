const multer = require("multer");
const path = require("path");
const { outputDir } = require("./folders");

// For single image BG remover
const uploadImage = multer({ storage: multer.memoryStorage() });

// For PDF uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, outputDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `upload-${Date.now()}${ext}`;
    cb(null, name);
  },
});

const uploadPDF = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      return cb(new Error("Only PDF files are allowed"));
    }
    cb(null, true);
  },
});

module.exports = {
  uploadImage,
  uploadPDF,
};
