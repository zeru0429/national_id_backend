const auth = require("./modules/auth/index");
const users = require("./modules/users/index");
const subscription = require("./modules/subscription/index");
const idGeneration = require("./modules/idGeneration/index");
const usageLog = require("./modules/usageLog/index");
const storedFile = require("./modules/storedFile/index");
const detection = require("./modules/detection/index");

module.exports = {
  auth,
  users,
  subscription,
  idGeneration,
  usageLog,
  storedFile,
  detection,
};
