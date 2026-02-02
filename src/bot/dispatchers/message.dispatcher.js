/**
 * Message dispatcher - routes incoming messages to appropriate handlers
 */

const stateManager = require("../utils/stateManager");
const { handleRegistrationMessage } = require("../handlers/registration.handler");
const { handleIDMessage, searchID } = require("../handlers/idGeneration.handler");
const adminHandler = require("../handlers/admin.handler");
const keyboards = require("../ui/keyboards");
const messages = require("../ui/messages");
const usersService = require("../../modules/users/services/usersService");

async function handleMessage(bot, msg) {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();

  if (msg.chat.type !== "private") return;

  if (text === "/help") {
    return bot.sendMessage(chatId, messages.helpShort, {
      parse_mode: "Markdown",
    });
  }

  if (text === "/profile") {
    const user = await usersService.findByTelegramId(chatId);
    if (!user) {
      return bot.sendMessage(
        chatId,
        messages.profileNotFound,
        keyboards.getBackKeyboard("main_menu")
      );
    }
    const { handleCallbackQuery } = require("./callback.dispatcher");
    await handleCallbackQuery(bot, {
      message: { chat: { id: chatId }, message_id: msg.message_id },
      data: "profile",
      id: "profile_cmd",
    });
    return;
  }

  const userState = stateManager.get(chatId);
  if (!userState) return;

  if (userState.step === "ADMIN_SEARCH_QUERY") {
    await adminHandler.handleAdminSearchUser(bot, chatId, text);
    stateManager.remove(chatId);
    return;
  }

  if (userState.step === "ADMIN_ADD_BALANCE") {
    await adminHandler.handleAdminAddBalance(
      bot,
      chatId,
      userState.data.userId,
      text
    );
    stateManager.remove(chatId);
    return;
  }

  const registrationSteps = [
    "AWAITING_FULL_NAME",
    "AWAITING_PHONE",
    "AWAITING_EMAIL",
    "EDIT_NAME",
    "EDIT_PHONE",
    "EDIT_EMAIL",
  ];
  if (registrationSteps.includes(userState.step)) {
    await handleRegistrationMessage(bot, msg);
    return;
  }

  if (userState.step?.startsWith("ID_")) {
    await handleIDMessage(bot, msg);
    return;
  }

  if (userState.step === "AWAITING_SEARCH_QUERY") {
    if (!text || text.length < 2) {
      return bot.sendMessage(
        chatId,
        "❌ Search query must be at least 2 characters.\n\nPlease enter FCN, FIN, or name:",
        keyboards.getCancelKeyboard()
      );
    }
    await searchID(bot, chatId, text, userState.data.userId);
    stateManager.remove(chatId);
  }
}

module.exports = { handleMessage };
