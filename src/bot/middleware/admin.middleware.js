/**
 * Authorization middleware for admin-only actions
 */

const usersService = require("../../modules/users/services/usersService");

/**
 * Checks if user has ADMIN role
 * @param {string} userId - User ID
 * @returns {Promise<boolean>}
 */
async function isAdmin(userId) {
  const user = await usersService.getUser(userId);
  return user?.role === "ADMIN";
}

/**
 * Requires admin role. Returns user if admin, null otherwise.
 */
async function requireAdmin(chatId) {
  const usersService = require("../../modules/users/services/usersService");
  const user = await usersService.findByTelegramId(chatId.toString());
  if (!user) return null;
  if (user.role !== "ADMIN") return { user, isAdmin: false };
  return { user, isAdmin: true };
}

/**
 * Wraps a handler to require admin. Sends error message if not admin.
 */
function withAdmin(handler) {
  return async (bot, ctx, ...args) => {
    const auth = await requireAdmin(ctx.chatId);
    if (!auth) {
      await bot.sendMessage(ctx.chatId, "❌ Please register first using /start");
      return null;
    }
    if (!auth.isAdmin) {
      await bot.sendMessage(ctx.chatId, "❌ Admin access required.");
      return null;
    }
    return handler(bot, { ...ctx, user: auth.user }, ...args);
  };
}

module.exports = { isAdmin, requireAdmin, withAdmin };
