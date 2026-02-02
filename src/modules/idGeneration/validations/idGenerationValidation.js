const Joi = require("joi");

// Generate new ID
const generate = {
  body: Joi.object({
    fcn: Joi.string().required().messages({
      "any.required": "validation.fcn_required",
    }),
    fin: Joi.string().required().messages({
      "any.required": "validation.fin_required",
    }),
    phoneNumber: Joi.string().required().messages({
      "any.required": "validation.phone_number_required",
    }),
    extractedData: Joi.object().required().messages({
      "any.required": "validation.extracted_data_required",
    }),
    cost: Joi.number().integer().min(0).required().messages({
      "any.required": "validation.cost_required",
      "number.base": "validation.cost_invalid",
    }),
  }).required(),
};

module.exports = { generate };
