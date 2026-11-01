const config = require("../../ai/config");

function getBotUsername(ctx) {
  return ctx.botInfo?.username || config.telegram.username || "";
}

function getMessageText(ctx) {
  return (ctx.message?.text || ctx.message?.caption || "").trim();
}

function stripBotMention(text, botUsername) {
  if (!text || !botUsername) return text || "";
  const escaped = botUsername.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`@${escaped}\\s*`, "gi"), "").trim();
}

function isGroupChat(ctx) {
  const t = ctx.chat?.type;
  return t === "group" || t === "supergroup";
}

function isMentionOfBot(ctx, text) {
  const username = getBotUsername(ctx);
  const botId = ctx.botInfo?.id;
  if (!text) return false;

  if (username) {
    const needle = `@${username}`.toLowerCase();
    if (text.toLowerCase().includes(needle)) return true;
  }

  const entities = ctx.message?.entities || ctx.message?.caption_entities || [];
  for (const e of entities) {
    if (e.type === "text_mention" && botId && e.user?.id === botId) {
      return true;
    }
    if (e.type !== "mention" || !username) continue;
    const mention = text.slice(e.offset, e.offset + e.length);
    if (mention.toLowerCase() === `@${username.toLowerCase()}`) return true;
  }
  return false;
}

function isReplyToBot(ctx) {
  const from = ctx.message?.reply_to_message?.from;
  const botId = ctx.botInfo?.id;
  if (botId) return from?.id === botId;
  return Boolean(from?.is_bot && from.username === getBotUsername(ctx));
}

/**
 * В группе Telegram с Privacy Mode и так шлёт только @бот / команды / ответы.
 * Если Privacy выключен (GROUP_ACCEPT_ALL=1) — обрабатываем любой текст.
 */
function shouldProcessMessage(ctx) {
  if (!isGroupChat(ctx)) return true;

  if (process.env.GROUP_ACCEPT_ALL === "1") return true;

  const text = getMessageText(ctx);
  if (!text) return true;
  if (text.startsWith("/")) return true;
  if (isReplyToBot(ctx)) return true;
  if (isMentionOfBot(ctx, text)) return true;

  return false;
}

function extractQuery(ctx) {
  let text = getMessageText(ctx);
  const username = getBotUsername(ctx);
  if (username) text = stripBotMention(text, username);
  return text.trim();
}

function groupHelpText(username) {
  const u = username || "ZonaDeck_bot";
  return (
    `Я в группе @${u}.\n\n` +
    `• @${u} подбери белые Nike 43\n` +
    `• /pick@${u} белые Nike 43\n` +
    `• /find@${u} Nike Dunk\n` +
    `• /birthdays@${u} — ДР баскетболистов\n\n` +
    `Если не отвечаю: @BotFather → /mybots → ${u} → Bot Settings → Group Privacy → Turn off`
  );
}

module.exports = {
  getBotUsername,
  getMessageText,
  stripBotMention,
  isGroupChat,
  shouldProcessMessage,
  extractQuery,
  isMentionOfBot,
  groupHelpText,
};
