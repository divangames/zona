const {
  searchOffers,
  detectSearchMode,
} = require("../../services/productSearch");
const { sendOfferCards } = require("../../services/telegramProducts");
const { getReadyCatalog, isCatalogLoading } = require("../../services/catalogLoader");
const config = require("../../ai/config");

function getCatalogOrReply(ctx) {
  const catalog = getReadyCatalog();
  if (catalog?.offers?.length) return catalog;

  if (isCatalogLoading()) {
    ctx.reply("Идёт обновление каталога (/reload). Подождите окончания.");
    return null;
  }

  ctx.reply("Каталог не найден. Один раз: /reload или start.bat пункт 3");
  return null;
}

async function handleProductQuery(ctx, text, options = {}) {
  const catalog = getCatalogOrReply(ctx);
  if (!catalog) return;

  const query = text.trim();
  if (query.length < 2) {
    await ctx.reply("Напишите название или критерии: цвет, размер, сезон.");
    return;
  }

  let mode = options.forceMode || detectSearchMode(query);
  let limit =
    mode === "pick"
      ? config.search?.pickLimit || 3
      : config.search?.nameLimit || 1;

  const wait = await ctx.reply(
    mode === "pick" ? "Подбираю 3 варианта…" : "Ищу в каталоге…"
  );

  let offers = searchOffers(catalog, query, { mode, limit });

  if (!offers.length && mode === "name") {
    offers = searchOffers(catalog, query, { mode: "pick", limit: 3 });
    if (offers.length) mode = "pick";
  }

  try {
    await ctx.telegram.deleteMessage(ctx.chat.id, wait.message_id);
  } catch {
    /* ignore */
  }

  const title =
    mode === "pick"
      ? `✅ Подбор по запросу: «${query}»`
      : offers.length
        ? `✅ Найдено: «${query}»`
        : null;

  await sendOfferCards(ctx, offers, {
    title,
    mode,
    searchQuery: query,
  });
}

module.exports = { handleProductQuery };
