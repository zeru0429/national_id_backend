// usageLogRoutes code
const router = require("express").Router();
const usageLogController = require("../controllers/usageLogController");
const validate = require("../../../middleware/validatorMiddleware");
const usageLogValidation = require("../validations/usageLogValidation");
const authenticate = require("../../../middleware/authMiddleware");

// All routes are protected
router.use(authenticate);

// Get all usage logs of current user
router.get("/", usageLogController.getUserLogs);

// Admin: get all logs
router.get("/all", usageLogController.getAllLogs);

// Admin: filter logs by user or action
router.post(
  "/filter",
  validate(usageLogValidation.filterLogs),
  usageLogController.filterLogs,
);

module.exports = router;
