const fs = require("fs");
const path = require("path");
const axios = require("axios");
const cheerio = require("cheerio");
const config = require("../ai/config");

const DESCRIPTION_SELECTORS = [
  "[itemprop=description]",
  ".product-description",
  ".product__description",
  ".description",
  ".detail-text",
  ".tab-content",
  "meta[name=description]",
];

function cleanText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1200);
}

function extractFromHtml(html, pageUrl) {
  const $ = cheerio.load(html);
  const samples = [];

  $("h1").each((_, el) => {
    const t = cleanText($(el).text());
    if (t.length >= 8 && t.length <= 200) samples.push({ type: "title", text: t, source: pageUrl });
  });

  for (const sel of DESCRIPTION_SELECTORS) {
    $(sel).each((_, el) => {
      const tag = el.tagName?.toLowerCase();
      const text =
        tag === "meta"
          ? $(el).attr("content")
          : cleanText($(el).text());
      if (text && text.length >= 40) {
        samples.push({ type: "description", text, source: pageUrl });
      }
    });
  }

  $("p").each((_, el) => {
    const t = cleanText($(el).text());
    if (t.length >= 80 && t.length <= 900) {
      samples.push({ type: "description", text: t, source: pageUrl });
    }
  });

  return samples;
}

async function fetchPageSamples(url) {
  const res = await axios.get(url, {
    timeout: 30000,
    headers: { "User-Agent": "ZonaDeckBot/1.0" },
    maxRedirects: 5,
  });
  return extractFromHtml(res.data, url);
}

function dedupe(samples) {
  const seen = new Set();
  return samples.filter((s) => {
    const key = `${s.type}:${s.text.slice(0, 80)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function loadSamplesFile() {
  const file = config.paths.styleSamples;
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function saveSamplesFile(data) {
  const file = config.paths.styleSamples;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

async function collectStyleSamples() {
  const urls = (config.referenceSites || []).filter(Boolean);
  const perSource = config.style.samplesPerSource || 8;
  const all = [];

  for (const url of urls) {
    try {
      const chunk = await fetchPageSamples(url);
      all.push(...chunk.slice(0, perSource * 3));
    } catch (err) {
      console.warn(`[style] Не удалось загрузить ${url}:`, err.message);
    }
  }

  const titles = dedupe(all.filter((s) => s.type === "title")).slice(0, perSource * urls.length);
  const descriptions = dedupe(all.filter((s) => s.type === "description")).slice(
    0,
    perSource * urls.length
  );

  const payload = {
    loadedAt: new Date().toISOString(),
    urls,
    titles: titles.map((s) => s.text),
    descriptions: descriptions.map((s) => s.text),
  };

  if (titles.length || descriptions.length) {
    saveSamplesFile(payload);
  }

  return payload;
}

async function getStyleSamples() {
  const cached = loadSamplesFile();
  const urls = (config.referenceSites || []).filter(Boolean);

  if (!urls.length) {
    return cached || { titles: [], descriptions: [] };
  }

  const cacheAgeOk =
    cached?.loadedAt &&
    Date.now() - new Date(cached.loadedAt).getTime() < 24 * 60 * 60 * 1000;

  if (cacheAgeOk && cached?.descriptions?.length) {
    return cached;
  }

  return collectStyleSamples();
}

function pickCatalogStyleExamples(catalog, count = 6) {
  const withDesc = (catalog?.offers || []).filter((o) => o.description?.length > 50);
  if (!withDesc.length) return [];

  const step = Math.max(1, Math.floor(withDesc.length / count));
  const picked = [];
  for (let i = 0; i < withDesc.length && picked.length < count; i += step) {
    const o = withDesc[i];
    picked.push({
      title: o.name,
      description: o.description,
      vendor: o.vendor,
    });
  }
  return picked;
}

module.exports = {
  getStyleSamples,
  collectStyleSamples,
  pickCatalogStyleExamples,
  extractFromHtml,
};
