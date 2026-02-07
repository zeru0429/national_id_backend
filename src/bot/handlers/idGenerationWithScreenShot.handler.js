/**
 * idGenerationWithScreenShot.handler.js
 * Full pipeline:
 * FRONT → detect + OCR + barcode + background removal
 * BACK → QR scan + AI extraction (uses original front + original back)
 * → ID generation
 */

const fs = require("fs");
const fsPromises = fs.promises;
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
  generateBarcode,
} = require("../../services/qrcodeService");

const { extractIdContent } = require("../../services/googleAiService");
const detectionService = require("../../modules/detection/services/detectionService");
const { downloadOBSFileAsBuffer } = require("../../services/obsService");
const { extractCardNumberFromBuffer } = require("../../utils/ocrUtils");
const { removeBackground } = require("../../services/bgRemover");

// ============================
// START FLOW
// ============================

async function startScreenshotIDGeneration(bot, chatId, userId) {
  if (stateManager.isLocked(chatId)) {
    return bot.sendMessage(
      chatId,
      "⏳ Please wait for your current operation to complete.",
      keyboards.getBackKeyboard("main_menu"),
    );
  }

  const balanceCheck = await idGenService.checkBalance(userId);

  if (!balanceCheck.ok) {
    return bot.sendMessage(
      chatId,
      `❌ *Insufficient Balance!*\nRequired: ${ID_GENERATION_COST}`,
      { parse_mode: "Markdown", ...keyboards.getBalanceKeyboard() },
    );
  }

  stateManager.set(chatId, {
    step: "ID_SCREENSHOT_FRONT",
    data: { userId },
    action: "generate_id_screenshot",
  });

  await bot.sendMessage(chatId, `✅ Upload *FRONT screenshot* (as file).`, {
    parse_mode: "Markdown",
    ...keyboards.getCancelKeyboard(),
  });
}

// ============================
// MAIN HANDLER
// ============================

