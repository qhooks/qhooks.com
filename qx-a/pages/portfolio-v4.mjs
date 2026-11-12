// Portfolio v4 (2026-11-12, site overhaul): one object per state.
//  - Connected: your largest holdings as minted gold coins (each token's own art) standing in a row on a lit floor,
//    sized by value (no rings or orbits: Randall, circles read as bundle/bubble maps). The total stays as real text beside it. When the page's live repricing changes the total
//    (#qp-total), the ring pulses; when the holdings change (#qp-top), the orbit rebuilds.
//  - Not connected: the same orbit carries the live QHooks tokens the page already lists (#mn-pf-live).
// Reads only the page's own DOM (qx-portfolio.mjs and money-portfolio.mjs fill it); no extra network reads.
// Reduced motion: one still frame. Paused off screen and in background tabs.
import { drawCoin, loadImage } from '/qx-a/minted.mjs';
const doc = document, $ = (id) => doc.getElementById(id);
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const main = doc.querySelector('main.mn-pf'); if (main) main.classList.add('pf4');
// polish (2026-11-12): where WebGL runs, the orbit stands in the lit set (pre-rendered shaft, dust and floor loop) with the
// coins live on top in real PBR gold (/qx-a/scene3d.mjs, loaded after first paint); otherwise the 2D orbit below.
const WEBGL = (() => { try { const c = doc.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } })();
const idle = window.requestIdleCallback || ((f) => setTimeout(f, 200));

