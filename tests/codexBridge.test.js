const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { BridgeStore } = require('../services/codexBridgeStore');
const { createCodexBridgeMiddleware } = require('../bot/handlers/codexBridge');
const { sendProjectReport, formatProjectReport } = require('../services/projectReport');
const { healthStatus } = require('../services/bridgeHealth');

test('Readiness rejects stale receivers and mismatched credentials without exposing them', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zona-health-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, 'data', 'codex-bridge');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(root, '.env'), 'TELEGRAM_BOT_TOKEN="fixture-token"\nTELEGRAM_OWNER_CHAT_ID=123\n');
  const request = { ownerId: '123', tokenDigest: require('crypto').createHash('sha256').update('fixture-token').digest('hex') };
  const now = Date.now();
  const pulse = (healthy, age) => fs.writeFileSync(path.join(dir, 'receiver-health.json'), JSON.stringify({ healthy, checkedAt: new Date(now - age).toISOString() }));
  assert.equal(healthStatus(root, request, now).receiverHealthy, false);
  pulse(true, 2000);
  assert.deepEqual(healthStatus(root, request, now), { protocolVersion: 1, idempotentInbox: true, receiverHealthy: true, tokenMatches: true, ownerMatches: true });
  assert.equal(healthStatus(root, { ...request, ownerId: '456' }, now).ownerMatches, false);
  assert.equal(healthStatus(root, { ...request, tokenDigest: 'wrong' }, now).tokenMatches, false);
  pulse(true, 120001);
  assert.equal(healthStatus(root, request, now).receiverHealthy, false);
  pulse(false, 1000);
  assert.equal(healthStatus(root, request, now).receiverHealthy, false);
  assert.ok(!JSON.stringify(healthStatus(root, request, now)).includes('fixture-token'));
});

function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zona-bridge-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = new BridgeStore(root);
  const route = { id: 'report-1', deviceId: 'pc-1', ownerId: '123', threadId: 'thread-1', hostId: 'local', title: 'Project', recommendations: [{ label: 'Check', prompt: 'Check the result' }] };
  store.register(route);
  const replies = [];
  const ctx = { chat: { id: 123, type: 'private' }, from: { id: 123 }, reply: async (text, extra) => { replies.push({ text, extra }); return { message_id: 99 }; }, answerCbQuery: async () => {} };
  return { store, route, replies, ctx, middleware: createCodexBridgeMiddleware(store) };
}

