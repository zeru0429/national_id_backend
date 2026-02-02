/**
 * Callback query dispatcher - central router for inline button actions
 */

const fs = require("fs");
const usersService = require("../../modules/users/services/usersService");
const stateManager = require("../utils/stateManager");
const keyboards = require("../ui/keyboards");
const idGenerationHandler = require("../handlers/idGeneration.handler");
const adminHandler = require("../handlers/admin.handler");
const idGenService = require("../services/idGeneration.service");
const telegramUserService = require("../services/telegramUser.service");

async function handleCallbackQuery(bot, query) {
  const chatId = query.message.chat.id;
  const action = query.data;
  const messageId = query.message.message_id;

  try {
    const currentUser = await usersService.findByTelegramId(chatId);
    if (!currentUser) {
      await bot.sendMessage(chatId, "❌ Please register first using /start");
      return bot.answerCallbackQuery(query.id);
    }

    await bot.answerCallbackQuery(query.id);

    switch (true) {
      case action === "main_menu": {
        await bot.deleteMessage(chatId, messageId);
        const { sendMainMenu } = require("../handlers/start.handler");
        await sendMainMenu(bot, chatId);
        break;
      }

      case action === "generate_id": {
        await bot.deleteMessage(chatId, messageId);
        await idGenerationHandler.startIDGeneration(
          bot,
          chatId,
          currentUser.id
        );
        break;
      }

      case action.startsWith("vp_"): {
        const page = parseInt(action.split("_")[1] || "1", 10);
        await bot.deleteMessage(chatId, messageId);
        await idGenerationHandler.handleViewPast(
          bot,
          chatId,
          currentUser.id,
          page,
          10
        );
        break;
      }

      case action === "search_id": {
        await bot.deleteMessage(chatId, messageId);
        stateManager.set(chatId, {
          step: "AWAITING_SEARCH_QUERY",
          data: { userId: currentUser.id },
        });
        await bot.sendMessage(
          chatId,
          "🔍 *Search IDs*\n\nEnter FCN, FIN, or name to search:",
          { parse_mode: "Markdown", ...keyboards.getCancelKeyboard() }
        );
        break;
      }

      case action === "profile": {
        await bot.deleteMessage(chatId, messageId);
        const profileData = await telegramUserService.getProfileData(chatId);
        if (!profileData) {
          await bot.sendMessage(chatId, "❌ Profile not found.");
          break;
        }
        const profileText = `👤 *Your Profile*

*Name:* ${profileData?.fullName || "Not set"}
*Phone:* ${profileData?.phoneNumber || "Not set"}
*Email:* ${profileData?.email || "Not set"}
*Language:* ${profileData?.language || "N/A"}
*Role:* ${profileData?.role || "USER"}

💰 *Subscription*
Balance: ${profileData?.subscription?.balance || 0} ETB
Total Used: ${profileData?.subscription?.totalUsed || 0} ETB
Status: ${profileData?.subscription?.isActive ? "✅ Active" : "❌ Inactive"}
`;
        await bot.sendMessage(chatId, profileText, {
          parse_mode: "Markdown",
          ...keyboards.getProfileKeyboard(),
        });
        break;
      }

      case action === "balance_info": {
        await bot.deleteMessage(chatId, messageId);
        const balanceData = await telegramUserService.getBalanceData(chatId);
        const sub = balanceData?.subscription || {};
        const balanceText = `💰 *Your Balance*

*Current Balance:* ${sub.balance || 0} ETB
*Total Used:* ${sub.totalUsed || 0} ETB
*Available for ID Generations:* ${Math.floor((sub.balance || 0) / 1)} IDs

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

      case action.startsWith("dl_"): {
        await handleDownload(bot, chatId, action, currentUser.id, messageId);
        break;
      }

      case action.startsWith("download_batch_"):
      case action.startsWith("download_page_"): {
        await handleBatchDownload(bot, chatId, action, currentUser.id);
        break;
      }

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

      case action === "admin_users": {
        await bot.deleteMessage(chatId, messageId);
        await adminHandler.handleAdminUsers(bot, chatId, 1);
        break;
      }

      case action.startsWith("admin_users_"): {
        const page = parseInt(action.split("_")[2] || "1", 10);
        await bot.deleteMessage(chatId, messageId);
        await adminHandler.handleAdminUsers(bot, chatId, page);
        break;
      }

      case action === "admin_search": {
        await bot.deleteMessage(chatId, messageId);
        const result = await adminHandler.handleAdminSearchUser(bot, chatId);
        if (result?.step) {
          stateManager.set(chatId, {
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
          userId
        );
        if (result?.step) {
          stateManager.set(chatId, {
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
        const page = parseInt(parts[3] || "1", 10);
        await bot.deleteMessage(chatId, messageId);
        await adminHandler.handleAdminUserGenerations(
          bot,
          chatId,
          userId,
          page
        );
        break;
      }

      case action === "admin_stats": {
        await bot.deleteMessage(chatId, messageId);
        await adminHandler.handleAdminStats(bot, chatId);
        break;
      }

      case action.startsWith("edit_"): {
        await handleEditProfile(bot, chatId, action, currentUser.id);
        break;
      }

      default:
        await bot.sendMessage(
          chatId,
          "⚠️ Action not implemented yet.",
          keyboards.getBackKeyboard("main_menu")
        );
    }
  } catch (error) {
    console.error("Callback error:", error);
    await bot.sendMessage(
      chatId,
      "❌ An error occurred. Please try again.",
      keyboards.getBackKeyboard("main_menu")
    );
  }
}

async function handleDownload(bot, chatId, action, userId, originalMessageId) {
  try {
    const parts = action.split("_");
    const side = parts[1];
    const shortId = parts[2];
    if (!shortId) {
      return bot.sendMessage(chatId, "❌ Invalid download request.");
    }

    const record = await idGenService.getGenerationForDownload(userId, shortId);
    if (!record) {
      return bot.sendMessage(chatId, "❌ Record not found.");
    }
    if (record.userId !== userId) {
      return bot.sendMessage(chatId, "❌ Access denied.");
    }

    const name = record.extractedData?.name_en || "ID";
    const fcn = record.fcn || "N/A";

    let filesToSend = [];
    if (side === "f") {
      const front = record.files?.find((f) => f.role === "FRONT_ID");
      if (front) filesToSend.push(front);
    } else if (side === "b") {
      const back = record.files?.find((f) => f.role === "BACK_ID");
      if (back) filesToSend.push(back);
    } else {
      filesToSend = record.files || [];
    }

    if (filesToSend.length === 0) {
      return bot.sendMessage(chatId, "❌ No files found.");
    }

    await bot.sendMessage(
      chatId,
      `📥 Downloading ${filesToSend.length} file(s) for ${name}...`
    );

    for (const file of filesToSend) {
      if (!fs.existsSync(file.fileUrl)) {
        await bot.sendMessage(chatId, `❌ File not found: ${file.role}`);
        continue;
      }
      await bot.sendDocument(chatId, fs.createReadStream(file.fileUrl), {
        caption: `${file.role} - ${name} (FCN: ${fcn})`,
      });
    }

    await bot.sendMessage(chatId, `✅ Download complete for ${name}!`, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "📂 View All", callback_data: "vp_1" },
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
      keyboards.getBackKeyboard("main_menu")
    );
  }
}

async function handleBatchDownload(bot, chatId, action, userId) {
  const idGenerationService = require("../../modules/idGeneration/services/idGenerationService");
  try {
    const parts = action.split("_");
    const batchType = parts[1];
    const batchData = parts.slice(2);

    let ids = [];
    let batchName = "";
    if (batchType === "batch") {
      ids = batchData[0].split("_");
      batchName = `batch of ${ids.length} IDs`;
    } else if (batchType === "page") {
      const pageNum = batchData[0];
      ids = batchData[1]?.split("_") || [];
      batchName = `page ${pageNum} (${ids.length} IDs)`;
    }

    const processingMsg = await bot.sendMessage(
      chatId,
      `📦 *Preparing batch download...*\n\n📄 ${batchName}\n⏳ Initializing...`,
      { parse_mode: "Markdown" }
    );

    let successfulDownloads = 0;
    let failedDownloads = 0;

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      await bot.editMessageText(
        `📦 *Batch download in progress...*\n\n✅ Processed: ${i}/${ids.length}\n✅ Success: ${successfulDownloads}\n❌ Failed: ${failedDownloads}`,
        {
          chat_id: chatId,
          message_id: processingMsg.message_id,
          parse_mode: "Markdown",
        }
      );

      try {
        const record = await idGenerationService.findByIdForDownload(userId, id);
        if (record && record.userId === userId && record.files) {
          for (const file of record.files) {
            if (fs.existsSync(file.fileUrl)) {
              await bot.sendDocument(chatId, fs.createReadStream(file.fileUrl), {
                caption: `📄 ${file.role} - ${record.extractedData?.name_en || "ID"}`,
              });
            }
          }
          successfulDownloads++;
        } else {
          failedDownloads++;
        }
      } catch {
        failedDownloads++;
      }
      await new Promise((r) => setTimeout(r, 300));
    }

    await bot.editMessageText(
      `✅ *Batch download complete!*\n\n✅ Successfully: ${successfulDownloads}\n❌ Failed: ${failedDownloads}`,
      {
        chat_id: chatId,
        message_id: processingMsg.message_id,
        parse_mode: "Markdown",
      }
    );

    await bot.sendMessage(chatId, "🎉 Batch download completed!", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "📂 View All", callback_data: "vp_1" }],
          [{ text: "🏠 Main Menu", callback_data: "main_menu" }],
        ],
      },
    });
  } catch (error) {
    console.error("Batch download error:", error);
    await bot.sendMessage(
      chatId,
      "❌ Batch download failed.",
      keyboards.getBackKeyboard("main_menu")
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

  stateManager.set(chatId, {
    step: fieldMap[field].step,
    data: { userId, field },
  });

  await bot.sendMessage(chatId, fieldMap[field].prompt, keyboards.getCancelKeyboard());
}

module.exports = { handleCallbackQuery };
