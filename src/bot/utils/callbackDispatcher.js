//bot/utils/callbackDispatcher.js
const usersService = require("../../modules/users/services/usersService");
const state = require("./stateManager");
const { prisma } = require("../../config/db");
const keyboards = require("./keyboards");
const idGenerationHandler = require("../handlers/idGenerationHandler");
const adminHandler = require("../handlers/adminHandler");
const fs = require("fs");

async function handleCallbackQuery(bot, query) {
  const chatId = query.message.chat.id;
  const action = query.data;
  const messageId = query.message.message_id;

  try {
    // Get the user from database
    const currentUser = await usersService.findByTelegramId(chatId);
    if (!currentUser) {
      await bot.sendMessage(chatId, "❌ Please register first using /start");
      return bot.answerCallbackQuery(query.id);
    }

    // Edit message to remove "typing..." indicator
    await bot.answerCallbackQuery(query.id);

    switch (true) {
      // Main menu
      case action === "main_menu": {
        await bot.deleteMessage(chatId, messageId);
        const { sendMainMenu } = require("../handlers/startHandler");
        await sendMainMenu(bot, chatId);
        break;
      }

      // ID Generation flow
      case action === "generate_id": {
        await bot.deleteMessage(chatId, messageId);
        await idGenerationHandler.startIDGeneration(
          bot,
          chatId,
          currentUser.id,
        );
        break;
      }

      // View past IDs
      case action.startsWith("vp_"): {
        const page = parseInt(action.split("_")[1] || "1");
        await bot.deleteMessage(chatId, messageId);
        await idGenerationHandler.handleViewPast(
          bot,
          chatId,
          currentUser.id,
          page,
          10,
        );
        break;
      }

      // Search IDs
      case action === "search_id": {
        await bot.deleteMessage(chatId, messageId);
        state.set(chatId, {
          step: "AWAITING_SEARCH_QUERY",
          data: { userId: currentUser.id },
        });
        await bot.sendMessage(
          chatId,
          "🔍 *Search IDs*\n\nEnter FCN, FIN, or name to search:",
          {
            parse_mode: "Markdown",
            ...keyboards.getCancelKeyboard(),
          },
        );
        break;
      }

      // Profile
      case action === "profile": {
        await bot.deleteMessage(chatId, messageId);
        // Rename variable to avoid conflict with outer scope
        const userProfile = await prisma.user.findUnique({
          where: { id: currentUser.id },
          include: { subscription: true },
        });

        const profileText = `
👤 *Your Profile*

*Name:* ${userProfile.fullName || "Not set"}
*Phone:* ${userProfile.phoneNumber || "Not set"}
*Email:* ${userProfile.email || "Not set"}
*Language:* ${userProfile.language}
*Role:* ${userProfile.role}

💰 *Subscription*
Balance: ${userProfile.subscription?.balance || 0} ETB
Total Used: ${userProfile.subscription?.totalUsed || 0} ETB
Status: ${userProfile.subscription?.isActive ? "✅ Active" : "❌ Inactive"}
        `;

        await bot.sendMessage(chatId, profileText, {
          parse_mode: "Markdown",
          ...keyboards.getProfileKeyboard(),
        });
        break;
      }

      // Balance info
      case action === "balance_info": {
        await bot.deleteMessage(chatId, messageId);
        const subscription = await prisma.subscription.findUnique({
          where: { userId: currentUser.id },
        });

        const balanceText = `
💰 *Your Balance*

*Current Balance:* ${subscription?.balance || 0} ETB
*Total Used:* ${subscription?.totalUsed || 0} ETB
*Available for ID Generations:* ${Math.floor((subscription?.balance || 0) / 1)} IDs

💡 *Pricing:*
• 1 ID Generation = 1 ETB
• Contact admin to add balance
        `;

        await bot.sendMessage(chatId, balanceText, {
          parse_mode: "Markdown",
          ...keyboards.getBalanceKeyboard(),
        });
        break;
      }

      // Download single file - OLD FORMAT (replace this)
      case action.startsWith("dl_"): {
        await handleDownloadWithProgress(
          bot,
          chatId,
          action,
          currentUser.id,
          messageId,
        );
        break;
      }

      // Batch downloads
      case action.startsWith("download_batch_"):
      case action.startsWith("download_page_"): {
        await handleBatchDownload(bot, chatId, action, currentUser.id);
        break;
      }

      // Admin panel
      case action === "admin_panel": {
        await bot.deleteMessage(chatId, messageId);
        if (currentUser.role !== "ADMIN") {
          return bot.sendMessage(chatId, "❌ Admin access required.");
        }
        await bot.sendMessage(chatId, "👑 *Admin Panel*\n\nSelect an option:", {
          parse_mode: "Markdown",
          ...keyboards.getAdminKeyboard(),
        });
        break;
      }
      // Admin panel actions
      case action === "admin_users": {
        await bot.deleteMessage(chatId, messageId);
        await adminHandler.handleAdminUsers(bot, chatId, 1);
        break;
      }

      case action.startsWith("admin_users_"): {
        const page = parseInt(action.split("_")[2] || "1");
        await bot.deleteMessage(chatId, messageId);
        await adminHandler.handleAdminUsers(bot, chatId, page);
        break;
      }

      case action === "admin_search": {
        await bot.deleteMessage(chatId, messageId);
        const result = await adminHandler.handleAdminSearchUser(bot, chatId);
        if (result?.step) {
          state.set(chatId, {
            step: result.step,
            data: result.data || {},
          });
        }
        break;
      }

      case action.startsWith("admin_user_"): {
        const userId = action.replace("admin_user_", "");
        await bot.deleteMessage(chatId, messageId);
        await adminHandler.handleAdminUserDetail(bot, chatId, userId);
        break;
      }

      case action.startsWith("admin_addbal_"): {
        const userId = action.replace("admin_addbal_", "");
        await bot.deleteMessage(chatId, messageId);
        const result = await adminHandler.handleAdminAddBalance(
          bot,
          chatId,
          userId,
        );
        if (result?.step) {
          state.set(chatId, {
            step: result.step,
            data: result.data || {},
          });
        }
        break;
      }

      case action.startsWith("admin_role_"): {
        const userId = action.replace("admin_role_", "");
        await bot.deleteMessage(chatId, messageId);
        await adminHandler.handleAdminChangeRole(bot, chatId, userId);
        break;
      }

      case action.startsWith("admin_block_"): {
        const userId = action.replace("admin_block_", "");
        await bot.deleteMessage(chatId, messageId);
        await adminHandler.handleAdminBlockUser(bot, chatId, userId);
        break;
      }

      case action.startsWith("admin_usergens_"): {
        const parts = action.split("_");
        const userId = parts[2];
        const page = parseInt(parts[3] || "1");
        await bot.deleteMessage(chatId, messageId);
        await adminHandler.handleAdminUserGenerations(
          bot,
          chatId,
          userId,
          page,
        );
        break;
      }

      case action === "admin_stats": {
        await bot.deleteMessage(chatId, messageId);
        await adminHandler.handleAdminStats(bot, chatId);
        break;
      }

      // Edit profile actions
      case action.startsWith("edit_"): {
        await handleEditProfile(bot, chatId, action, currentUser.id);
        break;
      }

      // Default case
      default: {
        await bot.sendMessage(
          chatId,
          "⚠️ Action not implemented yet.",
          keyboards.getBackKeyboard("main_menu"),
        );
      }
    }
  } catch (error) {
    console.error("Callback error:", error);
    await bot.sendMessage(
      chatId,
      "❌ An error occurred. Please try again.",
      keyboards.getBackKeyboard("main_menu"),
    );
  }
}

