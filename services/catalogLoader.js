const fs = require("fs");
const path = require("path");
const axios = require("axios");
const sax = require("sax");
const { pipeline } = require("stream/promises");
const config = require("../ai/config");

let activeLoad = null;

const feedPath = () =>
  path.join(path.dirname(config.paths.catalogCache), "catalog-feed.xml");

function toArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function stripHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeOffer(raw) {
  const name = stripHtml(raw.name || raw.model || "");
  const description = stripHtml(raw.description || "");
  const vendor = stripHtml(raw.vendor || raw.brand || "");
  const id = raw["@_id"] || raw.id || "";

  const pictures = toArray(raw.picture).filter(Boolean);
  const params = toArray(raw.param).map((p) => {
    if (typeof p === "string") return p;
    const key = p["@_name"] || p.name || "";
    const val = p["#text"] ?? p.value ?? p;
    return key ? `${key}: ${val}` : String(val);
  });

  return {
    id: String(id),
    name,
    description,
    vendor,
    price: raw.price,
    url: raw.url,
    pictures,
    params,
    searchText: [vendor, name, description, ...params].join(" ").toLowerCase(),
  };
}

function parseOffersFromFile(filePath, maxOffers) {
  return new Promise((resolve, reject) => {
    const offers = [];
    const parser = sax.createStream(true, { trim: true });
    let inOffer = false;
    let offer = null;
    let field = null;
    let paramName = "";
    let text = "";
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      readStream.destroy();
      resolve(offers);
    };

    parser.on("opentag", (node) => {
      if (done) return;
      if (node.name === "offer") {
        inOffer = true;
        offer = { "@_id": node.attributes.id || "", _params: [], _pictures: [] };
        return;
      }
      if (!inOffer) return;
      text = "";
      if (node.name === "param") {
        field = "param";
        paramName = node.attributes.name || "";
      } else {
        field = node.name;
      }
    });

    parser.on("text", (chunk) => {
      if (inOffer && !done) text += chunk;
    });

    parser.on("closetag", (name) => {
      if (done) return;
      const value = text.trim();
      text = "";

      if (name === "offer" && inOffer && offer) {
        const normalized = normalizeOffer({
          "@_id": offer["@_id"],
          name: offer.name,
          description: offer.description,
          vendor: offer.vendor,
          model: offer.model,
          price: offer.price,
          url: offer.url,
          picture: offer._pictures,
          param: offer._params,
        });
        if (normalized.name || normalized.description) offers.push(normalized);
        inOffer = false;
        offer = null;
        if (offers.length >= maxOffers) finish();
        return;
      }

      if (!inOffer || !offer) return;

      if (name === "param" && field === "param") {
        offer._params.push({ "@_name": paramName, "#text": value });
      } else if (name === "picture") {
        offer._pictures.push(value);
      } else if (field === name) {
        offer[name] = value;
      }
      field = null;
    });

    parser.on("end", () => finish());
    parser.on("error", reject);

    console.log("[catalog] Разбор XML (потоково)…");
    const readStream = fs.createReadStream(filePath, { encoding: "utf8" });
    readStream.on("error", reject);
    readStream.pipe(parser);
  });
}

async function downloadFeed(destPath) {
  const tmpPath = `${destPath}.part`;
  if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);

  console.log("[catalog] Скачивание с парсера (~200 МБ, 3–6 мин)…");

  const response = await axios.get(config.parserUrl, {
    responseType: "stream",
    timeout: config.catalog.downloadTimeoutMs || 360000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    headers: { "User-Agent": "ZonaDeckBot/1.0" },
    onDownloadProgress: (e) => {
      if (e.total) {
        const pct = Math.round((e.loaded / e.total) * 100);
        process.stdout.write(`\r[catalog] Загружено ${pct}%   `);
      } else if (e.loaded) {
        const mb = (e.loaded / 1024 / 1024).toFixed(1);
        process.stdout.write(`\r[catalog] Загружено ${mb} МБ   `);
      }
    },
  });

  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  await pipeline(response.data, fs.createWriteStream(tmpPath));
  fs.renameSync(tmpPath, destPath);
  console.log("");

  const sizeMb = (fs.statSync(destPath).size / 1024 / 1024).toFixed(1);
  console.log(`[catalog] Файл сохранён: ${sizeMb} МБ`);
}

async function buildCatalogFromFeed({ redownload = false } = {}) {
  const xmlFile = feedPath();
  const max = config.catalog.maxOffers || 15000;

  if (redownload && fs.existsSync(xmlFile)) fs.unlinkSync(xmlFile);
  if (!fs.existsSync(xmlFile)) await downloadFeed(xmlFile);

  const offers = await parseOffersFromFile(xmlFile, max);

  return {
    loadedAt: new Date().toISOString(),
    shopName: "outmaxshop",
    offerCount: offers.length,
    offers,
  };
}

function loadCache() {
  const file = config.paths.catalogCache;
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function saveCache(catalog) {
  const file = config.paths.catalogCache;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(catalog), "utf8");
  console.log(`[catalog] Кэш сохранён: ${catalog.offerCount} позиций`);
}

function isCacheStale(catalog) {
  if (!catalog?.loadedAt) return false;
  const hours = config.catalog.refreshHours || 6;
  const ageMs = Date.now() - new Date(catalog.loadedAt).getTime();
  return ageMs > hours * 60 * 60 * 1000;
}

function isCatalogLoading() {
  return Boolean(activeLoad);
}

/** Локальный каталог из data/catalog-cache.json (без скачивания) */
function getReadyCatalog() {
  const cached = loadCache();
  if (cached?.offers?.length) return cached;
  return null;
}

async function buildFromLocalFiles() {
  const xmlFile = feedPath();
  if (!fs.existsSync(xmlFile)) {
    return null;
  }
  console.log("[catalog] Сборка кэша из локального catalog-feed.xml…");
  const catalog = await buildCatalogFromFeed({ redownload: false });
  saveCache(catalog);
  return catalog;
}

/**
 * force: false — только локальные файлы, интернет не трогаем.
 * force: true  — скачать фид заново (/reload, пункт 3 в start.bat).
 */
async function getCatalog({ force = false } = {}) {
  if (!force) {
    const cached = getReadyCatalog();
    if (cached) return cached;

    if (activeLoad) return activeLoad;

    const xmlFile = feedPath();
    if (fs.existsSync(xmlFile)) {
      activeLoad = buildFromLocalFiles().finally(() => {
        activeLoad = null;
      });
      return activeLoad;
    }

    return loadCache() || { offers: [], offerCount: 0 };
  }

  if (activeLoad) return activeLoad;

  activeLoad = (async () => {
    try {
      const catalog = await buildCatalogFromFeed({ redownload: true });
      saveCache(catalog);
      return catalog;
    } catch (err) {
      const partial = `${feedPath()}.part`;
      if (fs.existsSync(partial)) fs.unlinkSync(partial);

      const cached = loadCache();
      if (cached?.offers?.length) {
        console.warn("[catalog] Ошибка загрузки, используем кэш:", err.message);
        return cached;
      }
      throw err;
    } finally {
      activeLoad = null;
    }
  })();

  return activeLoad;
}

module.exports = {
  getCatalog,
  loadCache,
  saveCache,
  isCacheStale,
  isCatalogLoading,
  getReadyCatalog,
};
