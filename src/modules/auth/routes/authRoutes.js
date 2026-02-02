// authRoutes.js
const router = require("express").Router();
const authController = require("../controllers/authController");
const validate = require("../../../middleware/validatorMiddleware");
const authValidation = require("../validations/authValidation");
const authenticate = require("../../../middleware/authMiddleware");

// -------------------------
// PUBLIC ROUTES
// -------------------------
router.post("/login", validate(authValidation.login), authController.login);
router.post(
  "/register",
  validate(authValidation.register),
  authController.register,
);
router.post(
  "/google-login",
  validate(authValidation.googleLogin),
  authController.googleLogin,
);
router.post(
  "/refresh-token",
  validate(authValidation.refreshToken),
  authController.refreshToken,
);

// -------------------------
// PROTECTED ROUTES
// -------------------------
router.use(authenticate);

router.post(
  "/change-password",
  validate(authValidation.changePassword),
  authController.changePassword,
);
router.get("/profile", authController.getProfile);
router.post("/logout", authController.logout);

module.exports = router;
