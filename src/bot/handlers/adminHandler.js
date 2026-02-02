// bot/handlers/adminHandler.js
const { prisma } = require("../../config/db");
const keyboards = require("../utils/keyboards");

// Helper function to escape Markdown
function escapeMarkdown(text) {
  if (!text) return "";

  return text.toString().replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

// Handle admin users list with pagination
async function handleAdminUsers(bot, chatId, page = 1, limit = 10) {
  const totalUsers = await prisma.user.count();
  const totalPages = Math.ceil(totalUsers / limit);

  const users = await prisma.user.findMany({
    skip: (page - 1) * limit,
    take: limit,
    include: {
      subscription: true,
      _count: {
        select: { generations: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  let message = `👥 *All Users*\n\nPage ${page}/${totalPages}\nTotal Users: ${totalUsers}\n\n`;

  const inlineKeyboard = [];

  users.forEach((user, idx) => {
    const globalIdx = (page - 1) * limit + idx + 1;
    const safeName = escapeMarkdown(user.fullName || "No Name");
    const safePhone = escapeMarkdown(user.phoneNumber || "No phone");

    message += `*${globalIdx}\\.${safeName}*\n`;
    message += `📞 ${safePhone}\n`;
    message += `💰 Balance: ${escapeMarkdown(user.subscription?.balance || 0)} ETB\n`;
    message += `📊 IDs: ${escapeMarkdown(user._count.generations)} \\| Role: ${escapeMarkdown(user.role)}\n`;

    const safeDate = escapeMarkdown(
      new Date(user.createdAt).toLocaleDateString(),
    );

    message += `📅 Joined: ${safeDate}\n\n`;

    // Add user action buttons
    inlineKeyboard.push([
      {
        text: `👤 ${globalIdx}`,
        callback_data: `admin_user_${user.id}`,
      },
      {
        text: "💰 Add Balance",
        callback_data: `admin_addbal_${user.id}`,
      },
      {
        text: user.role === "ADMIN" ? "👑 Remove Admin" : "👑 Make Admin",
        callback_data: `admin_role_${user.id}`,
      },
    ]);
  });

  // Pagination
  const paginationRow = [];
  if (page > 1) {
    paginationRow.push({
      text: "◀️ Previous",
      callback_data: `admin_users_${page - 1}`,
    });
  }
  paginationRow.push({
    text: `📄 ${page}/${totalPages}`,
    callback_data: "page_info",
  });
  if (page < totalPages) {
    paginationRow.push({
      text: "Next ▶️",
      callback_data: `admin_users_${page + 1}`,
    });
  }

  if (paginationRow.length > 0) {
    inlineKeyboard.push(paginationRow);
  }

  // Search and navigation
  inlineKeyboard.push([
    { text: "🔍 Search User", callback_data: "admin_search" },
    { text: "📊 Stats", callback_data: "admin_stats" },
  ]);
  inlineKeyboard.push([
    { text: "⬅️ Admin Panel", callback_data: "admin_panel" },
  ]);

  await bot.sendMessage(chatId, message, {
    parse_mode: "MarkdownV2",
    reply_markup: { inline_keyboard: inlineKeyboard },
  });
}

// Handle admin search user
async function handleAdminSearchUser(bot, chatId, query = null) {
  if (!query) {
    await bot.sendMessage(
      chatId,
      "🔍 *Search Users*\n\nEnter phone number, name, or Telegram ID to search:",
      {
        parse_mode: "MarkdownV2",
        ...keyboards.getCancelKeyboard(),
      },
    );
    return { step: "ADMIN_SEARCH_QUERY" };
  }

  const results = await prisma.user.findMany({
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
      _count: {
        select: { generations: true },
      },
    },
    take: 10,
  });

  if (!results.length) {
    await bot.sendMessage(
      chatId,
      `🔍 *No users found for "*${escapeMarkdown(query)}*"*\n\nTry a different search term.`,
      {
        parse_mode: "MarkdownV2",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔍 Search Again", callback_data: "admin_search" }],
            [{ text: "👥 View All Users", callback_data: "admin_users_1" }],
            [{ text: "⬅️ Admin Panel", callback_data: "admin_panel" }],
          ],
        },
      },
    );
    return;
  }

  let message = `🔍 *Search Results*\n\nFound *${results.length}* user(s) for "*${escapeMarkdown(query)}*":\n\n`;

  const inlineKeyboard = [];

  results.forEach((user, idx) => {
    const safeName = escapeMarkdown(user.fullName || "No Name");
    const safePhone = escapeMarkdown(user.phoneNumber || "No phone");

    message += `*${idx + 1}\\.${safeName}*\n`;
    message += `📞 ${safePhone}\n`;
    message += `💰 Balance: ${escapeMarkdown(user.subscription?.balance || 0)} ETB\n`;

    message += `📊 IDs: ${escapeMarkdown(user._count.generations)} \\| Role: ${escapeMarkdown(user.role)}\n\n`;

    inlineKeyboard.push([
      {
        text: `👤 ${idx + 1}`,
        callback_data: `admin_user_${user.id}`,
      },
      {
        text: "💰 Add Balance",
        callback_data: `admin_addbal_${user.id}`,
      },
    ]);
  });

  inlineKeyboard.push([
    { text: "🔍 New Search", callback_data: "admin_search" },
    { text: "👥 View All", callback_data: "admin_users_1" },
  ]);
  inlineKeyboard.push([
    { text: "⬅️ Admin Panel", callback_data: "admin_panel" },
  ]);

  await bot.sendMessage(chatId, message, {
    parse_mode: "MarkdownV2",
    reply_markup: { inline_keyboard: inlineKeyboard },
  });
}

// Handle user details view
async function handleAdminUserDetail(bot, chatId, userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      subscription: true,
      generations: {
        take: 5,
        orderBy: { createdAt: "desc" },
        include: { files: true },
      },
      _count: {
        select: { generations: true, usageLogs: true },
      },
    },
  });

  if (!user) {
    await bot.sendMessage(chatId, "❌ User not found.");
    return;
  }

  const safeName = escapeMarkdown(user.fullName || "No Name");
  const safePhone = escapeMarkdown(user.phoneNumber || "No phone");
  const safeEmail = escapeMarkdown(user.email || "No email");
  const safeTelegramId = escapeMarkdown(user.telegramId || "No Telegram ID");

  const totalSpent = await prisma.usageLog.aggregate({
    where: { userId: user.id },
    _sum: { amount: true },
  });

  const lastGeneration = user.generations[0];
  const lastGenDate = lastGeneration
    ? new Date(lastGeneration.createdAt).toLocaleDateString()
    : "Never";

  const message = `
👤 *User Details*

*Name:* ${safeName}
*Phone:* ${safePhone}
*Email:* ${safeEmail}
*Telegram ID:* ${safeTelegramId}
*Status:* ${escapeMarkdown(user.isBlocked ? "Blocked" : "Active")}
*Joined:* ${escapeMarkdown(new Date(user.createdAt).toLocaleDateString())}
*Role:* ${escapeMarkdown(user.role)}
*Language:* ${escapeMarkdown(user.language)}

💰 *Subscription*
Balance: ${escapeMarkdown(user.subscription?.balance || 0)} ETB
Total Used: ${escapeMarkdown(user.subscription?.totalUsed || 0)} ETB
Total Spent: ${escapeMarkdown(totalSpent._sum.amount || 0)} ETB
Status: ${user.subscription?.isActive ? "✅ Active" : "❌ Inactive"}

📊 *Usage Stats*
Total Generations: ${user._count.generations}
Total Actions: ${user._count.usageLogs}
Last Generation: ${lastGenDate}

💡 *Quick Actions*
`;

  const inlineKeyboard = [
    [
      { text: "💰 Add Balance", callback_data: `admin_addbal_${user.id}` },
      { text: "📊 View Logs", callback_data: `admin_logs_${user.id}` },
    ],
    [
      {
        text: user.role === "ADMIN" ? "👑 Remove Admin" : "👑 Make Admin",
        callback_data: `admin_role_${user.id}`,
      },
      {
        text: user.isBlocked ? "✅ Unblock" : "❌ Block",
        callback_data: `admin_block_${user.id}`,
      },
    ],
    [
      {
        text: "📋 View Generations",
        callback_data: `admin_usergens_${user.id}_1`,
      },
      { text: "💳 Add Manual", callback_data: `admin_manualadd_${user.id}` },
    ],
    [
      { text: "🔍 Search Again", callback_data: "admin_search" },
      { text: "👥 All Users", callback_data: "admin_users_1" },
    ],
    [{ text: "⬅️ Admin Panel", callback_data: "admin_panel" }],
  ];

  await bot.sendMessage(chatId, message, {
    parse_mode: "MarkdownV2",
    reply_markup: { inline_keyboard: inlineKeyboard },
  });
}

