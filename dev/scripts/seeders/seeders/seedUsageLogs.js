module.exports = async ({ prisma, logger }) => {
  logger.info("Seeding usage logs...");

  const generations = await prisma.iDGeneration.findMany();

  for (const gen of generations) {
    await prisma.usageLog.create({
      data: {
        userId: gen.userId,
        generationId: gen.id,
        amount: gen.cost,
        action: "GENERATE_ID",
      },
    });
  }

  logger.success("Usage logs seeded");
};
