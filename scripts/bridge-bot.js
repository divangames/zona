// Minimal Telegram receiver: Node 18+ only, no catalog, AI or application dependencies.
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
// Some VPS networks advertise IPv6 without a working Telegram route.
require('node:dns').setDefaultResultOrder('ipv4first');
require('node:net').setDefaultAutoSelectFamily?.(false);
const { BridgeStore } = require('../services/codexBridgeStore');
const { createCodexBridgeMiddleware } = require('../bot/handlers/codexBridge');
const token = process.env.TELEGRAM_BOT_TOKEN;
const ownerId = process.env.TELEGRAM_OWNER_CHAT_ID;
const root = path.join(__dirname, '..', 'data', 'codex-bridge');
const store = new BridgeStore(root);
const offsetFile = path.join(root, 'offset.json');
let running = true;
const agent = new https.Agent({ keepAlive: true, family: 4 });
function pulse(healthy) {
  const file = path.join(root, 'receiver-health.json');
  fs.writeFileSync(file + '.tmp', JSON.stringify({ healthy, checkedAt: new Date().toISOString() }), { mode: 0o600 });
  fs.renameSync(file + '.tmp', file);
}

async function api(method, body) {
  const payload = JSON.stringify(body);
  const data = await new Promise((resolve, reject) => {
    const request = https.request({ hostname: 'api.telegram.org', path: `/bot${token}/${method}`, method: 'POST', family: 4, agent,
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } }, response => {
      let text = '';
      response.on('data', part => { text += part; });
      response.on('end', () => { try { resolve(JSON.parse(text)); } catch { reject(new Error('Invalid Telegram response')); } });
      response.on('error', reject);
    });
    request.setTimeout(40000, () => request.destroy(Object.assign(new Error('Telegram timeout'), { code: 'ETIMEDOUT' })));
    request.on('error', reject);
    request.end(payload);
  });
  if (!data.ok) {
    const error = new Error(`Telegram API ${data.error_code || 500}`);
    error.code = data.error_code || 500;
    throw error;
  }
  return data.result;
}
const middleware = createCodexBridgeMiddleware(store);

async function handle(update) {
  const callback = update.callback_query;
  const message = update.message;
  const chat = message?.chat || callback?.message?.chat;
  const from = message?.from || callback?.from;
  const ctx = {
    chat, from, message, callbackQuery: callback,
    botInfo: { id: token?.split(':')[0] },
    reply: (text, extra = {}) => api('sendMessage', { chat_id: chat.id, text, ...extra }),
    answerCbQuery: text => api('answerCallbackQuery', { callback_query_id: callback.id, text }),
  };
  if (chat?.type !== 'private' || String(chat.id) !== ownerId || String(from?.id) !== ownerId) {
    if (callback) await ctx.answerCbQuery('Личный бот владельца');
    return;
  }
  await middleware(ctx, async () => {
    if (callback) return ctx.answerCbQuery('Кнопка недоступна');
    if (message?.text) return ctx.reply('💜 Я ZONA. Чтобы передать задачу в нужный чат Codex, ответьте на его отчёт или нажмите «Написать свою задачу» под ним. Рекомендации запускаются кнопками под отчётом.');
  });
}

async function main() {
  if (!token || !/^[1-9]\d*$/.test(ownerId || '')) throw Object.assign(new Error('Configure bot token and private owner ID'), { code: 401 });
  const webhook = await api('getWebhookInfo', {});
  if (webhook.url) throw Object.assign(new Error('Webhook exists; receiver will not change another integration'), { code: 409 });
  let offset = fs.existsSync(offsetFile) ? JSON.parse(fs.readFileSync(offsetFile, 'utf8')).offset : 0;
  console.log('ZONA bridge receiver started');
  pulse(false); // Healthy only after a successful getUpdates response.
  while (running) {
    try {
      const updates = await api('getUpdates', { offset, timeout: 25, allowed_updates: ['message', 'callback_query'] });
      pulse(true);
      for (const update of updates) {
        try { await handle(update); }
        catch (error) {
          // Expired callback acknowledgments or a blocked chat must not poison the queue forever.
          if (![400, 403].includes(error.code)) throw error;
          console.error(`Cannot acknowledge Telegram update: ${error.code}`);
        }
        offset = update.update_id + 1;
        fs.writeFileSync(offsetFile + '.tmp', JSON.stringify({ offset }), { mode: 0o600 });
        fs.renameSync(offsetFile + '.tmp', offsetFile);
      }
    } catch (error) {
      pulse(false);
      if ([401, 409].includes(error.code)) { console.error(`Receiver stopped: Telegram ${error.code}`); process.exitCode = 78; return; }
      console.error('Receiver retry after network or handler error');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
}
process.on('SIGTERM', () => { running = false; pulse(false); agent.destroy(); });
process.on('SIGINT', () => { running = false; pulse(false); agent.destroy(); });
main().catch(error => {
  pulse(false);
  console.error(`Bridge startup failed: ${error.code || error.cause?.code || error.name}`);
  process.exitCode = [401, 409].includes(error.code) ? 78 : 1;
});
