/**
 * Только кроссовки из YML outmaxshop.com (не одежда, не сланцы/шорты).
 */

const NON_SNEAKER_URL_RE =
  /\/(?:noski|futbolk|tolstovk|svitshot|kurtk|bryuk|short|shtan|kepk|beysbolk|shapka|perchatk|remen|riukzak|sumk|plate|kostyum|rubashk|dzhins|trench|parka|zhilet|majk|hoodie|leggins|bruk|slanc|sandal|shlep|tapok|tapochk|rashgard|polo|dzhers|braslet|sportivnyj-kostyum|sportivnyy-kostyum|velosiped|myach|myachi|aksessuar)/i;

const NON_SNEAKER_NAME_RE =
  /(?:^|\s)(?:носки|футболк|худи|куртк|штаны|шорты|кепк|свитшот|рюкзак|сумк|костюм|рубашк|джинс|жилет|плать|сланц|сандал|шлёп|шлеп|тапоч|тапок|браслет|рашгард|поло|джерси|бейсболк|шапк|перчатк|ремень|рюкзак|леггинс|спортивный\s+костюм|velo|велосипед)(?:\s|$)/i;

const SNEAKER_URL_RE = /\/(?:krossovki[-/]|snickers\/)/i;
const SNEAKER_NAME_RE = /^(?:кроссовки|кеды|кед)\b/i;

function isSneakerCatalogOffer(offer) {
  if (!offer?.name) return false;
  const url = String(offer.url || "").toLowerCase();
  const name = String(offer.name || "").trim().toLowerCase();

  if (NON_SNEAKER_URL_RE.test(url)) return false;
  if (NON_SNEAKER_NAME_RE.test(name)) return false;
  if (SNEAKER_URL_RE.test(url)) return true;
  if (SNEAKER_NAME_RE.test(name)) return true;

  return false;
}

/** Тема подборки → запрос с явным «кроссовки». */
function normalizeSneakerSearchTopic(topic) {
  let q = String(topic || "")
    .replace(/топ[\s-]*\d+/gi, " ")
    .replace(/\bкроссовок\b/gi, "кроссовки")
    .replace(/\s+/g, " ")
    .trim();

  if (!q) return "кроссовки";
  if (!/кроссовк|кед\b|sneaker/i.test(q)) {
    q = `кроссовки ${q}`;
  }
  return q;
}

function filterSneakerOffers(offers) {
  return (offers || []).filter(isSneakerCatalogOffer);
}

function sneakerCatalogView(catalog) {
  if (!catalog) return { offers: [] };
  return {
    ...catalog,
    offers: filterSneakerOffers(catalog.offers),
  };
}

module.exports = {
  isSneakerCatalogOffer,
  normalizeSneakerSearchTopic,
  filterSneakerOffers,
  sneakerCatalogView,
};
