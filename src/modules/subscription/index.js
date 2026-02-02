const subscriptionController = require("./controllers/subscriptionController");
const subscriptionModel = require("./models/subscriptionModel");
const subscriptionRoutes = require("./routes/subscriptionRoutes");
const subscriptionService = require("./services/subscriptionService");
const subscriptionValidation = require("./validations/subscriptionValidation");

module.exports = {
  subscriptionController,
  subscriptionModel,
  subscriptionRoutes,
  subscriptionService,
  subscriptionValidation,
};
