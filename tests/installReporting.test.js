const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { install, updateManaged } = require('../scripts/install-reporting');

function sandbox(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'zona-install-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
}

test('Codex preserves existing instructions and is idempotent', t => {
  const home = sandbox(t);
  const file = path.join(home, '.codex', 'AGENTS.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'Keep my instructions.\n');
  install({ client: 'codex', home });
  const first = fs.readFileSync(file, 'utf8');
  install({ client: 'codex', home });
  assert.equal(fs.readFileSync(file, 'utf8'), first);
  assert.ok(first.startsWith('Keep my instructions.\n'));
  assert.ok(fs.existsSync(path.join(home, '.codex', 'skills', 'zona-reports', 'SKILL.md')));
  assert.equal(fs.readdirSync(path.dirname(file)).filter(n => n.includes('zona-backup')).length, 1);
});

test('Codex uses active override and custom home', t => {
  const home = sandbox(t);
  const codexHome = path.join(home, 'custom');
  fs.mkdirSync(codexHome);
  const file = path.join(codexHome, 'AGENTS.override.md');
  fs.writeFileSync(file, 'Existing override.');
  const result = install({ client: 'codex', home, codexHome });
  assert.deepEqual(result.targets, [file]);
  assert.ok(!fs.existsSync(path.join(codexHome, 'AGENTS.md')));
});

test('Claude gets global instructions; Cursor gets skill and optional always-on project rule', t => {
  const home = sandbox(t);
  install({ client: 'claude', home });
  assert.ok(fs.existsSync(path.join(home, '.claude', 'CLAUDE.md')));
  install({ client: 'cursor', home, project: home });
  const rule = fs.readFileSync(path.join(home, '.cursor', 'rules', 'zona-reports.mdc'), 'utf8');
  assert.match(rule, /alwaysApply: true/);
  assert.ok(fs.existsSync(path.join(home, '.cursor', 'zona-reporting-user-rule.md')));
});

test('Malformed managed blocks and unrelated Cursor rules are not overwritten', t => {
  const home = sandbox(t);
  const file = path.join(home, 'broken.md');
  const original = '<!-- ZONA REPORTING START -->\ncustom';
  fs.writeFileSync(file, original);
  assert.throws(() => updateManaged(file, 'new'), /Повреждён/);
  assert.equal(fs.readFileSync(file, 'utf8'), original);
  const rule = path.join(home, '.cursor', 'rules', 'zona-reports.mdc');
  fs.mkdirSync(path.dirname(rule), { recursive: true });
  fs.writeFileSync(rule, 'User content');
  assert.throws(() => install({ client: 'cursor', home, project: home }), /не управляется/);
  assert.equal(fs.readFileSync(rule, 'utf8'), 'User content');
});