// Handle add balance to user
async function handleAdminAddBalance(bot, chatId, userId, amount = null) {
  if (amount === null) {
    await bot.sendMessage(
      chatId,
      "💰 *Add Balance to User*\n\nEnter amount to add (ETB):",
      {
        parse_mode: "MarkdownV2",
        ...keyboards.getCancelKeyboard(),
      },
    );
    return { step: "ADMIN_ADD_BALANCE", data: { userId } };
  }

  const amountNum = parseInt(amount);
  if (isNaN(amountNum) || amountNum <= 0) {
    await bot.sendMessage(chatId, "❌ Please enter a valid positive amount.");
    return;
  }

  try {
    // Update or create subscription
    const subscription = await prisma.subscription.upsert({
      where: { userId },
      update: {
        balance: { increment: amountNum },
        isActive: true,
      },
      create: {
        userId,
        balance: amountNum,
        totalUsed: 0,
        isActive: true,
      },
    });

    // Log the transaction
    await prisma.usageLog.create({
      data: {
        userId,
        amount: amountNum,
        action: "ADMIN_ADD_BALANCE",
      },
    });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { fullName: true, phoneNumber: true },
    });

    const safeName = escapeMarkdown(user?.fullName || "User");

    await bot.sendMessage(
      chatId,
      `✅ *Balance Added Successfully!*\n\n👤 *User:* ${safeName}\n💰 *Amount:* ${amountNum} ETB\n💳 *New Balance:* ${subscription.balance} ETB`,
      {
        parse_mode: "MarkdownV2",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "💰 Add More", callback_data: `admin_addbal_${userId}` },
              { text: "👤 View User", callback_data: `admin_user_${userId}` },
            ],
            [
              { text: "🔍 Search User", callback_data: "admin_search" },
              { text: "👥 All Users", callback_data: "admin_users_1" },
            ],
            [{ text: "⬅️ Admin Panel", callback_data: "admin_panel" }],
          ],
        },
      },
    );
  } catch (error) {
    console.error("Add balance error:", error);
    await bot.sendMessage(
      chatId,
      "❌ Failed to add balance. Please try again.",
    );
  }
}

