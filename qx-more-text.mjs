// Long call theses (up to 1,000 characters since 2026-11-08): feeds, the board and the inbox show about the first
// 280 characters with "Show more"; the call page shows the full text. Text only ever goes in as text nodes (or through
// the caller's own safe renderer), so links and markup stay as safe as the surface already was.
export const CALL_TEXT_MAX = 1000, PREVIEW_CHARS = 280;

/** The preview cut: about `limit` characters (code points), ending at a word or line break when one is close. */
export function previewCut(text, limit = PREVIEW_CHARS) {
  const chars = [...String(text || '')];
  if (chars.length <= limit + 20) return null; // short enough: no "Show more" for a few extra characters
  let cut = chars.slice(0, limit).join('');
  const brk = Math.max(cut.lastIndexOf(' '), cut.lastIndexOf('\n'));
  if (brk > limit * 0.7) cut = cut.slice(0, brk);
  return cut.replace(/[\s.,;:!?-]+$/u, '');
}

/** Fills `node` with `text`, clamped with a Show more / Show less toggle. `render(t)` returns nodes (default: text). */
export function clampInto(node, text, {render = t => [document.createTextNode(t)], limit = PREVIEW_CHARS} = {}) {
  const full = String(text || ''), cut = previewCut(full, limit);
  if (cut == null) { node.replaceChildren(...render(full)); return node; }
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'qx-more-btn'; btn.setAttribute('aria-expanded', 'false');
  const show = open => {
    node.replaceChildren(...render(open ? full : cut + '…'), document.createTextNode(' '), btn);
    btn.textContent = open ? 'Show less' : 'Show more'; btn.setAttribute('aria-expanded', String(open));
  };
  btn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); show(btn.getAttribute('aria-expanded') !== 'true'); });
  show(false);
  return node;
}

if (typeof document !== 'undefined' && !document.getElementById('qx-more-style')) {
  const s = document.createElement('style'); s.id = 'qx-more-style';
  s.textContent = '.qx-more-btn{display:inline;padding:0;margin:0;border:0;background:none;font:inherit;font-size:.92em;font-weight:600;font-style:normal;color:var(--qx-brass,inherit);text-decoration:underline;text-underline-offset:3px;cursor:pointer;white-space:nowrap}';
  document.head.append(s);
}
