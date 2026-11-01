const axios = require("axios");

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
};

function normalizeImageUrl(url, fallbackHost = "https://outmaxshop.com") {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (raw.startsWith("//")) return `https:${raw}`;
  if (raw.startsWith("/")) return `${fallbackHost.replace(/\/$/, "")}${raw}`;
  return raw;
}

function refererFromOffer(offer) {
  if (offer?.url) {
    try {
      const u = new URL(offer.url);
      return `${u.protocol}//${u.host}/`;
    } catch {
      /* ignore */
    }
  }
  return "https://outmaxshop.com/";
}

async function downloadImage(url, referer) {
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 25000,
    maxContentLength: 12 * 1024 * 1024,
    headers: {
      ...BROWSER_HEADERS,
      Referer: referer,
    },
  });

  const type = res.headers["content-type"] || "";
  if (!type.includes("image") && res.data?.byteLength < 200) {
    throw new Error("Not an image");
  }

  return Buffer.from(res.data);
}

/**
 * Telegram не может скачать многие URL каталога (защита, Referer).
 * Качаем фото сами и отдаём файлом.
 */
async function fetchProductImageBuffer(offer) {
  const referer = refererFromOffer(offer);
  const urls = (offer.pictures || [])
    .map((u) => normalizeImageUrl(u, referer.replace(/\/$/, "")))
    .filter(Boolean);

  for (const url of urls) {
    try {
      const buffer = await downloadImage(url, referer);
      if (buffer.length > 500) return { buffer, sourceUrl: url };
    } catch {
      /* try next picture */
    }
  }

  return null;
}

module.exports = {
  fetchProductImageBuffer,
  downloadImage,
  normalizeImageUrl,
};
