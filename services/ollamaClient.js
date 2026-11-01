const axios = require("axios");
const config = require("../ai/config");

function host() {
  return (config.ollama.host || "http://127.0.0.1:11434").replace(/\/$/, "");
}

async function downloadImageBase64(imageUrl) {
  const res = await axios.get(imageUrl, {
    responseType: "arraybuffer",
    timeout: 60000,
  });
  return Buffer.from(res.data).toString("base64");
}

async function chat({ model, messages, images, jsonMode = false, numPredict }) {
  const body = {
    model,
    messages,
    stream: false,
    options: {
      temperature: 0.45,
      num_predict: numPredict || 900,
    },
  };

  if (jsonMode) body.format = "json";
  if (images?.length) {
    const last = messages[messages.length - 1];
    if (last?.role === "user") last.images = images;
  }

  const res = await axios.post(`${host()}/api/chat`, body, {
    timeout: config.ollama.timeoutMs || 300000,
  });

  return res.data?.message?.content || "";
}

async function listModels() {
  const res = await axios.get(`${host()}/api/tags`, { timeout: 10000 });
  return (res.data?.models || []).map((m) => m.name);
}

function modelInstalled(models, name) {
  const base = name.split(":")[0];
  return models.some((m) => m === name || m.startsWith(`${base}:`) || m === base);
}

async function checkHealth() {
  try {
    const models = await listModels();
    const visionOk = modelInstalled(models, config.ollama.visionModel);
    const textOk = modelInstalled(models, config.ollama.textModel);
    return { ok: true, models, visionOk, textOk };
  } catch (err) {
    if (err.code === "ECONNREFUSED" || err.code === "ENOTFOUND") {
      return {
        ok: false,
        error:
          "Ollama не запущена. Установите https://ollama.com, запустите приложение и повторите.",
      };
    }
    return { ok: false, error: err.message };
  }
}

function formatOllamaError(err) {
  if (err.code === "ECONNREFUSED" || err.code === "ENOTFOUND") {
    return "Ollama не запущена. Откройте приложение Ollama на этом ПК.";
  }
  if (err.response?.status === 404) {
    return `Модель не найдена. Выполните в терминале:\nollama pull ${config.ollama.visionModel}\nollama pull ${config.ollama.textModel}`;
  }
  return err.response?.data?.error || err.message || "Ошибка Ollama";
}

module.exports = {
  chat,
  downloadImageBase64,
  checkHealth,
  listModels,
  formatOllamaError,
};
