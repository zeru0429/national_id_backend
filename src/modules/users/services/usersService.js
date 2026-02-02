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

// Find user by Telegram ID (checks both User.telegramId and AuthAccount)
const findByTelegramId = async (telegramId) => {
  const id = telegramId.toString().trim();
  // Try User.telegramId first (preferred for bot flows)
  let user = await prisma.user.findUnique({
    where: { telegramId: id },
    include: { subscription: true },
  });
  if (user) return user;
  // Fallback: AuthAccount lookup
  const authAccount = await prisma.authAccount.findUnique({
    where: {
      provider_providerUserId: {
        provider: "TELEGRAM",
        providerUserId: id,
      },
    },
    include: { user: { include: { subscription: true } } },
  });
  if (authAccount?.user) {
    // Sync telegramId to User for future lookups
    await prisma.user.update({
      where: { id: authAccount.user.id },
      data: { telegramId: id },
    });
    return authAccount.user;
  }
  return null;
};

// Create user with Telegram
const createByTelegram = async (data) => {
  const normalizedEmail = data.email ? data.email.toString().trim().toLowerCase() : null;
  const normalizedPhone = data.phoneNumber
    ? data.phoneNumber.toString().trim().replace(/\s+/g, "")
    : null;

  // Check for existing email or phone
  if (normalizedEmail) {
    const existingEmail = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existingEmail) throw new Error("users.email_exists");
  }

  if (normalizedPhone) {
    const existingPhone = await prisma.user.findUnique({
      where: { phoneNumber: normalizedPhone },
    });
    if (existingPhone) throw new Error("users.phone_exists");
  }

  let user;
  try {
    // Create user (include telegramId when provided)
    user = await prisma.user.create({
      data: {
        fullName: data.fullName,
        email: normalizedEmail,
        phoneNumber: normalizedPhone,
        language: data.language || "EN",
        telegramId: data.telegramId ? data.telegramId.toString() : null,
      },
    });
  } catch (err) {
    // Handle races / unique constraints gracefully
    if (err?.code === "P2002") {
      const targets = err?.meta?.target || [];
      if (Array.isArray(targets) && targets.includes("phoneNumber")) {
        throw new Error("users.phone_exists");
      }
      if (Array.isArray(targets) && targets.includes("email")) {
        throw new Error("users.email_exists");
      }
      // Fallback: generic conflict
      throw new Error("users.conflict");
    }
    throw err;
  }

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

// Get user with subscription (for profile display)
const getWithSubscription = async (id) => {
  return prisma.user.findUnique({
    where: { id },
    include: { subscription: true },
  });
};

// Update profile fields (for bot edit profile)
const updateProfile = async (id, data) => {
  return prisma.user.update({
    where: { id },
    data: { fullName: data.fullName, phoneNumber: data.phoneNumber, email: data.email },
  });
};

// =============================
// Admin Methods
// =============================

const getUsersPaginated = async (page = 1, limit = 10) => {
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      skip: (page - 1) * limit,
      take: limit,
      include: {
        subscription: true,
        _count: { select: { generations: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.count(),
  ]);
  return { users, total, totalPages: Math.ceil(total / limit) };
};

const searchUsers = async (query, limit = 10) => {
  return prisma.user.findMany({
    where: {
      OR: [
        { phoneNumber: { contains: query, mode: "insensitive" } },
        { fullName: { contains: query, mode: "insensitive" } },
        { telegramId: { contains: query } },
        { email: { contains: query, mode: "insensitive" } },
      ],
    },
    include: {
      subscription: true,
      _count: { select: { generations: true } },
    },
    take: limit,
  });
};

const getUserWithDetails = async (userId) => {
  return prisma.user.findUnique({
    where: { id: userId },
    include: {
      subscription: true,
      generations: {
        take: 5,
        orderBy: { createdAt: "desc" },
        include: { files: true },
      },
      _count: { select: { generations: true, usageLogs: true } },
    },
  });
};

const changeRole = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user) throw new Error("users.not_found");
  const newRole = user.role === "ADMIN" ? "USER" : "ADMIN";
  return prisma.user.update({
    where: { id: userId },
    data: { role: newRole },
  });
};

const toggleBlock = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isBlocked: true },
  });
  if (!user) throw new Error("users.not_found");
  return prisma.user.update({
    where: { id: userId },
    data: { isBlocked: !user.isBlocked },
  });
};

const getAdminTelegramIds = async () => {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", telegramId: { not: null } },
    select: { telegramId: true },
  });
  return (admins || [])
    .map((a) => (a.telegramId ? a.telegramId.toString() : null))
    .filter(Boolean);
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
  getWithSubscription,
  updateProfile,

  // Admin
  getUsersPaginated,
  searchUsers,
  getUserWithDetails,
  changeRole,
  toggleBlock,
  getAdminTelegramIds,
};
