const idGenerationController = require("./controllers/idGenerationController");
const idGenerationModel = require("./models/idGenerationModel");
const idGenerationRoutes = require("./routes/idGenerationRoutes");
const idGenerationService = require("./services/idGenerationService");
const idGenerationValidation = require("./validations/idGenerationValidation");

module.exports = {
  idGenerationController,
  idGenerationModel,
  idGenerationRoutes,
  idGenerationService,
  idGenerationValidation,
};
