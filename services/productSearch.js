const COLOR_WORDS = [
  "бел", "черн", "красн", "син", "зелен", "зелён", "сер", "беж", "розов",
  "оранж", "желт", "жёлт", "фиолет", "коричн", "голуб",
  "white", "black", "red", "blue", "green", "grey", "gray",
];

const SEASON_WORDS = [
  { keys: ["зим", "утепл", "пух", "мех"], tag: "зима" },
  { keys: ["лет", "лёгк", "сандал", "шлёп", "шлеп"], tag: "лето" },
  { keys: ["демисезон", "весн", "осен"], tag: "демисезон" },
];

const PICK_HINTS = /подбери|подобрать|найди|нужн|ищу|рекоменд|вариант|\bтри\b/i;

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

function parseCriteria(text) {
  const lower = text.toLowerCase();
  const criteria = {
    raw: text,
    tokens: tokenize(text),
    size: null,
    colors: [],
    seasons: [],
  };

  const sizeMatch =
    lower.match(/размер[:\s]*(\d{2}(?:[.,]\d)?)/i) ||
    lower.match(/\b(3[5-9]|4[0-6])(?:[.,](5))?\b/);
  if (sizeMatch) criteria.size = sizeMatch[1].replace(",", ".");

  for (const stem of COLOR_WORDS) {
    if (lower.includes(stem)) criteria.colors.push(stem);
  }

  for (const season of SEASON_WORDS) {
    if (season.keys.some((k) => lower.includes(k))) {
      criteria.seasons.push(season.tag);
    }
  }

  return criteria;
}

function hasCriteriaSignals(criteria) {
  return (
    criteria.size ||
    criteria.colors.length > 0 ||
    criteria.seasons.length > 0
  );
}

function detectSearchMode(text) {
  if (PICK_HINTS.test(text)) return "pick";
  const criteria = parseCriteria(text);
  if (hasCriteriaSignals(criteria)) return "pick";
  return "name";
}

function formatPrice(price) {
  if (price == null || price === "") return "—";
  const n = Number(String(price).replace(/\s/g, ""));
  if (Number.isFinite(n)) {
    return `${n.toLocaleString("ru-RU")} ₽`;
  }
  return `${price} ₽`;
}

function scoreByName(offer, queryTokens) {
  if (!queryTokens.length) return 0;
  const name = offer.name.toLowerCase();
  const text = offer.searchText;
  let score = 0;

  for (const t of queryTokens) {
    if (name.includes(t)) score += 3;
    else if (text.includes(t)) score += 1;
  }

  if (queryTokens.every((t) => name.includes(t))) score += 5;
  if (offer.pictures?.length) score += 0.3;

  return score;
}

function scoreByCriteria(offer, criteria) {
  let score = 0;
  const text = offer.searchText;
  const paramsText = (offer.params || []).join(" ").toLowerCase();

  for (const color of criteria.colors) {
    if (text.includes(color)) score += 2.5;
  }

  for (const season of criteria.seasons) {
    if (text.includes(season)) score += 2;
    if (season === "зима" && /утепл|зим|пух|мех|fur/i.test(text)) score += 1;
    if (season === "лето" && /лет|сандал|шлёп|шлеп/i.test(text)) score += 1;
  }

  if (criteria.size) {
    const size = criteria.size;
    if (paramsText.includes(size) || text.includes(`размер ${size}`)) score += 4;
    if (text.includes(size)) score += 2;
  }

  for (const token of criteria.tokens) {
    if (token.length < 3) continue;
    if (PICK_HINTS.test(token)) continue;
    if (text.includes(token)) score += 0.6;
  }

  if (offer.pictures?.length) score += 0.5;
  if (offer.description?.length > 40) score += 0.2;

  return score;
}

function searchOffers(catalog, text, { mode = "name", limit = 3 } = {}) {
  const offers = catalog?.offers || [];
  if (!offers.length || !text?.trim()) return [];

  const criteria = parseCriteria(text);
  const queryTokens = criteria.tokens.filter(
    (t) => t.length > 2 && !["подбери", "найди", "кроссовки", "обувь", "нужны"].includes(t)
  );

  const scored = offers.map((offer) => {
    const score =
      mode === "pick"
        ? scoreByCriteria(offer, criteria)
        : scoreByName(offer, queryTokens.length ? queryTokens : criteria.tokens);
    return { offer, score };
  });

  const minScore = mode === "pick" ? 1.5 : 2;

  return scored
    .filter((x) => x.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.offer);
}

/** Ранжированный список для подборок (нужен больший пул и разнообразие). */
function searchOffersRanked(catalog, text, { mode = "pick", limit = 60 } = {}) {
  const offers = catalog?.offers || [];
  if (!offers.length || !text?.trim()) return [];

  const criteria = parseCriteria(text);
  const queryTokens = criteria.tokens.filter(
    (t) =>
      t.length > 2 &&
      !["подбери", "найди", "кроссовки", "обувь", "нужны", "топ", "подборка"].includes(t)
  );

  const scored = offers.map((offer) => {
    const score =
      mode === "pick"
        ? scoreByCriteria(offer, criteria)
        : scoreByName(offer, queryTokens.length ? queryTokens : criteria.tokens);
    return { offer, score };
  });

  const minScore = mode === "pick" ? 1.2 : 1.5;

  return scored
    .filter((x) => x.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

module.exports = {
  searchOffers,
  searchOffersRanked,
  detectSearchMode,
  parseCriteria,
  formatPrice,
  tokenize,
};
