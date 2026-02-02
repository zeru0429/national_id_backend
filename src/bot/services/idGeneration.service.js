/**
 * ID Generation orchestration for bot - uses module services only
 */

const idGenerationService = require("../../modules/idGeneration/services/idGenerationService");
const subscriptionService = require("../../modules/subscription/services/subscriptionService");
const { ID_GENERATION_COST, PAGINATION_LIMIT } = require("../config/constants");

async function checkBalance(userId) {
  const subscription = await subscriptionService.getByUserId(userId);
  if (!subscription) return { ok: false, balance: 0 };
  if (subscription.balance < ID_GENERATION_COST) {
    return { ok: false, balance: subscription.balance };
  }
  return { ok: true, balance: subscription.balance, subscription };
}

async function getPastGenerations(userId, page = 1, limit = PAGINATION_LIMIT) {
  return idGenerationService.findByUserIdPaginated(userId, page, limit);
}

async function searchGenerations(userId, query) {
  return idGenerationService.searchByUser(userId, query, 10);
}

async function getGenerationForDownload(userId, shortOrFullId) {
  return idGenerationService.findByIdForDownload(userId, shortOrFullId);
}

module.exports = {
  checkBalance,
  getPastGenerations,
  searchGenerations,
  getGenerationForDownload,
};
