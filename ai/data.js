/**
 * Конфигурация бота ZonaDeck.
 * Секреты (токен) лучше задавать в .env — см. README.
 */
module.exports = {
  telegram: {
    username: "ZonaDeck_bot",
    botUrl: "https://t.me/ZonaDeck_bot",
  },

  /** YML/XML-каталог товаров (парсер outmaxshop.com) */
  parserUrl: "https://outmaxshop.com/yml/all_new.yml",

  /** Витрина магазина (поиск по каталогу для ссылок из бота) */
  shop: {
    baseUrl: "https://outmaxshop.com",
    searchPath: "/snickers",
    searchParam: "search",
  },

  /**
   * Два сайта-референса для стиля названий и описаний.
   * Укажите URL страниц каталога или карточек товара — бот возьмёт примеры текста.
   */
  referenceSites: [
    "https://outmaxshop.ru/",
    "https://хасл.рф/",
  ],

  catalog: {
    cacheFile: "data/catalog-cache.json",
    /** Только подсказка в /status, авто-скачивание не включает */
    refreshHours: 6,
    /** Полный фид ~200 МБ; в кэш попадает выборка для стиля и поиска */
    maxOffers: 15000,
    downloadTimeoutMs: 360000,
  },

  style: {
    samplesFile: "data/style-samples.json",
    samplesPerSource: 8,
    catalogSamplesForPrompt: 6,
  },

  search: {
    pickLimit: 3,
    nameLimit: 1,
  },

  /** Если товар по фото не найден в каталоге — поиск фактов в интернете */
  webSearch: {
    enabled: true,
    catalogMinScore: 0.5,
    maxPages: 3,
    resultLimit: 6,
    descriptionMaxTokens: 1800,
  },

  /** ollama | openai — по умолчанию Ollama (бесплатно, локально) */
  ai: {
    provider: (process.env.AI_PROVIDER || "ollama").toLowerCase(),
  },

  /** Yandex AI Studio: Wordstat + YandexGPT для SEO-новостей */
  yandex: {
    wordstatNumPhrases: 25,
    wordstatRegions: ["225"],
    gptModel: "yandexgpt",
    gptVersion: "latest",
    articleMaxTokens: 8000,
  },

  /** SEO-подборки топ-N в стиле outmaxshop.ru */
  seo: {
    roundupReferences: [
      "https://outmaxshop.ru/obuvnaleto",
      "https://outmaxshop.ru/article/2988-top-10-krossovok-na-maj-2026-goda",
      "https://outmaxshop.ru/article/2945-krossovki-new-balance-do-3-500r",
      "https://outmaxshop.ru/article/2934-top-belykh-krossovok-2026",
    ],
    defaultRoundupSize: 5,
    maxRoundupSize: 10,
  },

  ollama: {
    host: process.env.OLLAMA_HOST || "http://127.0.0.1:11434",
    visionModel: process.env.OLLAMA_VISION_MODEL || "llava",
    textModel: process.env.OLLAMA_TEXT_MODEL || "llama3.2",
    timeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS) || 300000,
  },

  openai: {
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    visionModel: process.env.OPENAI_VISION_MODEL || "gpt-4o-mini",
  },
};
