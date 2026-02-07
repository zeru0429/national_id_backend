const multer = require("multer");
const path = require("path");
const { OUTPUT_DIR } = require("../config/paths");

// For image uploads (matching your uploadPDF pattern)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(OUTPUT_DIR, "images");
    console.log("📁 Uploading images to:", uploadDir);
    const fs = require("fs");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `detection-${uniqueSuffix}${ext}`);
  },
});

const uploadImage = multer({
  storage,
  fileFilter: (req, file, cb) => {
    console.log("📁 Uploading file:", file.originalname);
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase(),
    );
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error("Only image files are allowed (jpeg, jpg, png, webp)"));
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

module.exports = {
  uploadImage,
};
