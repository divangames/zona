const { BTN, isMenuButtonText, mainKeyboard } = require("../ui/keyboards");
const { setPending, consumePending, getLastQuery } = require("../ui/userSession");
const { isGroupChat } = require("../utils/groupMessage");
const { handleProductQuery } = require("./catalogSearch");
const { sendCalendarMenu } = require("./basketballCalendar");
const { sendSeoHint } = require("./seoNews");

function withMainKeyboard(extra = {}) {
  return { ...extra, reply_markup: mainKeyboard().reply_markup };
}

async function sendWelcome(ctx, me) {
  const text =
    `Привет! Я *${me}*.\n\n` +
    "Используйте кнопки ниже или команды:\n\n" +
    "📷 *Фото* — название и описание в стиле каталога\n" +
    "🔍 *Найти* — карточка с фото и ценой\n" +
    "👟 *Подбор* — 3 товара по критериям\n" +
    "🎂 *Календарь ДР* — баскетболисты и их кроссовки\n" +
    "📰 *SEO-новость* — статья по Вордстату (YandexGPT)\n\n" +
    "Примеры текста:\n" +
    "`Nike Dunk Panda`\n" +
    "`подбери белые кроссовки 42 зима`\n\n" +
    "/find /pick /status /reload";

  if (isGroupChat(ctx)) {
    return ctx.reply(text.replace(/\*/g, ""), { parse_mode: undefined });
  }
  return ctx.replyWithMarkdown(text, withMainKeyboard());
}

async function sendStatusReply(ctx, statusText) {
  if (isGroupChat(ctx)) {
    return ctx.reply(statusText);
  }
  return ctx.reply(statusText, withMainKeyboard());
}

async function handleMenuButton(ctx, text) {
  const label = String(text || "").trim();

  switch (label) {
    case BTN.PHOTO:
      setPending(ctx.from?.id);
      return replyHint(
        ctx,
        "Отправьте *фото кроссовок* (как изображение, не файлом).\n\nЯ сгенерирую название и описание."
      );
    case BTN.FIND:
      setPending(ctx.from?.id, "find");
      return replyHint(
        ctx,
        "Напишите *название* следующим сообщением.\n\nПример: `Nike Air Force 1 white`"
      );
    case BTN.PICK:
      setPending(ctx.from?.id, "pick");
      return replyHint(
        ctx,
        "Напишите *критерии* следующим сообщением.\n\nПример: `белые кроссовки 42 зима Nike`"
      );
    case BTN.BDAY:
      setPending(ctx.from?.id);
      await sendCalendarMenu(ctx);
      return true;
    case BTN.SEO:
      setPending(ctx.from?.id, "seo");
      await sendSeoHint(ctx);
      return true;
    case BTN.STATUS:
      return { action: "status" };
    case BTN.MENU:
      return { action: "start" };
    default:
      return null;
  }
}

async function replyHint(ctx, markdown) {
  if (isGroupChat(ctx)) {
    return ctx.reply(markdown.replace(/[*`]/g, ""));
  }
  return ctx.replyWithMarkdown(markdown, withMainKeyboard());
}

/**
 * Текст после нажатия «Найти» / «Подбор» или обычный запрос.
 * @returns {boolean} true если сообщение обработано
 */
async function handleMenuFlow(ctx, text) {
  if (!text || text.startsWith("/")) return false;

  if (isMenuButtonText(text)) {
    const result = await handleMenuButton(ctx, text);
    if (result?.action === "status") return "status";
    if (result?.action === "start") return "start";
    return true;
  }

  const userId = ctx.from?.id;
  const mode = consumePending(userId);
  if (mode === "find") {
    await handleProductQuery(ctx, text, { forceMode: "name" });
    return true;
  }
  if (mode === "pick") {
    await handleProductQuery(ctx, text, { forceMode: "pick" });
    return true;
  }
  if (mode === "seo") {
    const { sendSeoArticle } = require("./seoNews");
    await sendSeoArticle(ctx, text);
    return true;
  }

  return false;
}

async function handlePickAgainCallback(ctx) {
  const query = getLastQuery(ctx.from?.id);
  if (!query) {
    await ctx.answerCbQuery("Сначала сделайте подбор текстом или кнопкой «Подбор 3»");
    return;
  }
  await ctx.answerCbQuery();
  await handleProductQuery(ctx, query, { forceMode: "pick" });
}

async function handleCallbackQuery(ctx) {
  const data = ctx.callbackQuery?.data || "";

  if (data === "pick:again") {
    return handlePickAgainCallback(ctx);
  }

  if (data.startsWith("bday:")) {
    const { handleBirthdayCallback } = require("./basketballCalendar");
    return handleBirthdayCallback(ctx, data);
  }

  await ctx.answerCbQuery();
}

module.exports = {
  sendWelcome,
  sendStatusReply,
  handleMenuFlow,
  handleCallbackQuery,
  withMainKeyboard,
  isMenuButtonText,
};
