# ZonaDeck — Telegram-бот для карточек кроссовок

## 💜 ZONA — отчёты из Codex, Claude Code и Cursor

**[Подключить по одной ссылке → INSTALL.md](INSTALL.md)** · **[Навык для агента → SKILL.md](skills/zona-reports/SKILL.md)**

Передайте агенту ссылку на навык с просьбой установить уведомления. После подключения
он обязан отправить тестовое сообщение. Для отчётов не нужно запускать основной бот,
загружать каталог или настраивать AI. Нужны токен вашего Telegram-бота и личный ID.

**[Ответить на отчёт и передать задачу в исходный чат Codex → BRIDGE.md](BRIDGE.md)**.
Обратная связь требует отдельной настройки приёмника на VPS и локального heartbeat.


**Подробная инструкция для команды:** [ИНСТРУКЦИЯ.md](./ИНСТРУКЦИЯ.md)  
**История изменений:** [CHANGELOG.md](./CHANGELOG.md)  
**Деплой на VPS:** [deploy/DEPLOY-VPS.md](./deploy/DEPLOY-VPS.md) · сборка: `build-prod.bat`

Бот [@ZonaDeck_bot](https://t.me/ZonaDeck_bot) принимает **фото кроссовок** и возвращает **название** и **описание** в стиле каталога парсера и референс-сайтов.

## Быстрый старт (Windows + Ollama, бесплатно)

1. [Node.js](https://nodejs.org/) 18+
2. [Ollama](https://ollama.com) — установить и **запустить** (иконка в трее)
3. В терминале скачать модели:
   ```bash
   ollama pull llava
   ollama pull llama3.2
   ```
4. `start.bat` → **4** → в `.env` указать только `TELEGRAM_BOT_TOKEN`
5. `start.bat` → **5** — проверка Ollama
6. **1** → install, **3** → каталог (только первый раз или по желанию), **2** → бот

Каталог хранится в `data/catalog-cache.json`. При запуске бота **ничего не скачивается** — только локальный файл. Обновление: `/reload` или пункт **3** в `start.bat`.

## AI: Ollama или OpenAI

| Режим | `.env` | Оплата |
|--------|--------|--------|
| **Ollama** (по умолчанию) | `AI_PROVIDER=ollama` | Бесплатно, всё на вашем ПК |
| OpenAI | `AI_PROVIDER=openai` + `OPENAI_API_KEY` | Платный API |

### Ollama

```env
AI_PROVIDER=ollama
OLLAMA_HOST=http://127.0.0.1:11434
OLLAMA_VISION_MODEL=llava
OLLAMA_TEXT_MODEL=llama3.2
```

Другие модели с фото: `llama3.2-vision`, `moondream`. Текст: `qwen2.5`, `gemma2`.

Проверка: `npm run check-ollama` или `start.bat` → **5**.

### OpenAI

```env
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

## Настройка `ai/data.js`

| Поле | Назначение |
|------|------------|
| `parserUrl` | YML/XML-каталог |
| `referenceSites` | URL сайтов для образцов стиля |
| `catalog.maxOffers` | Сколько позиций держать в кэше |

## Команды в Telegram

- `/start` — справка
- `/find Nike Dunk` — карточка: фото, название, описание, цена
- `/pick белые 42 зима` — 3 товара по критериям
- Текст без команды — поиск по названию или подбор (если есть цвет/размер/сезон)
- Фото — генерация названия и описания (Ollama)
- `/status` — каталог и AI
- `/reload` — обновить каталог

## Личные отчёты ZONA

После задач разработки агент готовит полный отчёт от лица ZONA: что сделала,
что проверила, состояние проекта, публикация, проблемы и оставшиеся задачи.
Правило для следующих сессий записано в `AGENTS.md`.

Владелец должен отправить боту `/start` в личке и указать свой числовой ID
в `.env`: `TELEGRAM_OWNER_CHAT_ID=123456789`. Username не заменяет числовой ID.
Отправка в группы запрещена самим скриптом.

Файл отчёта содержит `title` и непустые массивы строк `completed`, `checks`,
`projectStatus`, `deployment`, `issues`, `nextSteps`. Пример: `reports/current.json`.

```bash
npm run report -- reports/current.json --dry-run
npm run report -- reports/current.json
npm run test:report
```

Длинный отчёт отправляется несколькими HTML-сообщениями с эмодзи.
Отправка использует токен существующего бота, не запускает второй polling.
Завершение работы фиксирует агент: бот самостоятельно не отслеживает чаты Codex.
При ошибке команда завершится с ненулевым кодом и укажет число доставленных частей,
если ошибка произошла при отправке сообщения. Повторная отправка всего отчёта
может повторить уже доставленные части.

## Файлы проекта

```
ai/              — конфиг
bot/             — Telegram
services/        — каталог, Ollama, генерация
scripts/         — reload-catalog, check-ollama
start.bat        — меню
```
