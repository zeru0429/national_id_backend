const catchAsync = require("../../../utils/catchAsync");
const ApiResponse = require("../../../utils/apiResponse");
const usersService = require("../services/usersService");
const { StatusCodes } = require("http-status-codes");

const getAllUsers = catchAsync(async (req, res) => {
  const { page, limit, search, role, sortBy, sortOrder, has_pagination } =
    req.query;

  // Build filters object to pass to service
  const filters = {
    page,
    limit,
    search,
    role,
    sortBy,
    sortOrder,
    has_pagination,
  };

  // Call service
  const users = await usersService.getAllUsers(filters);

  res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(
        StatusCodes.OK,
        users,
        req.t("users.list_retrieved") || "Users retrieved successfully",
      ),
    );
});

const getUser = catchAsync(async (req, res) => {
  const user = await usersService.getUser(req.params.id);
  res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, user, req.t("users.retrieved")));
});

const updateUser = catchAsync(async (req, res) => {
  const updated = await usersService.updateUser(req.params.id, req.body);
  res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, updated, req.t("users.updated")));
});

const blockUser = catchAsync(async (req, res) => {
  const updated = await usersService.blockUser(req.params.id);
  res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(
        StatusCodes.OK,
        updated,
        req.t("users.block_status_updated"),
      ),
    );
});

module.exports = {
  getAllUsers,
  getUser,
  updateUser,
  blockUser,
};
