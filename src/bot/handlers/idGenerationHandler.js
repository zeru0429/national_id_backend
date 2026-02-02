//bot/handlers/idGenerationHandler.js
const { processPDF } = require("../../services/pdfService");
const { generateIDCard } = require("../../services/idCardGenerator");
const state = require("../utils/stateManager");
const fs = require("fs");
const fsPromises = fs.promises;
const path = require("path");
const axios = require("axios");
const { OUTPUT_DIR, TEMP_DIR } = require("../../config/paths");
const { prisma } = require("../../config/db");
const usageLogService = require("../../modules/usageLog/services/usageLogService");
const keyboards = require("../utils/keyboards");

const ID_GENERATION_COST = 1;

// -------------------------
// Start ID Generation
// -------------------------
async function startIDGeneration(bot, chatId, userId) {
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
  });

  if (!subscription || subscription.balance < ID_GENERATION_COST) {
    const balance = subscription?.balance || 0;
    await bot.sendMessage(
      chatId,
      `❌ *Insufficient Balance!*\n\n💰 Required: ${ID_GENERATION_COST} ETB\n💰 Available: ${balance} ETB\n\nPlease contact admin to add balance.`,
      {
        parse_mode: "Markdown",
        ...keyboards.getBalanceKeyboard(),
      },
    );
    return;
  }

  // Ask for confirmation
  await bot.sendMessage(
    chatId,
    `✅ *Ready to Generate ID*\n\n📊 *Cost:* ${ID_GENERATION_COST} ETB\n💰 *Your Balance:* ${subscription.balance} ETB\n\nPlease upload a PDF of the ID document:`,
    {
      parse_mode: "Markdown",
      ...keyboards.getCancelKeyboard(),
    },
  );

  state.set(chatId, {
    step: "ID_AWAITING_FILE",
    data: { userId },
    action: "generate_id",
  });
}