// Enhanced download function with progress indicator
async function handleDownloadWithProgress(
  bot,
  chatId,
  action,
  userId,
  originalMessageId,
) {
  try {
    // Extract parameters from action (supports both old and new formats)
    let shortId, side;

    if (action.startsWith("dl_")) {
      // New format: dl_f_abc123 or dl_b_abc123
      const parts = action.split("_");
      side = parts[1]; // f = front, b = back
      shortId = parts[2]; // Short ID (first 8 chars)
    } else if (action.startsWith("download_")) {
      // Old format: download_abc123_front or download_abc123_back
      const parts = action.split("_");
      shortId = parts[1]; // Full or short ID
      side = parts[2]; // front or back

      // Convert "front"/"back" to "f"/"b"
      if (side === "front") side = "f";
      if (side === "back") side = "b";
    } else {
      throw new Error("Invalid download request format");
    }

    if (!shortId) {
      throw new Error("Invalid download request");
    }
    if (!shortId) {
      throw new Error("Invalid download request");
    }

    // First, try to find the record by the short ID (first 8 chars)
    let record = await prisma.iDGeneration.findFirst({
      where: {
        userId: userId,
        id: {
          startsWith: shortId,
        },
      },
      include: { files: true },
    });

    // If not found, try exact match (in case shortId is actually the full ID)
    if (!record) {
      record = await prisma.iDGeneration.findUnique({
        where: {
          id: action
            .replace("dl_f_", "")
            .replace("dl_b_", "")
            .replace("dl_", ""),
        },
        include: { files: true },
      });
    }

    if (!record) {
      return bot.sendMessage(chatId, "❌ Record not found.");
    }

    // Verify ownership
    if (record.userId !== userId) {
      return bot.sendMessage(chatId, "❌ Access denied.");
    }

    const name = record.extractedData.name_en || "ID";
    const fcn = record.fcn || "N/A";

    let filesToSend = [];
    if (side === "f") {
      const frontFile = record.files.find((f) => f.role === "FRONT_ID");
      if (frontFile) filesToSend.push(frontFile);
    } else if (side === "b") {
      const backFile = record.files.find((f) => f.role === "BACK_ID");
      if (backFile) filesToSend.push(backFile);
    } else {
      // Send both files
      filesToSend = record.files;
    }

    if (filesToSend.length === 0) {
      return bot.sendMessage(chatId, "❌ No files found.");
    }

    // Send success message
    await bot.sendMessage(
      chatId,
      `📥 Downloading ${filesToSend.length} file(s) for ${name}...`,
    );

    // Send files
    for (let i = 0; i < filesToSend.length; i++) {
      const file = filesToSend[i];

      try {
        // Check if file exists
        if (!fs.existsSync(file.fileUrl)) {
          await bot.sendMessage(chatId, `❌ File not found: ${file.role}`);
          continue;
        }

        await bot.sendDocument(chatId, fs.createReadStream(file.fileUrl), {
          caption: `${file.role} - ${name} (FCN: ${fcn})`,
        });
      } catch (fileError) {
        console.error("File send error:", fileError);
        await bot.sendMessage(chatId, `❌ Failed to send ${file.role}`);
      }
    }

    // Send completion message
    await bot.sendMessage(chatId, `✅ Download complete for ${name}!`, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "📂 View All", callback_data: "view_past" },
            { text: "🏠 Main Menu", callback_data: "main_menu" },
          ],
        ],
      },
    });
  } catch (error) {
    console.error("Download error:", error);
    await bot.sendMessage(
      chatId,
      "❌ Download failed. Please try again.",
      keyboards.getBackKeyboard("main_menu"),
    );
  }
}

