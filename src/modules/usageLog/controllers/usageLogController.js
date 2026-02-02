// usageLogController code
const catchAsync = require("../../../utils/catchAsync");
const ApiResponse = require("../../../utils/apiResponse");
const usageLogService = require("../services/usageLogService");
const { StatusCodes } = require("http-status-codes");

// Get logs of current user
const getUserLogs = catchAsync(async (req, res) => {
  const logs = await usageLogService.getUserLogs(req.user.id);
  res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, logs, req.t("usage_logs.retrieved")));
});

// Admin: get all logs
const getAllLogs = catchAsync(async (_req, res) => {
  const logs = await usageLogService.getAllLogs();
  res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, logs, req.t("usage_logs.retrieved")));
});

// Admin: filter logs
const filterLogs = catchAsync(async (req, res) => {
  const logs = await usageLogService.filterLogs(req.body);
  res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, logs, req.t("usage_logs.retrieved")));
});

module.exports = {
  getUserLogs,
  getAllLogs,
  filterLogs,
};
