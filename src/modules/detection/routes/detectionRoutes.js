// detectionRoutes code
const router = require("express").Router();
const detectionController = require("../controllers/detectionController");
const validate = require("../../../middleware/validatorMiddleware");
const detectionValidation = require("../validations/detectionValidation");
const { uploadImage } = require("../../../middleware/uploadMiddleware");
const authenticate = require("../../../middleware/authMiddleware");

// -------------------------
// PUBLIC ROUTES
// -------------------------
router.post(
  "/detect-and-crop",
  uploadImage.single("image"),
  validate(detectionValidation.detectAndCropSchema),
  detectionController.detectAndCrop,
);

router.post(
  "/detect-only",
  uploadImage.single("image"),
  detectionController.detectOnly,
);

router.post(
  "/process-base64",
  validate(detectionValidation.processBase64Schema),
  detectionController.processBase64,
);

router.get("/health", detectionController.healthCheck);

// QR code detection + generate
router.post(
  "/detect-qr",
  uploadImage.single("image"),
  detectionController.detectQRController,
);

// Barcode detection only
router.post(
  "/detect-barcode",
  uploadImage.single("image"),
  detectionController.detectBarcodeController,
);

// -------------------------
// PROTECTED ROUTES
// -------------------------
router.use(authenticate);

// Add authenticated routes here if needed
// Example: router.post("/premium-detect", detectionController.premiumDetect);

module.exports = router;
