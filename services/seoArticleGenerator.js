const config = require("../ai/config");
const { getReadyCatalog } = require("./catalogLoader");
const { searchOffers } = require("./productSearch");
const {
  fetchTopRequests,
  pickSeoKeywords,
  formatWordstatReport,
  isFootwearRelevant,
} = require("./yandexWordstat");
const { completeText } = require("./yandexGpt");
const { fetchProductImageBuffer } = require("./imageFetch");
const { yandexConfigured } = require("./yandexCloud");
const { sanitizeTelegramHtml } = require("../bot/utils/telegramHtml");
const {
  isRoundupTopic,
  parseRoundupCount,
  pickDiverseRoundupOffers,
  fetchRoundupReferenceStyle,
  generateRoundupArticle,
} = require("./seoRoundup");

const SYSTEM_PROMPT = `Ты SEO-копирайтер интернет-магазина кроссовок (стиль outmaxshop.ru, 2026).
Пиши на русском: живой журнальный тон, истории, сравнения моделей, практические советы.

ГЛАВНОЕ ПРАВИЛО SEO:
В тексте ДОСЛОВНО должны встретиться КАЖДАЯ фраза из блока «ОБЯЗАТЕЛЬНЫЕ ФРАЗЫ ИЗ ВОРДСТАТ» (все про кроссовки/обувь).
Высокочастотные — в заголовке <b>, во вступлении и в подзаголовках.
ЗАПРЕЩЕНО: шины, автомобили, резина, пылесосы, чемоданы, кроссворды — даже если слово «лето» или «кросс» похоже.
Только кроссовки, кеды, бренды обуви, стиль, комфорт, каталог магазина.

Структура:
- Цепляющий заголовок с эмодзи
- Вступление 2–3 абзаца
- 4–5 разделов <b>Подзаголовок</b>
- <b>Заключение</b>
- <b>Часто задаваемые вопросы</b> (4–5 пар вопрос-ответ)
- Мягкий призыв в каталог (без выдуманных цен)

Формат — только Telegram HTML:
- Только теги: <b>, <i>, <a href="url">
- ЗАПРЕЩЕНО: DOCTYPE, html, body, div, p, h1-h6, markdown
- Абзацы через пустую строку
- Длина 4000–6500 символов`;

function buildMandatoryKeywordsBlock(keywords, topic) {
  if (!keywords?.length) {
    return `Тема: ${topic}\nОБЯЗАТЕЛЬНЫЕ ФРАЗЫ: нет данных Вордстат — используй тему и синонимы про кроссовки.`;
  }
  const lines = keywords.map((k, i) => {
    const freq = k.count > 0 ? `${k.count} показов/мес` : "частотность уточняется";
    return `${i + 1}. «${k.phrase}» — ${freq}`;
  });
  return (
    `Тема статьи: ${topic}\n\n` +
    `ОБЯЗАТЕЛЬНЫЕ ФРАЗЫ ИЗ ВОРДСТАТ (каждая — минимум 1 раз в тексте дословно):\n` +
    lines.join("\n") +
    `\n\nПеред ответом проверь: все ${keywords.length} фраз присутствуют.`
  );
}

function buildCatalogBlock(offers) {
  if (!offers?.length) {
    return "Каталог: товаров по теме нет — не выдумывай ссылки.";
  }
  const lines = offers.map((o, i) => {
    return `${i + 1}. ${o.name} — ${o.price || "?"} ₽ — ${o.url || ""}`;
  });
  return `Товары в каталоге (упомяни 1–2):\n${lines.join("\n")}`;
}

function phraseInText(text, phrase) {
  const t = String(text || "").toLowerCase();
  const p = String(phrase || "").toLowerCase().trim();
  if (!p) return true;
  return t.includes(p);
}

function findMissingKeywords(articleHtml, keywords) {
  const plain = articleHtml.replace(/<[^>]+>/g, " ");
  return (keywords || []).filter((k) => !phraseInText(plain, k.phrase));
}

async function injectMissingKeywords(articleHtml, missing, topic) {
  if (!missing.length) return articleHtml;

  const list = missing.map((k) => `«${k.phrase}»`).join(", ");
  const patch = await completeText(
    "Допиши блок HTML для Telegram про КРОССОВКИ. Включи фразы дословно. Только <b> и <i>. Без шин, авто, пылесосов.",
    `Тема: ${topic}\n\nФразы про обувь: ${list}\n\nБлок <b>Что важно знать</b> (2–3 абзаца) — только кроссовки и летний стиль.`,
    { maxTokens: 1200, temperature: 0.4 }
  );
  return `${articleHtml}\n\n${sanitizeTelegramHtml(patch)}`;
}

