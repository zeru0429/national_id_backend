// idGenerationService code
const { prisma } = require("../../../config/db");
const usageLogService = require("../../usageLog/services/usageLogService");

// Generate new ID
const generateID = async (userId, data) => {
  const { fcn, fin, phoneNumber, extractedData, cost } = data;

  // Check subscription balance
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
  });
  if (!subscription || subscription.balance < cost) {
    throw new Error("subscription.insufficient_balance");
  }

  // Create ID generation record
  const generation = await prisma.iDGeneration.create({
    data: {
      userId,
      fcn,
      fin,
      phoneNumber,
      extractedData,
      cost,
      status: "COMPLETED",
    },
  });

  // Deduct subscription balance
  await prisma.subscription.update({
    where: { userId },
    data: {
      balance: { decrement: cost },
      totalUsed: { increment: cost },
    },
  });

  // Log usage
  await usageLogService.createLog({
    userId,
    generationId: generation.id,
    amount: cost,
    action: "GENERATE_ID",
  });

  return generation;
};

// Regenerate ID
const regenerateID = async (userId, generationId) => {
  const generation = await prisma.iDGeneration.findUnique({
    where: { id: generationId },
  });
  if (!generation || generation.userId !== userId)
    throw new Error("id_generation.not_found");

  // Optionally, deduct cost again or handle subscription

  return generation;
};

// Get all generations for a user
const getUserGenerations = async (userId) => {
  return prisma.iDGeneration.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
};

// Get single generation by ID
const getGenerationById = async (userId, generationId) => {
  const generation = await prisma.iDGeneration.findUnique({
    where: { id: generationId },
  });
  if (!generation || generation.userId !== userId)
    throw new Error("id_generation.not_found");
  return generation;
};

module.exports = {
  generateID,
  regenerateID,
  getUserGenerations,
  getGenerationById,
};
