//bot/utils/messageDispatcher.js
const state = require("./stateManager");
const {
  handleRegistrationMessage,
} = require("../handlers/registrationHandler");
const {
  handleIDMessage,
  searchID,
} = require("../handlers/idGenerationHandler");
const keyboards = require("./keyboards");

async function handleMessage(bot, msg) {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();
  const messageId = msg.message_id;

  // Ignore messages from groups
  if (msg.chat.type !== "private") return;

  // Handle /help command
  if (text === "/help") {
    return bot.sendMessage(
      chatId,
      "📚 *Help*\n\nUse /start to begin\nUse /profile to view your profile\n\nFor detailed help, use the Help button in the main menu.",
      { parse_mode: "Markdown" },
    );
  }

  // Handle /profile command
  if (text === "/profile") {
    const usersService = require("../../modules/users/services/usersService");
    const user = await usersService.findByTelegramId(chatId);

    if (!user) {
      return bot.sendMessage(
        chatId,
        "❌ Please register first using /start",
        keyboards.getBackKeyboard("main_menu"),
      );
    }

    // Call the profile handler from callback dispatcher
    const { handleCallbackQuery } = require("./callbackDispatcher");
    await handleCallbackQuery(bot, {
      message: { chat: { id: chatId }, message_id: messageId },
      data: "profile",
      id: "profile_cmd",
    });
    return;
  }

  const userState = state.get(chatId);
  if (!userState) return;
  // Handle admin search queries
  if (userState?.step === "ADMIN_SEARCH_QUERY") {
    await adminHandler.handleAdminSearchUser(bot, chatId, text);
    state.remove(chatId);
    return;
  }

  // Handle admin add balance
  if (userState?.step === "ADMIN_ADD_BALANCE") {
    await adminHandler.handleAdminAddBalance(
      bot,
      chatId,
      userState.data.userId,
      text,
    );
    state.remove(chatId);
    return;
  }
  // Route based on current state
  if (
    [
      "AWAITING_FULL_NAME",
      "AWAITING_PHONE",
      "AWAITING_EMAIL",
      "EDIT_NAME",
      "EDIT_PHONE",
      "EDIT_EMAIL",
    ].includes(userState.step)
  ) {
    await handleRegistrationMessage(bot, msg);
  } else if (userState.step?.startsWith("ID_")) {
    await handleIDMessage(bot, msg);
  } else if (userState.step === "AWAITING_SEARCH_QUERY") {
    if (!text || text.length < 2) {
      return bot.sendMessage(
        chatId,
        "❌ Search query must be at least 2 characters.\n\nPlease enter FCN, FIN, or name:",
        keyboards.getCancelKeyboard(),
      );
    }

    await searchID(bot, chatId, text, userState.data.userId);
    state.remove(chatId);
  }
}

module.exports = { handleMessage };
