// subscriptionValidation code
const Joi = require("joi");

// Adjust subscription balance
const adjustSubscription = {
  body: Joi.object({
    userId: Joi.string().uuid().required().messages({
      "any.required": "validation.user_id_required",
      "string.guid": "validation.user_id_invalid",
    }),
    amount: Joi.number().required().messages({
      "any.required": "validation.amount_required",
      "number.base": "validation.amount_invalid",
    }),
    action: Joi.string().valid("CREDIT", "DEBIT").required().messages({
      "any.required": "validation.action_required",
      "any.only": "validation.action_invalid",
    }),
  }).required(),
};

module.exports = {
  adjustSubscription,
};
