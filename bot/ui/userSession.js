/** Простое состояние в памяти: режим ввода и последний поисковый запрос. */

const pending = new Map();
const lastQuery = new Map();

const TTL_MS = 15 * 60 * 1000;

function clearPending(userId) {
  if (userId) pending.delete(userId);
}

function setPending(userId, mode) {
  if (!userId) return;
  if (!mode) {
    clearPending(userId);
    return;
  }
  pending.set(userId, { mode, at: Date.now() });
}

function consumePending(userId) {
  const row = pending.get(userId);
  pending.delete(userId);
  if (!row) return null;
  if (Date.now() - row.at > TTL_MS) return null;
  return row.mode;
}

function peekPending(userId) {
  const row = pending.get(userId);
  if (!row) return null;
  if (Date.now() - row.at > TTL_MS) {
    pending.delete(userId);
    return null;
  }
  return row.mode;
}

function setLastQuery(userId, query) {
  if (!userId || !query) return;
  lastQuery.set(userId, { query: String(query).trim(), at: Date.now() });
}

function getLastQuery(userId) {
  const row = lastQuery.get(userId);
  if (!row) return null;
  if (Date.now() - row.at > TTL_MS) {
    lastQuery.delete(userId);
    return null;
  }
  return row.query;
}

module.exports = {
  setPending,
  clearPending,
  consumePending,
  peekPending,
  setLastQuery,
  getLastQuery,
};
