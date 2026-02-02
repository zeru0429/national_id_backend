/**
 * User registration and profile edit handler
 */

const usersService = require("../../modules/users/services/usersService");
const subscriptionService = require("../../modules/subscription/services/subscriptionService");
const messages = require("../ui/messages");
const stateManager = require("../utils/stateManager");
const keyboards = require("../ui/keyboards");
const validators = require("../utils/validators");
const { sendMainMenu } = require("./start.handler");

async function handleRegistrationMessage(bot, msg) {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();
  const userState = stateManager.get(chatId);
  if (!userState) return;

  const data = userState.data || {};

  try {
    switch (userState.step) {
      case "AWAITING_FULL_NAME":
        if (!validators.validateFullName(text)) {
          return bot.sendMessage(
            chatId,
            "⚠️ Please enter a valid full name (min 2 characters).",
            keyboards.getCancelKeyboard()
          );
        }
        data.fullName = text;
        data.registrationStep = 2;
        stateManager.set(chatId, { step: "AWAITING_PHONE", data });
        return bot.sendMessage(chatId, messages.start.registrationStep2, {
          parse_mode: "Markdown",
          ...keyboards.getCancelKeyboard(),
        });

      case "AWAITING_PHONE":
        if (!validators.validatePhone(text)) {
          return bot.sendMessage(
            chatId,
            "❌ *Invalid phone number format!*\n\nPlease use:\n• +2519XXXXXXXX (Ethiopia)\n• 09XXXXXXXX",
            { parse_mode: "Markdown", ...keyboards.getCancelKeyboard() }
          );
        }
        data.phoneNumber = text.replace(/\s+/g, "");
        data.registrationStep = 3;
        stateManager.set(chatId, { step: "AWAITING_EMAIL", data });
        return bot.sendMessage(chatId, messages.start.registrationStep3, {
          parse_mode: "Markdown",
          ...keyboards.getCancelKeyboard(),
        });

      case "AWAITING_EMAIL":
        if (text?.toLowerCase() === "/skip") {
          data.email = null;
        } else if (text && !validators.validateEmail(text)) {
          return bot.sendMessage(
            chatId,
            "❌ *Invalid email format!*\n\nPlease enter a valid email or type /skip",
            { parse_mode: "Markdown", ...keyboards.getCancelKeyboard() }
          );
        } else if (text) {
          data.email = text;
        } else {
          data.email = null;
        }

        const user = await usersService.createByTelegram({
          telegramId: chatId.toString(),
          fullName: data.fullName,
          phoneNumber: data.phoneNumber,
          email: data.email,
        });

        await subscriptionService.createForUser(user.id, 0);
        stateManager.remove(chatId);

        await bot.sendMessage(
          chatId,
          `🎉 *Registration Complete!*\n\nWelcome *${data.fullName}* to ID Generation Bot!\n\n💰 *Get Started:*\n1. Contact admin to add balance\n2. Upload PDF to generate ID\n3. Manage your generated IDs`,
          { parse_mode: "Markdown" }
        );
        await sendMainMenu(bot, chatId);
        break;

      case "EDIT_NAME":
        if (!validators.validateFullName(text)) {
          return bot.sendMessage(
            chatId,
            "❌ Name must be at least 2 characters.",
            keyboards.getCancelKeyboard()
          );
        }
        await usersService.updateProfile(data.userId, { fullName: text });
        stateManager.remove(chatId);
        await bot.sendMessage(
          chatId,
          "✅ Name updated successfully!",
          keyboards.getBackKeyboard("profile")
        );
        break;

      case "EDIT_PHONE":
        if (!validators.validatePhone(text)) {
          return bot.sendMessage(
            chatId,
            "❌ Invalid phone format. Use +2519XXXXXXXX or 09XXXXXXXX",
            keyboards.getCancelKeyboard()
          );
        }
        await usersService.updateProfile(data.userId, {
          phoneNumber: text,
        });
        stateManager.remove(chatId);
        await bot.sendMessage(
          chatId,
          "✅ Phone number updated!",
          keyboards.getBackKeyboard("profile")
        );
        break;

      case "EDIT_EMAIL":
        if (text?.toLowerCase() === "/skip") {
          await usersService.updateProfile(data.userId, { email: null });
          stateManager.remove(chatId);
          await bot.sendMessage(
            chatId,
            "✅ Email removed!",
            keyboards.getBackKeyboard("profile")
          );
        } else if (text && !validators.validateEmail(text)) {
          return bot.sendMessage(
            chatId,
            "❌ Invalid email format.",
            keyboards.getCancelKeyboard()
          );
        } else if (text) {
          await usersService.updateProfile(data.userId, { email: text });
          stateManager.remove(chatId);
          await bot.sendMessage(
            chatId,
            "✅ Email updated!",
            keyboards.getBackKeyboard("profile")
          );
        }
        break;

      default:
        stateManager.remove(chatId);
        await bot.sendMessage(
          chatId,
          messages.errors.sessionExpired,
          keyboards.getBackKeyboard("main_menu")
        );
    }
  } catch (err) {
    console.error("Registration error:", err);
    stateManager.remove(chatId);
    if (err.code === "P2002" || err.message === "users.phone_exists" || err.message === "users.email_exists") {
      await bot.sendMessage(
        chatId,
        "❌ *Registration Failed!*\n\nThis phone number or email is already registered. Please use different credentials.",
        { parse_mode: "Markdown", ...keyboards.getBackKeyboard("main_menu") }
      );
    } else {
      await bot.sendMessage(
        chatId,
        "❌ Registration failed. Please try /start again.",
        keyboards.getBackKeyboard("main_menu")
      );
    }
  }
}

function registerUserHandler(bot) {
  bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const userState = stateManager.get(chatId);
    if (!userState) return;

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