// -------------------------
// Handle Uploaded File with Validation
// -------------------------
async function handleIDMessage(bot, msg) {
  const chatId = msg.chat.id;
  const userState = state.get(chatId);
  if (!userState || !userState.step.startsWith("ID_")) return;

  const { userId } = userState.data;

  // Check balance again
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
  });

  if (!subscription || subscription.balance < ID_GENERATION_COST) {
    await bot.sendMessage(
      chatId,
      "❌ Insufficient balance. Please add balance first.",
      keyboards.getBalanceKeyboard(),
    );
    state.remove(chatId);
    return;
  }

  let fileId;
  let fileType;

  // Check for valid file types
  if (msg.document) {
    fileId = msg.document.file_id;
    fileType = msg.document.mime_type;

    // Validate PDF files
    if (!msg.document.mime_type?.includes("pdf")) {
      await bot.sendMessage(
        chatId,
        "❌ *Invalid file format!*\n\nOnly PDF files are accepted for ID generation.\n\nPlease upload a valid PDF document.",
        {
          parse_mode: "Markdown",
          ...keyboards.getCancelKeyboard(),
        },
      );
      return;
    }
  } else if (msg.photo?.length) {
    fileId = msg.photo[msg.photo.length - 1].file_id;
    fileType = "image";

    await bot.sendMessage(
      chatId,
      "❌ *Images not accepted!*\n\nPlease upload a PDF document instead.\n\nFor best results, use a clear scan of your ID in PDF format.",
      {
        parse_mode: "Markdown",
        ...keyboards.getCancelKeyboard(),
      },
    );
    return;
  } else {
    await bot.sendMessage(
      chatId,
      "⚠️ Please upload a PDF document file.",
      keyboards.getCancelKeyboard(),
    );
    return;
  }

  // Send processing message
  const processingMsg = await bot.sendMessage(
    chatId,
    "⏳ *Processing...*\n\n📥 Downloading file\n🔍 Validating format\n📄 Checking document...\n\nThis may take a moment...",
    { parse_mode: "Markdown" },
  );

  try {
    const fileLink = await bot.getFileLink(fileId);

    // Ensure directories exist
    [TEMP_DIR, OUTPUT_DIR, path.join(OUTPUT_DIR, "result")].forEach((dir) =>
      fs.mkdirSync(dir, { recursive: true }),
    );

    const originalName = msg.document?.file_name || "document.pdf";
    const ext = path.extname(originalName).toLowerCase();

    // Validate file extension
    if (ext !== ".pdf") {
      await bot.editMessageText(
        "❌ *Invalid file extension!*\n\nOnly .pdf files are accepted.\n\nPlease upload a valid PDF document.",
        {
          chat_id: chatId,
          message_id: processingMsg.message_id,
          parse_mode: "Markdown",
          ...keyboards.getCancelKeyboard(),
        },
      );
      return;
    }

    const tempPath = path.join(TEMP_DIR, `${Date.now()}-${fileId}${ext}`);

    // Update: Downloading file
    await bot.editMessageText(
      "⏳ *Processing...*\n\n📥 Downloading file...\n✅ Format validated\n🔍 Checking document...",
      {
        chat_id: chatId,
        message_id: processingMsg.message_id,
        parse_mode: "Markdown",
      },
    );

    // Download file with timeout
    const writer = fs.createWriteStream(tempPath);
    const response = await axios.get(fileLink, {
      responseType: "stream",
      timeout: 30000, // 30 second timeout
    });

    await new Promise((resolve, reject) => {
      response.data.pipe(writer);
      writer.on("finish", resolve);
      writer.on("error", reject);

      // Add timeout for download
      setTimeout(() => {
        writer.destroy();
        reject(new Error("File download timeout"));
      }, 60000); // 60 second download timeout
    });

    // Check file size (max 20MB)
    const stats = fs.statSync(tempPath);
    const fileSizeMB = stats.size / (1024 * 1024);

    if (fileSizeMB > 20) {
      await fsPromises.unlink(tempPath).catch(console.error);
      await bot.editMessageText(
        "❌ *File too large!*\n\nMaximum file size is 20MB.\n\nYour file: " +
          fileSizeMB.toFixed(2) +
          "MB\n\nPlease compress or upload a smaller file.",
        {
          chat_id: chatId,
          message_id: processingMsg.message_id,
          parse_mode: "Markdown",
          ...keyboards.getCancelKeyboard(),
        },
      );
      return;
    }

    // Check if file is actually a PDF (basic check)
    const fileBuffer = fs.readFileSync(tempPath);
    const isPDF = fileBuffer.slice(0, 4).toString() === "%PDF";

    if (!isPDF) {
      await fsPromises.unlink(tempPath).catch(console.error);
      await bot.editMessageText(
        "❌ *Invalid PDF file!*\n\nThe uploaded file doesn't appear to be a valid PDF document.\n\nPlease upload a proper PDF file.",
        {
          chat_id: chatId,
          message_id: processingMsg.message_id,
          parse_mode: "Markdown",
          ...keyboards.getCancelKeyboard(),
        },
      );
      return;
    }

    // Update: Extracting data
    await bot.editMessageText(
      "⏳ *Processing...*\n\n✅ File downloaded\n✅ Format validated\n🔍 Extracting data from PDF...",
      {
        chat_id: chatId,
        message_id: processingMsg.message_id,
        parse_mode: "Markdown",
      },
    );

    // Process PDF
    let extractedData;
    try {
      const result = await processPDF(tempPath, userId);
      extractedData = result.data;

      // Validate extracted data
      if (!extractedData) {
        throw new Error("No data extracted from PDF");
      }

      // Check for required fields (FCN and FIN)
      if (!extractedData.fcn && !extractedData.fin) {
        throw new Error("Invalid document - FCN and FIN not found");
      }

      // Validate FCN format (if present)
      if (extractedData.fcn && extractedData.fcn.length < 6) {
        throw new Error(
          `Invalid FCN format: ${extractedData.fcn}. Expected 6-16 digits.`,
        );
      }

      // Validate FIN format (if present)
      if (extractedData.fin && extractedData.fin.length < 6) {
        throw new Error(
          `Invalid FIN format: ${extractedData.fin}. Expected 6-16 digits.`,
        );
      }

      // Validate name exists
      if (!extractedData.name_en && !extractedData.name_am) {
        throw new Error("Name not found in document");
      }
    } catch (extractError) {
      await fsPromises.unlink(tempPath).catch(console.error);
      await bot.editMessageText(
        `❌ *Document Processing Failed!*\n\n*Error:* ${extractError.message}\n\n💡 *Possible issues:*\n• Document is not a valid ID\n• Text is not machine-readable\n• Document is scanned upside down\n• Low quality scan\n\nPlease upload a clear, valid ID document.`,
        {
          chat_id: chatId,
          message_id: processingMsg.message_id,
          parse_mode: "Markdown",
          ...keyboards.getCancelKeyboard(),
        },
      );
      return;
    }

    // Update: Generating ID card
    await bot.editMessageText(
      "⏳ *Processing...*\n\n✅ File downloaded\n✅ Data extracted successfully\n✅ Document validated\n🖼️ Generating ID card...",
      {
        chat_id: chatId,
        message_id: processingMsg.message_id,
        parse_mode: "Markdown",
      },
    );

    // Generate ID cards
    const timestamp = Date.now();
    const sanitizedName = extractedData.name_en?.replace(/\s+/g, "_") || "id";

    let frontPath, backPath;
    try {
      frontPath = await generateIDCard({
        side: "front",
        data: extractedData,
        customFileName: `front-${timestamp}-${sanitizedName}.jpg`,
        outputFormat: "jpg",
        jpegQuality: 0.9,
      });

      // Add serial number if not present
      extractedData.sn = extractedData.fcn || extractedData.fin || "00000000";

      backPath = await generateIDCard({
        side: "back",
        data: extractedData,
        customFileName: `back-${timestamp}-${sanitizedName}.jpg`,
        outputFormat: "jpg",
        jpegQuality: 0.9,
      });

      // Verify generated files exist
      if (!fs.existsSync(frontPath) || !fs.existsSync(backPath)) {
        throw new Error("Failed to generate ID card images");
      }
    } catch (genError) {
      await fsPromises.unlink(tempPath).catch(console.error);
      await bot.editMessageText(
        `❌ *ID Generation Failed!*\n\nError generating ID card: ${genError.message}\n\nPlease try again with a different document.`,
        {
          chat_id: chatId,
          message_id: processingMsg.message_id,
          parse_mode: "Markdown",
          ...keyboards.getCancelKeyboard(),
        },
      );
      return;
    }

    // Update: Saving records
    await bot.editMessageText(
      "⏳ *Processing...*\n\n✅ File downloaded\n✅ Data extracted successfully\n✅ ID cards generated\n💾 Saving records...",
      {
        chat_id: chatId,
        message_id: processingMsg.message_id,
        parse_mode: "Markdown",
      },
    );

    // Save generation record
    let generation;
    try {
      generation = await prisma.iDGeneration.create({
        data: {
          userId,
          fcn: extractedData.fcn,
          fin: extractedData.fin,
          phoneNumber: extractedData.phoneNumber,
          extractedData,
          cost: ID_GENERATION_COST,
          status: "COMPLETED",
          files: {
            create: [
              {
                role: "FRONT_ID",
                fileName: path.basename(frontPath),
                fileUrl: frontPath,
              },
              {
                role: "BACK_ID",
                fileName: path.basename(backPath),
                fileUrl: backPath,
              },
            ],
          },
        },
        include: { files: true },
      });

      // Deduct balance
      await prisma.subscription.update({
        where: { userId },
        data: {
          balance: { decrement: ID_GENERATION_COST },
          totalUsed: { increment: ID_GENERATION_COST },
        },
      });

      // Log usage
      await usageLogService.createLog({
        userId,
        generationId: generation.id,
        amount: ID_GENERATION_COST,
        action: "GENERATE_ID",
      });
    } catch (dbError) {
      console.error("Database error:", dbError);
      // Clean up generated files
      [frontPath, backPath].forEach((filePath) => {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });

      await bot.editMessageText(
        "❌ *Database Error!*\n\nFailed to save generation record. Please try again.\n\nIf the problem persists, contact support.",
        {
          chat_id: chatId,
          message_id: processingMsg.message_id,
          parse_mode: "Markdown",
          ...keyboards.getBackKeyboard("main_menu"),
        },
      );
      return;
    }

    // Update processing message
    await bot.deleteMessage(chatId, processingMsg.message_id);

    // Send success message with preview
    await bot.sendMessage(
      chatId,
      `🎉 *ID Generation Complete!*\n\n📋 *Extracted Details:*\n👤 Name: ${extractedData.name_en || "N/A"}\n🔢 FCN: ${extractedData.fcn || "N/A"}\n🔢 FIN: ${extractedData.fin || "N/A"}\n📞 Phone: ${extractedData.phoneNumber || "N/A"}\n💰 Cost: ${ID_GENERATION_COST} ETB\n\n✅ *Status:* Valid ID document processed successfully!\n\nYour ID cards are ready to download:`,
      { parse_mode: "Markdown" },
    );

    // Send files with download buttons
    await bot.sendDocument(chatId, fs.createReadStream(frontPath), {
      caption: `🆔 *Front ID*\n👤 ${extractedData.name_en || "ID"}\n🔢 FCN: ${extractedData.fcn || "N/A"}`,
      parse_mode: "Markdown",
    });

    await bot.sendDocument(chatId, fs.createReadStream(backPath), {
      caption: `🆔 *Back ID*\n👤 ${extractedData.name_en || "ID"}\n🔢 FIN: ${extractedData.fin || "N/A"}`,
      parse_mode: "Markdown",
    });

    // Show new balance and options
    const updatedSubscription = await prisma.subscription.findUnique({
      where: { userId },
    });

    await bot.sendMessage(
      chatId,
      `✅ *Generation Successful!*\n\n💰 *New Balance:* ${updatedSubscription.balance} ETB\n📊 *Credits used:* 1 | *Remaining:* ${updatedSubscription.balance}\n\nWhat would you like to do next?`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "🔄 Generate Another", callback_data: "generate_id" },
              { text: "📂 View All", callback_data: "view_past" },
            ],
            [{ text: "🏠 Main Menu", callback_data: "main_menu" }],
          ],
        },
      },
    );

    // Cleanup temp file
    await fsPromises.unlink(tempPath).catch(console.error);
  } catch (err) {
    console.error("❌ ID Generation error:", err);

    // Cleanup any temp files
    try {
      if (tempPath && fs.existsSync(tempPath)) {
        await fsPromises.unlink(tempPath);
      }
    } catch (cleanupError) {
      console.error("Cleanup error:", cleanupError);
    }

    // Update processing message to show error
    try {
      let errorMessage =
        "❌ *Generation Failed!*\n\nAn error occurred during processing.";

      if (err.message.includes("timeout")) {
        errorMessage =
          "❌ *Timeout Error!*\n\nThe operation took too long. Please try again with a smaller file.";
      } else if (err.message.includes("network")) {
        errorMessage =
          "❌ *Network Error!*\n\nFailed to download the file. Please check your connection and try again.";
      }

      await bot.editMessageText(
        `${errorMessage}\n\n*Error details:* ${err.message}\n\nPlease try again with a different file or contact support.`,
        {
          chat_id: chatId,
          message_id: processingMsg.message_id,
          parse_mode: "Markdown",
          ...keyboards.getBackKeyboard("main_menu"),
        },
      );
    } catch (editError) {
      await bot.sendMessage(
        chatId,
        "❌ Generation failed. Please try again.",
        keyboards.getBackKeyboard("main_menu"),
      );
    }
  }

  state.remove(chatId);
}

