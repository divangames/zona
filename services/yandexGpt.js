const { yandexPost, getFolderId, yandexConfigured } = require("./yandexCloud");
const config = require("../ai/config");

const COMPLETION_URL =
  "https://llm.api.cloud.yandex.net/foundationModels/v1/completion";

function getModelUri() {
  const folderId = getFolderId();
  const model = config.yandex?.gptModel || "yandexgpt";
  const version = config.yandex?.gptVersion || "latest";
  return `gpt://${folderId}/${model}/${version}`;
}

function extractText(data) {
  const alt = data?.result?.alternatives?.[0];
  if (alt?.message?.text) return alt.message.text;
  if (alt?.text) return alt.text;
  if (data?.result?.text) return data.result.text;
  return "";
}

async function completeText(systemText, userText, options = {}) {
  if (!yandexConfigured()) {
    throw new Error("Задайте YANDEX_API_KEY и YANDEX_FOLDER_ID в .env");
  }

  const messages = [];
  if (systemText) {
    messages.push({ role: "system", text: systemText });
  }
  messages.push({ role: "user", text: userText });

  const body = {
    modelUri: getModelUri(),
    completionOptions: {
      stream: false,
      temperature: options.temperature ?? 0.5,
      maxTokens: String(options.maxTokens ?? config.yandex?.articleMaxTokens ?? 8000),
    },
    messages,
  };

  const data = await yandexPost(COMPLETION_URL, body, {
    timeout: options.timeout || 180000,
  });

  const text = extractText(data);
  if (!text?.trim()) {
    throw new Error("YandexGPT вернул пустой ответ");
  }
  return text.trim();
}

module.exports = {
  completeText,
  yandexConfigured,
};
