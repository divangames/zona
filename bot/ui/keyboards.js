const { Markup } = require("telegraf");

/** Тексты кнопок нижней клавиатуры (должны совпадать с обработчиком меню). */
const BTN = {
  PHOTO: "📷 Описание по фото",
  FIND: "🔍 Найти товар",
  PICK: "👟 Подбор 3",
  BDAY: "🎂 Календарь дней рождений баскетболистов",
  SEO: "📰 SEO-новость",
  STATUS: "📊 Статус",
  MENU: "🏠 Меню",
};

const BDAY_BTN = {
  NEAREST: "Ближайшее",
  LIST: "Список",
};

const MENU_BUTTON_TEXTS = new Set(Object.values(BTN));

function isMenuButtonText(text) {
  return MENU_BUTTON_TEXTS.has(String(text || "").trim());
}

function mainKeyboard() {
  return Markup.keyboard([
    [BTN.PHOTO, BTN.FIND],
    [BTN.PICK],
    [BTN.BDAY],
    [BTN.SEO],
    [BTN.STATUS, BTN.MENU],
  ])
    .resize()
    .persistent();
}

function birthdayCalendarInlineKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("📍 Ближайшее", "bday:nearest"),
      Markup.button.callback("📋 Список", "bday:list"),
    ],
  ]);
}

function offerInlineKeyboard(offer) {
  const row = [];
  if (offer?.url) {
    row.push(Markup.button.url("🛒 Открыть на сайте", offer.url));
  }
  return row.length ? Markup.inlineKeyboard([row]) : undefined;
}

function pickAgainInlineKeyboard() {
  return Markup.inlineKeyboard([
    Markup.button.callback("🔁 Другие 3 варианта", "pick:again"),
  ]);
}

const BOT_COMMANDS = [
  { command: "start", description: "Меню и подсказки" },
  { command: "find", description: "Найти товар по названию" },
  { command: "pick", description: "Подбор 3 товаров" },
  { command: "birthdays", description: "ДР баскетболистов" },
  { command: "seo", description: "SEO-новость (Вордстат)" },
  { command: "status", description: "Каталог и AI" },
  { command: "reload", description: "Обновить каталог" },
];

module.exports = {
  BTN,
  BDAY_BTN,
  isMenuButtonText,
  mainKeyboard,
  birthdayCalendarInlineKeyboard,
  offerInlineKeyboard,
  pickAgainInlineKeyboard,
  BOT_COMMANDS,
};