// -------------------------
// Search ID Generations (Enhanced with loading)
// -------------------------
async function searchID(bot, chatId, queryText, userId) {
  if (!queryText || queryText.length < 2) {
    await bot.sendMessage(
      chatId,
      "❌ Search query must be at least 2 characters.",
      keyboards.getBackKeyboard("main_menu"),
    );
    return;
  }

  // Send searching message
  const searchingMsg = await bot.sendMessage(
    chatId,
    `🔍 *Searching...*\n\nLooking for IDs matching:\n"*${queryText}*"\n\n⏳ Please wait...`,
    { parse_mode: "Markdown" },
  );

  try {
    // Update: Searching in database
    await bot.editMessageText(
      `🔍 *Searching...*\n\nLooking for IDs matching:\n"*${queryText}*"\n\n✅ Query prepared\n🔍 Searching database...`,
      {
        chat_id: chatId,
        message_id: searchingMsg.message_id,
        parse_mode: "Markdown",
      },
    );

    const results = await prisma.iDGeneration.findMany({
      where: {
        userId,
        OR: [
          { fcn: { contains: queryText, mode: "insensitive" } },
          { fin: { contains: queryText, mode: "insensitive" } },
          {
            extractedData: {
              path: ["name_en"],
              string_contains: queryText,
            },
          },
          {
            extractedData: {
              path: ["name_am"],
              string_contains: queryText,
            },
          },
        ],
      },
      include: { files: true },
      take: 10,
      orderBy: { createdAt: "desc" },
    });

    // Delete searching message
    await bot.deleteMessage(chatId, searchingMsg.message_id);

    if (!results.length) {
      await bot.sendMessage(
        chatId,
        `🔍 *Search Complete*\n\nNo IDs found for "*${queryText}*".\n\n💡 *Suggestions:*\n• Check spelling\n• Try partial matches\n• Search by FCN/FIN instead of name`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🔍 Search Again", callback_data: "search_id" }],
              [{ text: "📂 View All IDs", callback_data: "view_past" }],
              [{ text: "🏠 Main Menu", callback_data: "main_menu" }],
            ],
          },
        },
      );
      return;
    }

    // Send found results
    let message = `✅ *Search Results*\n\nFound *${results.length}* ID(s) matching "*${queryText}*":\n\n`;

    const inlineKeyboard = [];

    results.forEach((gen, idx) => {
      const name = gen.extractedData.name_en || "Unknown";
      const date = new Date(gen.createdAt).toLocaleDateString();
      const hasFront = gen.files.some((f) => f.role === "FRONT_ID");
      const hasBack = gen.files.some((f) => f.role === "BACK_ID");

      message += `*${idx + 1}. ${name}*\n`;
      message += `📅 ${date} | 🔢 FCN: ${gen.fcn || "N/A"}\n`;
      message += `📄 Files: ${hasFront ? "✅ Front" : "❌ Front"} | ${hasBack ? "✅ Back" : "❌ Back"}\n\n`;

      const rowButtons = [];
      if (hasFront) {
        rowButtons.push({
          text: `⬇️ Front ${idx + 1}`,
          callback_data: `download_${gen.id}_front`,
        });
      }
      if (hasBack) {
        rowButtons.push({
          text: `⬇️ Back ${idx + 1}`,
          callback_data: `download_${gen.id}_back`,
        });
      }

      if (rowButtons.length > 0) {
        inlineKeyboard.push(rowButtons);
      }
    });

    // Add download all button if multiple results
    if (results.length > 1) {
      inlineKeyboard.push([
        {
          text: `⬇️ Download All (${results.length} IDs)`,
          callback_data: `download_batch_${results.map((r) => r.id).join("_")}`,
        },
      ]);
    }

    inlineKeyboard.push([
      { text: "🔍 New Search", callback_data: "search_id" },
      { text: "📂 View All", callback_data: "view_past" },
    ]);
    inlineKeyboard.push([{ text: "🏠 Main Menu", callback_data: "main_menu" }]);

    await bot.sendMessage(chatId, message, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: inlineKeyboard },
    });
  } catch (error) {
    console.error("Search error:", error);

    // Update error message
    try {
      await bot.editMessageText(
        `❌ *Search Failed!*\n\nAn error occurred while searching.\n\nError: ${error.message}`,
        {
          chat_id: chatId,
          message_id: searchingMsg.message_id,
          parse_mode: "Markdown",
          ...keyboards.getBackKeyboard("main_menu"),
        },
      );
    } catch (editError) {
      await bot.sendMessage(
        chatId,
        "❌ Search failed. Please try again.",
        keyboards.getBackKeyboard("main_menu"),
      );
    }
  }
}

