/**
 * Start command and main menu handler
 */

const usersService = require("../../modules/users/services/usersService");
const stateManager = require("../utils/stateManager");
const keyboards = require("../ui/keyboards");
const messages = require("../ui/messages");

async function sendMainMenu(bot, chatId) {
  try {
    const keyboard = await keyboards.getMainKeyboard(chatId);
    await bot.sendMessage(chatId, messages.mainMenu, {
      parse_mode: "Markdown",
      ...keyboard,
    });
  } catch (error) {
    console.error("Error sending main menu:", error);
    await bot.sendMessage(chatId, messages.mainMenuError);
  }
}

function startHandler(bot) {
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const firstName = msg.from.first_name;

    try {
      const existingUser = await usersService.findByTelegramId(chatId);

      if (existingUser) {
        await bot.sendMessage(chatId, messages.start.welcomeBack(firstName), {
          parse_mode: "Markdown",
        });
        return sendMainMenu(bot, chatId);
      }

      await bot.sendMessage(chatId, messages.start.welcomeNew(firstName), {
        parse_mode: "Markdown",
      });
      await bot.sendMessage(chatId, messages.start.registrationStep1, {
        parse_mode: "Markdown",
        ...keyboards.getCancelKeyboard(),
      });

      stateManager.set(chatId, {
        step: "AWAITING_FULL_NAME",
        data: {},
        registrationStep: 1,
      });
    } catch (err) {
      console.error("Start error:", err);
      await bot.sendMessage(chatId, messages.errors.generic);
    }
  });

  bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    await bot.sendMessage(chatId, messages.help, {
      parse_mode: "Markdown",
      ...keyboards.getBackKeyboard("main_menu"),
    });
  });
}

module.exports = { startHandler, sendMainMenu };