// Helper function to escape MarkdownV2 special characters
function escapeMarkdown(text) {
  if (!text) return "";
  return text
    .toString()
    .replace(/_/g, "\\_")
    .replace(/\*/g, "\\*")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/~/g, "\\~")
    .replace(/`/g, "\\`")
    .replace(/>/g, "\\>")
    .replace(/#/g, "\\#")
    .replace(/\+/g, "\\+")
    .replace(/-/g, "\\-")
    .replace(/=/g, "\\=")
    .replace(/\|/g, "\\|")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\./g, "\\.")
    .replace(/!/g, "\\!");
}

// Add this helper function to your utils
async function findGenerationById(userId, shortOrFullId) {
  const { prisma } = require("../../config/db");

  // First try exact match
  let record = await prisma.iDGeneration.findUnique({
    where: { id: shortOrFullId },
    include: { files: true },
  });

  // If not found and it's a short ID (8 chars), try prefix match
  if (!record && shortOrFullId.length === 8) {
    record = await prisma.iDGeneration.findFirst({
      where: {
        userId: userId,
        id: {
          startsWith: shortOrFullId,
        },
      },
      include: { files: true },
    });
  }

  return record;
}

async function handleBatchDownload(bot, chatId, action, userId) {
  try {
    const parts = action.split("_");
    const batchType = parts[1]; // batch or page
    const batchData = parts.slice(2); // IDs or page number + IDs

    let ids = [];
    let batchName = "";

    if (batchType === "batch") {
      ids = batchData[0].split("_");
      batchName = `batch of ${ids.length} IDs`;
    } else if (batchType === "page") {
      const pageNum = batchData[0];
      ids = batchData[1].split("_");
      batchName = `page ${pageNum} (${ids.length} IDs)`;
    }

    const processingMsg = await bot.sendMessage(
      chatId,
      `📦 *Preparing batch download...*\n\n📄 ${batchName}\n⏳ Initializing...`,
      { parse_mode: "Markdown" },
    );

    let successfulDownloads = 0;
    let failedDownloads = 0;

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];

      await bot.editMessageText(
        `📦 *Batch download in progress...*\n\n📄 ${batchName}\n✅ Processed: ${i}/${ids.length}\n✅ Success: ${successfulDownloads}\n❌ Failed: ${failedDownloads}\n⏳ Current: ID ${i + 1}`,
        {
          chat_id: chatId,
          message_id: processingMsg.message_id,
          parse_mode: "Markdown",
        },
      );

      try {
        const record = await prisma.iDGeneration.findUnique({
          where: { id },
          include: { files: true },
        });

        if (record && record.userId === userId) {
          for (const file of record.files) {
            if (fs.existsSync(file.fileUrl)) {
              await bot.sendDocument(
                chatId,
                fs.createReadStream(file.fileUrl),
                {
                  caption: `📄 ${file.role} - ${record.extractedData.name_en || "ID"}`,
                },
              );
            }
          }
          successfulDownloads++;
        } else {
          failedDownloads++;
        }
      } catch (error) {
        failedDownloads++;
      }

      // Small delay between downloads
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    await bot.editMessageText(
      `✅ *Batch download complete!*\n\n📦 ${batchName}\n✅ Successfully downloaded: ${successfulDownloads} IDs\n❌ Failed: ${failedDownloads} IDs\n📄 Total files: ${successfulDownloads * 2}`,
      {
        chat_id: chatId,
        message_id: processingMsg.message_id,
        parse_mode: "Markdown",
      },
    );

    await bot.sendMessage(
      chatId,
      `🎉 Batch download completed!\n\nWhat would you like to do next?`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "📂 View All", callback_data: "view_past" }],
            [{ text: "🏠 Main Menu", callback_data: "main_menu" }],
          ],
        },
      },
    );
  } catch (error) {
    console.error("Batch download error:", error);
    await bot.sendMessage(
      chatId,
      "❌ Batch download failed.",
      keyboards.getBackKeyboard("main_menu"),
    );
  }
}

async function handleEditProfile(bot, chatId, action, userId) {
  const field = action.replace("edit_", "");

  const fieldMap = {
    name: { step: "EDIT_NAME", prompt: "Enter your new full name:" },
    phone: { step: "EDIT_PHONE", prompt: "Enter your new phone number:" },
    email: { step: "EDIT_EMAIL", prompt: "Enter your new email (or /skip):" },
  };

  if (!fieldMap[field]) return;

  state.set(chatId, {
    step: fieldMap[field].step,
    data: { userId, field },
  });

  await bot.sendMessage(
    chatId,
    fieldMap[field].prompt,
    keyboards.getCancelKeyboard(),
  );
}

module.exports = { handleCallbackQuery };
