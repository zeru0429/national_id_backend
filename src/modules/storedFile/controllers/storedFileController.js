// storedFileController code
const catchAsync = require("../../../utils/catchAsync");
const ApiResponse = require("../../../utils/apiResponse");
const storedFileService = require("../services/storedFileService");
const { StatusCodes } = require("http-status-codes");

const getFilesByGeneration = catchAsync(async (req, res) => {
  const files = await storedFileService.getFilesByGeneration(
    req.params.generationId,
  );
  res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(StatusCodes.OK, files, req.t("files.list_retrieved")),
    );
});

const deleteFile = catchAsync(async (req, res) => {
  await storedFileService.deleteFile(req.params.id);
  res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, null, req.t("files.deleted")));
});

module.exports = {
  getFilesByGeneration,
  deleteFile,
};
