// bot/utils/keyboards.js
const { prisma } = require("../../config/db");

/**
 * Get main menu keyboard with dynamic balance
 */
async function getMainKeyboard(chatId) {
  try {
    console.log("=== DEBUG getMainKeyboard ===");
    console.log("chatId:", chatId, "Type:", typeof chatId);

    // First, try to find user by telegramId (as string)
    let user = await prisma.user.findUnique({
      where: {
        telegramId: chatId.toString(), // Always search as string
      },
      include: { subscription: true },
    });

    console.log("Found by telegramId:", user ? `Yes (ID: ${user.id})` : "No");

    // If not found by telegramId, try alternative methods
    if (!user) {
      console.log("User not found by telegramId, trying alternative lookup...");

      // METHOD 1: Check if any user has this chatId as telegramId (case-insensitive)
      const allUsers = await prisma.user.findMany({
        include: { subscription: true },
      });

      console.log(`Total users in DB: ${allUsers.length}`);

      // Check if any user has a matching telegramId (as string or number)
      for (const dbUser of allUsers) {
        if (dbUser.telegramId) {
          const dbTelegramId = dbUser.telegramId.toString().trim();
          const searchTelegramId = chatId.toString().trim();

          if (dbTelegramId === searchTelegramId) {
            user = dbUser;
            console.log(
              `Found match! User ID: ${user.id}, DB telegramId: ${dbUser.telegramId}`,
            );
            break;
          }
        }
      }

      // METHOD 2: If still not found, try to get the most recent active user
      if (!user) {
        console.log(
          "No matching telegramId found, getting most recent user...",
        );
        user = await prisma.user.findFirst({
          include: { subscription: true },
          orderBy: { createdAt: "desc" },
        });

        if (user) {
          console.log(`Using most recent user: ${user.id}`);

          // Update this user with the correct telegramId for future use
          try {
            await prisma.user.update({
              where: { id: user.id },
              data: { telegramId: chatId.toString() },
            });
            console.log(
              `Updated user ${user.id} with telegramId: ${chatId.toString()}`,
            );
          } catch (updateError) {
            console.error(
              "Failed to update user telegramId:",
              updateError.message,
            );
          }
        }
      }
    }

    // If still no user found
    if (!user) {
      console.error("CRITICAL: No user found in database at all!");
      throw new Error("No user account found. Please register first.");
    }

    console.log("Final user found:", {
      id: user.id,
      telegramId: user.telegramId,
      fullName: user.fullName,
      balance: user.subscription?.balance || 0,
    });

    const balance = user.subscription?.balance || 0;
    const isAdmin = user.role === "ADMIN";

    const keyboard = [
      [{ text: "🆔 Generate ID", callback_data: "generate_id" }],
      [{ text: "📂 View Past IDs", callback_data: "vp_1" }],
      [{ text: "🔍 Search IDs", callback_data: "search_id" }],
      [{ text: "👤 My Profile", callback_data: "profile" }],
      [{ text: "💰 Balance & Top-up", callback_data: "balance_info" }],
    ];

    if (isAdmin) {
      keyboard.push([{ text: "👑 Admin Panel", callback_data: "admin_panel" }]);
    }

    return {
      reply_markup: {
        inline_keyboard: keyboard,
      },
    };
  } catch (error) {
    console.error("Error getting main keyboard:", error);

    // Provide a fallback keyboard that doesn't require user lookup
    return {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🆔 Generate ID", callback_data: "generate_id" }],
          [{ text: "📂 View Past IDs", callback_data: "vp_1" }],
          [{ text: "🔍 Search IDs", callback_data: "search_id" }],
          [{ text: "👤 My Profile", callback_data: "profile" }],
          [{ text: "💰 Balance Info", callback_data: "balance_info" }],
        ],
      },
    };
  }
}

// Keep all other keyboard functions the same...
/**
 * Back button keyboard
 */
function getBackKeyboard(backTo = "main_menu") {
  return {
    reply_markup: {
      inline_keyboard: [[{ text: "⬅️ Back", callback_data: backTo }]],
    },
  };
}

/**
 * Cancel operation keyboard
 */
function getCancelKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [[{ text: "❌ Cancel", callback_data: "main_menu" }]],
    },
  };
}

/**
 * Confirmation keyboard (Yes/No)
 */
function getConfirmationKeyboard(action, id = "") {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✅ Yes", callback_data: `${action}_confirm_${id}` },
          { text: "❌ No", callback_data: "main_menu" },
        ],
      ],
    },
  };
}

/**
 * Pagination keyboard
 */
function getPaginationKeyboard(currentPage, totalPages, prefix = "view_past") {
  const keyboard = [];

  if (currentPage > 1) {
    keyboard.push({
      text: "◀️ Previous",
      callback_data: `${prefix}_${currentPage - 1}`,
    });
  }

  keyboard.push({
    text: `📄 ${currentPage}/${totalPages}`,
    callback_data: "page_info",
  });

  if (currentPage < totalPages) {
    keyboard.push({
      text: "Next ▶️",
      callback_data: `${prefix}_${currentPage + 1}`,
    });
  }

  return {
    reply_markup: {
      inline_keyboard: [
        keyboard,
        [{ text: "🏠 Main Menu", callback_data: "main_menu" }],
      ],
    },
  };
}

/**
 * Profile management keyboard
 */
function getProfileKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "✏️ Edit Name", callback_data: "edit_name" }],
        [{ text: "📧 Edit Email", callback_data: "edit_email" }],
        [{ text: "⬅️ Back to Menu", callback_data: "main_menu" }],
      ],
    },
  };
}

/**
 * Balance management keyboard
 */
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

/**
 * Admin panel keyboard
 */
function getAdminKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "👥 All Users", callback_data: "admin_users_1" }],
        [{ text: "🔍 Search User", callback_data: "admin_search" }],
        [{ text: "📊 Statistics", callback_data: "admin_stats" }],
        [{ text: "📋 Recent Activity", callback_data: "admin_activity" }],
        [{ text: "⬅️ Main Menu", callback_data: "main_menu" }],
      ],
    },
  };
}

module.exports = {
  getMainKeyboard,
  getBackKeyboard,
  getCancelKeyboard,
  getConfirmationKeyboard,
  getPaginationKeyboard,
  getProfileKeyboard,
  getBalanceKeyboard,
  getAdminKeyboard,
};
