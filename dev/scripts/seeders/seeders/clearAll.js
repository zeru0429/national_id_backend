module.exports = async (prisma, logger) => {
  logger.info("Clearing database...");

  // ---------------------------
  // Child tables first
  // ---------------------------

  // Stored files linked to ID generations
  await prisma.storedFile.deleteMany();
  
  // Usage logs linked to users/generations
  await prisma.usageLog.deleteMany();

  // ID generations
  await prisma.iDGeneration.deleteMany();

  // Subscriptions
  await prisma.subscription.deleteMany();

  // Auth accounts (passwords, google, etc.)
  await prisma.authAccount.deleteMany();

  // Users (top-level)
  await prisma.user.deleteMany();

  logger.success("Database cleared successfully!");
};
