/**
 * Telegram Bot Entry Point
 */

const TelegramBot = require("node-telegram-bot-api");
require("dotenv").config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

const { handleMessage } = require("./dispatchers/message.dispatcher");
const { handleCallbackQuery } = require("./dispatchers/callback.dispatcher");
const { startHandler } = require("./handlers/start.handler");

console.log("🤖 Telegram Bot started");

bot.on("message", (msg) => handleMessage(bot, msg));
bot.on("callback_query", (query) => handleCallbackQuery(bot, query));

startHandler(bot);

module.exports = bot;
