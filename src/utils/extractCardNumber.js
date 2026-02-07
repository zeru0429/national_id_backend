// utils/extractCardNumber.js
function extractCardNumber(text) {
    if (!text) return null;

    // Remove everything except digits
    const digitsOnly = text.replace(/[^\d]/g, " ");

    // Ethiopian card / barcode numbers are usually long
    const match = digitsOnly.match(/\b\d{16,20}\b/);

    return match ? match[0] : null;
}

module.exports = { extractCardNumber };
