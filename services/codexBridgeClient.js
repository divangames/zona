const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const dotenv = require('dotenv');
const { runBridgeTransport } = require('./bridgeTransport');

function deviceId() {
  const dir = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'zona-device-id');
  if (!fs.existsSync(file)) {
    try { fs.writeFileSync(file, randomUUID(), { flag: 'wx', mode: 0o600 }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  return fs.readFileSync(file, 'utf8').trim();
}

function bridgeRequest(request) {
  // Keep the same operation ID for transport retries, but never across deliveries.
  if (request.action === 'claim') request = { ...request, action: 'claimOnce', requestId: randomUUID() };
  if (request.action === 'ack') request = { ...request, action: 'ackOnce' };
  const root = path.resolve(__dirname, '..');
  const configFile = path.join(root, 'deploy.local.env');
  if (!fs.existsSync(configFile)) throw new Error('Для обратной связи нужен deploy.local.env с SSH-доступом к VPS.');
  const d = dotenv.parse(fs.readFileSync(configFile));
  const target = d.ZONA_BRIDGE_HOST ? `${d.ZONA_BRIDGE_USER || 'root'}@${d.ZONA_BRIDGE_HOST}` : (d.VPS_SSH || `${d.VPS_USER || 'root'}@${d.VPS_HOST || ''}`);
  const remote = d.ZONA_BRIDGE_PATH || d.VPS_PATH;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.@-]*$/.test(target) || !/^\/[a-zA-Z0-9_./-]+$/.test(remote || '')) throw new Error('Некорректные параметры SSH.');
  const args = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-o', 'ConnectionAttempts=2', '-o', 'ServerAliveInterval=5', '-o', 'ServerAliveCountMax=2', '-o', 'StrictHostKeyChecking=yes', '-o', 'IdentitiesOnly=yes'];
  const key = d.ZONA_BRIDGE_SSH_KEY || d.VPS_SSH_KEY;
  if (key) {
    if (!fs.existsSync(key)) throw new Error('SSH-ключ из deploy.local.env не найден на этом ПК.');
    args.push('-i', key);
  }
  args.push(target, `node '${remote}/scripts/bridge-store.js'`);
  return runBridgeTransport(request, () => spawnSync('ssh', args, {
    input: JSON.stringify(request), encoding: 'utf8', timeout: 45000,
    windowsHide: true, maxBuffer: 1024 * 1024,
  }));
}
module.exports = { bridgeRequest, deviceId };
