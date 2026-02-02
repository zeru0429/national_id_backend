// authorize.js
const { StatusCodes } = require("http-status-codes");
const ApiError = require("../utils/apiError");

/**
 * Role-based authorization middleware
 *
 * @param {string[]} requiredPermissions - Currently not implemented (placeholder)
 * @param {Object} options - optional flags
 *   - platformOnly: true → only allow platform users (ADMIN)
 *   - orgOnly: true → only allow organization users (USER)
 */
const authorize = (requiredPermissions = [], options = {}) => {
  const { platformOnly = false, orgOnly = false } = options;

  return (req, _res, next) => {
    try {
      const user = req.user;

      if (!user) {
        return next(
          new ApiError(
            StatusCodes.UNAUTHORIZED,
            req.t("auth.authentication_required"),
          ),
        );
      }

      // Platform/Org role checks
      if (platformOnly && user.role !== "ADMIN") {
        return next(
          new ApiError(
            StatusCodes.FORBIDDEN,
            req.t("auth.platform_access_only"),
          ),
        );
      }

      if (orgOnly && user.role !== "USER") {
        return next(
          new ApiError(StatusCodes.FORBIDDEN, req.t("auth.org_access_only")),
        );
      }

      // Permissions are not implemented yet in the model
      if (requiredPermissions.length > 0) {
        return next(
          new ApiError(
            StatusCodes.FORBIDDEN,
            req.t("auth.permissions_not_configured"),
          ),
        );
      }

      next();
    } catch (error) {
      console.error("Authorization error:", error);
      return next(
        new ApiError(
          StatusCodes.INTERNAL_SERVER_ERROR,
          req.t("auth.authorization_failed"),
        ),
      );
    }
  };
};

module.exports = authorize;
