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

module.exports = { set, get, remove, has };
