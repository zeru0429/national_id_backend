const Joi = require("joi");
const { email, password } = require("../../../utils/customJoi");

// -------------------------
// LOGIN
// -------------------------
const login = {
  body: Joi.object({
    email: email().required().messages({
      "any.required": "validation.email_required",
      "string.email": "validation.email_invalid",
    }),
    password: password().required().messages({
      "any.required": "validation.password_required",
    }),
  }).required(),
};

// -------------------------
// GOOGLE LOGIN
// -------------------------
const googleLogin = {
  body: Joi.object({
    token: Joi.string().required().messages({
      "any.required": "validation.token_required",
    }),
  }).required(),
};

// -------------------------
// REGISTER
// -------------------------
const register = {
  body: Joi.object({
    email: email().required().messages({
      "any.required": "validation.email_required",
      "string.email": "validation.email_invalid",
    }),
    password: password().min(6).required().messages({
      "any.required": "validation.password_required",
      "string.min": "validation.password_min",
    }),
    fullName: Joi.string().required().messages({
      "any.required": "validation.full_name_required",
    }),
  }).required(),
};

// -------------------------
// REFRESH TOKEN
// -------------------------
const refreshToken = {
  body: Joi.object({
    refreshToken: Joi.string().required().messages({
      "any.required": "validation.refresh_token_required",
    }),
  }).required(),
};

// -------------------------
// CHANGE PASSWORD
// -------------------------
const changePassword = {
  body: Joi.object({
    oldPassword: password().required().messages({
      "any.required": "validation.old_password_required",
    }),
    newPassword: password().min(6).required().messages({
      "any.required": "validation.new_password_required",
      "string.min": "validation.password_min",
    }),
  }).required(),
};

module.exports = {
  login,
  googleLogin,
  register,
  refreshToken,
  changePassword,
};
