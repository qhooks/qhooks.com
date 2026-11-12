// /profile v4 (2026-11-12, overhaul polish): caller and trader profiles get the same lit set as /create, Portfolio and
// /community. Phones: the top band (.pv-banner) becomes the set; wide screens: the band is the set's still plate and the live
// coin stands in the identity column. The coin carries the token of this caller's latest call (the first call in the page's
// own #qp-root list, filled by qx-profile.mjs), with a hairline callout: "Latest call", the token, the result since the call.
// No calls: the lit set only (no coin, nothing invented). Server skeleton markers (main.pv3, #qp-title, #qp-trading, #qp-root)
// are not moved: this only adds a stage inside .pv-banner / the hero section. No circles. Reduced motion: still.
const doc = document, $ = (id) => doc.getElementById(id);
// qx-profile-v3.mjs builds the band after load: start once .pv-banner and the hero exist (give up after 15 s)
function ready() { const main = doc.querySelector('main.pv3'), banner = doc.querySelector('.pv-banner'), hero = doc.querySelector('.qp-hero'); return main && banner && hero ? { main, banner, hero } : null; }
function start({ main, banner, hero }) {
  const root = $('qp-root');
  if (doc.querySelector('.pf5-stage')) return;
  main.classList.add('pf5');
  const wide = matchMedia('(min-width: 1100px)').matches;
  const stage = doc.createElement('div'); stage.className = 'pf5-stage'; stage.setAttribute('aria-hidden', 'true');
  const tag = doc.createElement('p'); tag.className = 'pf5-tag'; tag.hidden = true; stage.append(tag);
  (wide ? hero : banner).append(stage);
  const webgl = (() => { try { const c = doc.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } })();
  let s3 = null, last = null, key = '';
  function read() {
    const a = root?.querySelector('a.qb-board-name[href*="/board/token/"]'); if (!a) return null;
    const item = a.closest('.qb-callline') || a.parentElement, m = /\/board\/token\/([^/?#]+)\/([^/?#]+)/.exec(a.getAttribute('href') || '');
    const sym = [...a.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim() || a.textContent.trim();
    const x = item.querySelector('.qa-outcome__x b') || item.querySelector('.qa-up, .qa-down');
    return { key: a.getAttribute('href'), sym, res: x?.textContent?.trim() || '', up: !!x?.classList.contains('qa-up'), down: !!x?.classList.contains('qa-down'), src: m ? `/api/token-profiles/${m[1]}/${m[2]}/image` : '' };
  }
  const probe = (src) => new Promise((ok) => { if (!src) return ok(''); const im = new Image(), t = setTimeout(() => ok(''), 4000);
    im.onload = () => { clearTimeout(t); ok(im.naturalWidth ? src : ''); }; im.onerror = () => { clearTimeout(t); ok(''); }; im.src = src; });
  const face = async (c, fresh) => { const src = await probe(c.src); if (s3 && last === c) s3.setFace(src, c.sym.replace('$', ''), fresh); };
  function update() {
    // the result can arrive after the line itself: re-read on change, re-form the coin only when the call changes
    const c = read(); if (!c || c.key + c.res === key) return;
    const newCall = !last || last.key !== c.key; key = c.key + c.res; last = c;
    tag.replaceChildren(doc.createTextNode('Latest call'), Object.assign(doc.createElement('b'), { textContent: c.sym }));
    if (c.res) tag.append(Object.assign(doc.createElement('span'), { className: c.up ? 'is-up' : c.down ? 'is-down' : '', textContent: c.res }), doc.createTextNode(' since the call'));
    tag.hidden = false;
    if (s3 && newCall) face(c, true);
  }
  stage.classList.add('pf5-stage--set');
  if (webgl) (window.requestIdleCallback || ((f) => setTimeout(f, 200)))(() => import('/qx-a/scene3d.mjs').then(({ mountSet }) => {
    s3 = mountSet(stage, { variant: 'create', posY: wide ? .72 : .78 }); if (!s3) return;
    if (last) face(last, true);
  }).catch(() => {}), { timeout: 1200 });
  if (root) new MutationObserver(update).observe(root, { childList: true, subtree: true });
  update();
}
{ const r = ready(); if (r) start(r); else { const mo = new MutationObserver(() => { const x = ready(); if (x) { mo.disconnect(); start(x); } }); mo.observe(doc.body, { childList: true, subtree: true }); setTimeout(() => mo.disconnect(), 15000); } }
