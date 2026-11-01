const axios = require("axios");
const cheerio = require("cheerio");
const config = require("../ai/config");
const { getReadyCatalog } = require("./catalogLoader");
const { searchOffers, formatPrice } = require("./productSearch");
const { searchDuckDuckGo } = require("./webSearch");
const { downloadImage } = require("./imageFetch");
const { getPlayerNameEn } = require("./basketballPlayerMeta");
const {
  findNearestPlayer,
  formatNearestMessage,
  escapeHtml,
  formatDateRu,
  formatCareer,
  daysWord,
} = require("./basketballCalendar");

const SNEAKER_ALIASES = {
  AJ1: "Air Jordan 1",
  AJ3: "Air Jordan 3",
  AJ4: "Air Jordan 4",
  AJ11: "Air Jordan 11",
  "KB8": "adidas KB8",
};

const MAX_SNEAKER_LINKS = 6;
const MAX_EXTERNAL_LOOKUPS = 3;

function buildShopSearchUrl(query) {
  const shop = config.shop || {};
  const base = (shop.baseUrl || "https://outmaxshop.com").replace(/\/$/, "");
  const path = shop.searchPath || "/snickers";
  const param = shop.searchParam || "search";
  return `${base}${path}?${param}=${encodeURIComponent(query)}`;
}

function normalizeSneakerQuery(label) {
  let q = String(label || "")
    .replace(/\(.*?\)/g, " ")
    .replace(/линия.*$/i, " ")
    .replace(/[–—].*$/u, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const [abbr, full] of Object.entries(SNEAKER_ALIASES)) {
    if (new RegExp(`\\b${abbr}\\b`, "i").test(q)) {
      q = q.replace(new RegExp(`\\b${abbr}\\b`, "gi"), full);
    }
  }
  return q.slice(0, 80);
}

function offerMatchesSneakerQuery(offer, query) {
  const name = (offer?.name || "").toLowerCase();
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2 && !/^(and|the|liniya)$/i.test(t));
  if (!tokens.length) return false;
  return tokens.every((t) => name.includes(t));
}

function findInCatalog(catalog, query) {
  if (!catalog?.offers?.length || !query) return null;
  const candidates = searchOffers(catalog, query, { mode: "name", limit: 5 });
  return candidates.find((o) => offerMatchesSneakerQuery(o, query)) || null;
}

async function findExternalSneakerUrl(query) {
  const links = await searchDuckDuckGo(`${query} sneakers buy`, 5);
  const hit = links.find(
    (l) =>
      l.url &&
      !/bizoutmax\.ru|outmaxshop\.com/i.test(l.url) &&
      !/facebook|instagram|youtube|vk\.com/i.test(l.url)
  );
  return hit?.url || null;
}

async function resolveSneakerLink(label, catalog, externalBudget) {
  const query = normalizeSneakerQuery(label);
  if (!query || query.length < 2) {
    return { label, html: `• ${escapeHtml(label)}` };
  }

  const offer = catalog ? findInCatalog(catalog, query) : null;
  if (offer?.url) {
    const price = formatPrice(offer.price);
    return {
      label: query,
      inShop: true,
      html:
        `• <a href="${escapeHtml(offer.url)}">${escapeHtml(offer.name || label)}</a>` +
        (price !== "—" ? ` — <b>${escapeHtml(price)}</b>` : ""),
    };
  }

  let url = buildShopSearchUrl(query);
  let external = false;

  if (externalBudget.remaining > 0) {
    try {
      const ext = await findExternalSneakerUrl(query);
      if (ext) {
        url = ext;
        external = true;
        externalBudget.remaining -= 1;
      }
    } catch (err) {
      console.warn("[bday] внешний поиск:", query, err.message);
    }
  }

  const shopUrl = buildShopSearchUrl(query);
  if (!external) {
    return {
      label: query,
      inShop: false,
      html:
        `• <a href="${escapeHtml(shopUrl)}">${escapeHtml(label)}</a> ` +
        `<i>(нет в магазине — поиск на сайте)</i>`,
    };
  }

  return {
    label: query,
    inShop: false,
    html:
      `• <a href="${escapeHtml(url)}">${escapeHtml(label)}</a> ` +
      `<i>(нет в магазине)</i>\n` +
      `   <a href="${escapeHtml(shopUrl)}">Искать на outmaxshop.com</a>`,
  };
}

const WIKI_HEADERS = {
  "User-Agent": "ZonaDeckBot/1.0 (Telegram; basketball calendar)",
  Accept: "application/json",
};

