/**
 * Admin operations - uses module services only, no direct DB access
 */

const usersService = require("../../modules/users/services/usersService");
const subscriptionService = require("../../modules/subscription/services/subscriptionService");
const idGenerationService = require("../../modules/idGeneration/services/idGenerationService");
const usageLogService = require("../../modules/usageLog/services/usageLogService");

async function getUsersPaginated(page = 1, limit = 10) {
  return usersService.getUsersPaginated(page, limit);
}

async function searchUsers(query) {
  if (!query || typeof query !== "string" || !query.trim()) {
    return { data: [], total: 0 };
  }
  return usersService.searchUsers(query.trim(), 10);
}
async function getUserDetails(userId) {
  const user = await usersService.getUserWithDetails(userId);
  if (!user) return null;
  const totalSpent = await usageLogService.getTotalSpentByUser(userId);
  return { ...user, totalSpent };
}

async function addBalanceToUser(userId, amount) {
  const parsedAmount = Number(amount);
  if (!Number.isInteger(parsedAmount) || parsedAmount <= 0) {
    throw new Error("Invalid credit amount");
  }

  const subscription =
    (await subscriptionService.addBalance(userId, parsedAmount)) ||
    (await subscriptionService.createSubscription(userId, parsedAmount));

  await usageLogService.createLog({
    userId,
    amount: parsedAmount,
    action: "ADMIN_ADJUST",
  });

  return subscription;
}

async function changeUserRole(userId) {
  return usersService.changeRole(userId);
}

async function toggleUserBlock(userId) {
  return usersService.toggleBlock(userId);
}

async function getUserGenerations(userId, page = 1, limit = 10) {
  return idGenerationService.getGenerationsForUserPaginated(userId, page, limit);
}

async function getStats() {
  return usageLogService.getAdminStats();
}

async function getUserLogs(userId, limit = 20) {
  const user = await usersService.getUserWithDetails(userId);
  if (!user) return null;
  const logs = await usageLogService.getUserLogs(userId);
  return { user, logs: (logs || []).slice(0, limit) };
}

module.exports = {
  getUsersPaginated,
  searchUsers,
  getUserDetails,
  addBalanceToUser,
  changeUserRole,
  toggleUserBlock,
  getUserGenerations,
  getStats,
  getUserLogs,
};
