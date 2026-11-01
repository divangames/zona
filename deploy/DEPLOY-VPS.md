# Деплой ZonaDeck на VPS

## 1. Сборка на Windows

```bat
build-prod.bat
```

| Пункт | Результат |
|-------|-----------|
| **1** | Папка `release/zonadeck-deploy/` |
| **2** | Папка + каталог + `release/zonadeck-deploy.zip` |
| **3** | Только пересобрать ZIP |

**Важно:** папка `dist/` больше не используется (не пересобирается при каждой сборке).  
Перед заливкой **закройте WinSCP/FileZilla** из `release\zonadeck-deploy`, иначе папка занята.

## 2. Загрузка на сервер

### Вариант A — папка (rsync / WinSCP)

```bash
rsync -avz release/zonadeck-deploy/ root@45.12.72.82:/root/zonadeck-deploy/
```

В WinSCP откройте локально: `release\zonadeck-deploy`

### Вариант B — один ZIP

```bash
scp release/zonadeck-deploy.zip user@SERVER:/opt/
ssh user@SERVER
cd /opt && mkdir -p zonadeck && unzip -o zonadeck-deploy.zip -d zonadeck
cd zonadeck
```

Не заливайте `node_modules` с Windows — на Linux они не подойдут.

## 3. Установка на VPS (Ubuntu/Debian)

Путь: **`/root/zonadeck-deploy`**

### Node.js (если `npm: command not found` или Node 12)

**Проблема Beget/VPS:** битый PPA `certbot` ломает `apt update`, NodeSource не ставится, а `apt install nodejs` даёт **Node 12** — мало.

```bash
cd /root/zonadeck-deploy

# Убрать битый PPA
add-apt-repository -r ppa:certbot/certbot 2>/dev/null || true
rm -f /etc/apt/sources.list.d/certbot-ubuntu-certbot-*.list

# Удалить Node 12
apt-get remove -y nodejs npm
apt-get update

# Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
node -v   # должно быть v20.x
```

Или скрипт: `chmod +x deploy/vps/*.sh && ./deploy/vps/install-node.sh`

**Запасной вариант (NVM):** `./deploy/vps/install-node-nvm.sh` затем `source ~/.bashrc`

Или одной командой (Node + npm-пакеты бота):

```bash
./deploy/vps/setup-server.sh
```

### Бот

```bash
cd /root/zonadeck-deploy
./deploy/vps/install.sh
nano .env   # TELEGRAM_BOT_TOKEN, OLLAMA_HOST и т.д.
```

**SEO-новости (Вордстат + YandexGPT)** — добавьте в `.env` на сервере (ключ с ПК **не** заливается через `update-vps`):

```env
YANDEX_API_KEY=ваш_api_key_из_AI_Studio
YANDEX_FOLDER_ID=b1gxxxxxxxxxxxxxxxx
```

`YANDEX_FOLDER_ID` — ID каталога в [Yandex Cloud](https://console.cloud.yandex.ru/) (тот же, что для AI Studio).

После правки:

```bash
pm2 restart zona-bot
```

**С Windows** (без `nano` — это команда Linux):

```bat
sync-yandex-env-vps.bat
```

Скопирует `YANDEX_API_KEY` и `YANDEX_FOLDER_ID` из локального `.env` на сервер, не трогая `TELEGRAM_BOT_TOKEN`.

Или в PowerShell сначала зайдите на VPS:

```powershell
ssh zonadeck
```

(или `ssh root@45.12.72.82`), **уже на сервере**:

```bash
nano /root/zonadeck-deploy/.env
pm2 restart zona-bot
```

Проверка в Telegram: `/status` (строка про Yandex) и `/seo Nike Air Max 90`.

### Ollama на том же VPS

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llava
ollama pull llama3.2
```

В `.env`:

```env
AI_PROVIDER=ollama
OLLAMA_HOST=http://127.0.0.1:11434
```

## 4. Каталог товаров

Один раз на сервере:

```bash
npm run reload-catalog
```

Или залейте готовый `data/catalog-cache.json` с ПК (пункт 2 в `build-prod.bat`).

## 5. Запуск

### Вариант A — PM2 (рекомендуется)

```bash
npm install -g pm2
./deploy/vps/start.sh
pm2 save
pm2 startup
```

### Вариант B — systemd

```bash
sudo cp deploy/vps/zona-bot.service /etc/systemd/system/
sudo nano /etc/systemd/system/zona-bot.service   # User, WorkingDirectory
sudo systemctl daemon-reload
sudo systemctl enable zona-bot
sudo systemctl start zona-bot
sudo systemctl status zona-bot
```

### Вариант C — вручную

```bash
node bot/index.js
```

## 6. Проверка

- `pm2 logs zona-bot` или `journalctl -u zona-bot -f`
- В Telegram: `/status` у @ZonaDeck_bot

## 7. Быстрое обновление (с Windows)

**`update-vps.bat`** или `start.bat` → **8**

| Пункт | Действие |
|-------|----------|
| **1** | Сборка + заливка кода + `npm ci` + `pm2 restart` |
| **3** | Только заливка (`.env` на сервере **не** трогается) |
| **4** | Только перезапуск бота |

Одной командой:

```bat
update-vps.bat quick
```

### Один раз — больше не вводить пароль при каждой заливке

1. **`setup-deploy-once.bat`** — `deploy.local.env` (хост, логин, путь).
2. **`setup-ssh-once.bat`** — ключ `~\.ssh\zonadeck_ed25519`, пароль VPS **один раз**.
3. **`test-ssh.bat`** — проверка: должно быть `OK` без запроса пароля.

В `deploy.local.env` должны быть **обе** строки:

```env
VPS_SSH=zonadeck
VPS_SSH_KEY=C:\Users\ВАШ_ЛОГИН\.ssh\zonadeck_ed25519
```

Скрипты передают ключ явно (`-i`) и держат одно SSH-соединение на время `update-vps` (не спрашивает пароль на каждый файл).

**Если всё равно просит пароль:** снова `setup-ssh-once.bat` → `test-ssh.bat`. В меню: `start.bat` → 9 и 10.

Пароль в файлы **не** сохраняем.

При обновлении заливается и `data/basketball-birthdays.json` (календарь ДР). Каталог `catalog-cache.json` по умолчанию **не** перезаписывается.
