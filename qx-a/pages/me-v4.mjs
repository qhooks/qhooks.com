import { isTestToken } from '/qx-test-tokens.mjs'; // a test token is never the hero (Randall, 2026-11-12)
import { heroArt, firstWithArt } from '/qx-a/herocard.mjs'; // design audit #4: the token as a flat card, no coin
// /me v4 (2026-11-12, overhaul polish): My QHooks gets the shared lit set. One gold coin for your most recent launch (the
// first card in the page's own #qa-launches, filled by qx-me.mjs), with a hairline callout: "Your launch", the symbol and its
// chain. The face uses the token's profile art when the card's Trade link names it, else a minted letter. Signed out or no
// launches: the lit set only (nothing invented). Every id, flow and section stays. Reduced motion: still.
const doc = document, $ = (id) => doc.getElementById(id);
const main = doc.querySelector('main.mn-me'), hero = doc.querySelector('.mn-me-hero');
if (main && hero && !doc.querySelector('.me4-stage')) {
  main.classList.add('me4');
  const stage = doc.createElement('div'); stage.className = 'me4-stage'; stage.setAttribute('aria-hidden', 'true');
  const tag = doc.createElement('p'); tag.className = 'me4-tag'; tag.hidden = true; stage.append(tag); hero.append(stage);
  const webgl = (() => { try { const c = doc.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } })();
  let s3 = null, last = null, key = '';
  // every launch card, newest first; the hero shows the most recent one with real art (never a letter tile)
  function readAll() { return [...($('qa-launches')?.querySelectorAll('article.qa-launch') || [])].map(one).filter((c) => !c.test); }
  function one(card) {
    const sym = (card.querySelector('h3 small')?.textContent || card.querySelector('h3')?.textContent || '').trim(), chain = card.querySelector('.qa-chain')?.textContent?.trim() || '';
    const m = /#m=([^:]+):(0x[0-9a-fA-F]{40})/.exec(card.querySelector('a[href^="/terminal"]')?.getAttribute('href') || '');
    return { key: sym + chain + (m?.[2] || ''), test: !!m && isTestToken(m[1], m[2]), sym, chain, src: m ? `/api/token-profiles/${m[1]}/${m[2]}/image` : '' };
  }
  const probe = (src) => new Promise((ok) => { if (!src) return ok(''); const im = new Image(), t = setTimeout(() => ok(''), 4000);
    im.onload = () => { clearTimeout(t); ok(im.naturalWidth ? src : ''); }; im.onerror = () => { clearTimeout(t); ok(''); }; im.src = src; });
  const face = (c) => heroArt(stage, { src: c.src, sym: c.sym });
  let pick = 0;
  async function update() {
    const all = readAll(), k = all.map((c) => c.key).join('|'); if (!all.length || k === key) return; key = k;
    const my = ++pick, c = await firstWithArt(all); if (my !== pick) return;
    if (!c) { stage.hidden = true; tag.hidden = true; return; } // none with art: text-only hero
    last = c;
    tag.replaceChildren(doc.createTextNode('Your launch'), Object.assign(doc.createElement('b'), { textContent: c.sym }), Object.assign(doc.createElement('span'), { textContent: c.chain }));
    tag.hidden = false; stage.classList.remove('is-empty'); stage.hidden = false; face(c); mount();
  }
  stage.classList.add('me4-stage--set', 'is-empty'); stage.hidden = true; // design audit #9: text-only hero until there's a launch to show
  let mounted = false;
  function mount() { if (mounted || !webgl) return; mounted = true;
  (window.requestIdleCallback || ((f) => setTimeout(f, 200)))(() => import('/qx-a/scene3d.mjs').then(({ mountSet }) => {
    s3 = mountSet(stage, { variant: 'create', posY: .7 });
  }).catch(() => {}), { timeout: 1200 });
  }
  new MutationObserver(update).observe(main, { childList: true, subtree: true });
  update();
}
