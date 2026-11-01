const { yandexPost, getFolderId, yandexConfigured } = require("./yandexCloud");

const WORDSTAT_URL =
  "https://searchapi.api.cloud.yandex.net/v2/wordstat/topRequests";

const DEFAULT_REGIONS = ["225"];

/** Запросы не про обувь — отсекаем до статьи. */
const IRRELEVANT_RE =
  /(?:\bшин[аыуео]?\b|протектор|автомоб|легков|кроссовер|резин[аыу]|пылесос|чемодан|багаж|колёс|колес|кроссворд|дизель|бензин|аккумулятор|моторн(?:ое|ого)\s+масл|дворник|стеклоочистител|шиномонтаж|автошин|диск(?:и|ов)\s+лит|антифриз|омывающ|техосмотр|гараж|кузов|бампер|подвеск)/i;

const FOOTWEAR_RE =
  /(?:кроссовк|кросс[ыа]?\s+(?:на|для|мужск|женск)|кед[ыа]?|обув|sneaker|nike|adidas|jordan|reebok|puma|asics|salomon|air\s*max|dunk|yeezy|converse|new\s*balance|vans|brooks|hoka|balenciaga|gucci\s+sneaker|модн(?:ая|ые)\s+(?:летн|обув)|летн(?:яя|ие)\s+обув|топ\s*\d+\s+кросс|мужск(?:их|ие)\s+кросс|женск(?:их|ие)\s+кросс)/i;

const TOPIC_FOOTWEAR_RE =
  /(?:кроссовк|кед|обув|sneaker|nike|adidas|jordan|reebok|puma|asics|salomon|air\s*max)/i;

/** Для API Вордстата — сужаем общие темы до ниши кроссовок. */
function wordstatApiPhrase(subject) {
  const s = String(subject || "").trim();
  if (!s) return s;
  if (TOPIC_FOOTWEAR_RE.test(s)) {
    return s.replace(/\bкроссовок\b/gi, "кроссовки").slice(0, 200);
  }
  return `${s} кроссовки`.replace(/\bкроссовок\b/gi, "кроссовки").slice(0, 200);
}

function isIrrelevantPhrase(phrase) {
  const p = String(phrase || "").toLowerCase();
  if (!p) return true;
  if (IRRELEVANT_RE.test(p)) return true;
  if (/рейтинг|топ\s*\d+/i.test(p) && /(?:шин|резин|пылесос|авто|легков)/i.test(p)) {
    return true;
  }
  if (/вид\s+спорта/i.test(p) && !FOOTWEAR_RE.test(p)) return true;
  if (/кроссворд|туфел[ья]\s+кроссворд/i.test(p)) return true;
  return false;
}

function isFootwearRelevant(phrase, topic) {
  const p = String(phrase || "").toLowerCase();
  const t = String(topic || "").toLowerCase();
  if (!p || isIrrelevantPhrase(p)) return false;
  if (FOOTWEAR_RE.test(p)) return true;
  if (TOPIC_FOOTWEAR_RE.test(t) && /\bкросс/i.test(p) && !/\bшин/i.test(p)) {
    return true;
  }
  return false;
}

function filterSneakerKeywords(keywords, topic) {
  return (keywords || []).filter((k) => isFootwearRelevant(k.phrase, topic));
}

function normalizePhraseItem(item) {
  if (!item) return null;
  if (typeof item === "string") {
    return { phrase: item.trim(), count: 0 };
  }
  const phrase =
    item.phrase ||
    item.text ||
    item.query ||
    item.keyword ||
    item.key ||
    item.value;
  const count =
    item.count ??
    item.shows ??
    item.frequency ??
    item.requestCount ??
    item.valueCount ??
    (typeof item.value === "number" ? item.value : 0) ??
    0;
  if (!phrase) return null;
  return { phrase: String(phrase).trim(), count: Number(count) || 0 };
}

function extractPhraseList(data, keys) {
  const out = [];
  for (const key of keys) {
    const arr = data?.[key];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      const row = normalizePhraseItem(item);
      if (row?.phrase) out.push(row);
    }
  }
  return out;
}

