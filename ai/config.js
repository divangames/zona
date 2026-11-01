require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const data = require("./data");
const path = require("path");

const rootDir = path.join(__dirname, "..");

function resolvePath(relative) {
  return path.isAbsolute(relative) ? relative : path.join(rootDir, relative);
}

const token =
  process.env.TELEGRAM_BOT_TOKEN ||
  process.env.BOT_TOKEN ||
  "";

if (!token) {
  console.warn(
    "[config] TELEGRAM_BOT_TOKEN не задан. Создайте .env из .env.example"
  );
}

module.exports = {
  ...data,
  parserUrl: process.env.PARSER_URL || data.parserUrl,
  telegram: {
    ...data.telegram,
    token,
  },
  ai: {
    ...data.ai,
  },
  ollama: {
    ...data.ollama,
  },
  openai: {
    ...data.openai,
    apiKey: process.env.OPENAI_API_KEY || "",
    baseURL: process.env.OPENAI_BASE_URL || "",
  },
  yandex: {
    ...data.yandex,
    apiKey: process.env.YANDEX_API_KEY || "",
    folderId: process.env.YANDEX_FOLDER_ID || "",
  },
  paths: {
    root: rootDir,
    catalogCache: resolvePath(data.catalog.cacheFile),
    styleSamples: resolvePath(data.style.samplesFile),
    seoRoundupRefs: resolvePath("data/seo-roundup-refs.json"),
  },
};
