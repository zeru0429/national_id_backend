const Joi = require("joi");
const { email } = require("../../../utils/customJoi");

const updateUser = {
  body: Joi.object({
    email: email().optional().messages({
      "string.email": "validation.email_invalid",
    }),
    fullName: Joi.string().optional().messages({
      "string.base": "validation.full_name_invalid",
    }),
    phoneNumber: Joi.string().optional().messages({
      "string.base": "validation.phone_invalid",
    }),
    role: Joi.string().valid("USER", "ADMIN").optional().messages({
      "any.only": "validation.role_invalid",
    }),
    isBlocked: Joi.boolean().optional().messages({
      "boolean.base": "validation.isBlocked_invalid",
    }),
  }).required(),
};

const getAllUsers = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    search: Joi.string().optional(),
    role: Joi.string().valid("USER", "ADMIN").optional(),
    sortBy: Joi.string().optional(),
    sortOrder: Joi.string().valid("asc", "desc").optional(),
    has_pagination: Joi.boolean().optional(),
  }),
};

module.exports = { updateUser, getAllUsers };
