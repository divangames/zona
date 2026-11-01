const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Telegram } = require('telegraf');
const { sendProjectReport } = require('../services/projectReport');

async function main() {
  if (process.argv.includes('--interactive')) {
    if (process.env.ZONA_CODEX_BRIDGE !== '1') throw new Error('Сначала выполните check-codex-bridge.js --enable.');
    const option = name => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
    const threadId = option('--thread-id') || process.env.CODEX_THREAD_ID;
    const hostId = option('--host-id') || process.env.CODEX_HOST_ID || 'local';
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(threadId || '') || !/^[a-zA-Z0-9_-]{1,100}$/.test(hostId)) throw new Error('Укажите точный --thread-id и --host-id исходного чата Codex.');
    const fs = require('node:fs'), os = require('node:os'), { randomUUID } = require('node:crypto'), { spawnSync } = require('node:child_process');
    const nonce = randomUUID();
    const dir = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'zona-reports');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, nonce + '.json');
    const report = {
      title: 'ZONA — проверка полной установки на этом ПК',
      completed: ['Я подготовила проверку отчётов, рекомендаций и обратной передачи задачи.'],
      checks: ['Доставка в Codex будет подтверждена только после вашего нажатия и появления задачи в исходном чате.'],
      projectStatus: ['Проверяется новое устройство, работа других ПК не изменяется.'],
      deployment: ['Второй Telegram-приёмник не запускается.'],
      issues: ['Для доставки нужны работающий Codex и настроенный местный heartbeat.'],
      nextSteps: ['Нажмите «Проверить возврат в Codex» или напишите «Тест связи» ответом на этот отчёт.'],
      codex: { threadId, hostId },
      recommendations: [{ label: 'Проверить возврат в Codex', prompt: `Тест ZONA ${nonce}. Ответь: «Задача из Telegram получена в исходном чате Codex». Не меняй файлы проектов.` }],
    };
    fs.writeFileSync(file, JSON.stringify(report, null, 2), { mode: 0o600 });
    for (const tail of [['--dry-run'], []]) {
      const result = spawnSync(process.execPath, [path.join(__dirname, 'send-project-report.js'), file, ...tail], { encoding: 'utf8' });
      if (result.status !== 0) throw new Error(result.stderr || 'Не удалось отправить тестовый отчёт.');
      if (!tail.length) console.log(result.stdout.trim());
    }
    console.log(`Контрольная метка: ${nonce}. Дождитесь задачи с этой меткой в исходном чате; отправка отчёта ещё не подтверждает обратную связь.`);
    return;
  }
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
