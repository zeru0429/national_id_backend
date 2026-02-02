/**
 * Input validation for bot
 */

const phoneRegex = /^(?:\+2519\d{8}|09\d{8})$/;
const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

function validatePhone(text) {
  return phoneRegex.test(text);
}

function validateEmail(text) {
  return emailRegex.test(text);
}

function validateFullName(text) {
  return text && text.trim().length >= 2;
}

module.exports = {
  phoneRegex,
  emailRegex,
  validatePhone,
  validateEmail,
  validateFullName,
};
