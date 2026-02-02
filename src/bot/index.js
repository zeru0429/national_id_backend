//bot/index.js
const TelegramBot = require("node-telegram-bot-api");
require("dotenv").config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

const { handleMessage } = require("./utils/messageDispatcher");
const { handleCallbackQuery } = require("./utils/callbackDispatcher");
const initHandlers = require("./handlers");

console.log("🤖 Telegram Bot started");

bot.on("message", (msg) => handleMessage(bot, msg));
bot.on("callback_query", (query) => handleCallbackQuery(bot, query));

initHandlers(bot);

module.exports = bot;
