const test = require('node:test');
const assert = require('node:assert/strict');
const { runBridgeTransport } = require('../services/bridgeTransport');
const ok = { status: 0, stdout: '{"jobs":[],"processing":[]}' };
test('Claim retries only failures before remote execution', () => {
  let calls = 0;
  const result = runBridgeTransport({ action: 'claim' }, () => ++calls === 1
    ? { status: 255, stderr: 'ssh: connect to host private-host port 22: Connection timed out' } : ok, () => {});
  assert.equal(calls, 2);
  assert.deepEqual(result.jobs, []);
});
test('Lost claim/ack/register responses are never replayed', () => {
  for (const action of ['claim', 'ack', 'register']) {
    for (const result of [{ status: 255, stderr: 'Connection reset by peer' }, { error: { code: 'ETIMEDOUT' } }, { status: 0, stdout: 'truncated' }]) {
      let calls = 0;
      assert.throws(() => runBridgeTransport({ action }, () => { calls++; return result; }, () => {}));
      assert.equal(calls, 1);
    }
  }
});
test('Read-only requests recover from lost responses; retries are bounded', () => {
  let calls = 0;
  runBridgeTransport({ action: 'status' }, () => ++calls < 3 ? { status: 255 } : ok, () => {});
  assert.equal(calls, 3);
  calls = 0;
  assert.throws(() => runBridgeTransport({ action: 'health' }, () => { calls++; return { status: 255 }; }, () => {}), /disconnected/);
  assert.equal(calls, 3);
});
test('Configuration errors fail immediately without disclosing SSH stderr', () => {
  let calls = 0;
  assert.throws(() => runBridgeTransport({ action: 'status' }, () => {
    calls++; return { status: 255, stderr: 'private-user@private-host: Permission denied (publickey)' };
  }, () => {}), e => /configuration/.test(e.message) && !/private-/.test(e.message));
  assert.equal(calls, 1);
});