test('Recommendation returns to exact source chat, deduplicates clicks and isolates devices', async t => {
  const { store, ctx, middleware } = setup(t);
  ctx.callbackQuery = { data: 'zr:report-1:0' };
  await middleware(ctx, () => assert.fail('unexpected fallthrough'));
  await middleware(ctx, () => assert.fail('unexpected fallthrough'));
  assert.deepEqual(store.claim('other-pc'), []);
  const jobs = store.claim('pc-1');
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].threadId, 'thread-1');
  assert.equal(jobs[0].text, 'Check the result');
  assert.deepEqual(store.claim('pc-1'), []);
  assert.equal(store.processing('pc-1').length, 1);
  assert.throws(() => store.ack('other-pc', jobs[0].id));
  store.ack('pc-1', jobs[0].id);
  await middleware(ctx, () => {});
  assert.deepEqual(store.claim('pc-1'), []);
});
test('Custom task requires a reply binding and preserves text exactly', async t => {
  const { store, ctx, middleware } = setup(t);
  ctx.callbackQuery = { data: 'zr:report-1:custom' };
  await middleware(ctx, () => {});
  delete ctx.callbackQuery;
  ctx.message = { message_id: 101, reply_to_message: { message_id: 99 }, text: 'Моя задача: проверь <HTML>\nИ мобильный экран.' };
  await middleware(ctx, () => assert.fail('unexpected fallthrough'));
  assert.equal(store.claim('pc-1')[0].text, ctx.message.text);
});
test('Other users and groups cannot enqueue tasks', async t => {
  const { store, ctx, middleware } = setup(t);
  ctx.callbackQuery = { data: 'zr:report-1:0' };
  ctx.from.id = 456;
  await middleware(ctx, () => {});
  ctx.from.id = 123;
  ctx.chat.type = 'group';
  await middleware(ctx, () => {});
  assert.deepEqual(store.claim('pc-1'), []);
});
test('Owner reply recovers an interrupted SSH binding only from the real bot keyboard', async t => {
  const { store, ctx, middleware } = setup(t);
  ctx.botInfo = { id: 999 };
  ctx.message = { message_id: 21, text: 'My custom task', reply_to_message: { message_id: 20, from: { id: 888 }, reply_markup: { inline_keyboard: [[{ callback_data: 'zr:report-1:custom' }]] } } };
  let next = false;
  await middleware(ctx, () => { next = true; });
  assert.ok(next);
  assert.deepEqual(store.claim('pc-1'), []);
  ctx.message.reply_to_message.from.id = 999;
  await middleware(ctx, () => assert.fail('must recover binding'));
  assert.equal(store.byMessage('123', 20).id, 'report-1');
  assert.equal(store.claim('pc-1')[0].text, 'My custom task');
});
test('Unrelated text falls through and invalid routes cannot traverse paths', async t => {
  const { store, ctx, middleware, route } = setup(t);
  ctx.message = { text: 'ordinary message' };
  let next = false;
  await middleware(ctx, () => { next = true; });
  assert.ok(next);
  assert.throws(() => store.register({ ...route, id: '../escape' }));
});
test('Interrupted queue write is recovered; a dead claimant does not block delivery', t => {
  const { store, route } = setup(t);
  const result = store.enqueue(route, 'Recover task', 'source');
  fs.unlinkSync(store.file('pending', result.id));
  store.enqueue(route, 'Recover task', 'source');
  assert.ok(store.read('pending', result.id));
  const { execFileSync } = require('node:child_process');
  const deadPid = Number(execFileSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' }));
  fs.writeFileSync(path.join(store.root, 'claim-pc-1.lock'), JSON.stringify({ pid: deadPid }));
  assert.equal(store.claim('pc-1')[0].text, 'Recover task');
});
test('Multi-part reports bind every message and attach controls only to last part', async () => {
  const report = { title: 'Test', completed: ['x'.repeat(9000)], checks: ['ok'], projectStatus: ['ok'], deployment: ['no'], issues: ['no'], nextSteps: ['next'], recommendations: [{ label: 'Run', prompt: '<check>' }] };
  const sent = []; const bound = [];
  const keyboard = { inline_keyboard: [[{ text: 'Run', callback_data: 'zr:id:0' }]] };
  await sendProjectReport({ getChat: async () => ({ type: 'private' }), sendMessage: async (id, text, extra) => { sent.push(extra); return { message_id: sent.length }; } }, '123', report, { replyMarkup: keyboard, onDelivered: m => bound.push(m.message_id) });
  assert.ok(sent.length > 1);
  assert.equal(bound.length, sent.length);
  assert.ok(sent.slice(0, -1).every(extra => !extra.reply_markup));
  assert.deepEqual(sent.at(-1).reply_markup, keyboard);
  assert.match(formatProjectReport(report).join(''), /&lt;check&gt;/);
});


test('Lost claim response replays the same job only within the same request; ack is idempotent', t => {
  const { store, route } = setup(t);
  const first = store.enqueue(route, 'first task', 'one');
  store.enqueue(route, 'second task', 'two');
  const { runBridgeTransport } = require('../services/bridgeTransport');
  let calls = 0;
  const request = { action: 'claimOnce', requestId: 'request-1' };
  const response = runBridgeTransport(request, () => {
    const jobs = store.claim('pc-1', request.requestId);
    calls++;
    return calls === 1 ? { status: 255 } : { status: 0, stdout: JSON.stringify({ jobs }) };
  }, () => {});
  assert.equal(calls, 2);
  assert.equal(response.jobs.length, 1);
  const id = response.jobs[0].id;
  assert.equal(store.processing('pc-1').length, 1);
  assert.deepEqual(store.claim('pc-1', 'another-request'), []);
  assert.deepEqual(store.claim('other-pc', 'request-1'), []);
  store.ack('pc-1', id);
  store.ack('pc-1', id);
  assert.throws(() => store.ack('other-pc', id));
  assert.equal(store.processing('pc-1').length, 0);
  assert.equal(store.claim('pc-1', 'request-2').length, 1);
});


test('Interrupted pending rewrite is ignored and lost ack response can be retried', t => {
 const { store, route } = setup(t);
 fs.writeFileSync(path.join(store.root, 'pending', 'orphan.json.tmp'), '{');
 const enqueued = store.enqueue(route, 'test task', 'ack-test');
 assert.equal(store.claim('pc-1', 'request-ack')[0].id, enqueued.id);
 const { runBridgeTransport } = require('../services/bridgeTransport');
 let calls=0;
 runBridgeTransport({action:'ackOnce'}, () => {
   store.ack('pc-1', enqueued.id);
   return ++calls===1 ? {status:255} : {status:0,stdout:'{"ok":true}'};
 }, () => {});
 assert.equal(calls,2);
 assert.equal(store.processing('pc-1').length,0);
 assert.deepEqual(store.claim('pc-1', 'new-request'),[]);
});
