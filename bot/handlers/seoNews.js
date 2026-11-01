const { Input } = require("telegraf");
const {
  generateSeoArticle,
  yandexConfigured,
} = require("../../services/seoArticleGenerator");
const { splitTelegramHtml, TG_HTML_LIMIT } = require("../utils/splitMessage");
const { sanitizeTelegramHtml, htmlToPlain } = require("../utils/telegramHtml");
const { isGroupChat } = require("../utils/groupMessage");

const CHUNK_LIMIT = 3600;
const CAPTION_LIMIT = 1000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function replyHtmlSafe(ctx, text) {
  const safe = sanitizeTelegramHtml(text);
  if (!safe) return;
  try {
    await ctx.reply(safe, {
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
  } catch (err) {
    if (!/can't parse entities/i.test(err.message)) throw err;
    console.warn("[seo] HTML fallback plain");
    await ctx.reply(htmlToPlain(safe));
  }
}

function truncateCaption(html) {
  const safe = sanitizeTelegramHtml(html);
  if (safe.length <= CAPTION_LIMIT) return safe;
  const plain = htmlToPlain(safe);
  return plain.length <= CAPTION_LIMIT
    ? plain
    : `${plain.slice(0, CAPTION_LIMIT - 1)}…`;
}

function photoCaptionFromArticle(html) {
  const first = String(html || "").split(/\n\n+/)[0] || "";
  const clean = first.replace(/<[^>]+>/g, "").trim();
  if (clean.length <= 200) return sanitizeTelegramHtml(first.slice(0, 1020));
  return sanitizeTelegramHtml(`${clean.slice(0, 180)}…`);
}

async function sendArticleParts(ctx, articleHtml, photoBuffer) {
  const parts = splitTelegramHtml(articleHtml, CHUNK_LIMIT);
  const total = parts.length;

  if (photoBuffer && !isGroupChat(ctx)) {
    await ctx
      .replyWithPhoto(Input.fromBuffer(photoBuffer, "sneaker.jpg"), {
        caption: photoCaptionFromArticle(articleHtml),
        parse_mode: "HTML",
      })
      .catch(async () => {
        await ctx.replyWithPhoto(Input.fromBuffer(photoBuffer, "sneaker.jpg"));
      });
  }

  for (let i = 0; i < total; i++) {
    let chunk = parts[i];
    if (total > 1) {
      chunk = `<i>📄 Часть ${i + 1} из ${total}</i>\n\n${chunk}`;
    }
    await replyHtmlSafe(ctx, chunk);
    if (i < total - 1) await sleep(450);
  }
}

async function sendRoundupCards(ctx, productCards) {
  const total = productCards.length;
  for (let i = 0; i < total; i++) {
    const { offer, blurbHtml, photoBuffer } = productCards[i];
    const caption = truncateCaption(blurbHtml);
    const label = `<i>👟 ${i + 1} из ${total}</i>\n\n${caption}`;

    if (photoBuffer && !isGroupChat(ctx)) {
      await ctx
        .replyWithPhoto(Input.fromBuffer(photoBuffer, `sneaker-${i + 1}.jpg`), {
          caption: label,
          parse_mode: "HTML",
        })
        .catch(async () => {
          await replyHtmlSafe(ctx, label);
        });
    } else {
      await replyHtmlSafe(ctx, label);
    }
    if (i < total - 1) await sleep(500);
  }
}

async function sendRoundupArticle(ctx, result) {
  await replyHtmlSafe(ctx, result.wordstatReport);

  const introParts = splitTelegramHtml(result.introHtml || "", CHUNK_LIMIT);
  for (let i = 0; i < introParts.length; i++) {
    let chunk = introParts[i];
    if (introParts.length > 1) {
      chunk = `<i>📄 Вступление ${i + 1}/${introParts.length}</i>\n\n${chunk}`;
    } else {
      chunk = `<i>📋 Подборка — ${result.roundupSize} моделей</i>\n\n${chunk}`;
    }
    await replyHtmlSafe(ctx, chunk);
    if (i < introParts.length - 1) await sleep(400);
  }

  await sendRoundupCards(ctx, result.productCards || []);

  if (result.keywordsTotal > 0) {
    await replyHtmlSafe(
      ctx,
      `<i>✅ В подборке: ${result.keywordsUsed} из ${result.keywordsTotal} ВЧ-фраз · ${result.roundupSize} разных моделей из каталога</i>`
    );
  }
}

async function sendSeoArticle(ctx, topic) {
  if (!yandexConfigured()) {
    return ctx.reply(
      "SEO-новости: нужны YANDEX_API_KEY и YANDEX_FOLDER_ID в .env на сервере."
    );
  }

  const wait = await ctx.reply(
    "📰 Вордстат → каталог → пишу материал…\n(1–3 мин)"
  );

  try {
    const result = await generateSeoArticle(topic);

    try {
      await ctx.telegram.deleteMessage(ctx.chat.id, wait.message_id);
    } catch {
      /* ignore */
    }

    if (isGroupChat(ctx)) {
      await ctx.reply(htmlToPlain(result.wordstatReport));
      const plainParts = splitTelegramHtml(
        htmlToPlain(result.articleHtml),
        CHUNK_LIMIT
      );
      for (const p of plainParts) {
        await ctx.reply(p);
        await sleep(400);
      }
      return;
    }

    if (result.format === "roundup" && result.productCards?.length) {
      await sendRoundupArticle(ctx, result);
      return;
    }

    await replyHtmlSafe(ctx, result.wordstatReport);
    await sendArticleParts(ctx, result.articleHtml, result.photoBuffer);

    if (result.keywordsTotal > 0) {
      await replyHtmlSafe(
        ctx,
        `<i>✅ В статье: ${result.keywordsUsed} из ${result.keywordsTotal} ВЧ-фраз из Вордстата</i>`
      );
    }
  } catch (err) {
    console.error("[seo]", err);
    await ctx.telegram
      .editMessageText(
        ctx.chat.id,
        wait.message_id,
        undefined,
        `Ошибка: ${err.message}`
      )
      .catch(() => ctx.reply(`Ошибка: ${err.message}`));
  }
}

async function sendSeoHint(ctx) {
  const text =
    "📰 <b>SEO-новость</b>\n\n" +
    "<b>Подборка топ-N:</b> разные модели из каталога, фото + описание каждой (как outmaxshop.ru).\n" +
    "Пример: <code>/seo топ-10 кроссовок на лето 2026</code>\n\n" +
    "<b>Обычная статья:</b> одна тема/модель.\n" +
    "Пример: <code>/seo Salomon XT-6</code>\n\n" +
    "Сначала отчёт Вордстат, затем текст частями.";

  if (isGroupChat(ctx)) {
    return ctx.reply(text.replace(/<[^>]+>/g, ""));
  }
  return ctx.reply(text, { parse_mode: "HTML" });
}

module.exports = {
  sendSeoArticle,
  sendSeoHint,
  yandexConfigured,
};
