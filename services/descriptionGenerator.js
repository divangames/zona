const config = require("../ai/config");
const { findSimilarOffers, isCatalogMatchWeak } = require("./productMatcher");
const {
  getStyleSamples,
  pickCatalogStyleExamples,
} = require("./styleReference");
const { searchProductOnWeb, formatWebBlock } = require("./webSearch");
const llm = require("./llmProvider");

const VISION_PROMPT = `Ты эксперт по кроссовкам. По фото определи бренд, модель, расцветку (colorway), пол (если видно), материалы.
Ответь ТОЛЬКО валидным JSON без markdown:
{"brand":"","model":"","colorway":"","gender":"","materials":"","keywords":["",""],"notes":""}`;

function buildStyleBlock(catalogExamples, siteSamples, similarOffers) {
  const parts = [];

  if (catalogExamples.length) {
    parts.push("=== Примеры из парсера (каталог) — СТИЛЬ и СТРУКТУРА описания ===");
    for (const ex of catalogExamples) {
      parts.push(`Название: ${ex.title}`);
      parts.push(`Описание: ${ex.description}`);
      parts.push("---");
    }
  }

  if (siteSamples.titles?.length || siteSamples.descriptions?.length) {
    parts.push("=== Примеры с референс-сайтов ===");
    for (const t of (siteSamples.titles || []).slice(0, 5)) {
      parts.push(`Название (сайт): ${t}`);
    }
    for (const d of (siteSamples.descriptions || []).slice(0, 5)) {
      parts.push(`Описание (сайт): ${d}`);
      parts.push("---");
    }
  }

  if (similarOffers.length) {
    parts.push("=== Похожие позиции в каталоге ===");
    for (const o of similarOffers) {
      parts.push(`Название: ${o.name}`);
      if (o.description) parts.push(`Описание: ${o.description}`);
      if (o.vendor) parts.push(`Бренд: ${o.vendor}`);
      parts.push("---");
    }
  }

  return parts.join("\n");
}

function buildCatalogPrompt(styleBlock, vision) {
  return {
    system: `Ты Zona — копирайтер магазина кроссовок. Пиши на русском.
Сгенерируй название и описание по фото, СТРОГО в том же стиле, тоне, структуре и длине, что в примерах каталога и сайтов.
Не выдумывай характеристики, которых нет на фото или в похожих карточках.
Без markdown и эмодзи.
JSON: {"title":"...","description":"..."}`,
    user: `Данные с фото (JSON): ${JSON.stringify(vision, null, 0)}

${styleBlock}

Сгенерируй title и description.`,
    maxTokens: 900,
  };
}

function buildWebPrompt(styleBlock, vision, webData) {
  const webBlock = formatWebBlock(webData);

  return {
    system: `Ты Zona — копирайтер магазина кроссовок. Пиши на русском.
Товара НЕТ в нашем каталоге — карточку собираем по интернету.

ПРАВИЛА:
1. Название (title) — точное коммерческое название модели из интернет-данных и распознавания фото.
2. Описание (description) — РАЗВЁРНУТОЕ, как в примерах каталога: 2–4 абзаца или блоки, не короткая подпись.
3. Материалы, подошва, технологии, сезон, посадка — ТОЛЬКО если есть в блоке "Данные из интернета" или на фото.
4. Стиль, тон, порядок блоков — как в примерах каталога (образцах стиля).
5. Не выдумывай факты. Если данных мало — опиши только подтверждённое.
Без markdown и эмодзи.
JSON: {"title":"...","description":"..."}`,
    user: `Распознавание фото (JSON): ${JSON.stringify(vision, null, 0)}

=== Данные из интернета ===
${webBlock || "Источники не загрузились — опирайся на фото и укажи только очевидное."}

=== Образцы стиля каталога (только стиль, не копируй чужие товары) ===
${styleBlock}

Сгенерируй title и полное description.`,
    maxTokens: config.webSearch?.descriptionMaxTokens || 1800,
  };
}

async function analyzePhoto(imageUrl) {
  const raw = await llm.callLlm(() => llm.visionJson(imageUrl, VISION_PROMPT));
  return llm.parseJsonFromText(raw, {
    brand: "",
    model: "",
    colorway: "",
    keywords: [],
    notes: raw.slice(0, 200),
  });
}

async function generateListing({ imageUrl, catalog }) {
  const vision = await analyzePhoto(imageUrl);
  const similarOffers = findSimilarOffers(catalog, vision, 5);
  const catalogExamples = pickCatalogStyleExamples(
    catalog,
    config.style.catalogSamplesForPrompt || 6
  );
  const siteSamples = await getStyleSamples();
  const styleBlock = buildStyleBlock(catalogExamples, siteSamples, similarOffers);

  const useWeb =
    config.webSearch?.enabled !== false && isCatalogMatchWeak(catalog, vision);

  let webData = null;
  if (useWeb) {
    console.log("[zona] В каталоге нет совпадения — поиск в интернете");
    webData = await searchProductOnWeb(vision);
  }

  const prompt = useWeb
    ? buildWebPrompt(styleBlock, vision, webData)
    : buildCatalogPrompt(styleBlock, vision);

  const raw = await llm.callLlm(() =>
    llm.textJson(prompt.system, prompt.user, { maxTokens: prompt.maxTokens })
  );

  const listing = llm.parseJsonFromText(raw, {
    title: "Кроссовки",
    description: raw.trim(),
  });

  return {
    vision,
    similarCount: similarOffers.length,
    usedWebSearch: useWeb,
    webSources: webData?.snippets?.length || 0,
    listing: {
      title: String(listing.title || "").trim(),
      description: String(listing.description || "").trim(),
    },
  };
}

module.exports = { analyzePhoto, generateListing };
