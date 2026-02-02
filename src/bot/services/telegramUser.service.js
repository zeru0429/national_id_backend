/**
 * Telegram user orchestration - uses module services only
 */

const usersService = require("../../modules/users/services/usersService");
const subscriptionService = require("../../modules/subscription/services/subscriptionService");

async function getOrCreateUser(telegramId) {
  const user = await usersService.findByTelegramId(telegramId.toString());
  return user;
}


async function getProfileData(telegramId) {
  const user = await usersService.findByTelegramId(telegramId.toString());
  if (!user) return null;
  const withSub = await usersService.getWithSubscription(user.id);
  return withSub;
}

async function getBalanceData(telegramId) {
  const user = await usersService.findByTelegramId(telegramId.toString());
  if (!user) return null;
  const subscription = await subscriptionService.getByUserId(user.id);
  return { user, subscription };
}

module.exports = {
  getOrCreateUser,
  getProfileData,
  getBalanceData,
};
