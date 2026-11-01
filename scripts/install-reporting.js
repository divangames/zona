const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const START = '<!-- ZONA REPORTING START -->';
const END = '<!-- ZONA REPORTING END -->';

function updateManaged(file, body) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const old = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const start = old.indexOf(START);
  const end = old.indexOf(END);
  if ((start < 0) !== (end < 0) || (start >= 0 && end < start)) {
    throw new Error(`Повреждён блок ZONA в ${file}; исправьте маркеры перед установкой.`);
  }
  const block = `${START}\n${body.trim()}\n${END}`;
  const next = start >= 0
    ? old.slice(0, start) + block + old.slice(end + END.length)
    : old + (old && !old.endsWith('\n') ? '\n' : '') + '\n' + block + '\n';
  if (old === next) return;
  if (old) fs.copyFileSync(file, `${file}.zona-backup-${Date.now()}`);
  fs.writeFileSync(file, next, 'utf8');
}

function install({ client, home = os.homedir(), root = path.resolve(__dirname, '..'), project, codexHome }) {
  if (!['codex', 'claude', 'cursor'].includes(client)) throw new Error('Укажите --client codex, claude или cursor.');
  if (project && !fs.statSync(project).isDirectory()) throw new Error('Папка проекта не найдена.');
  const base = client === 'codex' ? (codexHome || path.join(home, '.codex')) : path.join(home, `.${client}`);
  const skill = path.join(base, 'skills', 'zona-reports');
  const sender = path.join(root, 'scripts', 'send-project-report.js');
  const body = `## Личные отчёты ZONA: все чаты и проекты
Пользователь подключил Telegram-отчёты от ZONA после завершения запросов; дополнительное разрешение на каждую отправку не требуется. Соблюдай отмену уведомлений пользователем.
Перед финальным ответом прочитай навык ${path.join(skill, 'SKILL.md')} и подготовь отдельный JSON с UUID вне Git: title и непустые массивы completed, checks, projectStatus, deployment, issues, nextSteps. Назови проект/чат, пиши от ZONA в женском роде. Указывай только факты; неизвестное и неприменимое отмечай. Для простого вопроса достаточно краткого отчёта. Не включай секреты и персональные данные.
Проверь: node "${sender}" "<absolute-report.json>" --dry-run. Отправь той же командой без --dry-run. Отправитель использует настройки ZONA, работает из любой папки и не запускает polling. Не дублируй отправку при нескольких правилах. Подтверждай доставку только по успешному ответу Telegram; ошибки и частичную доставку сообщай честно.
Это правило агента на данном ПК, а не фоновый монитор; старые задачи не отправляются автоматически. Не обещай работу на других ПК или в среде без инструментов.`;
  fs.mkdirSync(skill, { recursive: true });
  fs.copyFileSync(path.join(root, 'skills', 'zona-reports', 'SKILL.md'), path.join(skill, 'SKILL.md'));
  fs.writeFileSync(path.join(skill, 'installation.json'), JSON.stringify({ projectDir: root, client }, null, 2) + '\n');
  const targets = [];
  if (client === 'codex') {
    const override = path.join(base, 'AGENTS.override.md');
    targets.push(fs.existsSync(override) && fs.readFileSync(override, 'utf8').trim() ? override : path.join(base, 'AGENTS.md'));
  } else if (client === 'claude') targets.push(path.join(base, 'CLAUDE.md'));
  else {
    const rule = path.join(base, 'zona-reporting-user-rule.md');
    updateManaged(rule, body);
    console.log(`Cursor: вставьте текст ${rule} в Settings → Rules → User Rules для всех чатов.`);
    if (project) {
      const target = path.join(path.resolve(project), '.cursor', 'rules', 'zona-reports.mdc');
      if (fs.existsSync(target) && !fs.readFileSync(target, 'utf8').includes(START)) {
        throw new Error(`Файл ${target} уже существует и не управляется ZONA.`);
      }
      if (!fs.existsSync(target)) {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, '---\ndescription: ZONA Telegram completion reports\nalwaysApply: true\n---\n');
      }
      targets.push(target);
    }
  }
  for (const file of targets) updateManaged(file, body);
  console.log(`Навык ${client} установлен. Проверка доставки обязательна: node "${path.join(root, 'scripts', 'test-reporting.js')}"`);
  return { skill, targets };
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    const options = {};
    for (let i = 0; i < args.length; i += 2) {
      const key = { '--client': 'client', '--home': 'home', '--project': 'project' }[args[i]];
      if (!key || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Использование: --client codex|claude|cursor [--project путь] [--home путь]');
      options[key] = path.isAbsolute(args[i + 1]) || key === 'client' ? args[i + 1] : path.resolve(args[i + 1]);
    }
    if (!options.home) options.codexHome = process.env.CODEX_HOME;
    install(options);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { install, updateManaged };
