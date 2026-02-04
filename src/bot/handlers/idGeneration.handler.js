/**
 * ID Generation flow handler - uses services only
 */

const fs = require("fs");
const fsPromises = fs.promises;
const path = require("path");
const axios = require("axios");
const { processPDF } = require("../../services/pdfService");
const { generateIDCard } = require("../../services/idCardGenerator");
const idGenerationService = require("../../modules/idGeneration/services/idGenerationService");
const subscriptionService = require("../../modules/subscription/services/subscriptionService");
const stateManager = require("../utils/stateManager");
const keyboards = require("../ui/keyboards");
const { OUTPUT_DIR, TEMP_DIR } = require("../../config/paths");
const {
  ID_GENERATION_COST,
  MAX_FILE_SIZE_MB,
  SEARCH_MIN_LENGTH,
} = require("../config/constants");
const idGenService = require("../services/idGeneration.service");
const { downloadOBSFileAsBuffer } = require("../../services/obsService");

async function startIDGeneration(bot, chatId, userId) {
  // Check if already locked
  if (stateManager.isLocked(chatId)) {
    return bot.sendMessage(
      chatId,
      "⏳ Please wait for your current operation to complete.",
      keyboards.getBackKeyboard("main_menu")
    );
  }



  const balanceCheck = await idGenService.checkBalance(userId);
  if (!balanceCheck.ok) {
    await bot.sendMessage(
      chatId,
      `❌ *Insufficient Balance!*\n\n💰 Required: ${ID_GENERATION_COST} Credit\n💰 Available: ${balanceCheck.balance} Credit\n\nPlease contact admin to add balance.`,
      {
        parse_mode: "Markdown",
        ...keyboards.getBalanceKeyboard(),
      }
    );
    return;
  }

  // The lock will be set by the callback dispatcher
  stateManager.set(chatId, {
    step: "ID_AWAITING_FILE",
    data: { userId },
    action: "generate_id",
  });

  await bot.sendMessage(
    chatId,
    `✅ *Ready to Generate ID*\n\n📊 *Cost:* ${ID_GENERATION_COST} Credit\n💰 *Your Balance:* ${balanceCheck.balance} Credit\n\nPlease upload a PDF of the ID document:`,
    {
      parse_mode: "Markdown",
      ...keyboards.getCancelKeyboard(),
    }
  );

  stateManager.set(chatId, {
    step: "ID_AWAITING_FILE",
    data: { userId },
    action: "generate_id",
  });
}

