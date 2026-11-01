const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Telegram } = require('telegraf');
const { formatProjectReport, sendProjectReport } = require('../services/projectReport');
const { randomUUID } = require('node:crypto');
const { bridgeRequest, deviceId } = require('../services/codexBridgeClient');
const { validateRoute } = require('../services/codexBridgeStore');

async function main() {
  const args = process.argv.slice(2);
  const filename = args.find(arg => arg !== '--dry-run');
  if (!filename) throw new Error('Использование: npm run report -- reports/current.json [--dry-run]');
  const report = JSON.parse(fs.readFileSync(path.resolve(filename), 'utf8').replace(/^\uFEFF/, ''));
  // The running Codex process supplies its source thread; never infer it from a project name.
  if (!report.codex && process.env.CODEX_THREAD_ID) {
    report.codex = { threadId: process.env.CODEX_THREAD_ID, hostId: process.env.CODEX_HOST_ID || 'local' };
  }
  if (args.includes('--dry-run')) {
    console.log(formatProjectReport(report).join('\n\n----- Следующее сообщение -----\n\n'));
    return;
  }
  const token = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;
  if (!token) throw new Error('Не задан TELEGRAM_BOT_TOKEN.');
  formatProjectReport(report); // Validate before registering a route or sending anything.
  const options = {};
  if (process.env.ZONA_CODEX_BRIDGE === '1' && report.codex) {
    const route = validateRoute({ id: randomUUID(), deviceId: deviceId(), ownerId: process.env.TELEGRAM_OWNER_CHAT_ID,
      threadId: report.codex.threadId, hostId: report.codex.hostId, title: report.title,
      recommendations: report.recommendations || [] });
    bridgeRequest({ action: 'register', route });
    options.replyMarkup = { inline_keyboard: [
      ...route.recommendations.map((item, i) => [{ text: `${i + 1}. ${item.label}`, callback_data: `zr:${route.id}:${i}` }]),
      [{ text: '✍️ Написать свою задачу', callback_data: `zr:${route.id}:custom` }],
    ] };
    options.onDelivered = message => bridgeRequest({ action: 'bind', id: route.id, messageId: message.message_id });
  } else if (report.codex || report.recommendations?.length) {
    console.log('Обратная связь не включена: рекомендации отправляются текстом, задачи из Telegram пока не пересылаются.');
  }
  const count = await sendProjectReport(new Telegram(token), process.env.TELEGRAM_OWNER_CHAT_ID, report, options);
  console.log(`Отчёт ZONA доставлен в личный чат. Сообщений: ${count}.`);
}

main().catch(error => {
  // Do not log Telegram request objects: they can contain credentials.
  console.error(error.response ? `Telegram: ошибка ${error.response.error_code}. Проверьте ID и отправьте боту /start в личном чате.` : error.message);
  process.exitCode = 1;
});