async function getWikipediaThumbnail(searchTerm, lang = "en") {
  const res = await axios.get(`https://${lang}.wikipedia.org/w/api.php`, {
    params: {
      action: "query",
      generator: "search",
      gsrsearch: searchTerm,
      gsrnamespace: 0,
      gsrlimit: 1,
      prop: "pageimages",
      piprop: "thumbnail",
      pithumbsize: 800,
      format: "json",
    },
    headers: WIKI_HEADERS,
    timeout: 15000,
  });

  const pages = res.data?.query?.pages;
  if (!pages) return null;
  const page = Object.values(pages)[0];
  return page?.thumbnail?.source || null;
}

async function fetchOgImage(pageUrl) {
  const res = await axios.get(pageUrl, {
    timeout: 15000,
    maxContentLength: 1.5 * 1024 * 1024,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html",
    },
  });
  const $ = cheerio.load(res.data);
  const og =
    $('meta[property="og:image"]').attr("content") ||
    $('meta[name="twitter:image"]').attr("content");
  if (!og) return null;
  if (og.startsWith("//")) return `https:${og}`;
  return og;
}

async function fetchPlayerPhotoBuffer(player) {
  if (player.imageUrl) {
    try {
      const buffer = await downloadImage(player.imageUrl, "https://www.wikipedia.org/");
      if (buffer?.length > 500) return buffer;
    } catch {
      /* fallback */
    }
  }

  const en = getPlayerNameEn(player);
  const wikiQuery = `${en} NBA basketball player`.trim();

  for (const lang of ["en", "ru"]) {
    try {
      const thumb = await getWikipediaThumbnail(wikiQuery, lang);
      if (thumb) {
        const buffer = await downloadImage(thumb, `https://${lang}.wikipedia.org/`);
        if (buffer?.length > 500) return buffer;
      }
    } catch (err) {
      console.warn(`[bday] Wikipedia ${lang}:`, err.message);
    }
  }

  try {
    const links = await searchDuckDuckGo(`${en} NBA basketball player photo`, 3);
    for (const link of links) {
      try {
        const imgUrl = await fetchOgImage(link.url);
        if (imgUrl) {
          const buffer = await downloadImage(imgUrl, link.url);
          if (buffer?.length > 500) return buffer;
        }
      } catch {
        /* next */
      }
    }
  } catch (err) {
    console.warn("[bday] фото из веб:", err.message);
  }

  return null;
}

async function buildNearestBirthdayCard(nearestResult) {
  const nearest = nearestResult || findNearestPlayer();
  if (!nearest) return { caption: "Календарь пуст.", photoBuffer: null };

  const { player: p, daysUntil, nextDate } = nearest;
  const turningAge = nextDate.getFullYear() - p.birthYear;
  const catalog = getReadyCatalog();

  const sneakers = (p.sneakers || []).slice(0, MAX_SNEAKER_LINKS);
  const externalBudget = { remaining: MAX_EXTERNAL_LOOKUPS };

  const sneakerLines = [];
  for (const label of sneakers) {
    sneakerLines.push(await resolveSneakerLink(label, catalog, externalBudget));
  }

  const lines = [
    "🎂 <b>Ближайший день рождения</b>",
    "",
    `<b>${escapeHtml(p.name)}</b>`,
    `📅 ДР: ${formatDateRu(p.birthDate)} (исполнится ${turningAge})`,
    `⏳ Через ${daysUntil} ${daysWord(daysUntil)} — ${formatDateRu(nextDate)}`,
    `🏀 Карьера: ${escapeHtml(formatCareer(p))}`,
  ];

  if (p.deathDate) {
    lines.push(`🕯 Ушёл: ${formatDateRu(p.deathDate)}`);
  }

  lines.push("", "👟 <b>Кроссовки</b>");
  if (sneakerLines.length) {
    lines.push(...sneakerLines.map((s) => s.html));
  } else {
    lines.push("—");
  }

  lines.push("", "💡 <b>Факт</b>", escapeHtml(p.fact || "—"));

  const caption = lines.join("\n");
  if (caption.length > 1020) {
    return {
      caption: `${caption.slice(0, 1010)}…`,
      photoBuffer: await fetchPlayerPhotoBuffer(p),
    };
  }

  const photoBuffer = await fetchPlayerPhotoBuffer(p);
  return { caption, photoBuffer };
}

module.exports = {
  buildNearestBirthdayCard,
  buildShopSearchUrl,
  normalizeSneakerQuery,
  formatNearestMessage,
};
