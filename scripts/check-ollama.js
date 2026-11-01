const config = require("../ai/config");
const ollama = require("../services/ollamaClient");

(async () => {
  console.log("Ollama:", config.ollama.host);
  console.log("Vision:", config.ollama.visionModel, "| Text:", config.ollama.textModel);

  const health = await ollama.checkHealth();
  if (!health.ok) {
    console.error("\nОшибка:", health.error);
    process.exit(1);
  }

  console.log("\nМодели на ПК:", health.models.join(", ") || "(пусто)");

  if (!health.visionOk) {
    console.log(`\nСкачайте vision-модель:\n  ollama pull ${config.ollama.visionModel}`);
  }
  if (!health.textOk) {
    console.log(`\nСкачайте текстовую модель:\n  ollama pull ${config.ollama.textModel}`);
  }

  if (health.visionOk && health.textOk) {
    console.log("\nOllama готова к работе с ботом.");
  } else {
    process.exit(1);
  }
})();
