const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Telegram } = require('telegraf');
const { sendProjectReport } = require('../services/projectReport');

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;
  if (!token) throw new Error('Заполните TELEGRAM_BOT_TOKEN в локальном .env ZONA.');
  const report = {
    title: 'Проверочное сообщение после подключения ZONA',
    completed: ['Привет! Я ZONA 💜 Я отправила это тестовое сообщение, чтобы проверить личные уведомления.', 'Репозиторий и установка: https://github.com/divangames/zona'],
    checks: ['Проверяю реальную доставку через Telegram Bot API. Успех будет подтверждён в терминале после отправки.'],
    projectStatus: ['Это проверка отправителя на текущем компьютере. Исполнение правил в каждом чате и на других ПК отдельно не проверялось.'],
    deployment: ['Работающий бот и VPS не перезапускались.'],
    issues: ['Уже открытые сессии должны загрузить новые инструкции. Навык сам по себе не является фоновым наблюдателем за чатами.'],
    nextSteps: ['После следующей задачи проверь получение отчёта. Если используешь другой компьютер или агент, подключи ZONA и там.'],
  };
  const count = await sendProjectReport(new Telegram(token), process.env.TELEGRAM_OWNER_CHAT_ID, report);
  console.log(`Тест ZONA: Telegram подтвердил отправку ${count} сообщения(й).`);
}
main().catch(error => {
  console.error(error.response ? `Telegram: ошибка ${error.response.error_code}. Проверьте личный ID и отправьте боту /start.` : error.message);
  process.exitCode = 1;
});
