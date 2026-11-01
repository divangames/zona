const { Telegraf } = require("telegraf");
const { message } = require("telegraf/filters");
const config = require("../ai/config");
const {
  getCatalog,
  loadCache,
  isCacheStale,
  isCatalogLoading,
  getReadyCatalog,
} = require("../services/catalogLoader");
const { collectStyleSamples } = require("../services/styleReference");
const { generateListing } = require("../services/descriptionGenerator");
const { checkAiReady, aiStatusLine, useOllama } = require("../services/llmProvider");
const { handleProductQuery } = require("./handlers/catalogSearch");
const {
  shouldProcessMessage,
  extractQuery,
  isGroupChat,
  getBotUsername,
  groupHelpText,
} = require("./utils/groupMessage");
const { BOT_COMMANDS } = require("./ui/keyboards");
const {
  sendWelcome,
  sendStatusReply,
  handleMenuFlow,
  handleCallbackQuery,
} = require("./handlers/menu");
const { sendCalendarMenu } = require("./handlers/basketballCalendar");
const { sendSeoArticle } = require("./handlers/seoNews");
const { yandexConfigured } = require("../services/yandexCloud");

if (!config.telegram.token) {
  console.error("Ошибка: задайте TELEGRAM_BOT_TOKEN в файле .env");
  process.exit(1);
}

/** 0 = мгновенный таймаут! Нужно Infinity или большое число (Ollama, фото). */
const bot = new Telegraf(config.telegram.token, {
  handlerTimeout: Infinity,
});

bot.use(async (ctx, next) => {
  const chatType = ctx.chat?.type || "-";
  const text =
    ctx.message?.text?.slice(0, 80) ||
    ctx.message?.caption?.slice(0, 80) ||
    "";
  if (chatType === "group" || chatType === "supergroup") {
    console.log(`[tg] ${ctx.updateType} chat=${chatType} id=${ctx.chat?.id} text=${text || "(no text)"}`);
  }
  return next();
});

function startBackgroundCatalogLoad(force = false) {
  return getCatalog({ force }).catch((err) => {
    console.error("[catalog] Ошибка фоновой загрузки:", err.message);
    return loadCache() || { offers: [], offerCount: 0 };
  });
}

function catalogStatusText() {
  const ready = getReadyCatalog();
  const loading = isCatalogLoading();

  if (loading) {
    return "Каталог: идёт обновление по /reload (~5–10 мин).";
  }
  if (ready) {
    const stale = isCacheStale(ready) ? " (можно обновить: /reload)" : "";
    return `Каталог: ${ready.offerCount} позиций, файл ${ready.loadedAt}${stale}`;
  }
  return "Каталог: нет data/catalog-cache.json — один раз: /reload или start.bat пункт 3";
}

