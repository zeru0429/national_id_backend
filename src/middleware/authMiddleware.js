// authMiddleware.js
const { StatusCodes } = require("http-status-codes");
const ApiError = require("../utils/apiError");
const jwtUtil = require("../utils/jwtToken");
const authService = require("../modules/auth/services/authService");

/**
 * Authenticate JWT token and attach user context
 */
const authenticate = async (req, res, next) => {
  try {
    const token =
      req.header("Authorization")?.replace("Bearer ", "") || req.cookies?.token;

    if (!token) {
      return next(
        new ApiError(StatusCodes.UNAUTHORIZED, req.t("auth.no_token_provided")),
      );
    }

    const decoded = jwtUtil.verifyAccessToken(token);

    // Fetch user from DB
    const user = await authService.getProfile(decoded.id);
    if (!user) {
      return next(
        new ApiError(StatusCodes.UNAUTHORIZED, req.t("auth.invalid_token")),
      );
    }

    // Attach user to request
    req.user = user;

    // Set role-based flags
    req.isPlatformUser = user.role === "ADMIN"; // Admin
    req.isOrgUser = user.role === "USER"; // Regular user

    next();
  } catch (error) {
    console.error("Authentication error:", error);

    if (error.name === "TokenExpiredError") {
      return next(
        new ApiError(StatusCodes.UNAUTHORIZED, req.t("auth.token_expired")),
      );
    }

    if (error.name === "JsonWebTokenError") {
      return next(
        new ApiError(StatusCodes.UNAUTHORIZED, req.t("auth.invalid_token")),
      );
    }

    return next(
      new ApiError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        req.t("auth.authentication_failed"),
      ),
    );
  }
};

module.exports = authenticate;
