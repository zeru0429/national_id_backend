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
  return usersService.searchUsers(query, 10);
}

async function getUserDetails(userId) {
  const user = await usersService.getUserWithDetails(userId);
  if (!user) return null;
  const totalSpent = await usageLogService.getTotalSpentByUser(userId);
  return { ...user, totalSpent };
}

async function addBalanceToUser(userId, amount) {
  const subscription = await subscriptionService.addBalance(userId, amount);
  await usageLogService.createLog({
    userId,
    amount,
    action: "ADMIN_ADD_BALANCE",
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

module.exports = {
  getUsersPaginated,
  searchUsers,
  getUserDetails,
  addBalanceToUser,
  changeUserRole,
  toggleUserBlock,
  getUserGenerations,
  getStats,
};
