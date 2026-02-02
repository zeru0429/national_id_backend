/**
 * Admin panel handler - uses admin service only
 */

const adminService = require("../services/admin.service");
const keyboards = require("../ui/keyboards");
const { escapeMarkdownV2, formatDate } = require("../ui/formatters");

async function handleAdminUsers(bot, chatId, page = 1, limit = 10) {
  const { users, total, totalPages } =
    await adminService.getUsersPaginated(page, limit);

  let message = `👥 *All Users*\n\nPage ${page}/${totalPages}\nTotal Users: ${total}\n\n`;
  const inlineKeyboard = [];

  users.forEach((user, idx) => {
    const globalIdx = (page - 1) * limit + idx + 1;
    const safeName = escapeMarkdownV2(user.fullName || "No Name");
    const safePhone = escapeMarkdownV2(user.phoneNumber || "No phone");
    message += `*${globalIdx}\\.${safeName}*\n`;
    message += `📞 ${safePhone}\n`;
    message += `💰 Balance: ${escapeMarkdownV2(user.subscription?.balance || 0)} Credit\n`;
    message += `📊 IDs: ${escapeMarkdownV2(user._count?.generations || 0)} \\| Role: ${escapeMarkdownV2(user.role)}\n`;
    message += `📅 Joined: ${escapeMarkdownV2(formatDate(user.createdAt))}\n\n`;

    inlineKeyboard.push([
      { text: `👤 ${globalIdx}`, callback_data: `admin_user_${user.id}` },
      { text: "💰 Add Balance", callback_data: `admin_addbal_${user.id}` },
      {
        text: user.role === "ADMIN" ? "👑 Remove Admin" : "👑 Make Admin",
        callback_data: `admin_role_${user.id}`,
      },
    ]);
  });

  const paginationRow = [];
  if (page > 1)
    paginationRow.push({
      text: "◀️ Previous",
      callback_data: `admin_users_${page - 1}`,
    });
  paginationRow.push({
    text: `📄 ${page}/${totalPages}`,
    callback_data: "page_info",
  });
  if (page < totalPages)
    paginationRow.push({
      text: "Next ▶️",
      callback_data: `admin_users_${page + 1}`,
    });
  if (paginationRow.length > 0) inlineKeyboard.push(paginationRow);

  inlineKeyboard.push([
    { text: "🔍 Search User", callback_data: "admin_search" },
    { text: "📊 Stats", callback_data: "admin_stats" },
  ]);
  inlineKeyboard.push([{ text: "⬅️ Admin Panel", callback_data: "admin_panel" }]);

  await bot.sendMessage(chatId, message, {
    parse_mode: "MarkdownV2",
    reply_markup: { inline_keyboard: inlineKeyboard },
  });
}

async function handleAdminSearchUser(bot, chatId, query = null) {
  if (!query) {
    await bot.sendMessage(
      chatId,
      "🔍 *Search Users*\n\nEnter phone number, name, or Telegram ID to search:",
      { parse_mode: "MarkdownV2", ...keyboards.getCancelKeyboard() }
    );
    return { step: "ADMIN_SEARCH_QUERY" };
  }

  let results = [];
  try {
    results = await adminService.searchUsers(query.trim());
    if (!Array.isArray(results)) results = [];
  } catch (err) {
    console.error("Admin search failed:", err);
    await bot.sendMessage(chatId, "❌ Search failed. Please try again.");
    return;
  }

  if (!results.length) {
    await bot.sendMessage(
      chatId,
      `🔍 *No users found for "*${escapeMarkdownV2(query)}*"*\n\nTry a different search term.`,
      {
        parse_mode: "MarkdownV2",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔍 Search Again", callback_data: "admin_search" }],
            [{ text: "👥 View All Users", callback_data: "admin_users_1" }],
            [{ text: "⬅️ Admin Panel", callback_data: "admin_panel" }],
          ],
        },
      }
    );
    return;
  }

  let message = `🔍 *Search Results*\n\nFound *${results.length}* users for "*${escapeMarkdownV2(query)}*":\n\n`;
  const inlineKeyboard = [];

  results.forEach((user, idx) => {
    const safeName = escapeMarkdownV2(user.fullName || "No Name");
    const safePhone = escapeMarkdownV2(user.phoneNumber || "No phone");
    message += `*${idx + 1}\\.${safeName}*\n`;
    message += `📞 ${safePhone}\n`;
    message += `💰 Balance: ${escapeMarkdownV2(user.subscription?.balance || 0)} Credit\n`;
    message += `📊 IDs: ${escapeMarkdownV2(user._count?.generations || 0)} \\| Role: ${escapeMarkdownV2(user.role)}\n\n`;

    inlineKeyboard.push([
      { text: `👤 ${idx + 1}`, callback_data: `admin_user_${user.id}` },
      { text: "💰 Add Balance", callback_data: `admin_addbal_${user.id}` },
    ]);
  });

  inlineKeyboard.push([
    { text: "🔍 New Search", callback_data: "admin_search" },
    { text: "👥 View All", callback_data: "admin_users_1" },
  ]);
  inlineKeyboard.push([{ text: "⬅️ Admin Panel", callback_data: "admin_panel" }]);

  await bot.sendMessage(chatId, message, {
    parse_mode: "MarkdownV2",
    reply_markup: { inline_keyboard: inlineKeyboard },
  });
}