// -------------------------
// View Past ID Generations
// -------------------------
// -------------------------
// View Past ID Generations
// -------------------------
async function handleViewPast(bot, chatId, userId, page = 1, limit = 10) {
  const totalCount = await prisma.iDGeneration.count({ where: { userId } });
  const totalPages = Math.ceil(totalCount / limit);

  if (totalCount === 0) {
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
      },
    );
    return;
  }

  const pastIDs = await prisma.iDGeneration.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * limit,
    take: limit,
    include: { files: true },
  });

  let message = `📚 *Your ID Generations*\n\nPage *${page}* of *${totalPages}*\nTotal: *${totalCount}* generations\n\n`;

  const inlineKeyboard = [];

  pastIDs.forEach((gen, idx) => {
    const name = gen.extractedData.name_en || "Unknown";
    const date = new Date(gen.createdAt).toLocaleDateString();
    const globalIdx = (page - 1) * limit + idx + 1;

    message += `*${globalIdx}. ${name}*\n`;
    message += `📅 ${date} | 🔢 FCN: ${gen.fcn || "N/A"}\n`;
    message += `💳 Cost: ${gen.cost} ETB | Status: ✅\n\n`;

    // NEW: Use shortened callback data
    const shortId = gen.id.substring(0, 8);

    inlineKeyboard.push([
      {
        text: `⬇️ Front ${globalIdx}`,
        callback_data: `dl_f_${shortId}`, // CHANGED: dl_f_ instead of download_
      },
      {
        text: `⬇️ Back ${globalIdx}`,
        callback_data: `dl_b_${shortId}`, // CHANGED: dl_b_ instead of download_
      },
    ]);
  });

  // Add pagination - CHANGED: vp_ instead of view_past_
  const paginationRow = [];
  if (page > 1) {
    paginationRow.push({
      text: "◀️ Previous",
      callback_data: `vp_${page - 1}`, // CHANGED
    });
  }

  paginationRow.push({
    text: `📄 ${page}/${totalPages}`,
    callback_data: "page_info",
  });

  if (page < totalPages) {
    paginationRow.push({
      text: "Next ▶️",
      callback_data: `vp_${page + 1}`, // CHANGED
    });
  }

  if (paginationRow.length > 0) {
    inlineKeyboard.push(paginationRow);
  }

  // Add navigation buttons
  inlineKeyboard.push([
    { text: "🆔 Generate New", callback_data: "generate_id" },
    { text: "🏠 Main Menu", callback_data: "main_menu" },
  ]);

  await bot.sendMessage(chatId, message, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: inlineKeyboard },
  });
}

