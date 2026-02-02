// subscriptionService code
const { prisma } = require("../../../config/db");

// Get subscription for a user
const getSubscription = async (userId) => {
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
  });
  if (!subscription) throw new Error("subscription.not_found");
  return subscription;
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
  adjustSubscription,
};
