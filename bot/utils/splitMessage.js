const TG_HTML_LIMIT = 3600;

/**
 * Делит длинный HTML-текст на части для Telegram (лимит ~4096).
 */
function splitTelegramHtml(text, maxLen = TG_HTML_LIMIT) {
  const src = String(text || "").trim();
  if (!src) return [];
  if (src.length <= maxLen) return [src];

  const parts = [];
  const blocks = src.split(/\n\n+/);
  let chunk = "";

  for (const block of blocks) {
    const piece = chunk ? `${chunk}\n\n${block}` : block;
    if (piece.length <= maxLen) {
      chunk = piece;
      continue;
    }
    if (chunk) {
      parts.push(chunk);
      chunk = "";
    }
    if (block.length <= maxLen) {
      chunk = block;
      continue;
    }
    let rest = block;
    while (rest.length > maxLen) {
      let cut = maxLen;
      const slice = rest.slice(0, maxLen);
      const lastBreak = Math.max(
        slice.lastIndexOf("\n\n"),
        slice.lastIndexOf(". "),
        slice.lastIndexOf("! "),
        slice.lastIndexOf("? ")
      );
      if (lastBreak > maxLen * 0.5) cut = lastBreak + 1;
      parts.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    chunk = rest;
  }

  if (chunk) parts.push(chunk);
  return parts;
}

module.exports = { splitTelegramHtml, TG_HTML_LIMIT };
