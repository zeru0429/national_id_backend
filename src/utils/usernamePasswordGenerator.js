const crypto = require("crypto");
const { getPrisma } = require("../config/db");

// -------------------------------------------------------------------
// UTIL — generate unique username by retrying until no collision
// -------------------------------------------------------------------
const generateUniqueUsername = async (first, last) => {
    const prisma = getPrisma();
  const base = `${first}.${last}`.toLowerCase().replace(/\s+/g, "");

  while (true) {
    const suffix = Math.floor(1000 + Math.random() * 9000);
    const username = `${base}.${suffix}`;

    const existing = await prisma.user.findUnique({ where: { username } });
    if (!existing) return username; // unique = OK
  }
};

// -------------------------------------------------------------------
// UTIL — secure random password (no UUID slicing)
// -------------------------------------------------------------------
const generateSecurePassword = (length) => {
  return crypto.randomBytes(length).toString("base64url"); // ~8 chars, safe
};

module.exports = {
  generateUniqueUsername,
  generateSecurePassword,
};
