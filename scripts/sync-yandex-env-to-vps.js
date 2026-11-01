/**
 * Обновляет YANDEX_API_KEY и YANDEX_FOLDER_ID на VPS из локального .env
 * (остальной .env на сервере не трогает).
 */
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const apiKey = process.env.YANDEX_API_KEY?.trim();
const folderId = process.env.YANDEX_FOLDER_ID?.trim();

if (!apiKey || !folderId) {
  console.error("В локальном .env нужны YANDEX_API_KEY и YANDEX_FOLDER_ID");
  process.exit(1);
}

if (apiKey.includes("_AI_Studio")) {
  console.error("Уберите суффикс _AI_Studio из YANDEX_API_KEY");
  process.exit(1);
}

const root = path.join(__dirname, "..");
const deployEnv = path.join(root, "deploy.local.env");
let sshTarget = "root@45.12.72.82";
let remotePath = "/root/zonadeck-deploy";
let sshExtra = [];

function parseDeployEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  let host = "";
  let user = "";
  let vpsSsh = "";
  for (const line of lines) {
    if (line.startsWith("#") || !line.includes("=")) continue;
    const [k, ...rest] = line.split("=");
    const val = rest.join("=").trim();
    if (/^VPS_HOST$/i.test(k)) host = val;
    if (/^VPS_USER$/i.test(k)) user = val;
    if (/^VPS_PATH$/i.test(k)) remotePath = val;
    if (/^VPS_SSH$/i.test(k)) vpsSsh = val;
    if (/^VPS_SSH_KEY$/i.test(k)) sshExtra = ["-i", val];
  }
  if (vpsSsh) sshTarget = vpsSsh;
  else if (host && user) sshTarget = `${user}@${host}`;
}

parseDeployEnv(deployEnv);

const defaultKey = path.join(process.env.USERPROFILE || "", ".ssh", "zonadeck_ed25519");
if (!sshExtra.length && fs.existsSync(defaultKey)) {
  sshExtra = ["-i", defaultKey];
}

const remoteEnv = `${remotePath}/.env`;
const script = `set -e
ENV_FILE="${remoteEnv}"
mkdir -p "$(dirname "$ENV_FILE")"
touch "$ENV_FILE"
grep -v '^YANDEX_' "$ENV_FILE" > "$ENV_FILE.tmp" || true
mv "$ENV_FILE.tmp" "$ENV_FILE"
echo "YANDEX_API_KEY=${apiKey.replace(/"/g, '\\"')}" >> "$ENV_FILE"
echo "YANDEX_FOLDER_ID=${folderId.replace(/"/g, '\\"')}" >> "$ENV_FILE"
echo "OK: Yandex vars updated in $ENV_FILE"
`;

const sshArgs = [
  ...sshExtra,
  "-o",
  "StrictHostKeyChecking=accept-new",
  sshTarget,
  "bash",
  "-s",
];

console.log(`Сервер: ${sshTarget}`);
console.log(`Файл: ${remoteEnv}`);

const child = spawn("ssh", sshArgs, { stdio: ["pipe", "inherit", "inherit"], shell: false });
child.stdin.write(script);
child.stdin.end();

child.on("close", (code) => {
  if (code === 0) {
    console.log("\nПерезапуск бота: ssh ... \"cd " + remotePath + " && pm2 restart zona-bot\"");
  }
  process.exit(code || 0);
});
