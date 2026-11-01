// Private SSH entrypoint. Reads structured JSON from stdin, never shell-interpolated task text.
const fs = require('node:fs');
const path = require('node:path');
const { BridgeStore } = require('../services/codexBridgeStore');
try {
  const request = JSON.parse(fs.readFileSync(0, 'utf8'));
  const store = new BridgeStore(path.join(__dirname, '..', 'data', 'codex-bridge'));
  let result;
  switch (request.action) {
    case 'health': result = require('../services/bridgeHealth').healthStatus(path.join(__dirname, '..'), request); break;
    case 'register': store.register(request.route); result = { ok: true }; break;
    case 'bind': store.bind(request.id, request.messageId); result = { ok: true }; break;
    case 'claim': result = { jobs: store.claim(request.deviceId), processing: store.processing(request.deviceId) }; break;
    case 'claimOnce':
      if (typeof request.requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(request.requestId)) throw new Error('Invalid claim request ID');
      result = { jobs: store.claim(request.deviceId, request.requestId), processing: store.processing(request.deviceId) }; break;
    case 'ackOnce': store.ack(request.deviceId, request.id); result = { ok: true }; break;
    case 'status': result = { processing: store.processing(request.deviceId) }; break;
    case 'ack': store.ack(request.deviceId, request.id); result = { ok: true }; break;
    default: throw new Error('Unknown bridge action');
  }
  console.log(JSON.stringify(result));
} catch (error) { console.error(error.message); process.exitCode = 1; }
