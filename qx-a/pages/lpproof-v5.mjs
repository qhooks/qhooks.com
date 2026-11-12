// /lp-proof v5 (2026-11-12, main: no coin, no props): the proof itself is the hero. The launch contract's live share of the
// pool's liquidity (from the page's own holders bar, rendered by qx-lp-proof.mjs) as extruded type on the shared lit set, the
// landing's callers treatment, counting up once to the real value. Under it, in the DOM: "held by the launch contract" and the
// pool line the page shows ("Official QHOOKS pool"). Phones: the headline first, the figure under it. No WebGL: the same
// figure as large DOM type over the set's poster. Reduced motion: still.
const doc = document, $ = (id) => doc.getElementById(id);
const main = doc.querySelector('main.lpp'), hero = doc.querySelector('.lpp .pf-hero'), root = $('lpp-root');
if (main && hero && !doc.querySelector('.lp5-stage')) {
  main.classList.add('lp5');
  const stage = doc.createElement('div'); stage.className = 'lp5-stage'; stage.setAttribute('aria-hidden', 'true');
  const big = doc.createElement('p'); big.className = 'lp5-big'; big.hidden = true;
  const cap = doc.createElement('p'); cap.className = 'lp5-cap'; cap.hidden = true;
  stage.append(big); hero.append(stage, cap);
  const webgl = (() => { try { const c = doc.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } })();
  let s3 = null, share = '', key = '';
  function update() {
    const pool = root?.querySelector('.lpp-launch h2')?.textContent?.trim() || '';
    let s = '';
    for (const row of root?.querySelectorAll('.lpp-hhead') || []) { if (/launch contract/i.test(row.querySelector('strong')?.textContent || '')) { s = row.querySelector('strong:last-of-type')?.textContent?.trim() || ''; break; } }
    if (!s || s + pool === key) return; key = s + pool;
    const fresh = s !== share; share = s;
    cap.replaceChildren(Object.assign(doc.createElement('b'), { textContent: 'held by the launch contract' }), doc.createTextNode(pool ? ' · ' + pool : ''));
    cap.hidden = false; big.textContent = s;
    if (s3) { if (fresh) s3.setFigure(s, { color: '#F0DAAE' }); } else big.hidden = false;
  }
  stage.classList.add('lp5-stage--set');
  if (webgl) (window.requestIdleCallback || ((f) => setTimeout(f, 200)))(() => import('/qx-a/scene3d.mjs').then(({ mountSet }) => {
    s3 = mountSet(stage, { variant: 'create', posY: .72 }); if (!s3 || !s3.setFigure) { s3 = null; big.hidden = !share; return; }
    big.hidden = true; if (share) s3.setFigure(share, { color: '#F0DAAE' });
  }).catch(() => { s3 = null; big.hidden = !share; }), { timeout: 1200 });
  if (root) new MutationObserver(update).observe(root, { childList: true, subtree: true });
  update();
}
