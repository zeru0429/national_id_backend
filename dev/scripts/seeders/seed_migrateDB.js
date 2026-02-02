require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const logger = require("./utils/logger");

// Seeders
const seedUsers = require("./seeders/seedUsers");
const seedSubscriptions = require("./seeders/seedSubscriptions");
const seedIDGenerations = require("./seeders/seedIDGenerations");
const seedUsageLogs = require("./seeders/seedUsageLogs");

// Clear database
const clearAll = require("./seeders/clearAll");

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const SHOULD_CLEAR = args.includes("--clear");

async function main() {
  logger.info("🚀 Starting database seeding...");

  if (SHOULD_CLEAR) {
    logger.warn("--clear flag detected, clearing database...");
    await clearAll(prisma, logger);
  }

  // 1️⃣ Users
  await seedUsers({ prisma, logger });

  // 2️⃣ Subscriptions
  await seedSubscriptions({ prisma, logger });

  // 3️⃣ ID Generations
  await seedIDGenerations({ prisma, logger });

  // 4️⃣ Usage Logs
  await seedUsageLogs({ prisma, logger });

  logger.success("🎉 Database seeding completed successfully!");
}

main()
  .catch((err) => {
    logger.error("❌ Seeding failed");
    console.error(err);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
