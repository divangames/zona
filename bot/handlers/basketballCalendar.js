const { Input } = require("telegraf");
const {
  findNearestPlayer,
  buildYearlyScheduleMessages,
  getPlayerCount,
  dataFileExists,
  formatNearestMessage,
} = require("../../services/basketballCalendar");
const { buildNearestBirthdayCard } = require("../../services/basketballBirthdayCard");
const { isGroupChat } = require("../utils/groupMessage");
const { birthdayCalendarInlineKeyboard } = require("../ui/keyboards");

function missingDataReply() {
  return (
    "Файл календаря не найден на сервере.\n\n" +
    "На VPS должно быть:\n" +
    "`/root/zonadeck-deploy/data/basketball-birthdays.json`\n\n" +
    "С Windows: `update-vps.bat` → 1 или 3"
  );
}

async function sendCalendarMenu(ctx) {
  if (!dataFileExists()) {
    return ctx.reply(missingDataReply(), { parse_mode: "Markdown" });
  }
  const count = getPlayerCount();
  const text =
    `🎂 <b>Календарь дней рождений баскетболистов</b>\n\n` +
    `Игроки с собственными линейками кроссовок (чемпионы, звёзды NBA, легенды).\n` +
    `В базе: <b>${count}</b> игроков.\n\n` +
    `Выберите:`;

  const extra = {
    parse_mode: "HTML",
    ...birthdayCalendarInlineKeyboard(),
  };

  if (isGroupChat(ctx)) {
    return ctx.reply(text.replace(/<[^>]+>/g, ""), birthdayCalendarInlineKeyboard());
  }
  return ctx.reply(text, extra);
}

async function sendNearestBirthday(ctx) {
  if (!dataFileExists()) {
    return ctx.reply(missingDataReply());
  }

  const nearest = findNearestPlayer();
  if (!nearest) {
    await ctx.reply("Календарь пуст. Обновите data/basketball-birthdays.json");
    return;
  }

  const wait = await ctx.reply("⏳ Собираю карточку: фото и ссылки на кроссовки…");
  const extra = { parse_mode: "HTML", ...birthdayCalendarInlineKeyboard() };

  try {
    const card = await buildNearestBirthdayCard(nearest);

    try {
      await ctx.telegram.deleteMessage(ctx.chat.id, wait.message_id);
    } catch {
      /* ignore */
    }

    if (card.photoBuffer && !isGroupChat(ctx)) {
      await ctx.replyWithPhoto(Input.fromBuffer(card.photoBuffer, "player.jpg"), {
        caption: card.caption,
        ...extra,
      });
      return;
    }

    if (isGroupChat(ctx)) {
      await ctx.reply(card.caption.replace(/<[^>]+>/g, ""), birthdayCalendarInlineKeyboard());
    } else {
      await ctx.reply(card.caption, extra);
    }
  } catch (err) {
    console.error("[bday]", err);
    try {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        wait.message_id,
        undefined,
        formatNearestMessage(nearest).replace(/<[^>]+>/g, "")
      );
    } catch {
      await ctx.reply(
        `Не удалось собрать карточку: ${err.message}\n\n${formatNearestMessage(nearest)}`,
        extra
      );
    }
  }
}

async function sendFullSchedule(ctx) {
  if (!dataFileExists()) {
    return ctx.reply(missingDataReply());
  }
  const parts = buildYearlyScheduleMessages();
  const inline = birthdayCalendarInlineKeyboard();

  for (let i = 0; i < parts.length; i++) {
    const isLast = i === parts.length - 1;
    const extra = isLast
      ? { parse_mode: "HTML", ...inline }
      : { parse_mode: "HTML", disable_web_page_preview: true };

    if (isGroupChat(ctx)) {
      await ctx.reply(parts[i].replace(/<[^>]+>/g, ""));
    } else {
      await ctx.reply(parts[i], extra);
    }
  }
}

async function handleBirthdayCallback(ctx, data) {
  if (data === "bday:menu") {
    await ctx.answerCbQuery();
    return sendCalendarMenu(ctx);
  }
  if (data === "bday:nearest") {
    await ctx.answerCbQuery();
    return sendNearestBirthday(ctx);
  }
  if (data === "bday:list") {
    await ctx.answerCbQuery("Формирую список на 12 месяцев…");
    return sendFullSchedule(ctx);
  }
}

module.exports = {
  sendCalendarMenu,
  sendNearestBirthday,
  sendFullSchedule,
  handleBirthdayCallback,
};