async function handleIDMessage(bot, msg) {
  const chatId = msg.chat.id;
  const userState = stateManager.get(chatId);
  if (!userState || !userState.step?.startsWith("ID_")) return;

  const { userId } = userState.data;

  const balanceCheck = await idGenService.checkBalance(userId);
  if (!balanceCheck.ok) {
    await bot.sendMessage(
      chatId,
      "❌ Insufficient balance. Please add balance first.",
      keyboards.getBalanceKeyboard()
    );
    stateManager.remove(chatId);
    return;
  }

  let fileId;
  if (msg.document) {
    if (!msg.document.mime_type?.includes("pdf")) {
      await bot.sendMessage(
        chatId,
        "❌ *Invalid file format!*\n\nOnly PDF files are accepted for ID generation.\n\nPlease upload a valid PDF document.",
        { parse_mode: "Markdown", ...keyboards.getCancelKeyboard() }
      );
      return;
    }
    fileId = msg.document.file_id;
  } else if (msg.photo?.length) {
    await bot.sendMessage(
      chatId,
      "❌ *Images not accepted!*\n\nPlease upload a PDF document instead.",
      { parse_mode: "Markdown", ...keyboards.getCancelKeyboard() }
    );
    return;
  } else {
    await bot.sendMessage(
      chatId,
      "⚠️ Please upload a PDF document file.",
      keyboards.getCancelKeyboard()
    );
    return;
  }

  const processingMsg = await bot.sendMessage(
    chatId,
    "⏳ *Processing...*\n\n📥 Downloading file\n🔍 Validating format\n📄 Checking document...\n\nThis may take a moment...",
    { parse_mode: "Markdown" }
  );

  let tempPath;
  try {
    const fileLink = await bot.getFileLink(fileId);
    [TEMP_DIR, OUTPUT_DIR, path.join(OUTPUT_DIR, "result")].forEach((dir) =>
      fs.mkdirSync(dir, { recursive: true })
    );

    const originalName = msg.document?.file_name || "document.pdf";
    const ext = path.extname(originalName).toLowerCase();
    if (ext !== ".pdf") {
      await bot.editMessageText(
        "❌ *Invalid file extension!*\n\nOnly .pdf files are accepted.",
        {
          chat_id: chatId,
          message_id: processingMsg.message_id,
          parse_mode: "Markdown",
          ...keyboards.getCancelKeyboard(),
        }
      );
      return;
    }

    tempPath = path.join(TEMP_DIR, `${Date.now()}-${fileId}${ext}`);

    await bot.editMessageText(
      "⏳ *Processing...*\n\n📥 Downloading file...\n✅ Format validated\n🔍 Checking document...",
      {
        chat_id: chatId,
        message_id: processingMsg.message_id,
        parse_mode: "Markdown",
      }
    );

    const writer = fs.createWriteStream(tempPath);
    const response = await axios.get(fileLink, {
      responseType: "stream",
      timeout: 30000,
    });

    await new Promise((resolve, reject) => {
      response.data.pipe(writer);
      writer.on("finish", resolve);
      writer.on("error", reject);
      setTimeout(() => {
        writer.destroy();
        reject(new Error("File download timeout"));
      }, 60000);
    });

    const stats = fs.statSync(tempPath);
    const fileSizeMB = stats.size / (1024 * 1024);
    if (fileSizeMB > MAX_FILE_SIZE_MB) {
      await fsPromises.unlink(tempPath).catch(console.error);
      await bot.editMessageText(
        `❌ *File too large!*\n\nMaximum file size is ${MAX_FILE_SIZE_MB}MB.\n\nYour file: ${fileSizeMB.toFixed(2)}MB`,
        {
          chat_id: chatId,
          message_id: processingMsg.message_id,
          parse_mode: "Markdown",
          ...keyboards.getCancelKeyboard(),
        }
      );
      return;
    }

    const fileBuffer = fs.readFileSync(tempPath);
    if (fileBuffer.slice(0, 4).toString() !== "%PDF") {
      await fsPromises.unlink(tempPath).catch(console.error);
      await bot.editMessageText(
        "❌ *Invalid PDF file!*\n\nThe uploaded file doesn't appear to be a valid PDF document.",
        {
          chat_id: chatId,
          message_id: processingMsg.message_id,
          parse_mode: "Markdown",
          ...keyboards.getCancelKeyboard(),
        }
      );
      return;
    }

    await bot.editMessageText(
      "⏳ *Processing...*\n\n✅ File downloaded\n✅ Format validated\n🔍 Extracting data from PDF...",
      {
        chat_id: chatId,
        message_id: processingMsg.message_id,
        parse_mode: "Markdown",
      }
    );

    let extractedData;
    let result;
    try {
      result = await processPDF(tempPath, userId);
      extractedData = result.data;
      if (!extractedData) throw new Error("No data extracted from PDF");
      if (!extractedData.fcn && !extractedData.fin)
        throw new Error("Invalid document - FCN and FIN not found");
      if (extractedData.fcn && extractedData.fcn.length < 6)
        throw new Error(`Invalid FCN format: ${extractedData.fcn}`);
      if (extractedData.fin && extractedData.fin.length < 6)
        throw new Error(`Invalid FIN format: ${extractedData.fin}`);
      if (!extractedData.name_en && !extractedData.name_am)
        throw new Error("Name not found in document");
    } catch (extractError) {
      await fsPromises.unlink(tempPath).catch(console.error);
      await bot.editMessageText(
        `❌ *Document Processing Failed!*\n\n*Error:* ${extractError.message}\n\nPlease upload a clear, valid ID document.`,
        {
          chat_id: chatId,
          message_id: processingMsg.message_id,
          parse_mode: "Markdown",
          ...keyboards.getCancelKeyboard(),
        }
      );
      stateManager.remove(chatId);
      return;
    }

    await bot.editMessageText(
      "⏳ *Processing...*\n\n✅ File downloaded\n✅ Data extracted\n✅ Document validated\n🖼️ Generating ID card...",
      {
        chat_id: chatId,
        message_id: processingMsg.message_id,
        parse_mode: "Markdown",
      }
    );

    const timestamp = Date.now();
    const sanitizedName = extractedData.name_en?.replace(/\s+/g, "_") || "id";
    extractedData.sn = extractedData.fcn || extractedData.fin || "00000000";

    let frontPath;
    let backPath;
    try {
      console.log(extractedData)
      frontPath = await generateIDCard({
        side: "front",
        data: extractedData,
        photoPath: result.images.profile,
        barcodePath: result.images.barcode,
        customFileName: `front-${timestamp}-${sanitizedName}.jpg`,
        outputFormat: "jpg",
        jpegQuality: 0.9,
      });

      backPath = await generateIDCard({
        side: "back",
        data: extractedData,
        qrCodePath: result.images.qr,
        customFileName: `back-${timestamp}-${sanitizedName}.jpg`,
        outputFormat: "jpg",
        jpegQuality: 0.9,
      });

      if (!frontPath || !backPath)
        throw new Error("Failed to generate ID card images");
    } catch (genError) {
      await fsPromises.unlink(tempPath).catch(console.error);
      await bot.editMessageText(
        `❌ *ID Generation Failed!*\n\nError: ${genError.message}`,
        {
          chat_id: chatId,
          message_id: processingMsg.message_id,
          parse_mode: "Markdown",
          ...keyboards.getCancelKeyboard(),
        }
      );
      stateManager.remove(chatId);
      return;
    }

    await bot.editMessageText(
      "⏳ *Processing...*\n\n✅ File downloaded\n✅ Data extracted\n✅ ID cards generated\n💾 Saving records...",
      {
        chat_id: chatId,
        message_id: processingMsg.message_id,
        parse_mode: "Markdown",
      }
    );

    try {
      await idGenerationService.createWithFiles(
        userId,
        extractedData,
        ID_GENERATION_COST,
        [
          { role: "FRONT_ID", fileUrl: frontPath },
          { role: "BACK_ID", fileUrl: backPath },
        ]
      );
    } catch (dbError) {
      console.error("Database error:", dbError);
      await bot.editMessageText(
        "❌ *Database Error!*\n\nFailed to save. Please try again.",
        {
          chat_id: chatId,
          message_id: processingMsg.message_id,
          parse_mode: "Markdown",
          ...keyboards.getBackKeyboard("main_menu"),
        }
      );
      stateManager.remove(chatId);
      return;
    }

    await bot.deleteMessage(chatId, processingMsg.message_id);

    await bot.sendMessage(
      chatId,
      `🎉 *ID Generation Complete!*\n\n📋 *Extracted Details:*\n👤 Name: ${extractedData.name_en || "N/A"}\n🔢 FCN: ${extractedData.fcn || "N/A"}\n🔢 FIN: ${extractedData.fin || "N/A"}\n💰 Cost: ${ID_GENERATION_COST} Credit\n\nYour ID cards are ready:`,
      { parse_mode: "Markdown" }
    );


    const frontOBSUrl = frontPath;
    const backOBSUrl = backPath;
    const frontBuffer = await downloadOBSFileAsBuffer(frontOBSUrl);
    const backBuffer = await downloadOBSFileAsBuffer(backOBSUrl);

    await bot.sendDocument(
      chatId,
      frontBuffer,
      {
        filename: `Front-ID-${extractedData.fin || extractedData.fcn || "ID"}.jpg`,
        caption: `🆔 *Front ID*\n👤 ${extractedData.name_en || "ID"}\n🔢 FCN: ${extractedData.fcn || "N/A"}`,
        parse_mode: "Markdown",
      }
    );

    await bot.sendDocument(
      chatId,
      backBuffer,
      {
        filename: `Back-ID-${extractedData.fin || extractedData.fcn || "ID"}.jpg`,
        caption: `🆔 *Back ID*\n👤 ${extractedData.name_en || "ID"}\n🔢 FIN: ${extractedData.fin || "N/A"}`,
        parse_mode: "Markdown",
      }
    );
    const updatedSub = await subscriptionService.getByUserId(userId);
    await bot.sendMessage(
      chatId,
      `✅ *Generation Successful!*\n\n💰 *New Balance:* ${updatedSub.balance} Credit\n\nWhat would you like to do next?`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "🔄 Generate Another", callback_data: "generate_id" },
              { text: "📂 View All", callback_data: "vp_1" },
            ],
            [{ text: "🏠 Main Menu", callback_data: "main_menu" }],
          ],
        },
      }
    );

    await fsPromises.unlink(tempPath).catch(console.error);
  } catch (err) {
    console.error("ID Generation error:", err);
    try {
      if (tempPath && fs.existsSync(tempPath))
        await fsPromises.unlink(tempPath);
    } catch (e) { }
    let errorMessage = "❌ *Generation Failed!*\n\nAn error occurred.";
    if (err.message?.includes("timeout"))
      errorMessage = "❌ *Timeout Error!*\n\nThe operation took too long.";
    try {
      await bot.editMessageText(errorMessage + `\n\nPlease try again.`, {
        chat_id: chatId,
        message_id: processingMsg.message_id,
        parse_mode: "Markdown",
        ...keyboards.getBackKeyboard("main_menu"),
      });
    } catch (e) {
      await bot.sendMessage(
        chatId,
        "❌ Generation failed. Please try again.",
        keyboards.getBackKeyboard("main_menu")
      );
    }
  } finally {
    // ALWAYS CLEAN UP STATE
    stateManager.remove(chatId);
  }

}

