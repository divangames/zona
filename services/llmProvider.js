const OpenAI = require("openai");
const config = require("../ai/config");
const { formatOpenAIError } = require("./openaiErrors");
const ollama = require("./ollamaClient");

function useOllama() {
  return config.ai.provider === "ollama";
}

function getOpenAIClient() {
  if (!config.openai.apiKey) {
    throw new Error("OPENAI_API_KEY не задан в .env (или переключите AI_PROVIDER=ollama)");
  }
  const options = { apiKey: config.openai.apiKey };
  if (config.openai.baseURL) options.baseURL = config.openai.baseURL;
  return new OpenAI(options);
}

async function visionJson(imageUrl, prompt) {
  if (useOllama()) {
    const base64 = await ollama.downloadImageBase64(imageUrl);
    const raw = await ollama.chat({
      model: config.ollama.visionModel,
      messages: [{ role: "user", content: prompt }],
      images: [base64],
      jsonMode: true,
    });
    return raw;
  }

  const client = getOpenAIClient();
  const response = await client.chat.completions.create({
    model: config.openai.visionModel,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      },
    ],
    max_tokens: 400,
  });
  return response.choices[0]?.message?.content || "{}";
}

async function textJson(system, user, { maxTokens = 900 } = {}) {
  if (useOllama()) {
    return ollama.chat({
      model: config.ollama.textModel,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      jsonMode: true,
      numPredict: maxTokens,
    });
  }

  const client = getOpenAIClient();
  const response = await client.chat.completions.create({
    model: config.openai.model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.45,
    max_tokens: maxTokens,
  });
  return response.choices[0]?.message?.content || "{}";
}

async function callLlm(fn) {
  try {
    return await fn();
  } catch (err) {
    const message = useOllama() ? ollama.formatOllamaError(err) : formatOpenAIError(err);
    throw new Error(message);
  }
}

function parseJsonFromText(raw, fallback) {
  try {
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    if (jsonStart === -1) return fallback;
    return JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
  } catch {
    return fallback;
  }
}

async function checkAiReady() {
  if (useOllama()) return ollama.checkHealth();
  if (!config.openai.apiKey) {
    return { ok: false, error: "OPENAI_API_KEY не задан" };
  }
  return { ok: true, provider: "openai" };
}

function aiStatusLine() {
  if (useOllama()) {
    return `AI: Ollama (${config.ollama.visionModel} + ${config.ollama.textModel})`;
  }
  return config.openai.apiKey ? "AI: OpenAI" : "AI: OpenAI — нет ключа";
}

module.exports = {
  useOllama,
  visionJson,
  textJson,
  callLlm,
  parseJsonFromText,
  checkAiReady,
  aiStatusLine,
};
