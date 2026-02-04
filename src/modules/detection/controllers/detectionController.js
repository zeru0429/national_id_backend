const catchAsync = require("../../../utils/catchAsync");
const ApiResponse = require("../../../utils/apiResponse");
const detectionService = require("../services/detectionService");
const barQrDetectionService = require("../services/barQrDetectionService");
const { StatusCodes } = require("http-status-codes");
const fs = require("fs").promises;
const {
  scanQRCode,
  generateQRCode,
  scanBarcode,
  generateBarcode,
} = require("../../../services/qrcodeService");

const detectAndCrop = catchAsync(async (req, res) => {
  if (!req.file) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json(
        new ApiResponse(
          StatusCodes.BAD_REQUEST,
          null,
          req.t("detection.no_image_provided"),
        ),
      );
  }

  const data = await detectionService.detectAndCrop(req.file, req.body, req.t);

  return res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(StatusCodes.OK, data, req.t("detection.process_success")),
    );
});

const detectOnly = catchAsync(async (req, res) => {
  if (!req.file) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json(
        new ApiResponse(
          StatusCodes.BAD_REQUEST,
          null,
          req.t("detection.no_image_provided"),
        ),
      );
  }

  const data = await detectionService.detectOnly(req.file, req.t);

  return res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(
        StatusCodes.OK,
        data,
        req.t("detection.detection_success"),
      ),
    );
});

const processBase64 = catchAsync(async (req, res) => {
  const data = await detectionService.processBase64(req.body, req.t);

  return res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(StatusCodes.OK, data, req.t("detection.process_success")),
    );
});

const healthCheck = catchAsync(async (req, res) => {
  const health = await detectionService.healthCheck();
  return res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(
        StatusCodes.OK,
        health,
        req.t("detection.service_healthy"),
      ),
    );
});

const detectQRController = catchAsync(async (req, res) => {
  if (!req.file) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json(
        new ApiResponse(StatusCodes.BAD_REQUEST, null, "No image provided"),
      );
  }

  try {
    console.log("🔍 Starting QR detection for:", req.file.path);

    // Scan QR code
    const qrResult = await scanQRCode(req.file.path);
    console.log("Scan result:", qrResult);

    // Cleanup uploaded file after processing
    try {
      await fs.unlink(req.file.path);
    } catch (cleanupError) {
      console.error("Error cleaning up uploaded file:", cleanupError);
    }

    if (qrResult) {
      // qrResult is already a string
      const qrBuffer = await generateQRCode(qrResult);

      if (!qrBuffer) {
        return res.status(500).json({ message: "QR generation failed" });
      }

      res.status(200).contentType("image/png").send(qrBuffer);
    } else {
      res.status(404).json({ message: "QR not found" });
    }
  } catch (error) {
    // Cleanup uploaded file on error
    try {
      await fs.unlink(req.file.path);
    } catch (cleanupError) {
      console.error("Error cleaning up uploaded file:", cleanupError);
    }

    console.error("❌ Error detecting QR code:", error);
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json(
        new ApiResponse(
          StatusCodes.INTERNAL_SERVER_ERROR,
          { success: false, message: error.message },
          "Internal server error",
        ),
      );
  }
});

const detectBarcodeController = catchAsync(async (req, res) => {
  if (!req.file) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json(
        new ApiResponse(StatusCodes.BAD_REQUEST, null, "No image provided"),
      );
  }

  try {
    console.log("🔍 Starting barcode detection for:", req.file.path);

    // Scan barcode from image
    const barcodeData = await scanBarcode(req.file.path);

    // Clean up uploaded file after processing
    try {
      await fs.promises.unlink(req.file.path);
    } catch (cleanupError) {
      console.error("Error cleaning up uploaded file:", cleanupError);
    }

    if (barcodeData) {
      console.log("✅ Barcode FOUND:", barcodeData);

      // Optionally, generate a new barcode image for download
      const barcodeBuffer = await generateBarcode(barcodeData);

      if (!barcodeBuffer) {
        return res
          .status(500)
          .json(
            new ApiResponse(
              StatusCodes.INTERNAL_SERVER_ERROR,
              null,
              "Barcode generation failed",
            ),
          );
      }

      // Send PNG image as response
      res.status(200).contentType("image/png").send(barcodeBuffer);
    } else {
      console.log("❌ No barcode detected in image");
      res
        .status(StatusCodes.NOT_FOUND)
        .json(
          new ApiResponse(StatusCodes.NOT_FOUND, null, "Barcode not found"),
        );
    }
  } catch (error) {
    // Clean up uploaded file on error
    try {
      await fs.promises.unlink(req.file.path);
    } catch (cleanupError) {
      console.error("Error cleaning up uploaded file:", cleanupError);
    }

    console.error("❌ Error detecting barcode:", error);
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json(
        new ApiResponse(
          StatusCodes.INTERNAL_SERVER_ERROR,
          { success: false, message: error.message },
          "Internal server error",
        ),
      );
  }
});

module.exports = {
  detectAndCrop,
  detectOnly,
  processBase64,
  healthCheck,
  detectQRController,
  detectBarcodeController,
};
