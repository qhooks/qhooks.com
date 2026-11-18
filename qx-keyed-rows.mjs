// G2 (2026-11-18, logo flash): keyed list updates. `next` is the freshly rendered row list (fresh closures, current
// values); for every row whose key (data-key, chain:address) is already on screen, the on-screen row element is kept and
// takes the new row's attributes and dynamic children, and every static part (data-static-part + data-static-sig: the
// token art with its <img>) whose signature is unchanged is carried over as the very same element, so its img and src
// never reload or flash. New keys are inserted, gone keys removed, order follows `next`. A <details> keeps its open state.
export function keyedReplace(container, next, {key = n => n?.dataset?.key || null} = {}) {
  if (!container) return [];
  const list = (Array.isArray(next) ? next : [next]).filter(Boolean);
  const old = new Map();
  for (const n of [...container.children]) { const k = key(n); if (k && !old.has(k)) old.set(k, n); }
  const out = list.map(n => {
    const k = key(n), o = k ? old.get(k) : null;
    if (!o || o.tagName !== n.tagName) return n;
    old.delete(k);
    for (const part of [...(n.querySelectorAll?.('[data-static-part]') || [])]) {
      const id = part.dataset.staticPart, prev = [...o.querySelectorAll('[data-static-part]')].find(p => p.dataset.staticPart === id);
      if (prev && prev.dataset.staticSig === part.dataset.staticSig && prev.tagName === part.tagName) { part.__qxDiscarded = true; for (const img of [...(part.querySelectorAll?.('img') || [])]) img.__qxDiscarded = true; part.replaceWith(prev); }
    }
    const open = o.tagName === 'DETAILS' ? o.open : null;
    for (const a of [...o.attributes]) if (!n.hasAttribute(a.name)) o.removeAttribute(a.name);
    for (const a of [...n.attributes]) if (o.getAttribute(a.name) !== a.value) o.setAttribute(a.name, a.value);
    if (open !== null) o.open = open;
    o.replaceChildren(...n.childNodes);
    return o;
  });
  const keep = new Set(out);
  for (const n of [...container.childNodes]) if (!keep.has(n)) n.remove();
  out.forEach((n, i) => { const at = container.children[i]; if (at !== n) container.insertBefore(n, at || null); });
  return out;
}