async function findCatalogOffers(topic, limit = 3) {
  const catalog = getReadyCatalog();
  if (!catalog?.offers?.length) return [];
  let offers = searchOffers(catalog, topic, { mode: "name", limit });
  if (!offers.length) {
    offers = searchOffers(catalog, topic, { mode: "pick", limit });
  }
  return offers.slice(0, limit);
}

async function generateClassicArticle(subject, relevantKeys) {
  const offers = await findCatalogOffers(subject, 3);
  const userPrompt = [
    buildMandatoryKeywordsBlock(relevantKeys, subject),
    "",
    buildCatalogBlock(offers),
    "",
    "Напиши полную SEO-новость. Каждая фраза из списка обязательна в тексте.",
  ].join("\n");

  let articleHtml = await completeText(SYSTEM_PROMPT, userPrompt, {
    maxTokens: config.yandex?.articleMaxTokens || 8000,
    temperature: 0.5,
  });
  articleHtml = sanitizeTelegramHtml(articleHtml);

  const missing = findMissingKeywords(articleHtml, relevantKeys).filter((k) =>
    isFootwearRelevant(k.phrase, subject)
  );
  if (missing.length) {
    console.log(
      `[seo] Дописываем ${missing.length} фраз:`,
      missing.map((k) => k.phrase).join(", ")
    );
    articleHtml = await injectMissingKeywords(
      articleHtml,
      missing.slice(0, 6),
      subject
    );
  }

  let photoBuffer = null;
  if (offers[0]) {
    const img = await fetchProductImageBuffer(offers[0]);
    photoBuffer = img?.buffer || null;
  }

  return {
    format: "article",
    articleHtml,
    offers,
    photoBuffer,
    productCards: null,
    introHtml: null,
  };
}

async function generateSeoArticle(topic) {
  const subject = String(topic || "").trim();
  if (subject.length < 2) {
    throw new Error("Укажите тему: модель, бренд или новость про кроссовки");
  }

  if (!yandexConfigured()) {
    throw new Error(
      "Для SEO-новостей нужны YANDEX_API_KEY и YANDEX_FOLDER_ID в .env"
    );
  }

  let wordstat = { phrase: subject, keywords: [], top: [] };
  try {
    wordstat = await fetchTopRequests(subject, {
      numPhrases: config.yandex?.wordstatNumPhrases || 30,
      regions: config.yandex?.wordstatRegions || ["225"],
    });
    console.log(
      `[seo] Wordstat: ${wordstat.keywords.length} фраз, API: ${wordstat.apiPhrase || subject}`
    );
  } catch (err) {
    console.warn("[seo] Wordstat:", err.message);
  }

  const seoKeys = pickSeoKeywords(wordstat, 15);
  const relevantKeys = seoKeys.filter((k) => isFootwearRelevant(k.phrase, subject));
  const wordstatReport = formatWordstatReport(subject, relevantKeys);

  const roundup = isRoundupTopic(subject);
  let body;

  if (roundup) {
    const count = parseRoundupCount(subject);
    const offers = pickDiverseRoundupOffers(subject, count);
    if (!offers.length) {
      throw new Error(
        "В каталоге не нашлось разных моделей для подборки. Уточните тему (бренд, сезон, цвет)."
      );
    }
    console.log(
      `[seo] Подборка топ-${offers.length}:`,
      offers.map((o) => o.name).join(" | ")
    );
    const refStyle = await fetchRoundupReferenceStyle();
    body = await generateRoundupArticle({
      topic: subject,
      relevantKeys,
      offers,
      refStyle,
    });
    body.format = "roundup";
  } else {
    body = await generateClassicArticle(subject, relevantKeys);
  }

  const fullText = body.articleHtml || "";
  const usedCount = relevantKeys.filter((k) =>
    phraseInText(fullText, k.phrase)
  ).length;

  return {
    topic: subject,
    format: body.format,
    articleHtml: fullText,
    introHtml: body.introHtml,
    productCards: body.productCards,
    keywords: relevantKeys,
    wordstatReport,
    keywordsUsed: usedCount,
    keywordsTotal: relevantKeys.length,
    offers: body.offers || [],
    photoBuffer: body.photoBuffer,
    wordstatOk: wordstat.keywords.length > 0,
    roundupSize: body.productCards?.length || 0,
  };
}

module.exports = {
  generateSeoArticle,
  yandexConfigured,
  isRoundupTopic,
};
