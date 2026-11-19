// G2 (2026-11-18, logo flash): keyed list updates. `next` is the freshly rendered row list (fresh closures, current
// values); for every row whose key (data-key, chain:address) is already on screen, the on-screen row element is kept.
// New keys are inserted, gone keys removed, order follows `next`. A <details> keeps its open state.
// S1 (2026-11-18, jitter): a kept row is PATCHED, never emptied and refilled: only attributes and text that differ are
// written, so a tick that changes one price writes one text node instead of rebuilding every row.
//  - static parts (data-static-part + equal data-static-sig: token art and its <img>) stay the very same element;
//    a changed signature swaps in the new part (its img carries its own load/error binding);
//  - controls (button, input, select, textarea, form) are always the freshly rendered element, because their handlers
//    close over the new row (a Sell button must act on the current balance); focus moves to the replacement;
//  - an <img> or <a> is kept only when its attributes are identical, otherwise the fresh one replaces it;
//  - everything else (spans, cells, wrappers, text) is patched in place, recursively.
const CONTROL = /^(BUTTON|INPUT|SELECT|TEXTAREA|FORM)$/;
const isEl = n => !!n?.tagName;
const isText = n => !isEl(n) && typeof n?.data === 'string';
function sameAttributes(a, b) {
  const aa = a.attributes, bb = b.attributes;
  if (aa.length !== bb.length) return false;
  for (const {name, value} of bb) if (a.getAttribute(name) !== value) return false;
  return true;
}
function syncAttributes(o, n) {
  const details = o.tagName === 'DETAILS';
  for (const {name} of [...o.attributes]) if (!n.hasAttribute(name) && !(details && name === 'open')) o.removeAttribute(name);
  for (const {name, value} of [...n.attributes]) if (!(details && name === 'open') && o.getAttribute(name) !== value) o.setAttribute(name, value);
}
function discard(part) { part.__qxDiscarded = true; for (const img of [...(part.querySelectorAll?.('img') || [])]) img.__qxDiscarded = true; }
function swap(o, n) {
  const active = globalThis.document?.activeElement, focused = !!active && (active === o || o.contains?.(active));
  o.replaceWith(n);
  if (focused) try { (n.focus ? n : null)?.focus({preventScroll: true}); } catch {}
}
// Patch `o` (on screen) to look like `n` (fresh). Returns the node that is now on screen.
export function patchNode(o, n) {
  if (isText(o) && isText(n)) { if (o.data !== n.data) o.data = n.data; return o; }
  if (!isEl(o) || !isEl(n) || o.tagName !== n.tagName) { swap(o, n); return n; }
  const part = n.dataset?.staticPart;
  if (part !== undefined && o.dataset?.staticPart === part) {
    if (o.dataset.staticSig === n.dataset.staticSig) { discard(n); return o; }
    swap(o, n); return n;
  }
  if (CONTROL.test(n.tagName)) { swap(o, n); return n; }
  if (n.tagName === 'IMG' || n.tagName === 'A') {
    if (!sameAttributes(o, n) || (n.tagName === 'A' && o.textContent !== n.textContent)) { swap(o, n); return n; }
    if (n.tagName === 'IMG') { n.__qxDiscarded = true; return o; }
  }
  syncAttributes(o, n);
  patchChildren(o, n);
  return o;
}
export function patchChildren(o, n) {
  const after = [...n.childNodes];
  // Rows with keys (data-key: a trade's tx, a holding's chain:address) are matched by key, so a new trade at the top is
  // one inserted row, not every row rewritten one place down.
  if (after.length && after.every(c => isEl(c) && c.dataset?.key)) { keyedReplace(o, after); return; }
  const before = [...o.childNodes];
  after.forEach((b, i) => {
    const a = before[i];
    if (!a) { o.append(b); return; }
    patchNode(a, b);
  });
  for (let i = after.length; i < before.length; i++) before[i].remove();
}
export function keyedReplace(container, next, {key = n => n?.dataset?.key || null} = {}) {
  if (!container) return [];
  const list = (Array.isArray(next) ? next : [next]).filter(Boolean);
  const old = new Map();
  for (const n of [...container.children]) { const k = key(n); if (k && !old.has(k)) old.set(k, n); }
  const out = list.map(n => {
    const k = key(n), o = k ? old.get(k) : null;
    if (!o || o.tagName !== n.tagName) return n;
    old.delete(k);
    const open = o.tagName === 'DETAILS' ? o.open : null;
    syncAttributes(o, n);
    patchChildren(o, n);
    if (open !== null && o.open !== open) o.open = open;
    return o;
  });
  const keep = new Set(out);
  for (const n of [...container.childNodes]) if (!keep.has(n)) n.remove();
  out.forEach((n, i) => { const at = container.children[i]; if (at !== n) container.insertBefore(n, at || null); });
  return out;
}

// Drop-in for el.replaceChildren(...nodes) on live blocks (token stats, tape, holders, data health): patches in place.
export function patchKids(container, ...nodes) {
  if (!container) return;
  const doc = container.ownerDocument || globalThis.document;
  const list = nodes.flat().filter(x => x != null && x !== false && x !== '').map(x => typeof x === 'string' || typeof x === 'number' ? doc.createTextNode(String(x)) : x);
  const before = [...container.childNodes];
  if (list.length && list.every(c => isEl(c) && c.dataset?.key)) { keyedReplace(container, list); return; }
  list.forEach((b, i) => { const a = before[i]; if (!a) container.append(b); else if (a !== b) patchNode(a, b); });
  for (let i = list.length; i < before.length; i++) before[i].remove();
}
