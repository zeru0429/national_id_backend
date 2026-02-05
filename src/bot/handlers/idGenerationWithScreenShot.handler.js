/**
 * idGenerationWithScreenShot.handler.js
 */

const fs = require("fs");
const { unlink, writeFile } = require("fs/promises");
const path = require("path");
const axios = require("axios");
const { saveTempImage } = require("../ui/saveImage");
const { generateIDCard } = require("../../services/idCardGenerator");
const idGenerationService = require("../../modules/idGeneration/services/idGenerationService");
const subscriptionService = require("../../modules/subscription/services/subscriptionService");
const stateManager = require("../utils/stateManager");
const keyboards = require("../ui/keyboards");
const { ID_GENERATION_COST } = require("../config/constants");
const idGenService = require("../services/idGeneration.service");
const {
  scanQRCode,
  generateQRCode,
  scanBarcode,
  generateBarcode,
} = require("../../services/qrcodeService");
const { extractIdContent } = require("../../services/googleAiService");

async function startScreenshotIDGeneration(bot, chatId, userId) {
  // 1️⃣ Check if user is locked for another operation
  if (stateManager.isLocked(chatId)) {
    return bot.sendMessage(
      chatId,
      "⏳ Please wait for your current operation to complete.",
      keyboards.getBackKeyboard("main_menu"),
    );
  }

  // 2️⃣ Check user balance
  const balanceCheck = await idGenService.checkBalance(userId);
  if (!balanceCheck.ok) {
    return bot.sendMessage(
      chatId,
      `❌ *Insufficient Balance!*\n\n💰 Required: ${ID_GENERATION_COST} Credit\n💰 Available: ${balanceCheck.balance} Credit`,
      { parse_mode: "Markdown", ...keyboards.getBalanceKeyboard() },
    );
  }

  // 3️⃣ Lock user state for front screenshot upload
  stateManager.set(chatId, {
    step: "ID_SCREENSHOT_FRONT",
    data: { userId },
    action: "generate_id_screenshot",
  });

  await bot.sendMessage(
    chatId,
    `✅ *Ready to Generate ID From Screenshot*\n\n📊 *Cost:* ${ID_GENERATION_COST} Credit\n💰 *Your Balance:* ${balanceCheck.balance} Credit\n\nPlease upload the *FRONT screenshot* of the ID in **file format** (PNG, JPG, etc.).\n\n⚠️ Photo uploads are *not accepted* to preserve quality.`,
    { parse_mode: "Markdown", ...keyboards.getCancelKeyboard() },
  );
}

