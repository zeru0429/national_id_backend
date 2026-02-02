// usageLogValidation code
const Joi = require("joi");

// Filter logs (Admin)
const filterLogs = {
  body: Joi.object({
    userId: Joi.string().uuid().optional().messages({
      "string.guid": "validation.user_id_invalid",
    }),
    action: Joi.string()
      .valid("GENERATE_ID", "REGENERATE_ID", "ADMIN_ADJUST")
      .optional()
      .messages({
        "any.only": "validation.action_invalid",
      }),
    fromDate: Joi.date().optional().messages({
      "date.base": "validation.from_date_invalid",
    }),
    toDate: Joi.date().optional().messages({
      "date.base": "validation.to_date_invalid",
    }),
  }).required(),
};

module.exports = { filterLogs };
