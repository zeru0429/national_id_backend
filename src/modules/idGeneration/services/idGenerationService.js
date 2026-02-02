// idGenerationService code
const { prisma } = require("../../../config/db");
const path = require("path");
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

// Find by ID or short prefix (for download callbacks)
const findByIdForDownload = async (userId, shortOrFullId) => {
  let record = await prisma.iDGeneration.findUnique({
    where: { id: shortOrFullId },
    include: { files: true },
  });
  if (record && record.userId === userId) return record;
  if (shortOrFullId.length >= 8) {
    record = await prisma.iDGeneration.findFirst({
      where: { userId, id: { startsWith: shortOrFullId } },
      include: { files: true },
    });
  }
  return record;
};

// Paginated list for user
const findByUserIdPaginated = async (userId, page = 1, limit = 10) => {
  const [generations, total] = await Promise.all([
    prisma.iDGeneration.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { files: true },
    }),
    prisma.iDGeneration.count({ where: { userId } }),
  ]);
  return { generations, total, totalPages: Math.ceil(total / limit) };
};

// Search by FCN, FIN, or name
const searchByUser = async (userId, query, limit = 10) => {
  return prisma.iDGeneration.findMany({
    where: {
      userId,
      OR: [
        { fcn: { contains: query, mode: "insensitive" } },
        { fin: { contains: query, mode: "insensitive" } },
        { extractedData: { path: ["name_en"], string_contains: query } },
        { extractedData: { path: ["name_am"], string_contains: query } },
      ],
    },
    include: { files: true },
    take: limit,
    orderBy: { createdAt: "desc" },
  });
};

// Create generation with files (for bot flow)
const createWithFiles = async (userId, extractedData, cost, files) => {
  const generation = await prisma.iDGeneration.create({
    data: {
      userId,
      fcn: extractedData.fcn,
      fin: extractedData.fin,
      phoneNumber: extractedData.phoneNumber,
      extractedData,
      cost,
      status: "COMPLETED",
      files: {
        create: files.map((f) => ({
          role: f.role,
          fileName: path.basename(f.fileUrl),
          fileUrl: f.fileUrl,
        })),
      },
    },
    include: { files: true },
  });

  const subscriptionService = require("../../subscription/services/subscriptionService");
  await subscriptionService.adjustSubscription({
    userId,
    amount: cost,
    action: "DEBIT",
  });

  await usageLogService.createLog({
    userId,
    generationId: generation.id,
    amount: cost,
    action: "GENERATE_ID",
  });

  return generation;
};

// Admin: get generations for a user (paginated)
const getGenerationsForUserPaginated = async (userId, page = 1, limit = 10) => {
  const [generations, total] = await Promise.all([
    prisma.iDGeneration.findMany({
      where: { userId },
      skip: (page - 1) * limit,
      take: limit,
      include: { files: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.iDGeneration.count({ where: { userId } }),
  ]);
  return { generations, total, totalPages: Math.ceil(total / limit) };
};

module.exports = {
  generateID,
  regenerateID,
  getUserGenerations,
  getGenerationById,
  findByIdForDownload,
  findByUserIdPaginated,
  searchByUser,
  createWithFiles,
  getGenerationsForUserPaginated,
};
