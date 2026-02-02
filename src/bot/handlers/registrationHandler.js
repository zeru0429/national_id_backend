//bot/handlers/registrationHandler.js
const state = require("../utils/stateManager");
const usersService = require("../../modules/users/services/usersService");
const keyboards = require("../utils/keyboards");
const { prisma } = require("../../config/db");

const phoneRegex = /^(?:\+2519\d{8}|09\d{8})$/;
const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

async function handleRegistrationMessage(bot, msg) {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();
  const userState = state.get(chatId);
  if (!userState) return;

  const data = userState.data || {};

  try {
    switch (userState.step) {
      case "AWAITING_FULL_NAME":
        if (!text || text.length < 2) {
          return bot.sendMessage(
            chatId,
            "⚠️ Please enter a valid full name (min 2 characters).",
            keyboards.getCancelKeyboard(),
          );
        }
        data.fullName = text;
        data.registrationStep = 2;
        state.set(chatId, { step: "AWAITING_PHONE", data });
        return bot.sendMessage(
          chatId,
          "✅ *Full name saved!*\n\n📞 *Registration Step 2/3*\n\nEnter your phone number (required):\n\nFormat: +2519XXXXXXXX or 09XXXXXXXX",
          {
            parse_mode: "Markdown",
            ...keyboards.getCancelKeyboard(),
          },
        );

      case "AWAITING_PHONE":
        if (!phoneRegex.test(text)) {
          return bot.sendMessage(
            chatId,
            "❌ *Invalid phone number format!*\n\nPlease use:\n• +2519XXXXXXXX (Ethiopia)\n• 09XXXXXXXX",
            {
              parse_mode: "Markdown",
              ...keyboards.getCancelKeyboard(),
            },
          );
        }
        data.phoneNumber = text;
        data.registrationStep = 3;
        state.set(chatId, { step: "AWAITING_EMAIL", data });
        return bot.sendMessage(
          chatId,
          "✅ *Phone number saved!*\n\n📧 *Registration Step 3/3*\n\nEnter your email (optional):\n\nType /skip to skip this step",
          {
            parse_mode: "Markdown",
            ...keyboards.getCancelKeyboard(),
          },
        );

      case "AWAITING_EMAIL":
        if (text?.toLowerCase() === "/skip") {
          data.email = null;
        } else if (text && !emailRegex.test(text)) {
          return bot.sendMessage(
            chatId,
            "❌ *Invalid email format!*\n\nPlease enter a valid email or type /skip",
            {
              parse_mode: "Markdown",
              ...keyboards.getCancelKeyboard(),
            },
          );
        } else if (text) {
          data.email = text;
        } else {
          data.email = null;
        }

        // Complete registration
        const user = await usersService.createByTelegram({
          telegramId: chatId.toString(),
          fullName: data.fullName,
          phoneNumber: data.phoneNumber,
          email: data.email,
        });

        // Create initial subscription
        await prisma.subscription.create({
          data: {
            userId: user.id,
            balance: 0,
            totalUsed: 0,
            isActive: true,
          },
        });

        state.remove(chatId);

        // Send welcome message
        await bot.sendMessage(
          chatId,
          `🎉 *Registration Complete!*\n\nWelcome *${data.fullName}* to ID Generation Bot!\n\n💰 *Get Started:*\n1. Contact admin to add balance\n2. Upload PDF to generate ID\n3. Manage your generated IDs`,
          { parse_mode: "Markdown" },
        );

        // Send main menu
        const { sendMainMenu } = require("./startHandler");
        await sendMainMenu(bot, chatId);
        break;

      // Handle edit profile cases
      case "EDIT_NAME":
        if (!text || text.length < 2) {
          return bot.sendMessage(
            chatId,
            "❌ Name must be at least 2 characters.",
            keyboards.getCancelKeyboard(),
          );
        }
        await prisma.user.update({
          where: { id: data.userId },
          data: { fullName: text },
        });
        state.remove(chatId);
        await bot.sendMessage(
          chatId,
          "✅ Name updated successfully!",
          keyboards.getBackKeyboard("profile"),
        );
        break;

      case "EDIT_PHONE":
        if (!phoneRegex.test(text)) {
          return bot.sendMessage(
            chatId,
            "❌ Invalid phone format. Use +2519XXXXXXXX or 09XXXXXXXX",
            keyboards.getCancelKeyboard(),
          );
        }
        await prisma.user.update({
          where: { id: data.userId },
          data: { phoneNumber: text },
        });
        state.remove(chatId);
        await bot.sendMessage(
          chatId,
          "✅ Phone number updated!",
          keyboards.getBackKeyboard("profile"),
        );
        break;

      case "EDIT_EMAIL":
        if (text?.toLowerCase() === "/skip") {
          await prisma.user.update({
            where: { id: data.userId },
            data: { email: null },
          });
          state.remove(chatId);
          await bot.sendMessage(
            chatId,
            "✅ Email removed!",
            keyboards.getBackKeyboard("profile"),
          );
        } else if (text && !emailRegex.test(text)) {
          return bot.sendMessage(
            chatId,
            "❌ Invalid email format.",
            keyboards.getCancelKeyboard(),
          );
        } else if (text) {
          await prisma.user.update({
            where: { id: data.userId },
            data: { email: text },
          });
          state.remove(chatId);
          await bot.sendMessage(
            chatId,
            "✅ Email updated!",
            keyboards.getBackKeyboard("profile"),
          );
        }
        break;

      default:
        state.remove(chatId);
        await bot.sendMessage(
          chatId,
          "⚠️ Session expired. Please use /start to begin again.",
          keyboards.getBackKeyboard("main_menu"),
        );
    }
  } catch (err) {
    console.error("Registration error:", err);

    if (err.code === "P2002") {
      await bot.sendMessage(
        chatId,
        "❌ *Registration Failed!*\n\nThis phone number or email is already registered. Please use different credentials.",
        {
          parse_mode: "Markdown",
          ...keyboards.getBackKeyboard("main_menu"),
        },
      );
    } else {
      await bot.sendMessage(
        chatId,
        "❌ Registration failed. Please try /start again.",
        keyboards.getBackKeyboard("main_menu"),
      );
    }

    state.remove(chatId);
  }
}

function registerUserHandler(bot) {
  bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const userState = state.get(chatId);

    if (!userState) return;

    // Handle registration and edit states
    const registrationSteps = [
      "AWAITING_FULL_NAME",
      "AWAITING_PHONE",
      "AWAITING_EMAIL",
      "EDIT_NAME",
      "EDIT_PHONE",
      "EDIT_EMAIL",
    ];

    if (registrationSteps.includes(userState.step)) {
      await handleRegistrationMessage(bot, msg);
    }
  });
}

module.exports = { handleRegistrationMessage, registerUserHandler };
