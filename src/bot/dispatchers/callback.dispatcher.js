/**
 * Callback query dispatcher - central router for inline button actions
 */

const fs = require("fs");
const stateManager = require("../utils/stateManager");
const keyboards = require("../ui/keyboards");
const idGenerationHandler = require("../handlers/idGeneration.handler");
const adminHandler = require("../handlers/admin.handler");
const idGenService = require("../services/idGeneration.service");
const telegramUserService = require("../services/telegramUser.service");
const usageLogService = require("../../modules/usageLog/services/usageLogService");
const { withAuth } = require("../middleware/auth.middleware");
const { withAdmin } = require("../middleware/admin.middleware");
const { escapeMarkdownV2 } = require("../ui/formatters");

const CREDIT_PACKAGES = [10, 25, 50, 100, 250, 500];

function parsePositiveInt(value, fallback = null) {
  const n = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

async function handleCallbackQuery(bot, query) {
  const chatId = query?.message?.chat?.id;
  const action = query?.data;
  const messageId = query?.message?.message_id;
  if (!chatId || !action) {
    try {
      await bot.answerCallbackQuery(query.id);
    } catch { }
    return;
  }

  try {
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
        await withAuth(async (_bot, ctx) => {
          return idGenerationHandler.startIDGeneration(_bot, ctx.chatId, ctx.user.id);
        })(bot, { chatId });
        break;
      }

      case action.startsWith("vp_"): {
        await bot.deleteMessage(chatId, messageId);
        const page = parsePositiveInt(action.split("_")[1], 1);
        await withAuth(async (_bot, ctx) => {
          return idGenerationHandler.handleViewPast(_bot, ctx.chatId, ctx.user.id, page, 10);
        })(bot, { chatId });
        break;
      }

      case action === "search_id": {
        await bot.deleteMessage(chatId, messageId);
        await withAuth(async (_bot, ctx) => {
          stateManager.set(ctx.chatId, {
            step: "AWAITING_SEARCH_QUERY",
            data: { userId: ctx.user.id },
          });
          await _bot.sendMessage(
            ctx.chatId,
            "🔍 *Search IDs*\n\nEnter FCN, FIN, or name to search:",
            { parse_mode: "MarkdownV2", ...keyboards.getCancelKeyboard() }
          );
        })(bot, { chatId });
        break;
      }

      case action === "profile": {
        await bot.deleteMessage(chatId, messageId);
        await withAuth(async (_bot, ctx) => {
          const profileData = await telegramUserService.getProfileData(ctx.chatId);
          if (!profileData) {
            await _bot.sendMessage(ctx.chatId, "❌ Profile not found\\.", { parse_mode: "MarkdownV2" });
            return;
          }
          const safe = (v) => escapeMarkdownV2(v ?? "");
          const profileText = `👤 *Your Profile*

*Name:* ${safe(profileData.fullName || "Not set")}
*Phone:* ${safe(profileData.phoneNumber || "Not set")}
*Email:* ${safe(profileData.email || "Not set")}
*Language:* ${safe(profileData.language || "N/A")}
*Role:* ${safe(profileData.role || "USER")}

💰 *Subscription*
Balance: ${safe(profileData.subscription?.balance ?? 0)} Credit
Total Used: ${safe(profileData.subscription?.totalUsed ?? 0)} Credit
Status: ${profileData.subscription?.isActive ? "✅ Active" : "❌ Inactive"}`;
          await _bot.sendMessage(ctx.chatId, profileText, {
            parse_mode: "MarkdownV2",
            ...keyboards.getProfileKeyboard(),
          });
        })(bot, { chatId });
        break;
      }

      case action === "balance_info": {
        await bot.deleteMessage(chatId, messageId);
        await withAuth(async (_bot, ctx) => {
          const balanceData = await telegramUserService.getBalanceData(ctx.chatId);
          const sub = balanceData?.subscription || {};
          const safe = (v) => escapeMarkdownV2(v ?? "");
          const balanceText = `💰 *Your Balance*

*Current Balance:* ${safe(sub.balance || 0)} Credit
*Total Used:* ${safe(sub.totalUsed || 0)} Credit
*Available for ID Generations:* ${safe(Math.floor((sub.balance || 0) / 1))} IDs

💡 *Pricing:*
\\- 1 ID Generation \\= 1 Credit
\\- To top up, tap *Add Balance*`;
          await _bot.sendMessage(ctx.chatId, balanceText, {
            parse_mode: "MarkdownV2",
            ...keyboards.getBalanceKeyboard(),
          });
        })(bot, { chatId });
        break;
      }

      case action === "add_balance": {
        await bot.deleteMessage(chatId, messageId);
        await withAuth(async (_bot, ctx) => {
          const packages = CREDIT_PACKAGES.map((n) => `\\- ${n} Credit`).join("\n");
          const text = `💳 *Add Balance*

Available credit packages:
${packages}

To upgrade or top up, please contact @mihiretut21\\.`;
          await _bot.sendMessage(ctx.chatId, text, {
            parse_mode: "MarkdownV2",
            ...keyboards.getBackKeyboard("balance_info"),
          });
        })(bot, { chatId });
        break;
      }

      case action === "usage_history": {
        await bot.deleteMessage(chatId, messageId);
        await withAuth(async (_bot, ctx) => {
          const logs = await usageLogService.getUserLogs(ctx.user.id);
          const safe = (v) => escapeMarkdownV2(v ?? "");
          const items = (logs || []).slice(0, 15);
          if (!items.length) {
            await _bot.sendMessage(
              ctx.chatId,
              "📊 *Usage History*\n\nNo usage logs yet\\.",
              { parse_mode: "MarkdownV2", ...keyboards.getBackKeyboard("balance_info") }
            );
            return;
          }
          const lines = items.map((l, idx) => {
            const d = new Date(l.createdAt).toLocaleDateString();
            return `*${idx + 1}\\.* ${safe(l.action)} \\- ${safe(l.amount)} Credit \\(${safe(d)}\\)`;
          });
          await _bot.sendMessage(
            ctx.chatId,
            `📊 *Usage History* (latest ${items.length})\n\n${lines.join("\n")}`,
            { parse_mode: "MarkdownV2", ...keyboards.getBackKeyboard("balance_info") }
          );
        })(bot, { chatId });
        break;
      }

      case action.startsWith("dl_"): {
        await withAuth(async (_bot, ctx) => {
          return handleDownload(_bot, ctx.chatId, action, ctx.user.id, messageId);
        })(bot, { chatId });
        break;
      }

      case action.startsWith("download_batch_"):
      case action.startsWith("download_page_"): {
        await withAuth(async (_bot, ctx) => {
          return handleBatchDownload(_bot, ctx.chatId, action, ctx.user.id);
        })(bot, { chatId });
        break;
      }

      case action === "admin_panel": {
        await bot.deleteMessage(chatId, messageId);
        await withAdmin(async (_bot, ctx) => {
          await _bot.sendMessage(ctx.chatId, "👑 *Admin Panel*\n\nSelect an option:", {
            parse_mode: "MarkdownV2",
            ...keyboards.getAdminKeyboard(),
          });
        })(bot, { chatId });
        break;
      }

      case action === "admin_users": {
        await bot.deleteMessage(chatId, messageId);
        await withAdmin(async (_bot, ctx) => {
          return adminHandler.handleAdminUsers(_bot, ctx.chatId, 1);
        })(bot, { chatId });
        break;
      }

      case action.startsWith("admin_users_"): {
        await bot.deleteMessage(chatId, messageId);
        const page = parsePositiveInt(action.split("_")[2], 1);
        await withAdmin(async (_bot, ctx) => {
          return adminHandler.handleAdminUsers(_bot, ctx.chatId, page);
        })(bot, { chatId });
        break;
      }

      case action === "admin_search": {
        await bot.deleteMessage(chatId, messageId);
        await withAdmin(async (_bot, ctx) => {
          const result = await adminHandler.handleAdminSearchUser(_bot, ctx.chatId);
          if (result?.step) {
            stateManager.set(ctx.chatId, {
              step: result.step,
              data: result.data || {},
            });
          }
        })(bot, { chatId });
        break;
      }

      case action.startsWith("admin_user_"): {
        const userId = action.replace("admin_user_", "");
        await bot.deleteMessage(chatId, messageId);
        await withAdmin(async (_bot, ctx) => {
          return adminHandler.handleAdminUserDetail(_bot, ctx.chatId, userId);
        })(bot, { chatId });
        break;
      }

      case action.startsWith("admin_addbal_"): {
        const userId = action.replace("admin_addbal_", "");
        await bot.deleteMessage(chatId, messageId);
        await withAdmin(async (_bot, ctx) => {
          const result = await adminHandler.handleAdminAddBalance(_bot, ctx.chatId, userId);
          if (result?.step) {
            stateManager.set(ctx.chatId, {
              step: result.step,
              data: result.data || {},
            });
          }
        })(bot, { chatId });
        break;
      }

      case action.startsWith("admin_role_"): {
        const userId = action.replace("admin_role_", "");
        await bot.deleteMessage(chatId, messageId);
        await withAdmin(async (_bot, ctx) => {
          return adminHandler.handleAdminChangeRole(_bot, ctx.chatId, userId);
        })(bot, { chatId });
        break;
      }

      case action.startsWith("admin_block_"): {
        const userId = action.replace("admin_block_", "");
        await bot.deleteMessage(chatId, messageId);
        await withAdmin(async (_bot, ctx) => {
          return adminHandler.handleAdminBlockUser(_bot, ctx.chatId, userId);
        })(bot, { chatId });
        break;
      }

      case action.startsWith("admin_usergens_"): {
        const parts = action.split("_");
        const userId = parts[2];
        await bot.deleteMessage(chatId, messageId);
        const page = parsePositiveInt(parts[3], 1);
        await withAdmin(async (_bot, ctx) => {
          return adminHandler.handleAdminUserGenerations(_bot, ctx.chatId, userId, page);
        })(bot, { chatId });
        break;
      }

      case action === "admin_stats": {
        await bot.deleteMessage(chatId, messageId);
        await withAdmin(async (_bot, ctx) => {
          return adminHandler.handleAdminStats(_bot, ctx.chatId);
        })(bot, { chatId });
        break;
      }

      case action.startsWith("admin_logs_"): {
        const userId = action.replace("admin_logs_", "");
        await bot.deleteMessage(chatId, messageId);
        await withAdmin(async (_bot, ctx) => {
          return adminHandler.handleAdminUserLogs(_bot, ctx.chatId, userId);
        })(bot, { chatId });
        break;
      }

      case action.startsWith("edit_"): {
        await withAuth(async (_bot, ctx) => {
          return handleEditProfile(_bot, ctx.chatId, action, ctx.user.id);
        })(bot, { chatId });
        break;
      }

      default:
        await bot.sendMessage(
          chatId,
          "⚠️ Unknown action\\.",
          { parse_mode: "MarkdownV2", ...keyboards.getBackKeyboard("main_menu") }
        );
    }
  } catch (error) {
    console.error("Callback error:", error);
    await bot.sendMessage(
      chatId,
      "❌ An error occurred\\. Please try again\\.",
      { parse_mode: "MarkdownV2", ...keyboards.getBackKeyboard("main_menu") }
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
      { parse_mode: "MarkdownV2" }
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
          parse_mode: "MarkdownV2",
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
        parse_mode: "MarkdownV2",
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
