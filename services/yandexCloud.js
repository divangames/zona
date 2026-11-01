const axios = require("axios");
const config = require("../ai/config");

function getApiKey() {
  return config.yandex?.apiKey || process.env.YANDEX_API_KEY || "";
}

function getFolderId() {
  return config.yandex?.folderId || process.env.YANDEX_FOLDER_ID || "";
}

function yandexConfigured() {
  return Boolean(getApiKey() && getFolderId());
}

function authHeaders(extra = {}) {
  const key = getApiKey();
  if (!key) {
    throw new Error("YANDEX_API_KEY не задан в .env");
  }
  return {
    Authorization: `Api-Key ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function yandexPost(url, body, options = {}) {
  const res = await axios.post(url, body, {
    timeout: options.timeout || 120000,
    headers: authHeaders(options.headers),
  });
  return res.data;
}

module.exports = {
  getApiKey,
  getFolderId,
  yandexConfigured,
  authHeaders,
  yandexPost,
};
