const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

function healthStatus(root, request, now = Date.now()) {
  const env = Object.fromEntries(fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/).filter(line => /^[A-Z_]+=/.test(line)).map(line => {
    const i = line.indexOf('=');
    return [line.slice(0, i), line.slice(i + 1).trim().replace(/^(["'])(.*)\1$/, '$2')];
  }));
  let pulse = {};
  try { pulse = JSON.parse(fs.readFileSync(path.join(root, 'data', 'codex-bridge', 'receiver-health.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const age = now - Date.parse(pulse.checkedAt);
  return {
    protocolVersion: 1,
    receiverHealthy: pulse.healthy === true && age >= 0 && age < 120000,
    tokenMatches: !!env.TELEGRAM_BOT_TOKEN && createHash('sha256').update(env.TELEGRAM_BOT_TOKEN).digest('hex') === request.tokenDigest,
    ownerMatches: !!env.TELEGRAM_OWNER_CHAT_ID && env.TELEGRAM_OWNER_CHAT_ID === String(request.ownerId),
  };
}
module.exports = { healthStatus };
