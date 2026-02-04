const catchAsync = require("../../../utils/catchAsync");
const ApiResponse = require("../../../utils/apiResponse");
const detectionService = require("../services/detectionService");
const { StatusCodes } = require("http-status-codes");

const detectAndCrop = catchAsync(async (req, res) => {
  if (!req.file) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json(
        new ApiResponse(
          StatusCodes.BAD_REQUEST,
          null,
          req.t("detection.no_image_provided")
        )
      );
  }

  const data = await detectionService.detectAndCrop(req.file, req.body, req.t);

  return res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(StatusCodes.OK, data, req.t("detection.process_success"))
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
          req.t("detection.no_image_provided")
        )
      );
  }

  const data = await detectionService.detectOnly(req.file, req.t);

  return res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(
        StatusCodes.OK,
        data,
        req.t("detection.detection_success")
      )
    );
});

const processBase64 = catchAsync(async (req, res) => {
  const data = await detectionService.processBase64(req.body, req.t);

  return res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(StatusCodes.OK, data, req.t("detection.process_success"))
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
        req.t("detection.service_healthy")
      )
    );
});

module.exports = {
  detectAndCrop,
  detectOnly,
  processBase64,
  healthCheck,
};