async function handleAdminUserDetail(bot, chatId, userId) {
  const userData = await adminService.getUserDetails(userId);
  if (!userData) {
    await bot.sendMessage(chatId, "❌ User not found.");
    return;
  }

  const { totalSpent, ...user } = userData;
  const lastGeneration = user.generations?.[0];
  const lastGenDate = lastGeneration
    ? formatDate(lastGeneration.createdAt)
    : "Never";

  const safe = (t) => escapeMarkdownV2(t || "N/A");
  const message = `
👤 *User Details*

*Name:* ${safe(user.fullName)}
*Phone:* ${safe(user.phoneNumber)}
*Email:* ${safe(user.email)}
*Telegram ID:* ${safe(user.telegramId)}
*Status:* ${escapeMarkdownV2(user.isBlocked ? "Blocked" : "Active")}
*Joined:* ${safe(formatDate(user.createdAt))}
*Role:* ${escapeMarkdownV2(user.role)}
*Language:* ${escapeMarkdownV2(user.language)}

💰 *Subscription*
Balance: ${escapeMarkdownV2(user.subscription?.balance || 0)} Credit
Total Used: ${escapeMarkdownV2(user.subscription?.totalUsed || 0)} Credit
Total Spent: ${escapeMarkdownV2(totalSpent)} Credit
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
    ],
    [
      { text: "🔍 Search Again", callback_data: "admin_search" },
      { text: "👥 All Users", callback_data: "admin_users_1" },
    ],
    [{ text: "⬅️ Admin Panel", callback_data: "admin_panel" }],
  ];

  await bot.sendMessage(chatId, message.trim(), {
    parse_mode: "MarkdownV2",
    reply_markup: { inline_keyboard: inlineKeyboard },
  });
}

async function handleAdminAddBalance(bot, chatId, userId, amount = null) {
  if (amount === null) {
    await bot.sendMessage(
      chatId,
      "💰 *Add Balance to User*\n\nEnter amount to add (Credit):",
      { parse_mode: "MarkdownV2", ...keyboards.getCancelKeyboard() }
    );
    return { step: "ADMIN_ADD_BALANCE", data: { userId } };
  }

  const amountNum = parseInt(amount, 10);
  if (isNaN(amountNum) || amountNum <= 0) {
    await bot.sendMessage(chatId, "❌ Please enter a valid positive amount.");
    return;
  }

  try {
    const subscription = await adminService.addBalanceToUser(userId, amountNum);
    const user = await adminService.getUserDetails(userId);
    const safeName = escapeMarkdownV2(user?.fullName || "User");

    await bot.sendMessage(
      chatId,
      `✅ *Balance Added Successfully!*\n\n👤 *User:* ${safeName}\n💰 *Amount:* ${amountNum} Credit\n💳 *New Balance:* ${subscription.balance} Credit`,
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
      }
    );
  } catch (error) {
    console.error("Add balance error:", error);
    await bot.sendMessage(
      chatId,
      "❌ Failed to add balance. Please try again."
    );
  }
}

async function handleAdminChangeRole(bot, chatId, userId) {
  try {
    const updatedUser = await adminService.changeUserRole(userId);
    const safeName = escapeMarkdownV2(updatedUser?.fullName || "User");
    const newRole = updatedUser?.role || "USER";

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
      }
    );
  } catch (error) {
    console.error("Change role error:", error);
    await bot.sendMessage(chatId, "❌ Failed to change role.");
  }
}

async function handleAdminBlockUser(bot, chatId, userId) {
  try {
    const updatedUser = await adminService.toggleUserBlock(userId);
    const safeName = escapeMarkdownV2(updatedUser?.fullName || "User");
    const statusText = updatedUser?.isBlocked ? "❌ Blocked" : "✅ Unblocked";

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
      }
    );
  } catch (error) {
    console.error("Block user error:", error);
    await bot.sendMessage(chatId, "❌ Failed to update user status.");
  }
}

async function handleAdminUserGenerations(bot, chatId, userId, page = 1, limit = 10) {
  const { generations, total, totalPages } =
    await adminService.getUserGenerations(userId, page, limit);
  const userData = await adminService.getUserDetails(userId);
  const safeName = escapeMarkdownV2(userData?.fullName || "User");

  let message = `📋 *Generations for ${safeName}*\n\nPage ${page}/${totalPages}\nTotal: ${total} generations\n\n`;
  const inlineKeyboard = [];

  generations.forEach((gen, idx) => {
    const globalIdx = (page - 1) * limit + idx + 1;
    const name = gen.extractedData?.name_en || "Unknown";
    const date = formatDate(gen.createdAt);
    message += `*${globalIdx}\\.${escapeMarkdownV2(name)}*\n`;
    message += `📅 ${escapeMarkdownV2(date)} \\| FCN: ${escapeMarkdownV2(gen.fcn || "N/A")}\n`;
    message += `💰 Cost: ${escapeMarkdownV2(gen.cost)} Credit\n\n`;
  });

  const paginationRow = [];
  if (page > 1)
    paginationRow.push({
      text: "◀️ Previous",
      callback_data: `admin_usergens_${userId}_${page - 1}`,
    });
  paginationRow.push({
    text: `📄 ${page}/${totalPages}`,
    callback_data: "page_info",
  });
  if (page < totalPages)
    paginationRow.push({
      text: "Next ▶️",
      callback_data: `admin_usergens_${userId}_${page + 1}`,
    });
  if (paginationRow.length > 0) inlineKeyboard.push(paginationRow);

  inlineKeyboard.push([
    { text: "👤 View User", callback_data: `admin_user_${userId}` },
    { text: "💰 Add Balance", callback_data: `admin_addbal_${userId}` },
  ]);
  inlineKeyboard.push([{ text: "⬅️ Admin Panel", callback_data: "admin_panel" }]);

  await bot.sendMessage(chatId, message, {
    parse_mode: "MarkdownV2",
    reply_markup: { inline_keyboard: inlineKeyboard },
  });
}

async function handleAdminStats(bot, chatId) {
  const stats = await adminService.getStats();
  const avgPerUser =
    stats.totalUsers > 0
      ? (stats.totalGenerations / stats.totalUsers).toFixed(1)
      : 0;
  const revenuePerGen =
    stats.totalGenerations > 0
      ? (stats.totalRevenue / stats.totalGenerations).toFixed(2)
      : "0";

  const statsText = `
📊 *Bot Statistics*

👥 *Users*
Total Users: ${stats.totalUsers}
Admins: ${stats.adminCount}
Active Subscriptions: ${stats.activeSubscriptions}
Active Today: ${stats.activeTodayUsers}

💳 *Usage*
Total Generations: ${stats.totalGenerations}
Today's Generations: ${stats.todayGenerations}
Total Revenue: ${escapeMarkdownV2(stats.totalRevenue)} Credit
Today's Revenue: ${escapeMarkdownV2(stats.todayRevenue)} Credit

📈 *Performance*
Avg\\. per User: ${avgPerUser} IDs
Revenue per Gen: ${escapeMarkdownV2(revenuePerGen)} Credit
`;

  await bot.sendMessage(chatId, statsText.trim(), {
    parse_mode: "MarkdownV2",
    ...keyboards.getBackKeyboard("admin_panel"),
  });
}

async function handleAdminUserLogs(bot, chatId, userId) {
  const data = await adminService.getUserLogs(userId, 20);
  if (!data) {
    await bot.sendMessage(chatId, "❌ User not found\\.", { parse_mode: "MarkdownV2" });
    return;
  }

  const { user, logs } = data;
  const safe = (t) => escapeMarkdownV2(t || "N/A");
  if (!logs.length) {
    await bot.sendMessage(
      chatId,
      `📊 *Usage Logs*\n\nNo logs found for *${safe(user.fullName || "User")}*\\.`,
      { parse_mode: "MarkdownV2", ...keyboards.getBackKeyboard(`admin_user_${userId}`) }
    );
    return;
  }

  const lines = logs.map((l, idx) => {
    const d = formatDate(l.createdAt);
    return `*${idx + 1}\\.* ${safe(l.action)} \\- ${safe(l.amount)} Credit \\(${safe(d)}\\)`;
  });

  await bot.sendMessage(
    chatId,
    `📊 *Usage Logs* \\- latest ${logs.length}\n\n👤 *User:* ${safe(user.fullName || "User")}\n\n${lines.join("\n")}`,
    { parse_mode: "MarkdownV2", ...keyboards.getBackKeyboard(`admin_user_${userId}`) }
  );
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
  handleAdminUserLogs,
};
