module.exports = async ({ prisma, logger }) => {
  logger.info("Seeding subscriptions...");

  const users = await prisma.user.findMany();

  for (const user of users) {
    await prisma.subscription.create({
      data: {
        userId: user.id,
        balance: user.role === "ADMIN" ? 999999 : 0,
        totalUsed: 0,
        isActive: true,
      },
    });
    logger.info(`Subscription created for: ${user.email}`);
  }

  logger.success("Subscriptions seeded");
};
