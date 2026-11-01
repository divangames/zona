const { Input } = require("telegraf");
const { formatPrice } = require("./productSearch");
const { fetchProductImageBuffer } = require("./imageFetch");
const {
  offerInlineKeyboard,
  pickAgainInlineKeyboard,
} = require("../bot/ui/keyboards");
const { setLastQuery } = require("../bot/ui/userSession");

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function trimDescription(text, max = 450) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

function buildCaption(offer, index) {
  const num = index != null ? `${index}. ` : "";
  const name = escapeHtml(offer.name || "Товар");
  const desc = escapeHtml(trimDescription(offer.description));
  const price = escapeHtml(formatPrice(offer.price));
  const brand = offer.vendor ? `\n🏷 ${escapeHtml(offer.vendor)}` : "";

  let caption = `<b>${num}${name}</b>${brand}\n\n${desc || "—"}\n\n💰 <b>${price}</b>`;

  if (offer.url) {
    caption += `\n<a href="${escapeHtml(offer.url)}">Ссылка на товар</a>`;
  }

  if (caption.length > 1020) {
    caption = caption.slice(0, 1017) + "…";
  }

  return caption;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function cardExtra(offer, { showPickAgain } = {}) {
  const inline = offerInlineKeyboard(offer);
  const rows = inline?.reply_markup?.inline_keyboard || [];
  if (showPickAgain) {
    const again = pickAgainInlineKeyboard().reply_markup.inline_keyboard[0];
    rows.push(again);
  }
  if (!rows.length) return {};
  return { reply_markup: { inline_keyboard: rows } };
}

async function sendOfferCard(ctx, offer, index, extraOpts = {}) {
  const caption = buildCaption(offer, index);
  const image = await fetchProductImageBuffer(offer);
  const extra = cardExtra(offer, extraOpts);

  if (image?.buffer) {
    try {
      await ctx.replyWithPhoto(Input.fromBuffer(image.buffer, "product.jpg"), {
        caption,
        parse_mode: "HTML",
        ...extra,
      });
      return;
    } catch (err) {
      console.warn("[card] Отправка файла не удалась:", err.message);
    }
  } else if (offer.pictures?.length) {
    console.warn("[card] Не удалось скачать фото с сайта, только текст");
  }

  await ctx.reply(caption, {
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...extra,
  });
}

async function sendOfferCards(ctx, offers, { title, searchQuery, mode } = {}) {
  if (!offers.length) {
    await ctx.reply("Ничего не найдено в каталоге. Уточните запрос или /reload.");
    return;
  }

  if (title) await ctx.reply(title);

  const showPickAgain = mode === "pick" && searchQuery && offers.length > 0;
  if (showPickAgain && ctx.from?.id) {
    setLastQuery(ctx.from.id, searchQuery);
  }

  for (let i = 0; i < offers.length; i++) {
    const isLast = i === offers.length - 1;
    await sendOfferCard(ctx, offers[i], offers.length > 1 ? i + 1 : null, {
      showPickAgain: showPickAgain && isLast,
    });
    if (i < offers.length - 1) await sleep(400);
  }
}

module.exports = { sendOfferCards, sendOfferCard, buildCaption };
