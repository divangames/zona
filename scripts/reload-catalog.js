const { getCatalog, isCatalogLoading } = require("../services/catalogLoader");
const { collectStyleSamples } = require("../services/styleReference");
const config = require("../ai/config");

(async () => {
  if (isCatalogLoading()) {
    console.log("Загрузка уже выполняется другим процессом. Подождите.");
    process.exit(0);
  }
  console.log("Загрузка", config.parserUrl);
  const catalog = await getCatalog({ force: true });
  console.log("Готово:", catalog.offerCount, "позиций, сохранено в", config.paths.catalogCache);

  const sites = (config.referenceSites || []).filter(Boolean);
  if (sites.length) {
    console.log("Сбор примеров с сайтов…");
    const samples = await collectStyleSamples();
    console.log(
      "Стиль:",
      samples.titles?.length || 0,
      "названий,",
      samples.descriptions?.length || 0,
      "описаний"
    );
  }
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