async function handleViewPast(bot, chatId, userId, page = 1, limit = 10) {
  const { generations, total, totalPages } =
    await idGenService.getPastGenerations(userId, page, limit);

  if (total === 0) {
    await bot.sendMessage(
      chatId,
      "📭 *No Past Generations*\n\nYou haven't generated any IDs yet.\n\nClick below to generate your first ID:",
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🆔 Generate ID", callback_data: "generate_id" }],
            [{ text: "🏠 Main Menu", callback_data: "main_menu" }],
          ],
        },
      }
    );
    return;
  }

  let message = `📚 *Your ID Generations*\n\nPage *${page}* of *${totalPages}*\nTotal: *${total}* generations\n\n`;
  const inlineKeyboard = [];

  generations.forEach((gen, idx) => {
    const name = gen.extractedData?.name_en || "Unknown";
    const date = new Date(gen.createdAt).toLocaleDateString();
    const globalIdx = (page - 1) * limit + idx + 1;
    const shortId = gen.id.substring(0, 8);
    message += `*${globalIdx}. ${name}*\n`;
    message += `📅 ${date} | 🔢 FCN: ${gen.fcn || "N/A"}\n`;
    message += `💳 Cost: ${gen.cost} Credit | Status: ✅\n\n`;
    inlineKeyboard.push([
      { text: `⬇️ Front ${globalIdx}`, callback_data: `dl_f_${shortId}` },
      { text: `⬇️ Back ${globalIdx}`, callback_data: `dl_b_${shortId}` },
    ]);
  });

  const paginationRow = [];
  if (page > 1)
    paginationRow.push({ text: "◀️ Previous", callback_data: `vp_${page - 1}` });
  paginationRow.push({ text: `📄 ${page}/${totalPages}`, callback_data: "page_info" });
  if (page < totalPages)
    paginationRow.push({ text: "Next ▶️", callback_data: `vp_${page + 1}` });
  if (paginationRow.length > 0) inlineKeyboard.push(paginationRow);

  inlineKeyboard.push([
    { text: "🆔 Generate New", callback_data: "generate_id" },
    { text: "🏠 Main Menu", callback_data: "main_menu" },
  ]);

  await bot.sendMessage(chatId, message, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: inlineKeyboard },
  });
}

