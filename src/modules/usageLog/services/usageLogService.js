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

// Get total spent by user
const getTotalSpentByUser = async (userId) => {
  const result = await prisma.usageLog.aggregate({
    where: { userId },
    _sum: { amount: true },
  });
  return result._sum.amount || 0;
};

// Admin: aggregated stats for dashboard
const getAdminStats = async () => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [
    totalRevenue,
    todayRevenue,
    totalGenerations,
    todayGenerations,
    totalUsers,
    adminCount,
    activeSubscriptions,
    activeTodayUsers,
  ] = await Promise.all([
    prisma.usageLog.aggregate({ _sum: { amount: true } }),
    prisma.usageLog.aggregate({
      where: { createdAt: { gte: todayStart } },
      _sum: { amount: true },
    }),
    prisma.iDGeneration.count(),
    prisma.iDGeneration.count({
      where: { createdAt: { gte: todayStart } },
    }),
    prisma.user.count(),
    prisma.user.count({ where: { role: "ADMIN" } }),
    prisma.subscription.count({ where: { isActive: true } }),
    prisma.user.count({
      where: {
        generations: { some: { createdAt: { gte: todayStart } } },
      },
    }),
  ]);

  return {
    totalRevenue: totalRevenue._sum.amount || 0,
    todayRevenue: todayRevenue._sum.amount || 0,
    totalGenerations,
    todayGenerations,
    totalUsers,
    adminCount,
    activeSubscriptions,
    activeTodayUsers,
  };
};

module.exports = {
  getUserLogs,
  getAllLogs,
  filterLogs,
  createLog,
  getTotalSpentByUser,
  getAdminStats,
};
