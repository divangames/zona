const config = require("../ai/config");

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function scoreOffer(offer, vision) {
  const queryTokens = new Set([
    ...tokenize(vision.brand),
    ...tokenize(vision.model),
    ...tokenize(vision.colorway),
    ...tokenize(vision.keywords?.join(" ")),
  ]);

  if (!queryTokens.size) return 0;

  const offerTokens = tokenize(offer.searchText);
  let hits = 0;
  for (const t of queryTokens) {
    if (offer.searchText.includes(t)) hits += 1;
  }

  const overlap = hits / queryTokens.size;
  const nameBonus = tokenize(offer.name).filter((t) => queryTokens.has(t)).length * 0.15;
  return overlap + nameBonus;
}

function rankSimilarOffers(catalog, vision, limit = 5) {
  const offers = catalog?.offers || [];
  if (!offers.length) return { offers: [], topScore: 0 };

  const ranked = offers
    .map((offer) => ({ offer, score: scoreOffer(offer, vision) }))
    .filter((x) => x.score > 0.15)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    offers: ranked.map((x) => x.offer),
    topScore: ranked[0]?.score || 0,
  };
}

function findSimilarOffers(catalog, vision, limit = 5) {
  return rankSimilarOffers(catalog, vision, limit).offers;
}

function isCatalogMatchWeak(catalog, vision) {
  const minScore = config.webSearch?.catalogMinScore ?? 0.5;
  const { offers, topScore } = rankSimilarOffers(catalog, vision, 3);

  if (!offers.length) return true;
  if (topScore < minScore) return true;

  const brand = String(vision.brand || "").toLowerCase().trim();
  if (brand.length >= 3) {
    const name = offers[0].name.toLowerCase();
    const vendor = (offers[0].vendor || "").toLowerCase();
    if (!name.includes(brand) && !vendor.includes(brand)) return true;
  }

  return false;
}

module.exports = {
  findSimilarOffers,
  rankSimilarOffers,
  scoreOffer,
  isCatalogMatchWeak,
};
