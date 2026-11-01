function formatOpenAIError(err) {
  const code = err?.code || err?.error?.code;
  const type = err?.type || err?.error?.type;

  if (code === "insufficient_quota" || type === "insufficient_quota") {
    return (
      "Закончилась квота OpenAI (нет средств на балансе).\n\n" +
      "Что сделать:\n" +
      "1. https://platform.openai.com/account/billing — пополните баланс\n" +
      "2. https://platform.openai.com/api-keys — проверьте ключ в .env\n" +
      "3. Перезапустите бота после пополнения"
    );
  }

  if (code === "rate_limit_exceeded" || err?.status === 429) {
    return "Лимит запросов OpenAI. Подождите 1–2 минуты и отправьте фото снова.";
  }

  if (code === "invalid_api_key" || err?.status === 401) {
    return "Неверный OPENAI_API_KEY в .env. Создайте новый ключ на platform.openai.com";
  }

  return err?.message || "Ошибка OpenAI";
}

module.exports = { formatOpenAIError };
