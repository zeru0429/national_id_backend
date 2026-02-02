const usersController = require("./controllers/usersController");
const usersModel = require("./models/usersModel");
const usersRoutes = require("./routes/usersRoutes");
const usersService = require("./services/usersService");
const usersValidation = require("./validations/usersValidation");

module.exports = {
  usersController,
  usersModel,
  usersRoutes,
  usersService,
  usersValidation,
};
