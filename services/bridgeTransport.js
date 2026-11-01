// Never expose raw SSH stderr: it can contain hostnames, users and local key paths.
function failureKind(result) {
  const stderr = result.stderr || '';
  if (/Permission denied|Host key verification failed|REMOTE HOST IDENTIFICATION HAS CHANGED|Bad configuration option/i.test(stderr)) return 'configuration';
  if (/connect to host .* port .*: (Connection timed out|Connection refused|No route to host|Network is unreachable)|Could not resolve hostname|Connection timed out during banner exchange|kex_exchange_identification:/i.test(stderr)) return 'connection';
  if (result.error?.code === 'ENOENT') return 'missing-ssh';
  if (result.error?.code === 'ETIMEDOUT') return 'timeout';
  return result.status === 255 ? 'disconnected' : 'remote';
}

function runBridgeTransport(request, run, sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)) {
  const repeatable = ['health', 'status', 'bind'].includes(request.action);
  let kind;
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = run();
    if (!result.error && result.status === 0) {
      try { return JSON.parse(result.stdout); }
      catch { kind = 'invalid-response'; }
    } else kind = failureKind(result);
    // Connection/banner failures precede authentication and remote execution.
    // A lost response to claim/ack/register is ambiguous: never replay it.
    if (['configuration', 'missing-ssh', 'remote'].includes(kind) || (!repeatable && kind !== 'connection')) break;
    if (attempt < 2) sleep(500 * 2 ** attempt);
  }
  const details = {
    configuration: 'SSH отклонил ключ, конфигурацию или проверку сервера.',
    'missing-ssh': 'Программа ssh не найдена на этом ПК.',
    connection: 'Не удалось установить SSH-соединение после повторных попыток.',
    timeout: 'Истёк срок ожидания ответа SSH; результат команды не подтверждён.',
    disconnected: 'SSH-соединение оборвалось; результат команды не подтверждён.',
    remote: 'Серверная команда моста завершилась с ошибкой.',
    'invalid-response': 'Получен некорректный ответ моста; результат команды не подтверждён.',
  };
  throw new Error(`Мост VPS: ${details[kind]} [${kind}]`);
}
module.exports = { runBridgeTransport, failureKind };