function extractFromNested(data) {
  const out = [];
  const walk = (node) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node === "object") {
      if (node.phrase || node.text || node.query) {
        const row = normalizePhraseItem(node);
        if (row?.phrase) out.push(row);
      }
      Object.values(node).forEach(walk);
    }
  };
  walk(data);
  return out;
}

async function fetchTopRequests(phrase, options = {}) {
  if (!yandexConfigured()) {
    throw new Error("Задайте YANDEX_API_KEY и YANDEX_FOLDER_ID в .env");
  }

  const displayTopic = String(phrase).trim();
  const apiPhrase = options.apiPhrase ?? wordstatApiPhrase(displayTopic);

  const body = {
    phrase: apiPhrase,
    numPhrases: options.numPhrases || 30,
    regions: options.regions || DEFAULT_REGIONS,
    folderId: getFolderId(),
  };

  const data = await yandexPost(WORDSTAT_URL, body, { timeout: 60000 });

  let results = extractPhraseList(data, [
    "results",
    "topRequests",
    "popular",
    "data",
    "items",
  ]);
  let associations = extractPhraseList(data, [
    "associations",
    "related",
    "similar",
    "alsoSearched",
  ]);

  if (!results.length && !associations.length) {
    const nested = extractFromNested(data);
    results = nested;
  }

  const merged = [...results, ...associations];
  const seen = new Set();
  const keywords = [];

  for (const row of merged) {
    const key = row.phrase.toLowerCase();
    if (seen.has(key) || key.length < 2) continue;
    seen.add(key);
    keywords.push(row);
  }

  keywords.sort((a, b) => b.count - a.count);

  return {
    phrase: displayTopic,
    apiPhrase: body.phrase,
    keywords,
    top: keywords.slice(0, 20),
    raw: data,
  };
}

/** Топ ВЧ-фраз только про кроссовки/обувь (без авто и бытовой техники). */
function pickSeoKeywords(wordstatData, limit = 15) {
  const topic = String(wordstatData?.phrase || "").trim();
  const list = [...(wordstatData?.keywords || [])].sort(
    (a, b) => b.count - a.count
  );

  let pool = filterSneakerKeywords(list, topic);
  if (pool.length < 3) {
    pool = list.filter((k) => !isIrrelevantPhrase(k.phrase));
  }

  const seen = new Set();
  const out = [];

  if (topic) {
    const topicRow =
      pool.find((k) => k.phrase.toLowerCase() === topic.toLowerCase()) ||
      list.find((k) => k.phrase.toLowerCase() === topic.toLowerCase()) ||
      { phrase: topic, count: pool[0]?.count || list[0]?.count || 0 };
    seen.add(topic.toLowerCase());
    out.push(topicRow);
  }

  for (const k of pool) {
    if (out.length >= limit) break;
    const key = k.phrase.toLowerCase();
    if (seen.has(key)) continue;
    if (isIrrelevantPhrase(k.phrase)) continue;
    if (!isFootwearRelevant(k.phrase, topic)) continue;
    seen.add(key);
    out.push(k);
  }

  return out
    .filter((k) => !isIrrelevantPhrase(k.phrase))
    .slice(0, limit);
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatWordstatReport(topic, keywords) {
  if (!keywords?.length) {
    return `📊 <b>Вордстат</b>\nТема: ${escapeHtml(topic)}\n<i>Фразы не получены — статья по теме.</i>`;
  }
  const lines = keywords.map(
    (k, i) =>
      `${i + 1}. <b>${escapeHtml(k.phrase)}</b> — ${k.count || "—"} показов`
  );
  return (
    `📊 <b>Вордстат — ВЧ-запросы</b>\n` +
    `Тема: <i>${escapeHtml(topic)}</i>\n\n` +
    lines.join("\n") +
    `\n\n<i>Только запросы про кроссовки и обувь — ниже статья с этими фразами.</i>`
  );
}

module.exports = {
  fetchTopRequests,
  pickSeoKeywords,
  formatWordstatReport,
  isFootwearRelevant,
  isIrrelevantPhrase,
  filterSneakerKeywords,
  wordstatApiPhrase,
  yandexConfigured,
};
