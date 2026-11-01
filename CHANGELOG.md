# Changelog — ZonaDeck (Zona)

Все заметные изменения проекта. Формат ориентирован на [Keep a Changelog](https://keepachangelog.com/ru/1.0.0/).

## [Unreleased]

### Установка уведомлений для AI-агентов
- Навык `skills/zona-reports/SKILL.md` и инструкция `INSTALL.md` для подключения по ссылке из Codex, Claude Code и Cursor.
- Установщик сохраняет существующие правила, добавляет глобальные инструкции Codex/Claude и навык; для Cursor создаёт текст User Rules и опциональное проектное правило.
- Обязательное тестовое сообщение после подключения: `npm run report:test`.
- Проверки сохранности правил, повторной установки, override и настроек Cursor.

### Личные отчёты ZONA
- Команда `npm run report -- reports/current.json` для полного личного отчёта от ZONA.
- HTML-оформление, эмодзи, разбиение длинных отчётов, проверка личного получателя и ошибок доставки.
- Правила отчётности в `AGENTS.md`, настройка `TELEGRAM_OWNER_CHAT_ID` и тесты `npm run test:report`.

### Добавлено
- **`update-vps.bat`** — быстрое обновление: сборка → заливка на VPS → `pm2 restart` (без перезаписи `.env`).
- **`deploy.local.env`** — один файл с хостом/логином/путём; читает `deploy/load-deploy-env.bat`.
- **`setup-deploy-once.bat`**, **`setup-ssh-once.bat`** — один раз: env + SSH-ключ (без пароля при каждой заливке).
- Кнопки Telegram: клавиатура меню, inline «Открыть на сайте» / «Другие 3», обработчик `callback_query`.
- Календарь ДР: фото игрока (Wikipedia/веб), ссылки на кроссовки в каталоге bizoutmax или в интернете с пометкой «нет в магазине».
- SEO-новости: Яндекс Вордстат (ВЧ) + YandexGPT, `/seo`, фото из каталога, длинные тексты частями.

### Изменено
- **`build-prod.bat`**: сборка в `release/zonadeck-deploy` + ZIP; папка `dist` не пересоздаётся (удобно для WinSCP).

### Добавлено
- **`build-prod.bat`** — деплой на VPS (без `node_modules`).
- Скрипты VPS: `deploy/vps/install.sh`, `start.sh`, `ecosystem.config.cjs`, `deploy/DEPLOY-VPS.md`.

- Поиск в **интернете**, если по фото товар **не найден в каталоге** (`services/webSearch.js`).
- Бот **Zona** в промптах генерации текста.

### Изменено
- Ответ по фото: пометка «в каталоге не найдено — описание по интернету (N источн.)».

---

## [2026-06-01] — Группы, карточки, стабильность

### Добавлено
- Работа в **группах Telegram**: упоминание `@ZonaDeck_bot`, команды `/pick@бот`, `/find@бот`, лог `[tg]` в консоли.
- При добавлении в группу — приветствие с подсказками (`my_chat_member`).
- Переменная `.env`: `GROUP_ACCEPT_ALL=1` — обрабатывать все сообщения в группе.
- Отправка **фото товаров** через скачивание на сервер (обход блокировки URL каталога Telegram) — `services/imageFetch.js`.
- **Поиск и подбор** из каталога текстом:
  - по названию — фото, название, описание, цена;
  - по критериям (цвет, размер 35–46, сезон) — до 3 товаров;
  - команды `/find`, `/pick`.
- Референс-сайты стиля: `outmaxshop.ru`, `хасл.рф` в `ai/data.js`.
- Файл **`ИНСТРУКЦИЯ.md`** для команды.
- Скрипт `scripts/check-ollama.js`, пункт **5** в `start.bat`.
- `ZonaDeck.cmd`, `run-bot.bat` — альтернативный запуск.

### Исправлено
- **`handlerTimeout: 0`** → `Infinity` (ошибка `Promise timed out after 0 milliseconds`).
- **`start.bat`**: кириллица и скобки в `echo` ломали CMD — меню на латинице/безопасный синтаксис.
- Упоминания `@бота` в группе не обрабатывались — `bot/utils/groupMessage.js`, fallback username из конфига.
- Удаление **webhook** перед polling, явные `allowedUpdates`.
- Понятные сообщения об ошибках **OpenAI quota** (`services/openaiErrors.js`).

### Изменено
- При запуске бота каталог **не качается** с парсера — только `data/catalog-cache.json`; обновление вручную: `/reload` или `start.bat` → 3.
- Загрузка YML ~200 МБ: потоковый разбор **sax**, лимит axios, скачивание в файл `data/catalog-feed.xml`.

---

## [2026-06-01] — Ollama (бесплатный AI)

### Добавлено
- Провайдер **`AI_PROVIDER=ollama`** по умолчанию (`services/ollamaClient.js`, `services/llmProvider.js`).
- Модели по умолчанию: `llava` (фото), `llama3.2` (текст).
- OpenAI остаётся опционально через `AI_PROVIDER=openai`.

### Изменено
- `descriptionGenerator.js` переведён на абстракцию LLM-провайдера.
- `.env.example`, `README.md` — инструкции под Ollama.

---

## [2026-06-01] — Первый релиз бота

### Добавлено
- Telegram-бот **@ZonaDeck_bot** (Telegraf).
- Загрузка каталога с `https://outmaxshop.com/yml/all_new.yml`, кэш `data/catalog-cache.json`.
- Обработка **фото кроссовок**: распознавание + генерация названия и описания в стиле каталога и референс-сайтов.
- Конфиг `ai/data.js`, секреты в `.env`.
- `start.bat` — меню: install, run, reload catalog, create `.env`.
- Сервисы: `catalogLoader`, `styleReference`, `productMatcher`, `descriptionGenerator`.
- Команды: `/start`, `/status`, `/reload`.

### Безопасность
- Токен бота вынесен из `data.js` в `.env` (рекомендация перевыпустить токен, если светился в чате).

---

## Как вести дальше

При каждом заметном изменении добавляйте секцию под `[Unreleased]` или новую дату:

```markdown
## [ГГГГ-ММ-ДД] — Краткий заголовок
### Добавлено / Изменено / Исправлено / Удалено
- пункт
```
