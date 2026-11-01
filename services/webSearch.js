const axios = require("axios");
const cheerio = require("cheerio");
const config = require("../ai/config");

const BLOCKED_HOSTS = /facebook\.com|instagram\.com|youtube\.com|vk\.com|t\.me/i;

function buildSearchQuery(vision) {
  const parts = [
    vision.brand,
    vision.model,
    vision.colorway,
    "кроссовки",
    "sneakers",
  ].filter(Boolean);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

async function searchDuckDuckGo(query, limit = 5) {
  const res = await axios.post(
    "https://lite.duckduckgo.com/lite/",
    new URLSearchParams({ q: query }),
    {
      timeout: 20000,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      },
    }
  );

  const $ = cheerio.load(res.data);
  const links = [];

  $("a.result-link").each((_, el) => {
    const href = $(el).attr("href");
    const title = $(el).text().trim();
    if (href && href.startsWith("http") && !BLOCKED_HOSTS.test(href)) {
      links.push({ url: href, title });
    }
  });

  if (!links.length) {
    $("a[href^='http']").each((_, el) => {
      const href = $(el).attr("href");
      const title = $(el).text().trim();
      if (
        href &&
        !href.includes("duckduckgo.com") &&
        !BLOCKED_HOSTS.test(href) &&
        title.length > 8
      ) {
        links.push({ url: href, title });
      }
    });
  }

  const seen = new Set();
  return links
    .filter((l) => {
      if (seen.has(l.url)) return false;
      seen.add(l.url);
      return true;
    })
    .slice(0, limit);
}

async function fetchPageText(url) {
  const res = await axios.get(url, {
    timeout: 18000,
    maxContentLength: 2 * 1024 * 1024,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html",
    },
  });

  const $ = cheerio.load(res.data);
  $("script, style, nav, footer, header, iframe, noscript").remove();

  const chunks = [];
  $("h1, h2, h3, p, li").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t.length >= 25) chunks.push(t);
  });

  return chunks.join("\n").slice(0, 4500);
}

function formatWebBlock(webData) {
  if (!webData?.snippets?.length) return "";
  const parts = [`Поисковый запрос: ${webData.query}`];
  for (const s of webData.snippets) {
    parts.push(`\n---\nИсточник: ${s.title}\nURL: ${s.url}\n${s.text}`);
  }
  return parts.join("\n");
}

async function searchProductOnWeb(vision) {
  const query = buildSearchQuery(vision);
  if (!query || query.length < 4) {
    return { query, snippets: [], error: "Мало данных с фото для поиска" };
  }

  console.log("[web] Поиск:", query);

  let links = [];
  try {
    links = await searchDuckDuckGo(query, config.webSearch?.resultLimit || 6);
  } catch (err) {
    console.warn("[web] Поиск не удался:", err.message);
    return { query, snippets: [], error: err.message };
  }

  const maxPages = config.webSearch?.maxPages || 3;
  const snippets = [];

  for (const link of links) {
    if (snippets.length >= maxPages) break;
    try {
      const text = await fetchPageText(link.url);
      if (text.length > 120) {
        snippets.push({
          url: link.url,
          title: link.title || link.url,
          text,
        });
      }
    } catch {
      /* next link */
    }
  }

  console.log(`[web] Собрано источников: ${snippets.length}`);
  return { query, snippets };
}

module.exports = {
  searchDuckDuckGo,
  searchProductOnWeb,
  buildSearchQuery,
  formatWebBlock,
};