// Handle user role change (admin/normal)
async function handleAdminChangeRole(bot, chatId, userId) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, fullName: true },
    });

    if (!user) {
      await bot.sendMessage(chatId, "❌ User not found.");
      return;
    }

    const newRole = user.role === "ADMIN" ? "USER" : "ADMIN";

    await prisma.user.update({
      where: { id: userId },
      data: { role: newRole },
    });

    const safeName = escapeMarkdown(user.fullName || "User");

    await bot.sendMessage(
      chatId,
      `✅ *Role Updated!*\n\n👤 *User:* ${safeName}\n👑 *New Role:* ${newRole}`,
      {
        parse_mode: "MarkdownV2",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "👤 View User", callback_data: `admin_user_${userId}` },
              { text: "👥 All Users", callback_data: "admin_users_1" },
            ],
            [{ text: "⬅️ Admin Panel", callback_data: "admin_panel" }],
          ],
        },
      },
    );
  } catch (error) {
    console.error("Change role error:", error);
    await bot.sendMessage(chatId, "❌ Failed to change role.");
  }
}

// Handle user block/unblock
async function handleAdminBlockUser(bot, chatId, userId) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isBlocked: true, fullName: true },
    });

    if (!user) {
      await bot.sendMessage(chatId, "❌ User not found.");
      return;
    }

    const newBlockStatus = !user.isBlocked;

    await prisma.user.update({
      where: { id: userId },
      data: { isBlocked: newBlockStatus },
    });

    const safeName = escapeMarkdown(user.fullName || "User");
    const statusText = newBlockStatus ? "❌ Blocked" : "✅ Unblocked";

    await bot.sendMessage(
      chatId,
      `✅ *User Status Updated!*\n\n👤 *User:* ${safeName}\n📊 *Status:* ${statusText}`,
      {
        parse_mode: "MarkdownV2",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "👤 View User", callback_data: `admin_user_${userId}` },
              { text: "👥 All Users", callback_data: "admin_users_1" },
            ],
            [{ text: "⬅️ Admin Panel", callback_data: "admin_panel" }],
          ],
        },
      },
    );
  } catch (error) {
    console.error("Block user error:", error);
    await bot.sendMessage(chatId, "❌ Failed to update user status.");
  }
}

