const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(root, '.env') });
const { Telegram } = require('telegraf');
const { bridgeRequest, deviceId } = require('../services/codexBridgeClient');

async function main() {
  if (process.argv.slice(2).some(arg => arg !== '--enable')) throw new Error('Использование: node scripts/check-codex-bridge.js [--enable]');
  const token = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;
  const owner = process.env.TELEGRAM_OWNER_CHAT_ID;
  if (!token || !/^[1-9]\d*$/.test(owner || '')) throw new Error('Настройте токен и личный ID в локальном .env.');
  const telegram = new Telegram(token);
  await telegram.getMe();
  if ((await telegram.getChat(owner)).type !== 'private') throw new Error('Нужен личный чат владельца.');
  const health = bridgeRequest({ action: 'health', ownerId: owner, tokenDigest: createHash('sha256').update(token).digest('hex') });
  if (health.protocolVersion !== 1) throw new Error('Обновите файлы моста на VPS; протокол проверки не поддерживается.');
  if (!health.tokenMatches || !health.ownerMatches) throw new Error('Локальный токен или владелец не совпадают с приёмником VPS. Используйте настройки существующего бота, не перевыпускайте токен ради второго ПК.');
  if (!health.receiverHealthy) throw new Error('Нет свежего успешного приёма Telegram на VPS. Проверьте сервис; после запуска подождите один цикл polling (до 30 секунд).');
  const status = bridgeRequest({ action: 'status', deviceId: deviceId() });
  if (status.processing.length) throw new Error('На этом устройстве есть неподтверждённая передача. Проверьте её перед завершением установки.');
  if (process.argv.includes('--enable')) {
    const file = path.join(root, '.env');
    const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const clean = text.split(/\r?\n/).filter(line => !/^\s*ZONA_CODEX_BRIDGE\s*=/.test(line)).join('\n').trimEnd();
    fs.writeFileSync(file, clean + '\nZONA_CODEX_BRIDGE=1\n', { mode: 0o600 });
  }
  console.log('Telegram, владелец, SSH и приёмник VPS проверены. Мост ' + (process.argv.includes('--enable') ? 'включён.' : 'доступен.'));
  console.log('Осталось настроить местный heartbeat и подтвердить реальный возврат тестовой задачи в исходный чат.');
}
main().catch(error => { console.error(error.response ? `Telegram: ошибка ${error.response.error_code}.` : error.message); process.exitCode = 1; });