function scene(host, read) {
  const stage = doc.createElement('div'); stage.className = 'pf4-stage'; stage.setAttribute('aria-hidden', 'true');
  const cv = doc.createElement('canvas'); stage.append(cv); host.append(stage);
  const ctx = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1, raf = 0, visible = true, coins = [], pulseAt = -1e9, key = '', off = WEBGL, s3 = null, items3 = [];
  const t0 = performance.now();
  const size = () => { const r = stage.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1); W = Math.max(1, r.width); H = Math.max(1, r.height); cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
  function rebuild() {
    const items = read(); const k = items.map((i) => i.sym + ':' + Math.round(i.v || 0)).join('|');
    if (k === key) return; key = k; items3 = items; s3?.setItems(items);
    const max = Math.max(1, ...items.map((i) => i.v || 1));
    coins = items.slice(0, 7).map((i, n) => ({ ...i, img: loadImage(i.src), size: .45 + .55 * Math.sqrt((i.v || max * .3) / max), phase: (n / Math.max(1, Math.min(7, items.length))) * Math.PI * 2 }));
    pulseAt = performance.now(); go();
  }
  function frame(now) {
    raf = 0; if (off) return; const k = (now - t0) / 1000; ctx.clearRect(0, 0, W, H);
    // 2D fallback (no WebGL): the holdings standing in one row on a floor line under a vertical shaft of light, the largest
    // in the middle. No rings or orbits (Randall: circles read as bundle/bubble maps).
    const cx = W / 2, floorY = H * .82, pulse = Math.max(0, 1 - (now - pulseAt) / 1400);
    const sh = ctx.createLinearGradient(cx - W * .09, 0, cx + W * .09, 0);
    sh.addColorStop(0, 'rgba(255, 246, 230, 0)'); sh.addColorStop(.5, `rgba(255, 246, 230, ${.10 + .06 * pulse})`); sh.addColorStop(1, 'rgba(255, 246, 230, 0)');
    ctx.fillStyle = sh; ctx.fillRect(cx - W * .09, 0, W * .18, floorY);
    const pool = ctx.createRadialGradient(cx, floorY, 0, cx, floorY, W * .3); pool.addColorStop(0, 'rgba(255, 240, 215, .16)'); pool.addColorStop(1, 'rgba(255, 240, 215, 0)');
    ctx.save(); ctx.translate(cx, floorY); ctx.scale(1, .16); ctx.fillStyle = pool; ctx.beginPath(); ctx.arc(0, 0, W * .3, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    const order = [...coins].sort((a, b) => b.size - a.size), row = []; order.forEach((c, i) => (i % 2 ? row.unshift(c) : row.push(c)));
    const R0 = Math.min(H * .2, W * .07), gap = R0 * .25, ws = row.map((c) => 2 * R0 * c.size), total = ws.reduce((s, w) => s + w, 0) + gap * Math.max(0, row.length - 1), fit = Math.min(1, W * .9 / Math.max(1, total));
    let x = cx - total * fit / 2;
    row.forEach((c, i) => { const R = R0 * c.size * fit; x += R;
      drawCoin(ctx, { cx: x, cy: floorY - R, R, turn: RM ? .15 : Math.sin(k * .5 + c.phase) * .3, front: c.img, letter: (c.sym || '?').slice(0, 1).toUpperCase(), alpha: 1, k: RM ? 0 : k + c.phase, dpr, glow: pulse * .6 });
      x += R + gap * fit; });
    if (!RM && visible && !doc.hidden) raf = requestAnimationFrame(frame);
  }
  const go = () => { if (!raf) raf = requestAnimationFrame(frame); };
  // sized from the stage itself: the connected section starts hidden (0 x 0), so re-size whenever it changes
  size(); new ResizeObserver(() => { size(); go(); }).observe(stage);
  new IntersectionObserver((e) => { visible = e[0].isIntersecting; if (visible) go(); }).observe(stage);
  doc.addEventListener('visibilitychange', () => { if (!doc.hidden) go(); });
  if (WEBGL) {
    stage.classList.add('pf4-stage--set'); cv.hidden = true;
    idle(() => import('/qx-a/scene3d.mjs').then(({ mountSet }) => {
      s3 = mountSet(stage, { variant: 'orbit', posY: .82 }); if (!s3) throw new Error('no webgl');
      if (items3.length) s3.setItems(items3);
    }).catch(() => { off = false; cv.hidden = false; go(); }), { timeout: 1200 });
  }
  return { rebuild, pulse() { pulseAt = performance.now(); s3?.pulse(); go(); }, go };
}

// Connected: the largest holdings (#qp-top: symbol, art, value)
const top = $('qp-top'), valueBox = doc.querySelector('.mn-pf-value');
if (top && valueBox) {
  const host = doc.createElement('div'); host.className = 'pf4-orbit pf4-orbit--mine';
  valueBox.after(host);
  const money = (t) => Number(String(t || '').replace(/[^0-9.]/g, '')) || 0;
  const s = scene(host, () => [...top.querySelectorAll('li')].map((li) => ({ sym: li.querySelector('b')?.textContent || '', src: li.querySelector('img')?.getAttribute('src') || '', v: money(li.querySelector('.qp-number')?.textContent) })));
  new MutationObserver(() => s.rebuild()).observe(top, { childList: true, subtree: true });
  const total = $('qp-total'), reading = doc.querySelector('.mn-pf-reading');
  // annotation: the live dot pulses once each time the live repricing changes the total (a real event, never a loop)
  const tick = () => { if (!reading || RM) return; reading.classList.remove('is-tick'); void reading.offsetWidth; reading.classList.add('is-tick'); };
  if (total) new MutationObserver(() => { s.pulse(); tick(); }).observe(total, { childList: true, characterData: true, subtree: true });
  s.rebuild();
}
// Not connected: the live QHooks tokens (#mn-pf-live rows)
const live = $('mn-pf-live'), outHead = doc.querySelector('.mn-pf-out__head');
if (live && outHead) {
  const host = doc.createElement('div'); host.className = 'pf4-orbit pf4-orbit--live';
  outHead.after(host);
  const s = scene(host, () => [...live.querySelectorAll('a, li, .qa-row')].filter((r) => r.querySelector('img, b')).slice(0, 7).map((r) => ({ sym: (r.querySelector('b, .qa-row__t')?.textContent || '').trim(), src: r.querySelector('img')?.getAttribute('src') || '', v: 0 })));
  new MutationObserver(() => s.rebuild()).observe(live, { childList: true, subtree: true });
  s.rebuild();
}
