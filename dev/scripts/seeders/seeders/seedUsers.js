const { hashPassword } = require("../utils/crypto");
const users = require("../data/users.data");

module.exports = async ({ prisma, logger }) => {
  logger.info("Seeding users...");

  for (const u of users) {
    const user = await prisma.user.create({
      data: {
        email: u.email,
        fullName: `${u.firstName} ${u.lastName}`,
        phoneNumber: u.phoneNumber,
        language: u.language || "EN",
        role: u.role || "USER",
        authAccounts: {
          create: [
            {
              provider: "PASSWORD",
              providerUserId: u.email,
              passwordHash: await hashPassword(u.password),
            },
          ],
        },
      },
    });

    logger.info(`Created user: ${user.email}`);
  }

  logger.success("Users seeded");
};
