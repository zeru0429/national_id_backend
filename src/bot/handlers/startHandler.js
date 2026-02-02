//bot/handlers/startHandler.js
const usersService = require("../../modules/users/services/usersService");
const state = require("../utils/stateManager");
const keyboards = require("../utils/keyboards");

async function sendMainMenu(bot, chatId) {
  try {
    // Add logging here:
    const existingUser = await usersService.findByTelegramId(chatId);
    console.log("Found existing user:", existingUser);
    console.log("User telegramId:", existingUser?.telegramId);
    const keyboard = await keyboards.getMainKeyboard(chatId);
    await bot.sendMessage(chatId, "🏠 *Main Menu*\n\nChoose an option below:", {
      parse_mode: "Markdown",
      ...keyboard,
    });
  } catch (error) {
    console.error("Error sending main menu:", error);
    await bot.sendMessage(
      chatId,
      "❌ Error loading menu. Please try /start again.",
    );
  }
}

function startHandler(bot) {
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const firstName = msg.from.first_name;

    try {
      const existingUser = await usersService.findByTelegramId(chatId);

      if (existingUser) {
        await bot.sendMessage(
          chatId,
          `👋 Welcome back, *${firstName}*!\n\nYour ID Generation Bot is ready.`,
          { parse_mode: "Markdown" },
        );
        return sendMainMenu(bot, chatId);
      }

      // New user registration flow
      await bot.sendMessage(
        chatId,
        `👋 Welcome *${firstName}*!\n\nTo use this bot, you need to complete a quick registration.`,
        { parse_mode: "Markdown" },
      );

      await bot.sendMessage(
        chatId,
        "📝 *Registration Step 1/3*\n\nPlease enter your *full name*:",
        {
          parse_mode: "Markdown",
          ...keyboards.getCancelKeyboard(),
        },
      );

      state.set(chatId, {
        step: "AWAITING_FULL_NAME",
        data: {},
        registrationStep: 1,
      });
    } catch (err) {
      console.error("Start error:", err);
      await bot.sendMessage(
        chatId,
        "❌ Something went wrong. Please try /start again.",
      );
    }
  });

  // Help command
  bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;

    const helpText = `
📚 *ID Generation Bot Help*

*Available Commands:*
/start - Start or restart the bot
/help - Show this help message
/profile - View your profile

*How to Generate IDs:*
1. Go to Main Menu → "🆔 Generate ID"
2. Upload a PDF or image of your document
3. Bot will extract data and generate ID
4. Download your ID card images

*Features:*
• View past generated IDs
• Search IDs by FCN, FIN, or name
• Manage your profile
• Track your subscription balance

*Support:*
For assistance, contact admin.
    `;

    await bot.sendMessage(chatId, helpText, {
      parse_mode: "Markdown",
      ...keyboards.getBackKeyboard("main_menu"),
    });
  });

  // Profile command
  bot.onText(/\/profile/, async (msg) => {
    const chatId = msg.chat.id;

    try {
      const user = await usersService.findByTelegramId(chatId);
      if (!user) {
        return bot.sendMessage(
          chatId,
          "❌ Please register first using /start",
          keyboards.getBackKeyboard("main_menu"),
        );
      }

      const subscription = await prisma.subscription.findUnique({
        where: { userId: user.id },
      });

      const profileText = `
👤 *Your Profile*

*Name:* ${user.fullName || "Not set"}
*Phone:* ${user.phoneNumber || "Not set"}
*Email:* ${user.email || "Not set"}
*Registration:* ${new Date(user.createdAt).toLocaleDateString()}

💰 *Subscription*
Balance: ${subscription?.balance || 0} ETB
Total Used: ${subscription?.totalUsed || 0} ETB
Status: ${subscription?.isActive ? "✅ Active" : "❌ Inactive"}
      `;

      await bot.sendMessage(chatId, profileText, {
        parse_mode: "Markdown",
        ...keyboards.getProfileKeyboard(),
      });
    } catch (error) {
      console.error("Profile error:", error);
      await bot.sendMessage(chatId, "❌ Error loading profile.");
    }
  });
}

module.exports = { startHandler, sendMainMenu };
