// Portfolio v4 (2026-11-12, site overhaul): one object per state.
//  - Connected: your largest holdings as minted gold coins (each token's own art) orbiting a lit core on a tilted ring,
//    sized by value. The total stays as real text beside it. When the page's live repricing changes the total
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
    const cx = W / 2, cy = H * .5, rx = Math.min(W * .42, 360), ry = rx * .3, base = Math.min(W, H) * .085, pulse = Math.max(0, 1 - (now - pulseAt) / 1400);
    // light from above onto the core
    const shaft = ctx.createLinearGradient(0, 0, 0, cy + ry);
    shaft.addColorStop(0, 'rgba(255, 238, 205, 0)'); shaft.addColorStop(.3, 'rgba(255, 238, 205, .15)'); shaft.addColorStop(1, 'rgba(255, 238, 205, 0)');
    ctx.fillStyle = shaft; ctx.beginPath(); ctx.moveTo(cx - base * .9, 0); ctx.lineTo(cx + base * .9, 0); ctx.lineTo(cx + rx * .7, cy + ry); ctx.lineTo(cx - rx * .7, cy + ry); ctx.closePath(); ctx.fill();
    // the core
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, base * 2.4);
    core.addColorStop(0, `rgba(255, 236, 196, ${.85})`); core.addColorStop(.25, `rgba(232, 200, 140, ${.45 + .3 * pulse})`); core.addColorStop(1, 'rgba(232, 200, 140, 0)');
    ctx.fillStyle = core; ctx.beginPath(); ctx.arc(cx, cy, base * 2.4, 0, Math.PI * 2); ctx.fill();
    // the ring
    ctx.lineWidth = 1.2; ctx.strokeStyle = `rgba(232, 200, 140, ${.28 + .4 * pulse})`; ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(232, 200, 140, .10)'; ctx.beginPath(); ctx.ellipse(cx, cy, rx * 1.18, ry * 1.18, 0, 0, Math.PI * 2); ctx.stroke();
    // coins on the ring, back to front
    const spin = RM ? 0 : k * .16;
    const placed = coins.map((c) => { const a = c.phase + spin, z = Math.sin(a); return { c, x: cx + Math.cos(a) * rx, y: cy + z * ry, z }; }).sort((a, b) => a.z - b.z);
    for (const p of placed) {
      const depth = .62 + .38 * (p.z + 1) / 2, R = base * 1.7 * p.c.size * depth;
      drawCoin(ctx, { cx: p.x, cy: p.y - R * .15, R, turn: RM ? .15 : Math.sin(k * .7 + p.c.phase) * .35, front: p.c.img, letter: (p.c.sym || '?').slice(0, 1).toUpperCase(), alpha: .45 + .55 * depth, k: RM ? 0 : k + p.c.phase, dpr, glow: pulse * .8 });
    }
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
