/**
 * Authentication middleware for Telegram bot
 * Ensures user is registered before proceeding
 */

const usersService = require("../../modules/users/services/usersService");

/**
 * Resolves current user from chat. Returns { user, chatId } or null if not registered.
 * @param {Object} context - { chatId, telegramId }
 * @returns {Promise<{user: Object, chatId: number}|null>}
 */
async function requireUser(chatId) {
  const telegramId = chatId.toString();
  const user = await usersService.findByTelegramId(telegramId);
  if (!user) return null;
  return { user, chatId };
}

/**
 * Wraps a handler to require authentication. If user not found, sends message and returns.
 */
function withAuth(handler) {
  return async (bot, ctx, ...args) => {
    const auth = await requireUser(ctx.chatId);
    if (!auth) {
      await bot.sendMessage(ctx.chatId, "❌ Please register first using /start");
      return null;
    }
    return handler(bot, { ...ctx, ...auth }, ...args);
  };
}

module.exports = { requireUser, withAuth };
