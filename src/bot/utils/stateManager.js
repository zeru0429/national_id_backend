/**
 * In-memory per-user state manager for conversation flow
 */

const stateMap = new Map();

function set(chatId, value) {
  stateMap.set(chatId.toString(), value);
}

function get(chatId) {
  return stateMap.get(chatId.toString()) || null;
}

function remove(chatId) {
  stateMap.delete(chatId.toString());
}

function has(chatId) {
  return stateMap.has(chatId.toString());
}

/**
 * Mark a user as processing a task
 * @param {number|string} chatId
 * @param {string} task - optional name of the task (e.g., "ID Generation")
 */
function lock(chatId, task = "GENERAL") {
  const existing = get(chatId) || {};
  set(chatId, { ...existing, isProcessing: true, task });
}

/**
 * Unlock a user after task is done
 * @param {number|string} chatId
 */
function unlock(chatId) {
  const existing = get(chatId) || {};
  set(chatId, { ...existing, isProcessing: false, task: null });
}

/**
 * Check if user is currently locked
 * @param {number|string} chatId
 * @returns {boolean}
 */
function isLocked(chatId) {
  const existing = get(chatId);
  return existing?.isProcessing || false;
}

module.exports = { set, get, remove, has, lock, unlock, isLocked };
