const fs = require("fs");
const axios = require("axios");
const cheerio = require("cheerio");
const config = require("../ai/config");
const { getReadyCatalog } = require("./catalogLoader");
const {
  searchOffers,
  searchOffersRanked,
  parseCriteria,
  formatPrice,
} = require("./productSearch");
const { completeText } = require("./yandexGpt");
const { fetchProductImageBuffer } = require("./imageFetch");
const { sanitizeTelegramHtml } = require("../bot/utils/telegramHtml");
const { extractFromHtml } = require("./styleReference");
const {
  isSneakerCatalogOffer,
  normalizeSneakerSearchTopic,
  sneakerCatalogView,
} = require("./sneakerCatalog");

const ROUNDUP_TOPIC_RE =
  /(?:топ[\s-]*\d+|топ\s+\d+|\d+\s+лучших|подборк|подбор\b|лучшие\s+\d+|рейтинг\s+\d+|кроссовк[иа]?\s+на\s+(?:лето|зиму|весну|осень|май|июн|июл|август)|обувь\s+на\s+лето|летн(?:ие|яя|их)\s+кросс)/i;

const ROUNDUP_SYSTEM = `Ты редактор подборок кроссовок outmaxshop.ru (2026).
Пиши как в журнальных топах: живо, по делу, без воды.

Формат — только Telegram HTML: <b>, <i>, <a href="url">.
Без markdown, без DOCTYPE/html/div.

ОБЯЗАТЕЛЬНО: все фразы из Вордстат — дословно во вступлении и подзаголовках.
ЗАПРЕЩЕНО: шины, авто, пылесосы, чемоданы, кроссворды, одежда (футболки, шорты, куртки, носки).
Пиши ТОЛЬКО про кроссовки из списка моделей — не выдумывай другие товары.`;

function isRoundupTopic(topic) {
  return ROUNDUP_TOPIC_RE.test(String(topic || ""));
}

function parseRoundupCount(topic) {
  const t = String(topic || "");
  const m =
    t.match(/топ[\s-]*(\d{1,2})/i) ||
    t.match(/топ\s+(\d{1,2})/i) ||
    t.match(/(\d{1,2})\s+лучших/i) ||
    t.match(/подборк[аи]\s+(\d{1,2})/i);
  const n = parseInt(m?.[1], 10);
  const max = config.seo?.maxRoundupSize || 10;
  const def = config.seo?.defaultRoundupSize || 5;
  if (n >= 3 && n <= max) return n;
  if (/топ[\s-]*10|топ\s*10|топ-10/i.test(t)) return 10;
  if (/топ[\s-]*5|топ\s*5|топ-5/i.test(t)) return 5;
  return def;
}

