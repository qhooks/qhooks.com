// /community v4 (2026-11-12, site overhaul polish): the same lit set as /create and Portfolio. One object under light: a
// gold coin carrying the token of the latest real call (the top of the page's own call feed, #cx-community-activity,
// filled by qx-community.mjs), with a hairline callout: who called it and the result since the call. The coin re-forms
// when a new call lands on top of the feed. No circles, maps or orbits (Randall). Token art: the token's own profile
// image (same-origin /api/token-profiles/<chain>/<token>/image, the source /create uses); a minted letter without one.
// WebGL: /qx-a/scene3d.mjs after first paint; otherwise the set's poster with a still 2D coin. Reduced motion: still.
import { drawCoin, loadImage } from '/qx-a/minted.mjs';
const doc = document, $ = (id) => doc.getElementById(id);
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const hero = doc.querySelector('.cx-hero'), feed = $('cx-community-activity');
if (hero && !hero.querySelector('.cv4-stage')) {
  doc.querySelector('main')?.classList.add('cv4');
  const stage = doc.createElement('div'); stage.className = 'cv4-stage'; stage.setAttribute('aria-hidden', 'true');
  const tag = doc.createElement('p'); tag.className = 'cv4-tag'; tag.hidden = true;
  stage.append(tag); hero.append(stage);
  const webgl = (() => { try { const c = doc.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } })();
  let s3 = null, last = null, key = '';
  // the latest call: its token (chip link → chain + address), symbol, caller and result since the call
  function read() {
    const post = feed?.querySelector('article.cx-post'); if (!post) return null;
    const chip = post.querySelector('.cx-chip'), m = /\/board\/token\/([^/]+)\/(0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})/.exec(chip?.getAttribute('href') || '');
    const sym = [...(chip?.childNodes || [])].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim(), who = post.querySelector('.cx-who__t')?.textContent || '', x = post.querySelector('.qa-outcome__x b');
    return { id: post.id, sym, who, res: x?.textContent || '', up: !!x?.classList.contains('qa-up'), down: !!x?.classList.contains('qa-down'), src: m ? `/api/token-profiles/${m[1]}/${m[2]}/image` : '' };
  }
  function paint2d() { // no WebGL: the set's poster (CSS) and one still coin
    if (s3 || !last) return;
    let cv = stage.querySelector('canvas.cv4-2d'); if (!cv) { cv = doc.createElement('canvas'); cv.className = 'cv4-2d'; stage.prepend(cv); }
    const r = stage.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1); cv.width = r.width * dpr; cv.height = r.height * dpr;
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const img = loadImage(last.src), R = Math.min(r.width * .2, r.height * .22, 120);
    const draw = () => { ctx.clearRect(0, 0, r.width, r.height); drawCoin(ctx, { cx: r.width / 2, cy: r.height * .62, R, turn: .25, front: img.naturalWidth ? img : null, letter: (last.sym.replace('$', '') || 'Q').slice(0, 1).toUpperCase(), dpr }); };
    img.onload = draw; img.onerror = draw; draw();
  }
  // the token's art, if it loads within 4 s (a profile may not exist; a slow image never holds the coin back)
  const probe = (src) => new Promise((ok) => { if (!src) return ok(''); const im = new Image(), t = setTimeout(() => ok(''), 4000);
    im.onload = () => { clearTimeout(t); ok(im.naturalWidth ? src : ''); }; im.onerror = () => { clearTimeout(t); ok(''); }; im.src = src; });
  const face = async (c, fresh) => { const src = await probe(c.src); if (s3 && last === c) s3.setFace(src, c.sym.replace('$', ''), fresh); };
  function update() {
    const c = read(); if (!c || c.id === key) return;
    const fresh = !!key; key = c.id; last = c;
    tag.replaceChildren(doc.createTextNode('Latest call'), Object.assign(doc.createElement('b'), { textContent: c.sym }),
      Object.assign(doc.createElement('span'), { textContent: c.res ? `${c.who} · ` : c.who }));
    if (c.res) tag.lastChild.append(Object.assign(doc.createElement('em'), { className: c.up ? 'is-up' : c.down ? 'is-down' : '', textContent: c.res }), doc.createTextNode(' since the call'));
    tag.hidden = false;
    if (s3) face(c, true); else paint2d();
  }
  stage.classList.add('cv4-stage--set');
  if (webgl) {
    (window.requestIdleCallback || ((f) => setTimeout(f, 200)))(() => import('/qx-a/scene3d.mjs').then(({ mountSet }) => {
      s3 = mountSet(stage, { variant: 'create', posY: .7 }); if (!s3) throw new Error('no webgl');
      stage.querySelector('canvas.cv4-2d')?.remove();
      if (last) face(last, true);
    }).catch(() => { s3 = null; paint2d(); }), { timeout: 1200 });
  }
  if (feed) new MutationObserver(update).observe(feed, { childList: true });
  update();
  if (!webgl) addEventListener('resize', paint2d);
}