// Handle view user generations
async function handleAdminUserGenerations(
  bot,
  chatId,
  userId,
  page = 1,
  limit = 10,
) {
  const totalCount = await prisma.iDGeneration.count({ where: { userId } });
  const totalPages = Math.ceil(totalCount / limit);

  const generations = await prisma.iDGeneration.findMany({
    where: { userId },
    skip: (page - 1) * limit,
    take: limit,
    include: { files: true },
    orderBy: { createdAt: "desc" },
  });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { fullName: true },
  });

  const safeName = escapeMarkdown(user?.fullName || "User");

  let message = `📋 *Generations for ${safeName}*\n\nPage ${page}/${totalPages}\nTotal: ${totalCount} generations\n\n`;

  const inlineKeyboard = [];

  generations.forEach((gen, idx) => {
    const globalIdx = (page - 1) * limit + idx + 1;
    const name = gen.extractedData.name_en || "Unknown";
    const date = new Date(gen.createdAt).toLocaleDateString();
    const safeName = escapeMarkdown(name);

    message += `*${globalIdx}\\.${safeName}*\n`;
    message += `📅 ${escapeMarkdown(date)} \\| FCN: ${escapeMarkdown(gen.fcn || "N/A")}\n`;
    message += `💰 Cost: ${escapeMarkdown(gen.cost)} ETB\n\n`;
  });

  // Pagination
  const paginationRow = [];
  if (page > 1) {
    paginationRow.push({
      text: "◀️ Previous",
      callback_data: `admin_usergens_${userId}_${page - 1}`,
    });
  }
  paginationRow.push({
    text: `📄 ${page}/${totalPages}`,
    callback_data: "page_info",
  });
  if (page < totalPages) {
    paginationRow.push({
      text: "Next ▶️",
      callback_data: `admin_usergens_${userId}_${page + 1}`,
    });
  }

  if (paginationRow.length > 0) {
    inlineKeyboard.push(paginationRow);
  }

  inlineKeyboard.push([
    { text: "👤 View User", callback_data: `admin_user_${userId}` },
    { text: "💰 Add Balance", callback_data: `admin_addbal_${userId}` },
  ]);
  inlineKeyboard.push([
    { text: "⬅️ Admin Panel", callback_data: "admin_panel" },
  ]);

  await bot.sendMessage(chatId, message, {
    parse_mode: "MarkdownV2",
    reply_markup: { inline_keyboard: inlineKeyboard },
  });
}

// Handle admin stats
async function handleAdminStats(bot, chatId) {
  const [
    totalUsers,
    totalAdmins,
    totalGenerations,
    totalRevenue,
    activeSubscriptions,
    todayGenerations,
    todayRevenue,
    activeTodayUsers,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: "ADMIN" } }),
    prisma.iDGeneration.count(),
    prisma.usageLog.aggregate({ _sum: { amount: true } }),
    prisma.subscription.count({ where: { isActive: true } }),
    prisma.iDGeneration.count({
      where: {
        createdAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
        },
      },
    }),
    prisma.usageLog.aggregate({
      where: {
        createdAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
        },
      },
      _sum: { amount: true },
    }),
    prisma.user.count({
      where: {
        generations: {
          some: {
            createdAt: {
              gte: new Date(new Date().setHours(0, 0, 0, 0)),
            },
          },
        },
      },
    }),
  ]);
  const revenue = totalRevenue._sum.amount || 0;
  const todayRev = todayRevenue._sum.amount || 0;

  const safeRevenuePerGen = escapeMarkdown(
    totalGenerations > 0 ? (revenue / totalGenerations).toFixed(2) : "0",
  );

  const avgPerUser =
    totalUsers > 0 ? (totalGenerations / totalUsers).toFixed(1) : 0;

  const statsText = `
📊 *Bot Statistics*

👥 *Users*
Total Users: ${totalUsers}
Admins: ${totalAdmins}
Active Subscriptions: ${activeSubscriptions}
Active Today: ${activeTodayUsers}

💳 *Usage*
Total Generations: ${totalGenerations}
Today's Generations: ${todayGenerations}
Total Revenue: ${escapeMarkdown(revenue)} ETB
Today's Revenue: ${escapeMarkdown(todayRev)} ETB


📈 *Performance*
Avg\\. per User: ${avgPerUser} IDs
Revenue per Gen: ${safeRevenuePerGen} ETB
    `;

  await bot.sendMessage(chatId, statsText, {
    parse_mode: "MarkdownV2",
    ...keyboards.getBackKeyboard("admin_panel"),
  });
}

module.exports = {
  handleAdminUsers,
  handleAdminSearchUser,
  handleAdminUserDetail,
  handleAdminAddBalance,
  handleAdminChangeRole,
  handleAdminBlockUser,
  handleAdminUserGenerations,
  handleAdminStats,
};
