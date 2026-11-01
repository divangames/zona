const test = require('node:test');
const assert = require('node:assert/strict');
const { formatProjectReport, sendProjectReport } = require('../services/projectReport');
const report = () => ({ title: 'Задача', completed: ['Добавила отчёт'], checks: ['Проверила'], projectStatus: ['AI не проверен'], deployment: ['Локально'], issues: ['Нет ID'], nextSteps: ['Настроить ID'] });

test('Report contains all sections and escapes external text', () => {
  const data = report();
  data.completed = ['<script>& пример'];
  const text = formatProjectReport(data).join('\n');
  assert.match(text, /&lt;script&gt;&amp;/);
  for (const heading of ['Что я сделала', 'Что я проверила', 'Полный статус', 'Публикация', 'Проблемы', 'Что осталось']) assert.ok(text.includes(heading));
});
test('Long reports retain text and stay within safe Telegram limits', () => {
  const data = report();
  data.completed = ['💜<&'.repeat(5000)];
  const messages = formatProjectReport(data);
  assert.ok(messages.length > 1);
  assert.ok(messages.every(message => message.length <= 3900));
  assert.equal(messages.join('').replace(/\n/g, '').match(/💜&lt;&amp;/g).length, 5000);
});
test('Missing sections fail before network access', async () => {
  await assert.rejects(sendProjectReport({}, '123', { title: 'Empty' }), /completed/);
});
test('Only explicitly configured private recipients are accepted', async () => {
  await assert.rejects(sendProjectReport({}, '-123', report()), /TELEGRAM_OWNER/);
  await assert.rejects(sendProjectReport({ getChat: async () => ({ type: 'group' }) }, '123', report()), /личный чат/);
});
test('Delivery awaits every part and reports partial failure', async () => {
  let calls = 0;
  const data = report();
  data.completed = ['x'.repeat(9000)];
  const telegram = {
    getChat: async () => ({ type: 'private' }),
    sendMessage: async () => { if (++calls === 2) throw { response: { error_code: 403 } }; },
  };
  await assert.rejects(sendProjectReport(telegram, '123', data), /Доставлено частей: 1\//);
  assert.equal(calls, 2);
});
test('Successful delivery returns actual message count', async () => {
  const sent = [];
  const count = await sendProjectReport({ getChat: async () => ({ type: 'private' }), sendMessage: async (...args) => sent.push(args) }, '123', report());
  assert.equal(count, sent.length);
  assert.equal(sent[0][0], '123');
  assert.equal(sent[0][2].parse_mode, 'HTML');
});
