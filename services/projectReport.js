const SECTIONS = [
  ['completed', '✅ Что я сделала'],
  ['checks', '🧪 Что я проверила'],
  ['projectStatus', '📊 Полный статус проекта'],
  ['deployment', '🚀 Публикация'],
  ['issues', '⚠️ Проблемы и ограничения'],
  ['nextSteps', '📌 Что осталось'],
];

function validateReport(report) {
  if (!report || typeof report.title !== 'string' || !report.title.trim()) {
    throw new Error('Укажите title отчёта.');
  }
  for (const [key] of SECTIONS) {
    if (!Array.isArray(report[key]) || !report[key].length ||
        report[key].some(item => typeof item !== 'string' || !item.trim())) {
      throw new Error(`Раздел ${key} должен содержать непустой список строк.`);
    }
  }
}

function escapeHtml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Split before escaping so neither HTML entities nor emoji pairs are cut.
function textChunks(value, limit = 600) {
  const points = Array.from(value);
  const chunks = [];
  for (let i = 0; i < points.length; i += limit) chunks.push(points.slice(i, i + limit).join(''));
  return chunks;
}

function formatProjectReport(report, now = new Date()) {
  validateReport(report);
  const date = now.toLocaleString('ru-RU', { timeZone: 'Asia/Krasnoyarsk' });
  const blocks = [
    '<b>💜 ZONA · Отчёт о работе</b>',
    ...textChunks(report.title).map(escapeHtml),
    `🕒 ${date} (Красноярск, UTC+7)`,
    'Привет! Я подготовила отчёт по задачам и собрала актуальный статус проекта.',
  ];
  for (const [key, label] of SECTIONS) {
    blocks.push(`<b>${label}</b>`);
    for (const item of report[key]) {
      blocks.push(...textChunks(`• ${item}`).map(escapeHtml));
    }
  }
  blocks.push('С заботой о проекте, твоя ZONA 💜');
  const messages = [];
  let current = '';
  for (const block of blocks) {
    if (current.length + block.length + 2 > 3900) {
      messages.push(current);
      current = '';
    }
    current += (current ? '\n\n' : '') + block;
  }
  if (current) messages.push(current);
  return messages;
}

async function sendProjectReport(telegram, chatId, report) {
  const messages = formatProjectReport(report);
  if (!/^[1-9]\d*$/.test(String(chatId || ''))) {
    throw new Error('Укажите положительный числовой TELEGRAM_OWNER_CHAT_ID в .env.');
  }
  const chat = await telegram.getChat(chatId);
  if (chat.type !== 'private') throw new Error('Отчёты ZONA можно отправлять только в личный чат.');
  let sent = 0;
  for (const message of messages) {
    try {
      await telegram.sendMessage(chatId, message, { parse_mode: 'HTML', disable_web_page_preview: true });
      sent++;
    } catch (error) {
      const code = error.response?.error_code || 'network';
      throw new Error(`Доставлено частей: ${sent}/${messages.length}. Ошибка Telegram: ${code}. Проверьте личный чат и доступность сети.`);
    }
  }
  return sent;
}

module.exports = { formatProjectReport, sendProjectReport };