// -------------------------
// Search ID Generations
// -------------------------
// -------------------------
// Search ID Generations
// -------------------------
async function searchID(bot, chatId, queryText, userId) {
  if (!queryText || queryText.length < 2) {
    await bot.sendMessage(
      chatId,
      "❌ Search query must be at least 2 characters.",
      keyboards.getBackKeyboard("main_menu"),
    );
    return;
  }

  const results = await prisma.iDGeneration.findMany({
    where: {
      userId,
      OR: [
        { fcn: { contains: queryText, mode: "insensitive" } },
        { fin: { contains: queryText, mode: "insensitive" } },
        {
          extractedData: {
            path: ["name_en"],
            string_contains: queryText,
          },
        },
        {
          extractedData: {
            path: ["name_am"],
            string_contains: queryText,
          },
        },
      ],
    },
    include: { files: true },
    take: 10,
    orderBy: { createdAt: "desc" },
  });

  if (!results.length) {
    await bot.sendMessage(
      chatId,
      `🔍 *No Results Found*\n\nNo IDs found for "*${queryText}*".\n\nTry a different search term or check your spelling.`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔍 Search Again", callback_data: "search_id" }],
            [{ text: "📂 View All", callback_data: "vp_1" }], // CHANGED: vp_1 instead of view_past
            [{ text: "🏠 Main Menu", callback_data: "main_menu" }],
          ],
        },
      },
    );
    return;
  }

  let message = `🔍 *Search Results for "*${queryText}*"*\n\nFound *${results.length}* matching ID(s):\n\n`;

  const inlineKeyboard = [];

  results.forEach((gen, idx) => {
    const name = gen.extractedData.name_en || "Unknown";
    const date = new Date(gen.createdAt).toLocaleDateString();

    message += `*${idx + 1}. ${name}*\n`;
    message += `📅 ${date} | FCN: ${gen.fcn || "N/A"}\n\n`;

    // NEW: Use shortened callback data
    const shortId = gen.id.substring(0, 8);

    inlineKeyboard.push([
      {
        text: `⬇️ Front ${idx + 1}`,
        callback_data: `dl_f_${shortId}`, // CHANGED
      },
      {
        text: `⬇️ Back ${idx + 1}`,
        callback_data: `dl_b_${shortId}`, // CHANGED
      },
    ]);
  });

  inlineKeyboard.push([
    { text: "🔍 New Search", callback_data: "search_id" },
    { text: "📂 View All", callback_data: "vp_1" }, // CHANGED
  ]);
  inlineKeyboard.push([{ text: "🏠 Main Menu", callback_data: "main_menu" }]);

  await bot.sendMessage(chatId, message, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: inlineKeyboard },
  });
}

module.exports = {
  startIDGeneration,
  handleIDMessage,
  handleViewPast,
  searchID,
};
