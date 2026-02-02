// utils/jwtToken.js
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");

/**
 * Generate an access token
 * @param {Object} user - User object containing authentication info
 * @returns {string} JWT access token
 */
const generateAccessToken = (user) => {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    ...user,
    type: "access",
    iat: now,
  };
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "8h",
    audience: process.env.JWT_AUDIENCE || "boss-grand-garment-api",
    issuer: process.env.JWT_ISSUER || "boss-grand-garment-system",
  });
};

/**
 * Generate a refresh token
 * @param {Object} user - User object
 * @returns {string} JWT refresh token
 */
const generateRefreshToken = (user) => {
  const userId = user._id || user.id;
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    id: userId,
    type: "refresh",
    iat: now,
    jti: uuidv4(), // Optional: unique ID for token revocation
  };

  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
    audience: process.env.JWT_AUDIENCE || "boss-grand-garment-api",
    issuer: process.env.JWT_ISSUER || "boss-grand-garment-system",
  });
};

/**
 * Verify an access token
 * @param {string} token
 * @returns {Object} Decoded payload
 */
const verifyAccessToken = (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      audience: process.env.JWT_AUDIENCE || "boss-grand-garment-api",
      issuer: process.env.JWT_ISSUER || "boss-grand-garment-system",
    });
    if (decoded.type !== "access") throw new Error("Invalid token type");
    return decoded;
  } catch (err) {
    console.error("Access token verification failed:", err.message);
    throw err;
  }
};

/**
 * Verify a refresh token
 * @param {string} token
 * @returns {Object} Decoded payload
 */
const verifyRefreshToken = (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET, {
      audience: process.env.JWT_AUDIENCE || "boss-grand-garment-api",
      issuer: process.env.JWT_ISSUER || "boss-grand-garment-system",
    });

    if (decoded.type !== "refresh") throw new Error("Invalid token type");
    return decoded;
  } catch (err) {
    console.error("Refresh token verification failed:", err.message);
    throw err;
  }
};

/**
 * Generate both access and refresh tokens
 * @param {Object} user - User object
 * @returns {Object} { accessToken, refreshToken }
 */
const generateTokens = (user) => {
  return {
    accessToken: generateAccessToken(user),
    refreshToken: generateRefreshToken(user),
  };
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  generateTokens,
  verifyAccessToken,
  verifyRefreshToken,
};
