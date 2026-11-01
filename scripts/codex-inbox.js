const { bridgeRequest, deviceId } = require('../services/codexBridgeClient');
try {
  const action = process.argv[2];
  if (!['claim', 'status', 'ack'].includes(action)) throw new Error('Использование: node scripts/codex-inbox.js claim|status|ack [jobId]');
  console.log(JSON.stringify(bridgeRequest({ action, deviceId: deviceId(), id: process.argv[3] }), null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
