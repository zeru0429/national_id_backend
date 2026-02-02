const { prisma } = require("../../../config/db");

/**
 * =============================
 * Web/Admin Methods
 * =============================
 */

const getAllUsers = async (filters = {}) => {
  const {
    page = 1,
    limit = 10,
    search,
    role,
    has_pagination = true,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = filters;

  // Helper to parse boolean-like values
  const parseBool = (value) => {
    if (value === true || value === false) return value;
    if (value === "true") return true;
    if (value === "false") return false;
    return undefined;
  };

  const parsedHasPagination = parseBool(has_pagination) ?? true;
  const parsedPage = Number(page) || 1;
  const parsedLimit = Number(limit) || 10;

  // Build Prisma "where" filter
  const where = {
    ...(role && { role }), // Filter by role if provided
    ...(search && {
      OR: [
        { fullName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phoneNumber: { contains: search, mode: "insensitive" } },
      ],
    }),
  };

  const orderBy = {
    [sortBy]: sortOrder.toLowerCase() === "desc" ? "desc" : "asc",
  };

  if (parsedHasPagination) {
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: { authAccounts: true, subscription: true },
        skip: (parsedPage - 1) * parsedLimit,
        take: parsedLimit,
        orderBy,
      }),
      prisma.user.count({ where }),
    ]);

    return {
      users,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        totalPages: Math.ceil(total / parsedLimit),
        hasNext: parsedPage * parsedLimit < total,
        hasPrev: parsedPage > 1,
      },
    };
  } else {
    const users = await prisma.user.findMany({
      where,
      include: { authAccounts: true, subscription: true },
      orderBy,
    });
    return { users };
  }
};

const getUser = async (id) => {
  const user = await prisma.user.findUnique({
    where: { id },
    include: { authAccounts: true, subscription: true },
  });
  if (!user) throw new Error("users.not_found");
  return user;
};

const updateUser = async (id, data) => {
  return prisma.user.update({
    where: { id },
    data,
  });
};

const blockUser = async (id) => {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new Error("users.not_found");
  return prisma.user.update({
    where: { id },
    data: { isBlocked: !user.isBlocked },
  });
};

/**
 * =============================
 * Telegram Bot Methods
 * =============================
 */

// Find user by Telegram ID
const findByTelegramId = async (telegramId) => {
  const authAccount = await prisma.authAccount.findUnique({
    where: {
      provider_providerUserId: {
        provider: "TELEGRAM",
        providerUserId: telegramId.toString(),
      },
    },
    include: {
      user: { include: { subscription: true } },
    },
  });
  return authAccount?.user || null;
};

// Create user with Telegram
const createByTelegram = async (data) => {
  // Check for existing email or phone
  if (data.email) {
    const existingEmail = await prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existingEmail) throw new Error("users.email_exists");
  }

  if (data.phoneNumber) {
    const existingPhone = await prisma.user.findUnique({
      where: { phoneNumber: data.phoneNumber },
    });
    if (existingPhone) throw new Error("users.phone_exists");
  }

  // Create user
  const user = await prisma.user.create({
    data: {
      fullName: data.fullName,
      email: data.email,
      phoneNumber: data.phoneNumber,
      language: data.language || "EN",
    },
  });

  // Create Telegram auth account
  await prisma.authAccount.create({
    data: {
      userId: user.id,
      provider: "TELEGRAM",
      providerUserId: data.telegramId.toString(),
    },
  });

  return user;
};

// Update user by Telegram ID
const updateByTelegram = async (telegramId, data) => {
  // Find auth account
  const authAccount = await prisma.authAccount.findUnique({
    where: {
      provider_providerUserId: {
        provider: "TELEGRAM",
        providerUserId: telegramId.toString(),
      },
    },
  });

  if (!authAccount) throw new Error("users.not_found");

  // Check if email or phone exists for another user
  if (data.email) {
    const existingEmail = await prisma.user.findFirst({
      where: { email: data.email, id: { not: authAccount.userId } },
    });
    if (existingEmail) throw new Error("users.email_exists");
  }

  if (data.phoneNumber) {
    const existingPhone = await prisma.user.findFirst({
      where: { phoneNumber: data.phoneNumber, id: { not: authAccount.userId } },
    });
    if (existingPhone) throw new Error("users.phone_exists");
  }

  return prisma.user.update({
    where: { id: authAccount.userId },
    data,
  });
};

// Find user by email
const findByEmail = async (email) => {
  return prisma.user.findUnique({ where: { email } });
};

// Find user by phone
const findByPhone = async (phoneNumber) => {
  return prisma.user.findUnique({ where: { phoneNumber } });
};

module.exports = {
  // Admin/Web
  getAllUsers,
  getUser,
  updateUser,
  blockUser,

  // Telegram Bot
  findByTelegramId,
  createByTelegram,
  updateByTelegram,
  findByEmail,
  findByPhone,
};
