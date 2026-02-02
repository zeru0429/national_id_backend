// subscriptionRoutes code
const router = require("express").Router();
const subscriptionController = require("../controllers/subscriptionController");
const validate = require("../../../middleware/validatorMiddleware");
const subscriptionValidation = require("../validations/subscriptionValidation");
const authenticate = require("../../../middleware/authMiddleware");

// Protected routes
router.use(authenticate);

// Get user's subscription
router.get("/", subscriptionController.getSubscription);

// Admin routes
router.post(
  "/adjust",
  validate(subscriptionValidation.adjustSubscription),
  subscriptionController.adjustSubscription,
);

module.exports = router;
