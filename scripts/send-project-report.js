const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Telegram } = require('telegraf');
const { formatProjectReport, sendProjectReport } = require('../services/projectReport');

async function main() {
  const args = process.argv.slice(2);
  const filename = args.find(arg => arg !== '--dry-run');
  if (!filename) throw new Error('Использование: npm run report -- reports/current.json [--dry-run]');
  const report = JSON.parse(fs.readFileSync(path.resolve(filename), 'utf8').replace(/^\uFEFF/, ''));
  if (args.includes('--dry-run')) {
    console.log(formatProjectReport(report).join('\n\n----- Следующее сообщение -----\n\n'));
    return;
  }
  const token = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;
  if (!token) throw new Error('Не задан TELEGRAM_BOT_TOKEN.');
  const count = await sendProjectReport(new Telegram(token), process.env.TELEGRAM_OWNER_CHAT_ID, report);
  console.log(`Отчёт ZONA доставлен в личный чат. Сообщений: ${count}.`);
}

main().catch(error => {
  // Do not log Telegram request objects: they can contain credentials.
  console.error(error.response ? `Telegram: ошибка ${error.response.error_code}. Проверьте ID и отправьте боту /start в личном чате.` : error.message);
  process.exitCode = 1;
});