async function handleScreenshotMessage(bot, msg) {
  const chatId = msg.chat.id;
  const userState = stateManager.get(chatId);

  if (!userState || !userState.step?.startsWith("ID_SCREENSHOT")) return;

  const step = userState.step;
  const { userId, frontFile, barcodeData, barcodeImage } = userState.data || {};

  // Validate upload format
  if (!msg.document) {
    return bot.sendMessage(
      chatId,
      "❌ Upload screenshot as *FILE*, not photo.",
      { parse_mode: "Markdown", ...keyboards.getCancelKeyboard() },
    );
  }

  const processingMsg = await bot.sendMessage(
    chatId,
    "⏳ Processing screenshot...",
    { parse_mode: "Markdown" },
  );

  let tempPath;
  try {
    // Download file from Telegram
    const fileLink = await bot.getFileLink(msg.document.file_id);
    const res = await axios.get(fileLink, { responseType: "arraybuffer" });
    const buffer = Buffer.from(res.data);

    tempPath = await saveTempImage(buffer);

    // =====================================================
    // 🟢 STEP 1 — FRONT: scan barcode
    // =====================================================
    if (step === "ID_SCREENSHOT_FRONT") {
      const scannedBarcode = await scanBarcode(tempPath);
      if (!scannedBarcode) {
        return bot.editMessageText(
          "❌ Barcode not detected.\nUpload clearer *front screenshot*.",
          {
            chat_id: chatId,
            message_id: processingMsg.message_id,
            parse_mode: "Markdown",
            ...keyboards.getCancelKeyboard(),
          },
        );
      }

      // generate barcode image
      const barcodeImg = await generateBarcode(scannedBarcode);

      // Store front file as full object for AI
      const frontFileObj = {
        buffer,
        mimetype: msg.document.mime_type || "image/png",
        originalname: msg.document.file_name || "front.png",
      };

      stateManager.set(chatId, {
        step: "ID_SCREENSHOT_BACK",
        data: {
          userId,
          frontFile: frontFileObj,
          barcodeData: scannedBarcode,
          barcodeImage: barcodeImg,
        },
        action: "generate_id_screenshot",
      });

      return bot.editMessageText(
        "✅ Front verified!\n📥 Upload *BACK screenshot* (file format).",
        {
          chat_id: chatId,
          message_id: processingMsg.message_id,
          parse_mode: "Markdown",
          ...keyboards.getCancelKeyboard(),
        },
      );
    }

    // =====================================================
    // 🔵 STEP 2 — BACK: scan QR
    // =====================================================
    if (step === "ID_SCREENSHOT_BACK") {
      const qrData = await scanQRCode(tempPath);
      if (!qrData) {
        return bot.editMessageText(
          "❌ QR not detected.\nUpload clearer *back screenshot*.",
          {
            chat_id: chatId,
            message_id: processingMsg.message_id,
            parse_mode: "Markdown",
            ...keyboards.getCancelKeyboard(),
          },
        );
      }

      const qrImg = await generateQRCode(qrData);

      // Prepare back file object for AI
      const backFile = {
        buffer,
        mimetype: msg.document.mime_type || "image/png",
        originalname: msg.document.file_name || "back.png",
      };

      // =====================================================
      // 🤖 STEP 3 — AI EXTRACTION
      // =====================================================
      const prompt = `
Analyze the front and back of this Ethiopian Digital ID.
Return a JSON object with these EXACT keys:
name_am, name_en, date_of_birth_am, date_of_birth_en, sex_am, sex_en, 
issueDate_am, issueDate_en, expireDate_am, expireDate_en,
nationality_am, nationality_en, phone_number, region_am, region_en, 
zone_am, zone_en, woreda_am, woreda_en, fcn, fin, sn.
If a value is not found, use null.
`;

      const aiResult = await extractIdContent([frontFile, backFile], prompt);
      if (!aiResult.success || !aiResult.data) {
        return bot.editMessageText(
          "❌ AI extraction failed.\nTry clearer screenshots.",
          {
            chat_id: chatId,
            message_id: processingMsg.message_id,
            parse_mode: "Markdown",
            ...keyboards.getCancelKeyboard(),
          },
        );
      }

      // =====================================================
      // 🚀 STEP 4 — READY FOR ID GENERATION
      // =====================================================
      stateManager.remove(chatId);

      await bot.editMessageText(
        "🎉 ID verified & extracted!\n\n🚀 Starting generation pipeline...",
        {
          chat_id: chatId,
          message_id: processingMsg.message_id,
          parse_mode: "Markdown",
        },
      );

      // 🔥 Call your ID generation function here
      // await generateID(aiResult.data, barcodeImage, qrImg);
      return;
    }
  } catch (err) {
    console.error("Screenshot pipeline error:", err);
    await bot.editMessageText("❌ Processing failed. Try again.", {
      chat_id: chatId,
      message_id: processingMsg.message_id,
      parse_mode: "Markdown",
      ...keyboards.getBackKeyboard("main_menu"),
    });
    stateManager.remove(chatId);
  } finally {
    if (tempPath) await unlink(tempPath).catch(() => { });
  }
}

module.exports = {
  startScreenshotIDGeneration,
  handleScreenshotMessage,
};
