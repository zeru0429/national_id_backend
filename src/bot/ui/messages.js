/**
 * Bot message templates - all user-facing text in one place
 */

const messages = {
  start: {
    welcomeBack: (firstName) =>
      `👋 Welcome back, *${firstName}*!\n\nYour ID Generation Bot is ready.`,
    welcomeNew: (firstName) =>
      `👋 Welcome *${firstName}*!\n\nTo use this bot, you need to complete a quick registration.`,
    registrationStep1:
      "📝 *Registration Step 1/3*\n\nPlease enter your *full name*:",
    registrationStep2:
      "✅ *Full name saved!*\n\n📞 *Registration Step 2/3*\n\nEnter your phone number (required):\n\nFormat: +2519XXXXXXXX or 09XXXXXXXX",
    registrationStep3:
      "✅ *Phone number saved!*\n\n📧 *Registration Step 3/3*\n\nEnter your email (optional):\n\nType /skip to skip this step",
  },

  mainMenu: "🏠 *Main Menu*\n\nChoose an option below:",
  mainMenuError: "❌ Error loading menu. Please try /start again.",

  help: `📚 *ID Generation Bot Help*

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
For assistance, contact admin.`,

  helpShort:
    "📚 *Help*\n\nUse /start to begin\nUse /profile to view your profile\n\nFor detailed help, use the Help button in the main menu.",

  profile: (user, subscription) => `👤 *Your Profile*

*Name:* ${user.fullName || "Not set"}
*Phone:* ${user.phoneNumber || "Not set"}
*Email:* ${user.email || "Not set"}
*Registration:* ${new Date(user.createdAt).toLocaleDateString()}

💰 *Subscription*
Balance: ${subscription?.balance || 0} ETB
Total Used: ${subscription?.totalUsed || 0} ETB
Status: ${subscription?.isActive ? "✅ Active" : "❌ Inactive"}`,

  profileNotFound: "❌ Please register first using /start",

  balance: (subscription) => `💰 *Your Balance*

*Current Balance:* ${subscription?.balance || 0} ETB
*Total Used:* ${subscription?.totalUsed || 0} ETB
*Available for ID Generations:* ${Math.floor((subscription?.balance || 0) / 1)} IDs

💡 *Pricing:*
• 1 ID Generation = 1 ETB
• Contact admin to add balance`,

  errors: {
    generic: "❌ Something went wrong. Please try /start again.",
    sessionExpired: "⚠️ Session expired. Please use /start to begin again.",
    registerFirst: "❌ Please register first using /start",
  },
};

module.exports = messages;
