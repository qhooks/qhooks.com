// /lp-proof v4 (2026-11-12, overhaul polish): the shared lit set beside the headline, one gold coin for the token whose pool is
// proven (?chain=&token= when given, else the official QHOOKS pool the page shows), with a hairline callout built from the
// page's own render: the pool line ("Official QHOOKS pool") and the launch contract's share from its holders bar. Reads only
// the page's DOM (qx-lp-proof.mjs fills it); the coin face is the token's profile art, else a minted letter. No circles.
const doc = document, $ = (id) => doc.getElementById(id), qs = new URLSearchParams(location.search);
const main = doc.querySelector('main.lpp'), hero = doc.querySelector('.lpp .pf-hero'), root = $('lpp-root');
if (main && hero && !doc.querySelector('.lp4-stage')) {
  main.classList.add('lp4');
  const stage = doc.createElement('div'); stage.className = 'lp4-stage'; stage.setAttribute('aria-hidden', 'true');
  const tag = doc.createElement('p'); tag.className = 'lp4-tag'; tag.hidden = true; stage.append(tag); hero.append(stage);
  const chain = qs.get('chain') || '4663', token = (qs.get('token') || '0x20429af7ca3b0ce4d99edbaa0693f26c5df05195').toLowerCase();
  const src = /^0x[0-9a-f]{40}$/.test(token) ? `/api/token-profiles/${encodeURIComponent(chain)}/${token}/image` : '';
  const webgl = (() => { try { const c = doc.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } })();
  let s3 = null, sym = '', key = '';
  const probe = (u) => new Promise((ok) => { if (!u) return ok(''); const im = new Image(), t = setTimeout(() => ok(''), 4000);
    im.onload = () => { clearTimeout(t); ok(im.naturalWidth ? u : ''); }; im.onerror = () => { clearTimeout(t); ok(''); }; im.src = u; });
  // the official QHOOKS pool: the site's own QHOOKS art if its profile image doesn't answer
  const face = async () => { if (!s3 || !sym) return; const u = (await probe(src)) || (!qs.get('token') ? await probe('/qhooks-logo.jpg') : ''); s3.setFace(u, sym, true); };
  function update() {
    const h = root?.querySelector('.lpp-launch h2')?.textContent?.trim() || ''; if (!h) return;
    const m = /^Official\s+(\S+)\s+pool$/i.exec(h); const s = m ? m[1] : '';
    let share = '';
    for (const row of root.querySelectorAll('.lpp-hhead')) { const k = row.querySelector('strong')?.textContent?.trim(); if (/launch contract/i.test(k || '')) { share = row.querySelector('strong:last-of-type')?.textContent?.trim() || ''; break; } }
    const k = h + share; if (k === key) return; key = k;
    const first = !sym; sym = s || sym;
    tag.replaceChildren(Object.assign(doc.createElement('b'), { textContent: h }));
    if (share) tag.append(Object.assign(doc.createElement('span'), { textContent: 'Launch contract ' + share }));
    tag.hidden = false; if (first && sym) face();
  }
  stage.classList.add('lp4-stage--set');
  if (webgl) (window.requestIdleCallback || ((f) => setTimeout(f, 200)))(() => import('/qx-a/scene3d.mjs').then(({ mountSet }) => {
    s3 = mountSet(stage, { variant: 'create', posY: .7 }); if (s3 && sym) face();
  }).catch(() => {}), { timeout: 1200 });
  if (root) new MutationObserver(update).observe(root, { childList: true, subtree: true });
  update();
}
