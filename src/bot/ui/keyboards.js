/**
 * Inline keyboards for bot - UI only, no business logic
 */

const usersService = require("../../modules/users/services/usersService");

async function getMainKeyboard(chatId) {
  const user = await usersService.findByTelegramId(chatId.toString());
  if (!user) {
    return getFallbackKeyboard();
  }

  const balance = user.subscription?.balance || 0;
  const isAdmin = user.role === "ADMIN";

  const keyboard = [
    [{ text: "🆔 Generate ID From PDF", callback_data: "generate_id" }],
    [{ text: "📂 View Past IDs", callback_data: "vp_1" }],
    [{ text: "🔍 Search IDs", callback_data: "search_id" }],
    [{ text: "👤 My Profile", callback_data: "profile" }],
    [{ text: "💰 Balance & Top-up", callback_data: "balance_info" }],
  ];

  if (isAdmin) {
    keyboard.push([{ text: "👑 Admin Panel", callback_data: "admin_panel" }]);
  }

  return { reply_markup: { inline_keyboard: keyboard } };
}

function getFallbackKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🆔 Generate ID From PDF", callback_data: "generate_id" }],
        [{ text: "📂 View Past IDs", callback_data: "vp_1" }],
        [{ text: "🔍 Search IDs", callback_data: "search_id" }],
        [{ text: "👤 My Profile", callback_data: "profile" }],
        [{ text: "💰 Balance Info", callback_data: "balance_info" }],
      ],
    },
  };
}

function getBackKeyboard(backTo = "main_menu") {
  return {
    reply_markup: {
      inline_keyboard: [[{ text: "⬅️ Back", callback_data: backTo }]],
    },
  };
}

function getCancelKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [[{ text: "❌ Cancel", callback_data: "main_menu" }]],
    },
  };
}

function getProfileKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "✏️ Edit Name", callback_data: "edit_name" }],
        [{ text: "✏️ Edit Phone", callback_data: "edit_phone" }],
        [{ text: "✏️ Edit Email", callback_data: "edit_email" }],
        [{ text: "⬅️ Back to Menu", callback_data: "main_menu" }],
      ],
    },
  };
}

function getBalanceKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "💳 Add Balance", callback_data: "add_balance" }],
        [{ text: "📊 Usage History", callback_data: "usage_history" }],
        [{ text: "⬅️ Back to Menu", callback_data: "main_menu" }],
      ],
    },
  };
}

function getAdminKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "👥 All Users", callback_data: "admin_users_1" }],
        [{ text: "🔍 Search User", callback_data: "admin_search" }],
        [{ text: "📊 Statistics", callback_data: "admin_stats" }],
        [{ text: "⬅️ Main Menu", callback_data: "main_menu" }],
      ],
    },
  };
}

module.exports = {
  getMainKeyboard,
  getFallbackKeyboard,
  getBackKeyboard,
  getCancelKeyboard,
  getProfileKeyboard,
  getBalanceKeyboard,
  getAdminKeyboard,
};
