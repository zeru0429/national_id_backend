const storedFileController = require("./controllers/storedFileController");
const storedFileModel = require("./models/storedFileModel");
const storedFileRoutes = require("./routes/storedFileRoutes");
const storedFileService = require("./services/storedFileService");
const storedFileValidation = require("./validations/storedFileValidation");

module.exports = {
  storedFileController,
  storedFileModel,
  storedFileRoutes,
  storedFileService,
  storedFileValidation,
};
