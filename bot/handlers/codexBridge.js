function isOwner(ctx, route) {
  return route && ctx.chat?.type === 'private' && String(ctx.chat.id) === String(route.ownerId) && String(ctx.from?.id) === String(route.ownerId);
}

function createCodexBridgeMiddleware(store) {
  return async (ctx, next) => {
    const data = ctx.callbackQuery?.data;
    if (data?.startsWith('zr:')) {
      const [, id, action] = data.split(':');
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id || '')) return ctx.answerCbQuery('Неизвестный отчёт');
      const route = store.route(id);
      if (!isOwner(ctx, route)) return ctx.answerCbQuery('Отчёт недоступен');
      if (ctx.callbackQuery.message?.message_id) store.bind(id, ctx.callbackQuery.message.message_id);
      if (action === 'custom') {
        const message = await ctx.reply(`💜 Напишите задачу ответом на это сообщение. Передам её в исходный чат Codex.\n\n${route.title}`, { reply_markup: { force_reply: true, selective: true } });
        store.bind(id, message.message_id);
        return ctx.answerCbQuery();
      }
      if (!/^\d$/.test(action || '') || !route.recommendations[Number(action)]) return ctx.answerCbQuery('Рекомендация недоступна');
      const result = store.enqueue(route, route.recommendations[Number(action)].prompt, `recommendation-${action}`);
      await ctx.answerCbQuery(result.duplicate ? 'Эта задача уже в очереди' : 'Задача добавлена в очередь Codex');
      if (!result.duplicate) await ctx.reply('📨 Я сохранила выбранную задачу. Передам её в исходный чат, когда подключённый Codex проверит очередь.');
      return;
    }
    const replyId = ctx.message?.reply_to_message?.message_id;
    if (!replyId || ctx.chat?.type !== 'private') return next();
    let route = store.byMessage(ctx.chat.id, replyId);
    // A report may reach Telegram while its SSH message binding fails. Recover only
    // from this bot's own inline keyboard in an authenticated owner's reply.
    const original = ctx.message.reply_to_message;
    if (!route && ctx.botInfo?.id && String(original.from?.id) === String(ctx.botInfo.id)) {
      const buttons = original.reply_markup?.inline_keyboard?.flat() || [];
      const data = buttons.find(button => /^zr:[a-zA-Z0-9_-]{1,100}:custom$/.test(button.callback_data || ''))?.callback_data;
      if (data) {
        const candidate = store.route(data.split(':')[1]);
        if (isOwner(ctx, candidate)) { store.bind(candidate.id, replyId); route = candidate; }
      }
    }
    if (!route) return next();
    if (!isOwner(ctx, route)) return;
    if (!ctx.message.text?.trim()) return ctx.reply('Напишите задачу текстом. Файлы и голосовые сообщения пока не передаю.');
    const result = store.enqueue(route, ctx.message.text, `message-${ctx.message.message_id}`);
    return ctx.reply(result.duplicate ? 'Эта задача уже сохранена.' : '📨 Я сохранила вашу задачу для исходного чата Codex. Передача произойдёт при следующей проверке очереди.');
  };
}
module.exports = { createCodexBridgeMiddleware };