function formatReply(result) {
  const { title, description } = result.listing;
  const v = result.vision;
  const meta = [
    v.brand && `Бренд: ${v.brand}`,
    v.model && `Модель: ${v.model}`,
    v.colorway && `Расцветка: ${v.colorway}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return [
    "✅ **Готово**",
    meta ? `\n_${meta}_` : "",
    "",
    `**Название**\n${title || "—"}`,
    "",
    `**Описание**\n${description || "—"}`,
    result.usedWebSearch
      ? `\n_В каталоге не найдено — описание по интернету (${result.webSources || 0} источн.)_`
      : result.similarCount
        ? `\n_Похожих в каталоге: ${result.similarCount}_`
        : "",
  ].join("\n");
}

async function safeEdit(ctx, messageId, text) {
  try {
    await ctx.telegram.editMessageText(ctx.chat.id, messageId, undefined, text);
  } catch {
    await ctx.reply(text);
  }
}

bot.catch((err, ctx) => {
  console.error("[bot] Ошибка обработки:", err.message);
  if (ctx?.chat) {
    ctx.reply(`Ошибка: ${err.message}`).catch(() => {});
  }
});

bot.start(async (ctx) => {
  const me = getBotUsername(ctx);
  if (isGroupChat(ctx)) {
    return ctx.reply(groupHelpText(me));
  }
  await sendWelcome(ctx, me);
});

bot.on("my_chat_member", async (ctx) => {
  const status = ctx.myChatMember?.new_chat_member?.status;
  console.log("[tg] my_chat_member", ctx.chat?.type, ctx.chat?.id, status);
  if (!isGroupChat(ctx)) return;
  if (status === "member" || status === "administrator") {
    const me = getBotUsername(ctx);
    await ctx.reply(groupHelpText(me)).catch(() => {});
  }
});

bot.command("find", async (ctx) => {
  const q = ctx.message.text.replace(/^\/find(@\w+)?\s*/i, "").trim();
  if (!q) {
    await ctx.reply("Напишите: /find Nike Air Force 1");
    return;
  }
  return handleProductQuery(ctx, q, { forceMode: "name" });
});

bot.command("pick", async (ctx) => {
  const q = ctx.message.text.replace(/^\/pick(@\w+)?\s*/i, "").trim();
  if (!q) {
    await ctx.reply(
      "Напишите критерии:\n/pick белые кроссовки 42 зима"
    );
    return;
  }
  return handleProductQuery(ctx, q, { forceMode: "pick" });
});

bot.command("birthdays", async (ctx) => {
  if (!shouldProcessMessage(ctx) && isGroupChat(ctx)) return;
  return sendCalendarMenu(ctx);
});

bot.command("seo", async (ctx) => {
  if (!shouldProcessMessage(ctx) && isGroupChat(ctx)) return;
  const q = ctx.message.text.replace(/^\/seo(@\w+)?\s*/i, "").trim();
  if (!q) {
    const { sendSeoHint } = require("./handlers/seoNews");
    return sendSeoHint(ctx);
  }
  return sendSeoArticle(ctx, q);
});

bot.command("news", async (ctx) => {
  if (!shouldProcessMessage(ctx) && isGroupChat(ctx)) return;
  const q = ctx.message.text.replace(/^\/news(@\w+)?\s*/i, "").trim();
  if (!q) {
    const { sendSeoHint } = require("./handlers/seoNews");
    return sendSeoHint(ctx);
  }
  return sendSeoArticle(ctx, q);
});

async function buildStatusText() {
  const sites = (config.referenceSites || []).filter(Boolean);
  const yandexLine = yandexConfigured()
    ? "Yandex: Wordstat + YandexGPT (SEO-новости) — OK"
    : "Yandex: задайте YANDEX_API_KEY и YANDEX_FOLDER_ID для /seo";

  return [
    catalogStatusText(),
    `Парсер: ${config.parserUrl}`,
    `Референс-сайты: ${sites.length ? sites.join(", ") : "не заданы (ai/data.js)"}`,
    aiStatusLine(),
    yandexLine,
  ].join("\n");
}

bot.command("status", async (ctx) => {
  await sendStatusReply(ctx, await buildStatusText());
});

bot.command("reload", async (ctx) => {
  if (isCatalogLoading()) {
    await ctx.reply("Каталог уже загружается. Дождитесь окончания (смотрите консоль).");
    return;
  }

  const wait = await ctx.reply("Запускаю обновление каталога в фоне…");

  startBackgroundCatalogLoad(true)
    .then(async (catalog) => {
      if ((config.referenceSites || []).filter(Boolean).length) {
        await collectStyleSamples();
      }
      await safeEdit(
        ctx,
        wait.message_id,
        `Каталог обновлён: ${catalog.offerCount || 0} позиций`
      );
    })
    .catch((err) => safeEdit(ctx, wait.message_id, `Не удалось обновить: ${err.message}`));
});

async function processPhoto(ctx, getFileId) {
  const ai = await checkAiReady();
  if (!ai.ok) {
    await ctx.reply(ai.error);
    return;
  }
  if (useOllama() && (!ai.visionOk || !ai.textOk)) {
    await ctx.reply(
      `Не хватает моделей Ollama.\n\n` +
        `ollama pull ${config.ollama.visionModel}\n` +
        `ollama pull ${config.ollama.textModel}`
    );
    return;
  }

  const catalog = getReadyCatalog();
  if (!catalog?.offers?.length) {
    if (isCatalogLoading()) {
      await ctx.reply("Идёт обновление каталога (/reload). Подождите окончания.");
      return;
    }
    await ctx.reply(
      "Каталог не найден локально. Один раз загрузите: /reload или start.bat пункт 3"
    );
    return;
  }

  const wait = await ctx.reply("Смотрю фото и подбираю стиль описания…");

  try {
    const fileLink = await ctx.telegram.getFileLink(getFileId(ctx));
    const result = await generateListing({
      imageUrl: fileLink.href,
      catalog,
    });

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      wait.message_id,
      undefined,
      formatReply(result),
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    console.error("[photo]", err);
    await safeEdit(ctx, wait.message_id, `Ошибка: ${err.message}`);
  }
}

bot.on("photo", (ctx) => {
  if (!shouldProcessMessage(ctx)) return;
  const photos = ctx.message.photo;
  const best = photos[photos.length - 1];
  return processPhoto(ctx, () => best.file_id);
});

bot.on("callback_query", async (ctx) => {
  try {
    await handleCallbackQuery(ctx);
  } catch (err) {
    console.error("[callback]", err.message);
    await ctx.answerCbQuery("Ошибка").catch(() => {});
  }
});

async function onTextMessage(ctx) {
  if (!shouldProcessMessage(ctx)) {
    if (isGroupChat(ctx)) {
      console.log("[group] пропуск (нет @бота; включите GROUP_ACCEPT_ALL=1 или Group Privacy off)");
    }
    return;
  }

  const text = extractQuery(ctx);
  if (!text || text.startsWith("/")) return;

  const menuResult = await handleMenuFlow(ctx, text);
  if (menuResult === true) return;
  if (menuResult === "status") {
    await sendStatusReply(ctx, await buildStatusText());
    return;
  }
  if (menuResult === "start") {
    const me = getBotUsername(ctx);
    if (isGroupChat(ctx)) return ctx.reply(groupHelpText(me));
    return sendWelcome(ctx, me);
  }

  if (isGroupChat(ctx)) {
    console.log("[group] запрос:", text.slice(0, 80));
  }

  return handleProductQuery(ctx, text);
}

bot.on(message("text"), onTextMessage);

bot.on("document", async (ctx) => {
  if (!shouldProcessMessage(ctx)) return;
  const mime = ctx.message.document?.mime_type || "";
  if (!mime.startsWith("image/")) {
    await ctx.reply("Пришлите фото кроссовок (как изображение, не файлом).");
    return;
  }
  return processPhoto(ctx, () => ctx.message.document.file_id);
});

async function main() {
  const ai = await checkAiReady();
  if (!ai.ok) {
    console.warn("[ai]", ai.error);
    if (useOllama()) {
      console.warn("[ai] Запустите Ollama и: node scripts/check-ollama.js");
    }
  } else if (useOllama()) {
    console.log(
      `[ai] Ollama OK — vision: ${config.ollama.visionModel}, text: ${config.ollama.textModel}`
    );
    if (!ai.visionOk || !ai.textOk) {
      console.warn(
        `[ai] Скачайте модели: ollama pull ${config.ollama.visionModel} && ollama pull ${config.ollama.textModel}`
      );
    }
  }

  const ready = getReadyCatalog();
  if (ready) {
    console.log(`Каталог локально: ${ready.offerCount} позиций (скачивание не требуется)`);
  } else {
    console.log("Каталог не найден. Загрузите вручную: /reload или start.bat пункт 3");
  }

  const webhook = await bot.telegram.getWebhookInfo();
  if (webhook.url) {
    console.warn("[tg] Был webhook, удаляем для polling:", webhook.url);
    await bot.telegram.deleteWebhook({ drop_pending_updates: true });
  }

  try {
    await bot.telegram.setMyCommands(BOT_COMMANDS);
  } catch (err) {
    console.warn("[tg] setMyCommands:", err.message);
  }

  await bot.launch({
    dropPendingUpdates: true,
    allowedUpdates: [
      "message",
      "edited_message",
      "my_chat_member",
      "callback_query",
    ],
  });

  const me = bot.botInfo?.username || config.telegram.username;
  console.log(`Бот @${me} запущен (polling)`);
  console.log(`Группа: /pick@${me} белые Nike 43`);
  console.log("Если в группе тишина: @BotFather → Group Privacy → Turn off");
  console.log("Или в .env: GROUP_ACCEPT_ALL=1");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
