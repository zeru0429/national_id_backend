const Joi = require("joi");

// Custom ID validation: UUID only (for Prisma)
const id = Joi.string().custom((value, helpers) => {
  // UUID pattern (with dashes)
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // CUID pattern (starts with 'c', 25 chars)
  const cuidPattern = /^c[a-z0-9]{24}$/;

  if (!uuidPattern.test(value) && !cuidPattern.test(value)) {
    return helpers.error("any.invalid", { value });
  }
  return value;
}, "ID validation (UUID or CUID)");

// Password validation with complexity requirements
const password = () => {
  return Joi.string()
    .min(6)
    .max(30)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .messages({
      "string.pattern.base": "common.validation.password_invalid",
      "string.min": "common.validation.password_too_short",
      "string.max": "common.validation.password_too_long",
      "any.required": "common.validation.password_required",
    });
};

// Username validation
const username = () => {
  return Joi.alternatives()
    .try(
      Joi.string()
        .email()
        .messages({ "string.email": "common.validation.username_invalid" }),
      Joi.string()
        .pattern(/^\+?\d{9,15}$/) // simple phone regex
        .messages({
          "string.pattern.base": "common.validation.username_invalid",
        }),
      Joi.string()
        .min(3)
        .max(30)
        .pattern(/^[a-zA-Z0-9_]+$/)
        .messages({
          "string.pattern.base": "common.validation.username_invalid",
          "string.min": "common.validation.username_too_short",
          "string.max": "common.validation.username_too_long",
        })
    )
    .required()
    .messages({
      "any.required": "common.validation.username_required",
    });
};

// Phone number validation (E.164 format)
const phoneNumber = () => {
  return Joi.string()
    .pattern(/^\+?[1-9]\d{1,14}$/)
    .messages({
      "string.pattern.base": "common.validation.phone_invalid",
    });
};

// Email validation
const email = () => {
  return Joi.string().email().lowercase().messages({
    "string.email": "common.validation.email_invalid",
    "any.required": "common.validation.email_required",
  });
};

module.exports = {
  id,
  password,
  username,
  phoneNumber,
  email,
};
