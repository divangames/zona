/**
 * Очистка HTML для Telegram parse_mode=HTML.
 * Поддерживаются: b, strong, i, em, u, ins, s, strike, del, code, pre, a.
 */

const ALLOWED = new Set([
  "b",
  "strong",
  "i",
  "em",
  "u",
  "ins",
  "s",
  "strike",
  "del",
  "code",
  "pre",
  "a",
]);

function stripDocumentWrapper(text) {
  let s = String(text || "").trim();
  s = s.replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/i, "");
  s = s.replace(/<!DOCTYPE[^>]*>/gi, "");
  s = s.replace(/<\?xml[^>]*>/gi, "");
  s = s.replace(/<\/?html[^>]*>/gi, "");
  s = s.replace(/<head[\s\S]*?<\/head>/gi, "");
  s = s.replace(/<\/?body[^>]*>/gi, "");
  return s.trim();
}

function unwrapTags(s, tags) {
  let out = s;
  for (const tag of tags) {
    out = out.replace(new RegExp(`<${tag}[^>]*>`, "gi"), "\n");
    out = out.replace(new RegExp(`</${tag}>`, "gi"), "\n");
  }
  return out;
}

function headingsToBold(s) {
  return s.replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, "\n<b>$1</b>\n");
}

function removeDisallowedTags(s) {
  return s.replace(/<\/?([a-z0-9]+)(?:\s[^>]*)?>/gi, (match, tag) => {
    const name = tag.toLowerCase();
    if (ALLOWED.has(name)) return match;
    if (match.startsWith("</")) return "";
    return "";
  });
}

function fixAnchors(s) {
  return s.replace(/<a\s+([^>]*?)>/gi, (m, attrs) => {
    const href = attrs.match(/href\s*=\s*["']([^"']+)["']/i);
    if (!href) return "";
    const url = href[1].replace(/&/g, "&amp;");
    return `<a href="${url}">`;
  });
}

function normalizeWhitespace(s) {
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/&nbsp;/gi, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizeTelegramHtml(html) {
  let s = stripDocumentWrapper(html);
  s = headingsToBold(s);
  s = unwrapTags(s, [
    "div",
    "p",
    "span",
    "section",
    "article",
    "main",
    "header",
    "footer",
    "ul",
    "ol",
    "li",
    "table",
    "tr",
    "td",
    "th",
    "blockquote",
  ]);
  s = removeDisallowedTags(s);
  s = fixAnchors(s);
  s = normalizeWhitespace(s);
  return s;
}

function htmlToPlain(text) {
  return String(text || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

module.exports = {
  sanitizeTelegramHtml,
  htmlToPlain,
};
