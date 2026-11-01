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
  if (report.recommendations !== undefined) {
    if (!Array.isArray(report.recommendations) || report.recommendations.length > 5 ||
        report.recommendations.some(item => !item || typeof item.label !== 'string' || !item.label.trim() || item.label.length > 60 || typeof item.prompt !== 'string' || !item.prompt.trim() || item.prompt.length > 12000)) {
      throw new Error('recommendations: до 5 рекомендаций с label (до 60 символов) и prompt (до 12000).');
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
  if (report.recommendations?.length) {
    blocks.push('<b>💡 Рекомендации Codex — следующие задачи</b>');
    report.recommendations.forEach((item, index) => {
      blocks.push(...textChunks(`${index + 1}. ${item.label}\n${item.prompt}`).map(escapeHtml));
    });
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

async function sendProjectReport(telegram, chatId, report, options = {}) {
  const messages = formatProjectReport(report);
  if (!/^[1-9]\d*$/.test(String(chatId || ''))) {
    throw new Error('Укажите положительный числовой TELEGRAM_OWNER_CHAT_ID в .env.');
  }
  const chat = await telegram.getChat(chatId);
  if (chat.type !== 'private') throw new Error('Отчёты ZONA можно отправлять только в личный чат.');
  let sent = 0;
  for (const [index, message] of messages.entries()) {
    try {
      const extra = { parse_mode: 'HTML', disable_web_page_preview: true };
      if (index === messages.length - 1 && options.replyMarkup) extra.reply_markup = options.replyMarkup;
      const delivered = await telegram.sendMessage(chatId, message, extra);
      sent++;
      if (options.onDelivered) await options.onDelivered(delivered);
    } catch (error) {
      const code = error.response?.error_code || 'network';
      throw new Error(`Доставлено частей: ${sent}/${messages.length}. Ошибка отправки или привязки чата: ${code}. Проверьте Telegram и мост VPS; не повторяйте доставленные части автоматически.`);
    }
  }
  return sent;
}

module.exports = { formatProjectReport, sendProjectReport };
