import { isTestToken } from '/qx-test-tokens.mjs'; // a test token is never the hero (Randall, 2026-11-12)
import { heroArt } from '/qx-a/herocard.mjs'; // design audit #4: the token as a flat card, no coin
// /community v4 (2026-11-12, site overhaul polish): the same lit set as /create and Portfolio. One object under light: a
// gold coin carrying the token of the latest real call (the top of the page's own call feed, #cx-community-activity,
// filled by qx-community.mjs), with a hairline callout: who called it and the result since the call. The coin re-forms
// when a new call lands on top of the feed. No circles, maps or orbits (Randall). Token art: the token's own profile
// image (same-origin /api/token-profiles/<chain>/<token>/image, the source /create uses); a minted letter without one.
// WebGL: /qx-a/scene3d.mjs after first paint; otherwise the set's poster with a still 2D coin. Reduced motion: still.
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
  // the token's art, if it loads within 4 s (a profile may not exist; a slow image never holds the coin back)
  const probe = (src) => new Promise((ok) => { if (!src) return ok(''); const im = new Image(), t = setTimeout(() => ok(''), 4000);
    im.onload = () => { clearTimeout(t); ok(im.naturalWidth ? src : ''); }; im.onerror = () => { clearTimeout(t); ok(''); }; im.src = src; });
  const testSrc = (s) => { const m = /\/api\/token-profiles\/([^/]+)\/([^/]+)\/image/.exec(s || ''); return !!m && isTestToken(m[1], m[2]); };
  const face = (c) => heroArt(stage, { src: testSrc(c.src) ? '' : c.src, sym: c.sym });
  function update() {
    const c = read(); if (!c || c.id === key) return;
    const fresh = !!key; key = c.id; last = c;
    tag.replaceChildren(doc.createTextNode('Latest call'), Object.assign(doc.createElement('b'), { textContent: c.sym }),
      Object.assign(doc.createElement('span'), { textContent: c.res ? `${c.who} · ` : c.who }));
    if (c.res) tag.lastChild.append(Object.assign(doc.createElement('em'), { className: c.up ? 'is-up' : c.down ? 'is-down' : '', textContent: c.res }), doc.createTextNode(' since the call'));
    tag.hidden = false;
    face(c);
  }
  stage.classList.add('cv4-stage--set');
  if (webgl) {
    (window.requestIdleCallback || ((f) => setTimeout(f, 200)))(() => import('/qx-a/scene3d.mjs').then(({ mountSet }) => {
      s3 = mountSet(stage, { variant: 'create', posY: .7 }); if (!s3) throw new Error('no webgl');
      stage.querySelector('canvas.cv4-2d')?.remove();
    }).catch(() => { s3 = null; }), { timeout: 1200 });
  }
  if (feed) new MutationObserver(update).observe(feed, { childList: true });
  update();
}
