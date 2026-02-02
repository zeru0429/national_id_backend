// file: upload/config/constants.js

// Storage Types
const STORAGE_TYPES = {
  MEMORY: "memory",
  DISK: "disk",
  OBS: "obs",
};

// ACL Types for OBS
const ACL_TYPES = {
  PRIVATE: "private",
  PUBLIC_READ: "public-read",
  PUBLIC_READ_WRITE: "public-read-write",
  AUTHENTICATED_READ: "authenticated-read",
};

// File type & size limits
const FILE_TYPE_LIMITS = {
  image: {
    mimeTypes: ["image/jpeg", "image/png", "image/gif", "image/webp"],
    maxSize: 5 * 1024 * 1024, // 5MB
  },
  video: {
    mimeTypes: ["video/mp4", "video/quicktime", "video/x-matroska"],
    maxSize: 50 * 1024 * 1024, // 50MB
  },
  document: {
    mimeTypes: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    maxSize: 10 * 1024 * 1024, // 10MB
  },
  audio: {
    mimeTypes: ["audio/mpeg", "audio/wav", "audio/webm"],
    maxSize: 20 * 1024 * 1024, // 20MB
  },
};

// Default configuration
const DEFAULT_CONFIG = {
  storageType: STORAGE_TYPES.MEMORY,
  uploadDir: "public/uploads",
  limits: {
    fileSize: Math.max(
      ...Object.values(FILE_TYPE_LIMITS).map((f) => f.maxSize)
    ),
  },
  fileFilter: null,
};

module.exports = {
  STORAGE_TYPES,
  ACL_TYPES,
  FILE_TYPE_LIMITS,
  DEFAULT_CONFIG,
};