function parsePriceMax(topic) {
  const m = String(topic || "").match(
    /до\s*([\d\s]{3,7})\s*(?:р|руб|₽)/i
  );
  if (!m) return null;
  const n = parseInt(m[1].replace(/\s/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function offerPriceNumber(offer) {
  const n = Number(String(offer?.price || "").replace(/\s/g, ""));
  return Number.isFinite(n) ? n : null;
}

function modelKey(offer) {
  const name = String(offer?.name || "").toLowerCase();
  const vendor = String(offer?.vendor || "").toLowerCase();
  const core = name
    .replace(vendor, "")
    .replace(/[^a-zа-яё0-9\s]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !/^(кроссовки|мужские|женские|unisex)$/i.test(w))
    .slice(0, 4)
    .join(" ");
  return `${vendor}|${core}`.slice(0, 80);
}

function pickDiverseRoundupOffers(topic, count) {
  const catalog = sneakerCatalogView(getReadyCatalog());
  if (!catalog?.offers?.length) return [];

  const priceMax = parsePriceMax(topic);
  const searchText = normalizeSneakerSearchTopic(topic);

  let ranked = searchOffersRanked(catalog, searchText, {
    mode: "pick",
    limit: count * 40,
  }).filter((row) => isSneakerCatalogOffer(row.offer));

  if (ranked.length < count * 2) {
    const extra = searchOffersRanked(catalog, searchText, {
      mode: "name",
      limit: count * 25,
    }).filter((row) => isSneakerCatalogOffer(row.offer));
    const seen = new Set(ranked.map((x) => x.offer.id));
    for (const row of extra) {
      if (!seen.has(row.offer.id)) ranked.push(row);
    }
    ranked.sort((a, b) => b.score - a.score);
  }

  const seenId = new Set();
  ranked = ranked.filter((row) => {
    if (seenId.has(row.offer.id)) return false;
    seenId.add(row.offer.id);
    return true;
  });

  const seenModel = new Set();
  const brandCount = new Map();
  const picked = [];
  const maxPerBrand = Math.max(2, Math.ceil(count / 4));

  const tryPick = (rows, strictBrand) => {
    for (const { offer } of rows) {
      if (picked.length >= count) break;
      if (!isSneakerCatalogOffer(offer)) continue;
      if (!offer?.pictures?.length) continue;
      if (priceMax != null) {
        const p = offerPriceNumber(offer);
        if (p != null && p > priceMax) continue;
      }
      const key = modelKey(offer);
      if (seenModel.has(key)) continue;
      const brand = String(offer.vendor || "other").toLowerCase();
      if (strictBrand && (brandCount.get(brand) || 0) >= maxPerBrand) continue;

      seenModel.add(key);
      brandCount.set(brand, (brandCount.get(brand) || 0) + 1);
      picked.push(offer);
    }
  };

  tryPick(ranked, true);
  if (picked.length < count) tryPick(ranked, false);
  if (picked.length < count) {
    const fallback = searchOffers(catalog, searchText, {
      mode: "name",
      limit: count * 5,
    }).filter(isSneakerCatalogOffer);
    for (const offer of fallback) {
      if (picked.length >= count) break;
      const key = modelKey(offer);
      if (seenModel.has(key)) continue;
      seenModel.add(key);
      picked.push(offer);
    }
  }

  return picked.slice(0, count);
}

async function fetchRoundupReferenceStyle() {
  const cacheFile = config.paths.seoRoundupRefs;
  const urls = config.seo?.roundupReferences || [];
  if (!urls.length) return { headings: [], intros: [] };

  try {
    if (fs.existsSync(cacheFile)) {
      const cached = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
      const age = Date.now() - new Date(cached.loadedAt || 0).getTime();
      if (age < 7 * 24 * 60 * 60 * 1000 && cached.headings?.length) {
        return cached;
      }
    }
  } catch {
    /* refresh */
  }

  const headings = [];
  const intros = [];

  for (const url of urls) {
    try {
      const res = await axios.get(url, {
        timeout: 25000,
        headers: { "User-Agent": "ZonaDeckBot/1.0" },
      });
      const $ = cheerio.load(res.data);
      $("h2, h3").each((_, el) => {
        const t = $(el).text().trim();
        if (
          t.length >= 8 &&
          t.length < 120 &&
          /nike|adidas|new balance|asics|puma|reebok|salomon|jordan|кросс|обув/i.test(
            t
          )
        ) {
          headings.push(t);
        }
      });
      const samples = extractFromHtml(res.data, url);
      for (const s of samples) {
        if (s.type === "description" && s.text.length >= 80 && s.text.length <= 500) {
          intros.push(s.text);
        }
      }
    } catch (err) {
      console.warn("[seo-roundup] ref", url, err.message);
    }
  }

  const payload = {
    loadedAt: new Date().toISOString(),
    urls,
    headings: [...new Set(headings)].slice(0, 24),
    intros: [...new Set(intros)].slice(0, 8),
  };

  try {
    fs.mkdirSync(require("path").dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(payload, null, 2), "utf8");
  } catch {
    /* ignore */
  }

  return payload;
}

function buildReferenceBlock(style) {
  const h = (style.headings || []).slice(0, 6).join("\n• ");
  const p = (style.intros || [])[0] || "";
  return (
    `СТИЛЬ РЕФЕРЕНСОВ outmaxshop.ru (подборки топ-N):\n` +
    `• Заголовок h1 — яркий, с годом/сезоном\n` +
    `• На каждую модель: <b>название модели</b> как подзаголовок, 2–3 предложения (материалы, стиль, с чем носить)\n` +
    `• Разные бренды и модели, не повторять одну и ту же пару\n` +
    (h ? `Примеры подзаголовков:\n• ${h}\n` : "") +
    (p ? `Пример абзаца о модели:\n${p.slice(0, 280)}\n` : "")
  );
}

function buildProductsDataBlock(offers) {
  return offers
    .map((o, i) => {
      const desc = (o.description || "").replace(/\s+/g, " ").slice(0, 320);
      return (
        `${i + 1}. ${o.name}\n` +
        `   Цена: ${formatPrice(o.price)}\n` +
        `   URL: ${o.url || ""}\n` +
        `   Бренд: ${o.vendor || "—"}\n` +
        `   Описание из каталога: ${desc || "—"}`
      );
    })
    .join("\n\n");
}

function splitProductBlocks(text, expected) {
  const raw = String(text || "").trim();
  const byMarker = raw.split(/\n---+\n/).map((s) => s.trim()).filter(Boolean);
  if (byMarker.length >= expected) return byMarker.slice(0, expected);

  const byHeading = raw.split(/(?=<b>\d+\.)/i).map((s) => s.trim()).filter(Boolean);
  if (byHeading.length >= expected) return byHeading.slice(0, expected);

  return byMarker.length ? byMarker : [raw];
}

function ensureProductLink(block, offer, index) {
  let html = sanitizeTelegramHtml(block);
  const url = offer?.url || "";
  const price = formatPrice(offer?.price);
  const title = offer?.name || `Модель ${index + 1}`;

  if (!html.includes("<b>")) {
    html = `<b>${index + 1}. ${title}</b>\n\n${html}`;
  }
  if (url && !html.includes(url)) {
    html += `\n\n<a href="${url}">В каталоге — ${price}</a>`;
  }
  return html;
}

async function generateRoundupArticle({
  topic,
  relevantKeys,
  offers,
  refStyle,
}) {
  const count = offers.length;
  const refBlock = buildReferenceBlock(refStyle);
  const productsBlock = buildProductsDataBlock(offers);
  const keysBlock =
    relevantKeys?.length > 0
      ? relevantKeys.map((k, i) => `${i + 1}. «${k.phrase}»`).join("\n")
      : `Тема: ${topic}`;

  const introFooter = await completeText(
    ROUNDUP_SYSTEM,
    [
      refBlock,
      "",
      `Тема подборки: ${topic}`,
      `Количество моделей: ${count}`,
      "",
      `ВЧ-фразы Вордстат (встроить во вступление):\n${keysBlock}`,
      "",
      "Напиши ТОЛЬКО:",
      "1) Заголовок <b> с эмодзи",
      "2) Вступление 2–3 абзаца (все ВЧ-фразы)",
      "3) Короткий блок <b>Как мы выбирали</b> — 1 абзац",
      "4) В конце: <b>Заключение</b> + <b>Часто задаваемые вопросы</b> (4 вопроса) + призыв в каталог",
      "",
      "НЕ описывай отдельные модели — их дам отдельно.",
    ].join("\n"),
    { maxTokens: 3500, temperature: 0.45 }
  );

  const productTexts = await completeText(
    ROUNDUP_SYSTEM,
    [
      refBlock,
      "",
      `Тема: ${topic}`,
      "",
      `МОДЕЛИ (ровно ${count} блоков, разделитель --- между блоками):`,
      productsBlock,
      "",
      "Для КАЖДОЙ модели отдельный блок:",
      "<b>N. Точное название из списка</b>",
      "2–3 предложения: силуэт, материалы, комфорт, с чем носить летом/в городе",
      "<a href=\"URL из списка\">В каталоге — цена</a>",
      "",
      "Между блоками строка ---",
      "Не дублируй одну модель. Не выдумывай URL и цены — только из списка.",
      "Это только КРОССОВКИ — не описывай одежду, сланцы, шорты, носки.",
    ].join("\n"),
    { maxTokens: config.yandex?.articleMaxTokens || 8000, temperature: 0.5 }
  );

  const blocks = splitProductBlocks(productTexts, count);
  const productCards = [];

  for (let i = 0; i < offers.length; i++) {
    const offer = offers[i];
    const blurbHtml = ensureProductLink(blocks[i] || "", offer, i);
    let photoBuffer = null;
    try {
      const img = await fetchProductImageBuffer(offer);
      photoBuffer = img?.buffer || null;
    } catch {
      /* ignore */
    }
    productCards.push({ offer, blurbHtml, photoBuffer });
  }

  const introHtml = sanitizeTelegramHtml(introFooter);
  const productsHtml = productCards.map((c) => c.blurbHtml).join("\n\n");
  const articleHtml = `${introHtml}\n\n${productsHtml}`;

  return { introHtml, productCards, articleHtml };
}

module.exports = {
  isRoundupTopic,
  parseRoundupCount,
  pickDiverseRoundupOffers,
  fetchRoundupReferenceStyle,
  generateRoundupArticle,
};
