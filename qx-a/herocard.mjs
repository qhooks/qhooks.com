// The hero's token, flat (2026-11-12, design audit #4): the token's own image as a sharp, flat card standing in the lit set's
// light pool, in place of the 3D gold coin (Randall rejected props). No image: a flat letter tile. Portfolio: a row of cards
// sized by value. DOM only; the set (plate + dust) stays behind it. Square with rounded corners: never a circle.
const doc = document;
const probe = (src) => new Promise((ok) => { if (!src) return ok(''); const im = new Image(), t = setTimeout(() => ok(''), 4000);
  im.onload = () => { clearTimeout(t); ok(im.naturalWidth ? src : ''); }; im.onerror = () => { clearTimeout(t); ok(''); }; im.src = src; });
const CSS = `.qhc{position:absolute;left:50%;bottom:16%;z-index:1;transform:translateX(-50%);display:flex;align-items:flex-end;gap:clamp(10px,2.4vw,22px);pointer-events:none}
.qhc__i{position:relative;display:grid;place-items:center;width:var(--s,128px);aspect-ratio:1;border-radius:22%;overflow:hidden;background:#111210;color:#e8c88c;font:860 calc(var(--s,128px)*.46)/1 "Mona Sans",system-ui,sans-serif;font-stretch:125%;box-shadow:0 0 0 1px rgba(255,244,214,.14),0 28px 50px -18px #000,0 0 60px -10px rgba(255,236,200,.22);opacity:0;transform:translateY(10px);transition:opacity .5s ease,transform .7s cubic-bezier(.2,.7,.2,1)}
.qhc__i.is-in{opacity:1;transform:none}
.qhc__i img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.qhc__i::after{content:"";position:absolute;inset:0;border-radius:inherit;background:linear-gradient(180deg,rgba(255,250,235,.10),transparent 38%);pointer-events:none}
.qhc__w{position:relative;display:block}.qhc__sym{position:absolute;left:-20px;right:-20px;top:calc(100% + 8px);text-align:center;font:700 11.5px/1.2 system-ui,sans-serif;color:rgba(244,241,233,.72);white-space:nowrap}
@media (prefers-reduced-motion:reduce){.qhc__i{transition:none;opacity:1;transform:none}}`;
function ensure(stage) {
  if (!doc.getElementById('qhc-css')) doc.head.append(Object.assign(doc.createElement('style'), { id: 'qhc-css', textContent: CSS }));
  let box = stage.querySelector(':scope > .qhc'); if (!box) { box = doc.createElement('div'); box.className = 'qhc'; box.setAttribute('aria-hidden', 'true'); stage.append(box); }
  return box;
}
async function tile(src, sym, px, label) {
  const el = doc.createElement('span'); el.className = 'qhc__i'; el.style.setProperty('--s', px + 'px');
  const ok = await probe(src);
  if (ok) el.append(Object.assign(doc.createElement('img'), { src: ok, alt: '', decoding: 'async' }));
  else el.textContent = (String(sym || '?').replace('$', '').trim().charAt(0) || '?').toUpperCase();
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-in')));
  if (!label) return el;
  const w = doc.createElement('span'); w.className = 'qhc__w'; w.append(el, Object.assign(doc.createElement('span'), { className: 'qhc__sym', textContent: label })); return w;
}
const size = (stage, f) => Math.round(Math.max(64, Math.min(168, Math.min(stage.clientWidth * .3, stage.clientHeight * .42) * f)));
let seq = 0;
// one token: the latest launch / call / your launch
// (main, 2026-11-12: never a letter tile at hero size) → resolves true when real art is shown, false (card cleared) otherwise
export async function heroArt(stage, { src = '', sym = '' } = {}) {
  const box = ensure(stage), my = ++seq, ok = await probe(src);
  if (my !== seq) return false;
  if (!ok) { box.replaceChildren(); return false; }
  const el = await tile(ok, sym, size(stage, 1)); if (my !== seq) return false;
  box.replaceChildren(el); return true;
}
// the first candidate whose art loads (newest first), or null
export async function firstWithArt(list) { for (const c of list) if (c?.src && await probe(c.src)) return c; return null; }
// several tokens in one row, largest first in the middle, sized by value (Portfolio)
export async function heroRow(stage, items = []) {
  const box = ensure(stage), my = ++seq, list = items.slice(0, 5), max = Math.max(1, ...list.map((i) => i.v || 1));
  const order = [...list].sort((a, b) => (b.v || 0) - (a.v || 0)), row = []; order.forEach((x, i) => (i % 2 ? row.unshift(x) : row.push(x)));
  const base = size(stage, list.length > 3 ? .62 : .78);
  const els = await Promise.all(row.map((i) => tile(i.src, i.sym, Math.round(base * (.62 + .38 * Math.sqrt((i.v || max * .4) / max))), (i.sym || '').replace('$', ''))));
  if (my !== seq) return; box.replaceChildren(...els); box.style.bottom = '22%';
}
