// detectionValidation code
const Joi = require("joi");

const detectAndCropSchema = Joi.object({
  outputWidth: Joi.number().integer().min(64).max(4096).default(512),
  outputHeight: Joi.number().integer().min(64).max(4096).default(512),
  removeBackground: Joi.boolean().default(false),
  format: Joi.string().valid("png", "jpg", "webp").default("png"),
}).unknown(false); // Don't allow unknown fields

const processBase64Schema = Joi.object({
  image: Joi.string().required().messages({
    "string.empty": "Image data is required",
    "any.required": "Image data is required",
  }),
  outputWidth: Joi.number().integer().min(64).max(4096).default(512),
  outputHeight: Joi.number().integer().min(64).max(4096).default(512),
  removeBackground: Joi.boolean().default(false),
  format: Joi.string().valid("png", "jpg", "webp").default("png"),
});

module.exports = {
  detectAndCropSchema,
  processBase64Schema,
};