async function handleScreenshotMessage(bot, msg) {
  const chatId = msg.chat.id;
  // grab the latest user state at function start
  const userState = stateManager.get(chatId);

  if (!userState?.step?.startsWith("ID_SCREENSHOT")) return;

  if (!msg.document) {
    return bot.sendMessage(chatId, "❌ Upload as FILE.", {
      parse_mode: "Markdown",
      ...keyboards.getCancelKeyboard(),
    });
  }

  const processingMsg = await bot.sendMessage(chatId, "⏳ Processing...", {
    parse_mode: "Markdown",
  });

  let tempPath;
  try {
    // Download uploaded file from Telegram
    const fileLink = await bot.getFileLink(msg.document.file_id);
    const res = await axios.get(fileLink, {
      responseType: "arraybuffer",
      timeout: 30000,
    });
    const buffer = Buffer.from(res.data);

    // Save temp for detection
    tempPath = await saveTempImage(buffer);

    // ========== STEP 1: FRONT ==========
    if (userState.step === "ID_SCREENSHOT_FRONT") {
      await bot.editMessageText("🔍 Detecting face...", {
        chat_id: chatId,
        message_id: processingMsg.message_id,
      });

      let detectResult;
      try {
        detectResult = await detectionService.detectAndCrop(
          { path: tempPath },
          { outputWidth: 1200, outputHeight: 1200 },
        );
      } catch (dErr) {
        console.error("DEBUG: detectAndCrop failed", dErr);
        await bot.editMessageText(
          "❌ Face detection failed. Please upload a clear front photo.",
          {
            chat_id: chatId,
            message_id: processingMsg.message_id,
            parse_mode: "Markdown",
            ...keyboards.getCancelKeyboard(),
          },
        );
        return;
      }

      const frontProcessed = detectResult?.processedImage;
      if (!frontProcessed) {
        await bot.editMessageText(
          "❌ No face detected. Please upload a clear front photo with visible face.",
          {
            chat_id: chatId,
            message_id: processingMsg.message_id,
            parse_mode: "Markdown",
            ...keyboards.getCancelKeyboard(),
          },
        );
        return;
      }

      // read the processed (cropped) file for background removal / preview
      const croppedPath = path.join(
        process.cwd(),
        "public",
        frontProcessed.url,
      );
      const croppedBuffer = fs.readFileSync(croppedPath);

      // OCR (try to obtain card number)
      await bot.editMessageText("🔍 OCR scanning...", {
        chat_id: chatId,
        message_id: processingMsg.message_id,
      });

      let cardNumber = null;
      let barcodeBuffer = null;
      try {
        const ocr = await extractCardNumberFromBuffer(buffer); // use original buffer for OCR
        cardNumber = ocr.cardNumber;
        if (cardNumber) {
          barcodeBuffer = await generateBarcode(cardNumber);
        }
      } catch (ocrErr) {
        console.warn("OCR error", ocrErr);
      }

      // Background removal for rendering (not for AI)
      await bot.editMessageText("✨ Removing background...", {
        chat_id: chatId,
        message_id: processingMsg.message_id,
      });

      let bgPath;
      try {
        bgPath = await removeBackground(croppedBuffer, {
          saveFolder: path.join(process.cwd(), "public", "output"),
          filename: `bg-${Date.now()}.png`,
          width: 400,
          height: 550,
          format: "png",
          colorMode: "rgba",
        });
      } catch (bgErr) {
        console.warn(
          "Background removal failed, using cropped image as fallback",
          bgErr,
        );
        // fallback to croppedPath if removeBackground fails
        bgPath = croppedPath;
      }

      const relativeBg = bgPath.replace(path.join(process.cwd(), "public"), "");

      // Save important items to state:
      // - frontOriginal: ORIGINAL front buffer (for AI)
      // - frontProcessedPath: processed path (for rendering/generateIDCard)
      // - barcodeBuffer stored as base64 for persistence
      stateManager.set(chatId, {
        step: "ID_SCREENSHOT_BACK",
        data: {
          userId: userState.data.userId,
          frontOriginal: {
            buffer, // original front screenshot buffer (from Telegram)
            mimeType: msg.document.mime_type || "image/png",
          },
          frontProcessedPath: relativeBg, // path relative to /public for rendering
          barcodeBuffer: barcodeBuffer
            ? barcodeBuffer.toString("base64")
            : null,
          rawOcrText: null, // optional - you can set raw OCR text if you want to store
        },
        action: "generate_id_screenshot",
      });

      await bot.editMessageText(
        `✅ Front processed!\nCard: ${cardNumber || "Not found"}\n\n📥 Upload BACK screenshot (file).`,
        {
          chat_id: chatId,
          message_id: processingMsg.message_id,
          parse_mode: "Markdown",
          ...keyboards.getCancelKeyboard(),
        },
      );

      return; // done with front step
    }

    // ========== STEP 2: BACK ==========
    else if (userState.step === "ID_SCREENSHOT_BACK") {
      // Re-fetch state in case something changed
      const state = stateManager.get(chatId);
      const data = state?.data || userState.data || {};

      await bot.editMessageText("🔍 Scanning QR...", {
        chat_id: chatId,
        message_id: processingMsg.message_id,
      });

      const qrData = await scanQRCode(tempPath);

      if (!qrData) {
        await bot.editMessageText(
          "❌ QR not detected. Upload a clearer back screenshot (file).",
          {
            chat_id: chatId,
            message_id: processingMsg.message_id,
            parse_mode: "Markdown",
            ...keyboards.getCancelKeyboard(),
          },
        );
        return;
      }

      const qrBuffer = await generateQRCode(qrData);

      await bot.editMessageText("🤖 AI extracting (front + back)...", {
        chat_id: chatId,
        message_id: processingMsg.message_id,
      });

      // Build the two image parts for AI:
      // Prefer original buffers (frontOriginal + current back buffer).
      // If frontOriginal is missing (rare) fallback to the processed file.
      let frontOriginal = data.frontOriginal;
      if (!frontOriginal && data.frontProcessedPath) {
        try {
          const fallbackPath = path.join(
            process.cwd(),
            "public",
            data.frontProcessedPath.replace(/^\//, ""),
          );
          const fallbackBuf = fs.readFileSync(fallbackPath);
          frontOriginal = { buffer: fallbackBuf, mimeType: "image/png" };
          console.warn(
            "frontOriginal missing in state - using processed fallback for AI",
          );
        } catch (e) {
          console.warn(
            "No front original or processed file available for AI",
            e,
          );
        }
      }

      if (!frontOriginal) {
        // cannot proceed reliably, inform user
        await bot.editMessageText(
          "❌ Front screenshot not available for AI extraction. Please re-upload the FRONT screenshot and try again.",
          {
            chat_id: chatId,
            message_id: processingMsg.message_id,
            parse_mode: "Markdown",
            ...keyboards.getCancelKeyboard(),
          },
        );
        stateManager.remove(chatId);
        return;
      }

      // Prepare AI payload
      const backImage = {
        buffer, // current uploaded back screenshot buffer
        mimeType: msg.document.mime_type || "image/png",
      };

      let aiResult;
      try {
        aiResult = await extractIdContent(
          [
            { buffer: frontOriginal.buffer, mimeType: frontOriginal.mimeType },
            { buffer: backImage.buffer, mimeType: backImage.mimeType },
          ],
          `
Analyze the front and back screenshots of this Ethiopian Digital ID.
Return JSON with keys: name_am, name_en, date_of_birth_am, date_of_birth_en, sex_am, sex_en,
issueDate_am, issueDate_en, expireDate_am, expireDate_en, nationality_am, nationality_en,
phone_number, region_am, region_en, zone_am, zone_en, woreda_am, woreda_en, fcn, fin, sn.
Use null if value not found.
          `,
        );
      } catch (aiErr) {
        console.error("AI extraction error", aiErr);
        await bot.editMessageText(
          "❌ AI extraction failed. Please try again (ensure both images are clear).",
          {
            chat_id: chatId,
            message_id: processingMsg.message_id,
            parse_mode: "Markdown",
            ...keyboards.getCancelKeyboard(),
          },
        );
        stateManager.remove(chatId);
        return;
      }

      if (!aiResult || !aiResult.success || !aiResult.data) {
        console.error("AI returned no data", aiResult);
        await bot.editMessageText(
          "❌ AI extraction failed to return valid data. Please try again with clearer images.",
          {
            chat_id: chatId,
            message_id: processingMsg.message_id,
            parse_mode: "Markdown",
            ...keyboards.getCancelKeyboard(),
          },
        );
        stateManager.remove(chatId);
        return;
      }

      // Proceed to generate ID images using the processed front image for the photo
      // If frontProcessedPath is available use it for rendering; otherwise fallback to frontOriginal.buffer
      let profileBuffer;
      try {
        if (data.frontProcessedPath) {
          profileBuffer = fs.readFileSync(
            path.join(
              process.cwd(),
              "public",
              data.frontProcessedPath.replace(/^\//, ""),
            ),
          );
        } else {
          profileBuffer = frontOriginal.buffer;
        }
      } catch (readErr) {
        console.warn(
          "Failed to read frontProcessedPath, using frontOriginal for rendering",
          readErr,
        );
        profileBuffer = frontOriginal.buffer;
      }

      // Finalize: remove state then generate
      stateManager.remove(chatId);

      await bot.editMessageText(
        "🎉 ID verified & extracted!\n🚀 Generating ID cards...",
        {
          chat_id: chatId,
          message_id: processingMsg.message_id,
          parse_mode: "Markdown",
        },
      );

      try {
        await generateIDFromScreenshot({
          bot,
          chatId,
          userId: data.userId,
          extractedData: aiResult.data,
          profileBuffer,
          barcodeBuffer: data.barcodeBuffer
            ? Buffer.from(data.barcodeBuffer, "base64")
            : null,
          qrBuffer,
        });
      } catch (genErr) {
        console.error("generateIDFromScreenshot error", genErr);
        await bot.editMessageText(
          "❌ ID generation failed. Please try again.",
          {
            chat_id: chatId,
            message_id: processingMsg.message_id,
            parse_mode: "Markdown",
            ...keyboards.getBackKeyboard("main_menu"),
          },
        );
        return;
      }
    }
  } catch (err) {
    console.error("Screenshot pipeline error:", err);

    try {
      await bot.editMessageText("❌ Processing failed. Try again.", {
        chat_id: chatId,
        message_id: processingMsg.message_id,
        parse_mode: "Markdown",
        ...keyboards.getBackKeyboard("main_menu"),
      });
    } catch (_) {
      await bot.sendMessage(
        chatId,
        "❌ Processing failed. Try again.",
        keyboards.getBackKeyboard("main_menu"),
      );
    }

    stateManager.remove(chatId);
  } finally {
    if (tempPath) await fsPromises.unlink(tempPath).catch(() => { });
  }
}

function generateRandom7DigitNumber() {
  const randomNumber = Math.floor(1000000 + Math.random() * 9000000);
  return randomNumber.toString();
}

// ============================
// FINAL ID GENERATION
// ============================

async function generateIDFromScreenshot({
  bot,
  chatId,
  userId,
  extractedData,
  profileBuffer,
  barcodeBuffer,
  qrBuffer,
}) {
  try {
    extractedData.sn =
      extractedData.fcn || extractedData.fin || Date.now().toString();

    const safeName = (extractedData.name_en || "id").replace(/\s+/g, "_");
    const ts = Date.now();
    extractedData.sn = generateRandom7DigitNumber();

    const frontURL = await generateIDCard({
      side: "front",
      data: extractedData,
      photoPath: profileBuffer,
      barcodePath: barcodeBuffer,
      qrCodePath: qrBuffer,
      customFileName: `front-${ts}-${safeName}.jpg`,
      isBarcode2: true,
    });

    const backURL = await generateIDCard({
      side: "back",
      data: extractedData,
      photoPath: profileBuffer,
      barcodePath: barcodeBuffer,
      qrCodePath: qrBuffer,
      customFileName: `back-${ts}-${safeName}.jpg`,
    });

    await idGenerationService.createWithFiles(
      userId,
      extractedData,
      ID_GENERATION_COST,
      [
        { role: "FRONT_ID", fileUrl: frontURL },
        { role: "BACK_ID", fileUrl: backURL },
      ],
    );

    const frontBuf = await downloadOBSFileAsBuffer(frontURL);
    const backBuf = await downloadOBSFileAsBuffer(backURL);

    await bot.sendDocument(chatId, frontBuf, {
      filename: `Front-ID-${extractedData.fin || extractedData.fcn || "ID"}.jpg`,
      caption: "🆔 Front ID",
    });
    await bot.sendDocument(chatId, backBuf, {
      filename: `Back-ID-${extractedData.fin || extractedData.fcn || "ID"}.jpg`,
      caption: "🆔 Back ID",
    });

    const sub = await subscriptionService.getByUserId(userId);

    await bot.sendMessage(
      chatId,
      `✅ Done!\nRemaining balance: ${sub.balance}`,
      keyboards.getBackKeyboard("main_menu"),
    );
  } catch (err) {
    console.error("ID generation error:", err);

    await bot.sendMessage(
      chatId,
      "❌ ID generation failed.",
      keyboards.getBackKeyboard("main_menu"),
    );
  }
}

module.exports = {
  startScreenshotIDGeneration,
  handleScreenshotMessage,
};
