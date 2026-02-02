const router = require("express").Router();
const usersController = require("../controllers/usersController");
const validate = require("../../../middleware/validatorMiddleware");
const usersValidation = require("../validations/usersValidation");
const authenticate = require("../../../middleware/authMiddleware");
const authorize = require("../../../middleware/authorize");

// All routes require authentication
router.use(authenticate);

// Get all users (admin only)
router.get(
  "/",
  authorize([], { platformOnly: true }),
  validate(usersValidation.getAllUsers),
  usersController.getAllUsers,
);

// Get single user by ID (admin only)
router.get(
  "/:id",
  authorize([], { platformOnly: true }),
  usersController.getUser,
);

// Update user (admin only)
router.put(
  "/:id",
  authorize([], { platformOnly: true }),
  validate(usersValidation.updateUser),
  usersController.updateUser,
);

// Block/unblock user (admin only)
router.post(
  "/:id/block",
  authorize([], { platformOnly: true }),
  usersController.blockUser,
);

module.exports = router;
