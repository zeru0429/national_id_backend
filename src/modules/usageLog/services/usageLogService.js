// usageLogService code
const { prisma } = require("../../../config/db");

// Get logs for a specific user
const getUserLogs = async (userId) => {
  return prisma.usageLog.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
};

// Get all logs (Admin)
const getAllLogs = async () => {
  return prisma.usageLog.findMany({
    orderBy: { createdAt: "desc" },
  });
};

// Filter logs by user, action, or date
const filterLogs = async ({ userId, action, fromDate, toDate }) => {
  const where = {};

  if (userId) where.userId = userId;
  if (action) where.action = action;
  if (fromDate || toDate) where.createdAt = {};
  if (fromDate) where.createdAt.gte = new Date(fromDate);
  if (toDate) where.createdAt.lte = new Date(toDate);

  return prisma.usageLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });
};

// Create log (used internally in ID generation or subscription adjustments)
const createLog = async ({ userId, generationId, amount, action }) => {
  return prisma.usageLog.create({
    data: { userId, generationId, amount, action },
  });
};

module.exports = {
  getUserLogs,
  getAllLogs,
  filterLogs,
  createLog,
};
