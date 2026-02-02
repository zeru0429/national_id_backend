//bot/handlers/index.js
const { startHandler } = require("./startHandler");
const { registerUserHandler } = require("./registrationHandler");

module.exports = function initHandlers(bot) {
  startHandler(bot);
  registerUserHandler(bot);
};
