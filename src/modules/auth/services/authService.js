const { prisma } = require("../../../config/db");
const jwtUtil = require("../../../utils/jwtToken");
const bcrypt = require("bcryptjs");
const { OAuth2Client } = require("google-auth-library");

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

// Login (email/password)
const login = async ({ email, password }) => {
  const authAccount = await prisma.authAccount.findUnique({
    where: {
      provider_providerUserId: { provider: "PASSWORD", providerUserId: email },
    },
    include: { user: true },
  });

  if (!authAccount || !authAccount.passwordHash)
    throw new Error("auth.invalid_credentials");

  const validPassword = await bcrypt.compare(
    password,
    authAccount.passwordHash,
  );
  if (!validPassword) throw new Error("auth.invalid_credentials");

  const tokens = jwtUtil.generateTokens({ id: authAccount.userId });
  return { ...tokens, user: authAccount.user };
};

// Google login
const googleLogin = async (token) => {
  const client = new OAuth2Client(GOOGLE_CLIENT_ID);
  const ticket = await client.verifyIdToken({
    idToken: token,
    audience: GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();

  let user = await prisma.user.findUnique({ where: { email: payload.email } });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: payload.email,
        fullName: payload.name,
        authAccounts: {
          create: { provider: "GOOGLE", providerUserId: payload.sub },
        },
      },
    });
  } else {
    // Ensure Google account exists
    const existingGoogle = await prisma.authAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider: "GOOGLE",
          providerUserId: payload.sub,
        },
      },
    });
    if (!existingGoogle) {
      await prisma.authAccount.create({
        data: {
          provider: "GOOGLE",
          providerUserId: payload.sub,
          userId: user.id,
        },
      });
    }
  }

  const tokens = jwtUtil.generateTokens({ id: user.id });
  return { ...tokens, user };
};

// Register (email/password)
const register = async ({ email, password, fullName }) => {
  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email,
      fullName,
      authAccounts: {
        create: {
          provider: "PASSWORD",
          providerUserId: email,
          passwordHash: hashedPassword,
        },
      },
    },
    include: { authAccounts: true },
  });
  return user;
};

// Refresh token
const refreshToken = async (refreshToken) => {
  const payload = jwtUtil.verifyRefreshToken(refreshToken);
  const newAccessToken = jwtUtil.generateAccessToken({ id: payload.id });
  return { accessToken: newAccessToken };
};

// Logout
const logout = async (userId) => true;

// Change password
const changePassword = async (userId, { oldPassword, newPassword }) => {
  const authAccount = await prisma.authAccount.findFirst({
    where: { userId, provider: "PASSWORD" },
  });
  if (!authAccount) throw new Error("auth.user_not_found");

  const validOld = await bcrypt.compare(oldPassword, authAccount.passwordHash);
  if (!validOld) throw new Error("auth.invalid_old_password");

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await prisma.authAccount.update({
    where: { id: authAccount.id },
    data: { passwordHash: hashedPassword },
  });
};

// Get profile
const getProfile = async (userId) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");
  return user;
};

module.exports = {
  login,
  googleLogin,
  register,
  refreshToken,
  logout,
  changePassword,
  getProfile,
};