async function searchID(bot, chatId, queryText, userId) {
  if (!queryText || queryText.length < SEARCH_MIN_LENGTH) {
    await bot.sendMessage(
      chatId,
      `❌ Search query must be at least ${SEARCH_MIN_LENGTH} characters.`,
      keyboards.getBackKeyboard("main_menu")
    );
    return;
  }

  const searchingMsg = await bot.sendMessage(
    chatId,
    `🔍 *Searching...*\n\nLooking for IDs matching "*${queryText}*"`,
    { parse_mode: "Markdown" }
  );

  try {
    const results = await idGenService.searchGenerations(userId, queryText);
    await bot.deleteMessage(chatId, searchingMsg.message_id);

    if (!results.length) {
      await bot.sendMessage(
        chatId,
        `🔍 *No Results Found*\n\nNo IDs found for "*${queryText}*".\n\nTry a different search term.`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🔍 Search Again", callback_data: "search_id" }],
              [{ text: "📂 View All IDs", callback_data: "vp_1" }],
              [{ text: "🏠 Main Menu", callback_data: "main_menu" }],
            ],
          },
        }
      );
      return;
    }

    let message = `✅ *Search Results*\n\nFound *${results.length}* ID(s) matching "*${queryText}*":\n\n`;
    const inlineKeyboard = [];

    results.forEach((gen, idx) => {
      const name = gen.extractedData?.name_en || "Unknown";
      const date = new Date(gen.createdAt).toLocaleDateString();
      const shortId = gen.id.substring(0, 8);
      message += `*${idx + 1}. ${name}*\n`;
      message += `📅 ${date} | 🔢 FCN: ${gen.fcn || "N/A"}\n\n`;
      inlineKeyboard.push([
        { text: `⬇️ Front ${idx + 1}`, callback_data: `dl_f_${shortId}` },
        { text: `⬇️ Back ${idx + 1}`, callback_data: `dl_b_${shortId}` },
      ]);
    });

    inlineKeyboard.push([
      { text: "🔍 New Search", callback_data: "search_id" },
      { text: "📂 View All", callback_data: "vp_1" },
    ]);
    inlineKeyboard.push([{ text: "🏠 Main Menu", callback_data: "main_menu" }]);

    await bot.sendMessage(chatId, message, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: inlineKeyboard },
    });
  } catch (error) {
    console.error("Search error:", error);
    try {
      await bot.editMessageText(
        `❌ *Search Failed!*\n\n${error.message}`,
        {
          chat_id: chatId,
          message_id: searchingMsg.message_id,
          parse_mode: "Markdown",
          ...keyboards.getBackKeyboard("main_menu"),
        }
      );
    } catch {
      await bot.sendMessage(
        chatId,
        "❌ Search failed. Please try again.",
        keyboards.getBackKeyboard("main_menu")
      );
    }
  }
}

module.exports = {
  startIDGeneration,
  handleIDMessage,
  handleViewPast,
  searchID,
};
