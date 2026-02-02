// storedFileRoutes code
const router = require("express").Router();
const storedFileController = require("../controllers/storedFileController");
const authenticate = require("../../../middleware/authMiddleware");
const authorize = require("../../../middleware/authorize");

// All routes require authentication
router.use(authenticate);

// Get files for a specific generation
router.get(
  "/generation/:generationId",
  storedFileController.getFilesByGeneration,
);

// Delete file (admin only)
router.delete(
  "/:id",
  authorize([], { platformOnly: true }),
  storedFileController.deleteFile,
);

module.exports = router;
