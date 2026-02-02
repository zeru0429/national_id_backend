const catchAsync = require("../../../utils/catchAsync");
const ApiResponse = require("../../../utils/apiResponse");
const authService = require("../services/authService");
const { StatusCodes } = require("http-status-codes");

// Login
const login = catchAsync(async (req, res) => {
  const data = await authService.login(req.body);
  res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, data, req.t("auth.login_success")));
});

// Google login
const googleLogin = catchAsync(async (req, res) => {
  const data = await authService.googleLogin(req.body.token);
  res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(StatusCodes.OK, data, req.t("auth.google_login_success")),
    );
});

// Register
const register = catchAsync(async (req, res) => {
  const user = await authService.register(req.body);
  res
    .status(StatusCodes.CREATED)
    .json(
      new ApiResponse(
        StatusCodes.CREATED,
        user,
        req.t("auth.register_success"),
      ),
    );
});

// Refresh token
const refreshToken = catchAsync(async (req, res) => {
  const data = await authService.refreshToken(req.body.refreshToken);
  res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, data, req.t("auth.token_refreshed")));
});

// Logout
const logout = catchAsync(async (req, res) => {
  await authService.logout(req.user.id);
  res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, null, req.t("auth.logout_success")));
});

// Change password
const changePassword = catchAsync(async (req, res) => {
  await authService.changePassword(req.user.id, req.body);
  res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(StatusCodes.OK, null, req.t("auth.password_changed")),
    );
});

// Get profile
const getProfile = catchAsync(async (req, res) => {
  const profile = await authService.getProfile(req.user.id);
  res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(StatusCodes.OK, profile, req.t("auth.profile_retrieved")),
    );
});

module.exports = {
  login,
  googleLogin,
  register,
  refreshToken,
  logout,
  changePassword,
  getProfile,
};
