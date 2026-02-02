// subscriptionController code
const catchAsync = require("../../../utils/catchAsync");
const ApiResponse = require("../../../utils/apiResponse");
const subscriptionService = require("../services/subscriptionService");
const { StatusCodes } = require("http-status-codes");

// Get current user's subscription
const getSubscription = catchAsync(async (req, res) => {
  const subscription = await subscriptionService.getSubscription(req.user.id);
  res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(
        StatusCodes.OK,
        subscription,
        req.t("subscription.retrieved"),
      ),
    );
});

// Adjust user's subscription (Admin only)
const adjustSubscription = catchAsync(async (req, res) => {
  const data = await subscriptionService.adjustSubscription(req.body);
  res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(StatusCodes.OK, data, req.t("subscription.adjusted")),
    );
});

module.exports = {
  getSubscription,
  adjustSubscription,
};
