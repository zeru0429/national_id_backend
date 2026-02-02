const multer = require("multer");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

// ------------------------------
// File type & size limits from env
// ------------------------------
const FILE_TYPE_LIMITS = {
  image: {
    mimeTypes: ["image/jpeg", "image/png", "image/gif", "image/webp"],
    maxSize: (parseInt(process.env.MAX_IMAGE_SIZE) || 5) * 1024 * 1024,
  },
  video: {
    mimeTypes: ["video/mp4", "video/quicktime", "video/x-matroska"],
    maxSize: (parseInt(process.env.MAX_VIDEO_SIZE) || 50) * 1024 * 1024,
  },
  document: {
    mimeTypes: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    maxSize: (parseInt(process.env.MAX_DOCUMENT_SIZE) || 10) * 1024 * 1024,
  },
  audio: {
    mimeTypes: ["audio/mpeg", "audio/wav", "audio/webm"],
    maxSize: (parseInt(process.env.MAX_AUDIO_SIZE) || 20) * 1024 * 1024,
  },
};

// ------------------------------
// Dynamic storage (memory or disk)
// ------------------------------
let storage;
if (process.env.STORAGE_TYPE === "disk") {
  const uploadDir = process.env.UPLOAD_DEST || "public/uploads";
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const name = path.basename(file.originalname, ext);
      cb(null, `${name}-${Date.now()}${ext}`);
    },
  });
} else {
  storage = multer.memoryStorage();
}

// ------------------------------
// File filter (check type & size per type)
// ------------------------------
const fileFilter = (req, file, cb) => {
  let validType = false;

  for (const type in FILE_TYPE_LIMITS) {
    if (FILE_TYPE_LIMITS[type].mimeTypes.includes(file.mimetype)) {
      validType = true;
      // Attach max size info to file object for later check
      file.maxSize = FILE_TYPE_LIMITS[type].maxSize;
      break;
    }
  }

  if (!validType) {
    return cb(new Error("Unsupported file type"), false);
  }

  cb(null, true);
};

// ------------------------------
// Middleware factory
// ------------------------------
const uploadMiddleware = ({ fieldName, maxCount = 1 }) => {
  const multerInstance = multer({
    storage,
    fileFilter,
    limits: {
      fileSize: Math.max(
        ...Object.values(FILE_TYPE_LIMITS).map((f) => f.maxSize)
      ),
    },
  });

  return multerInstance.array(fieldName, maxCount);
};

const uploadSingleFile = ({ fieldName }) => {
  const multerInstance = multer({
    storage,
    fileFilter,
    limits: {
      fileSize: Math.max(
        ...Object.values(FILE_TYPE_LIMITS).map((f) => f.maxSize)
      ),
    },
  });

  // Use .single() for single file uploads
  return multerInstance.single(fieldName);
};

module.exports = {
  uploadMiddleware,
  uploadSingleFile,
};
