const detectionController = require("./controllers/detectionController");
const detectionModel = require("./models/detectionModel");
const detectionRoutes = require("./routes/detectionRoutes");
const detectionService = require("./services/detectionService");
const detectionValidation = require("./validations/detectionValidation");

module.exports = {
  detectionController,
  detectionModel,
  detectionRoutes,
  detectionService,
  detectionValidation,
};
