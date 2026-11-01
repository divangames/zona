const path = require("path");
const fs = require("fs");

const DATA_PATH = path.join(__dirname, "..", "data", "basketball-birthdays.json");

const MONTH_NAMES = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

let cachedPlayers = null;

function dataFileExists() {
  return fs.existsSync(DATA_PATH);
}

function loadPlayers() {
  if (cachedPlayers) return cachedPlayers;
  if (!dataFileExists()) {
    const err = new Error(
      `Нет файла data/basketball-birthdays.json (ожидается: ${DATA_PATH}). Обновите деплой: update-vps.bat`
    );
    err.code = "BDAY_DATA_MISSING";
    throw err;
  }
  const raw = fs.readFileSync(DATA_PATH, "utf8");
  const data = JSON.parse(raw);
  cachedPlayers = (data.players || [])
    .filter((p) => p.name && p.birth && !p._duplicate)
    .map(normalizePlayer);
  return cachedPlayers;
}

function normalizePlayer(p) {
  const birthDate = parseIsoDate(p.birth);
  const deathDate = p.death ? parseIsoDate(p.death) : null;
  return {
    ...p,
    birthDate,
    deathDate,
    month: birthDate.getMonth() + 1,
    day: birthDate.getDate(),
    birthYear: birthDate.getFullYear(),
  };
}

function parseIsoDate(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(y, m - 1, d);
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatDateRu(date) {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function formatCareer(p) {
  const start = p.careerStart || "?";
  const end = p.careerEnd != null ? p.careerEnd : "н.в.";
  return `${start}–${end}`;
}

function daysUntilBirthday(player, from = new Date()) {
  const today = startOfDay(from);
  const year = today.getFullYear();
  let next = new Date(year, player.month - 1, player.day);
  if (next < today) {
    next = new Date(year + 1, player.month - 1, player.day);
  }
  const diff = Math.round((next - today) / 86400000);
  return { days: diff, nextDate: next };
}

function daysWord(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "дней";
  if (mod10 === 1) return "день";
  if (mod10 >= 2 && mod10 <= 4) return "дня";
  return "дней";
}

function findNearestPlayer(from = new Date()) {
  const players = loadPlayers();
  let best = null;
  let bestDays = Infinity;

  for (const p of players) {
    const { days } = daysUntilBirthday(p, from);
    if (days < bestDays) {
      bestDays = days;
      best = p;
    }
  }
  return best ? { player: best, daysUntil: bestDays, ...daysUntilBirthday(best, from) } : null;
}

function formatNearestMessage(result) {
  const { player: p, daysUntil, nextDate } = result;
  const turningAge = nextDate.getFullYear() - p.birthYear;

  const lines = [
    "🎂 <b>Ближайший день рождения</b>",
    "",
    `<b>${escapeHtml(p.name)}</b>`,
    `📅 ДР: ${formatDateRu(p.birthDate)} (исполнится ${turningAge})`,
    `⏳ Через ${daysUntil} ${daysWord(daysUntil)} — ${formatDateRu(nextDate)}`,
    `🏀 Карьера: ${escapeHtml(formatCareer(p))}`,
  ];

  if (p.deathDate) {
    lines.push(`🕯 Ушёл: ${formatDateRu(p.deathDate)}`);
  }

  lines.push("", "👟 <b>Кроссовки</b>", escapeHtml(p.sneakers.join(" · ")));
  lines.push("", "💡 <b>Факт</b>", escapeHtml(p.fact || "—"));

  return lines.join("\n");
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatPlayerLine(p) {
  const bday = `${String(p.day).padStart(2, "0")}.${String(p.month).padStart(2, "0")}`;
  const born = p.birthYear;
  let line = `• <b>${bday}</b> — ${escapeHtml(p.name)} (${born})`;
  line += `\n   🏀 ${escapeHtml(formatCareer(p))}`;
  if (p.deathDate) {
    line += ` · 🕯 ${formatDateRu(p.deathDate)}`;
  }
  const kicks = p.sneakers.slice(0, 3).join(", ");
  const more = p.sneakers.length > 3 ? "…" : "";
  line += `\n   👟 ${escapeHtml(kicks + more)}`;
  return line;
}

function buildMonthBlock(monthIndex, list) {
  const lines = [`\n<b>${MONTH_NAMES[monthIndex]}</b> (${list.length})`];
  if (!list.length) {
    lines.push("<i>— нет записей —</i>");
    return lines.join("\n");
  }
  for (const p of list) {
    lines.push(formatPlayerLine(p));
  }
  return lines.join("\n");
}

function buildYearlyScheduleMessages() {
  const players = loadPlayers();
  const byMonth = Array.from({ length: 12 }, () => []);

  for (const p of players) {
    byMonth[p.month - 1].push(p);
  }

  for (const list of byMonth) {
    list.sort((a, b) => a.day - b.day || a.name.localeCompare(b.name, "ru"));
  }

  const header = `📆 <b>Календарь ДР баскетболистов</b> (${players.length} игроков)\n<i>Сигнатурные линейки · 12 месяцев</i>\n`;
  const messages = [];
  let current = header;
  const maxLen = 3900;

  for (let m = 0; m < 12; m++) {
    const block = buildMonthBlock(m, byMonth[m]);
    if (current.length + block.length > maxLen) {
      messages.push(current.trim());
      current = block;
    } else {
      current += block;
    }
  }

  if (current.trim()) messages.push(current.trim());
  return messages.length ? messages : ["Календарь пуст."];
}

function getPlayerCount() {
  return loadPlayers().length;
}

module.exports = {
  loadPlayers,
  dataFileExists,
  findNearestPlayer,
  formatNearestMessage,
  buildYearlyScheduleMessages,
  getPlayerCount,
  MONTH_NAMES,
  escapeHtml,
  formatDateRu,
  formatCareer,
  daysWord,
};
