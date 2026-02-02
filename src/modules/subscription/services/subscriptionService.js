// subscriptionService code
const { prisma } = require("../../../config/db");

// Get subscription for a user (throws if not found)
const getSubscription = async (userId) => {
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
  });
  if (!subscription) throw new Error("subscription.not_found");
  return subscription;
};

// Get subscription by userId (returns null if not found)
const getByUserId = async (userId) => {
  return prisma.subscription.findUnique({
    where: { userId },
  });
};

// Create subscription for new user
const createForUser = async (userId, initialBalance = 0) => {
  return prisma.subscription.create({
    data: {
      userId,
      balance: initialBalance,
      totalUsed: 0,
      isActive: true,
    },
  });
};

// Add balance to user (admin or top-up)
const addBalance = async (userId, amount) => {
  return prisma.subscription.upsert({
    where: { userId },
    update: {
      balance: { increment: amount },
      isActive: true,
    },
    create: {
      userId,
      balance: amount,
      totalUsed: 0,
      isActive: true,
    },
  });
};

// Adjust subscription balance (Admin only)
const adjustSubscription = async ({ userId, amount, action }) => {
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
  });
  if (!subscription) throw new Error("subscription.not_found");

  let newBalance = subscription.balance;
  let newTotalUsed = subscription.totalUsed;

  if (action === "CREDIT") {
    newBalance += amount;
  } else if (action === "DEBIT") {
    if (subscription.balance < amount)
      throw new Error("subscription.insufficient_balance");
    newBalance -= amount;
    newTotalUsed += amount;
  }

  return prisma.subscription.update({
    where: { userId },
    data: { balance: newBalance, totalUsed: newTotalUsed },
  });
};

module.exports = {
  getSubscription,
  getByUserId,
  createForUser,
  addBalance,
  adjustSubscription,
};
