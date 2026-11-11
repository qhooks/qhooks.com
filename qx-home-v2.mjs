// QHooks home v2: the hook swings. The hero's render shows a hook hanging from a line, so it behaves like one: it
// drops in, settles, and answers the pointer and the scroll with a small damped swing while the light on its metal
// moves with it. One transform on one image; it stops when it is still, off screen, or when motion is reduced.
const frame = document.querySelector('[data-hx-frame]'), art = frame?.querySelector('.hx-art'), img = art?.querySelector('img');
const still = matchMedia('(prefers-reduced-motion: reduce)');
if (frame && img && !still.matches) {
  // Where the line leaves the top of the picture, in the image's own box (object-fit: cover crops it per screen).
  const LINE_X = 0.748;
  let SCALE = 1.1;     // the picture's own scale, read from qx-home-v2.css (--hook-scale)
  let box = null;      // pivot and the shank's offset from it, in px of the picture's box
  function pivot() {
    const w = img.offsetWidth, h = img.offsetHeight, iw = img.naturalWidth || 1920, ih = img.naturalHeight || 1088;
    if (!w || !h) return;
    const scale = Math.max(w / iw, h / ih), rw = iw * scale, rh = ih * scale;
    const cs = getComputedStyle(img), [px, py] = cs.objectPosition.split(' ').map(v => parseFloat(v) / 100);
    SCALE = parseFloat(cs.getPropertyValue('--hook-scale')) || 1.1;
    img.style.setProperty('--hook-ox', ((w - rw) * (px || 0) + LINE_X * rw).toFixed(1) + 'px');
    img.style.setProperty('--hook-oy', ((h - rh) * (py || 0)).toFixed(1) + 'px');
    // the shank of the hook in the picture: about 77% across, 30% down
    box = { w, h, ox: (w - rw) * (px || 0) + LINE_X * rw, oy: (h - rh) * (py || 0), vx: (0.772 - LINE_X) * rw, vy: 0.30 * rh };
  }
  let angle = 5.5, speed = 0, target = 0, raf = 0, last = 0, seen = true, lastY = scrollY;
  const STIFF = 26, DAMP = 3.1, LIMIT = 7;
  function step(now) {
    const dt = Math.min(0.032, (now - (last || now)) / 1000 || 0.016); last = now;
    speed += (-STIFF * (angle - target) - DAMP * speed) * dt; angle += speed * dt;
    angle = Math.max(-LIMIT, Math.min(LIMIT, angle));
    img.style.setProperty('--hook-a', angle.toFixed(3) + 'deg');
    // the light stays on the hook's shank: the same turn, applied to the shank's place in the picture
    if (box) { const a = angle * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
      art.style.setProperty('--hook-lx', (100 * (box.ox + SCALE * (box.vx * c - box.vy * sn)) / box.w).toFixed(2) + '%');
      art.style.setProperty('--hook-ly', (100 * (box.oy + SCALE * (box.vx * sn + box.vy * c)) / box.h).toFixed(2) + '%'); }
    raf = seen && !document.hidden && (Math.abs(angle - target) > 0.01 || Math.abs(speed) > 0.01) ? requestAnimationFrame(step) : 0;
    if (!raf) last = 0;
  }
  const wake = () => { if (!raf && seen && !document.hidden) raf = requestAnimationFrame(step); };
  frame.addEventListener('pointermove', e => { if (e.pointerType === 'touch') return; const r = frame.getBoundingClientRect(); target = ((e.clientX - r.left) / r.width - 0.5) * 3.2; wake(); }, { passive: true });
  frame.addEventListener('pointerleave', () => { target = 0; wake(); }, { passive: true });
  addEventListener('scroll', () => { const dy = scrollY - lastY; lastY = scrollY; if (!seen || !dy) return; speed += Math.max(-9, Math.min(9, dy * 0.09)); wake(); }, { passive: true });
  new IntersectionObserver(([e]) => { seen = e.isIntersecting; wake(); }).observe(frame);
  document.addEventListener('visibilitychange', wake);
  addEventListener('resize', pivot, { passive: true });
  // On a phone the headline starts under the hook's band, however tall the notice beside the hook is.
  const title = frame.querySelector('.hx-title'), phone = matchMedia('(max-width:760px)');
  function clearHook() {
    if (!title) return; title.style.removeProperty('--hx-clear'); if (!phone.matches) return;
    const need = art.getBoundingClientRect().bottom - 14 - title.getBoundingClientRect().top;   // the box's top does not move with its padding
    title.style.setProperty('--hx-clear', Math.max(0, Math.round(need)) + 'px');
  }
  addEventListener('resize', clearHook, { passive: true }); new MutationObserver(clearHook).observe(frame.querySelector('.hx-copy'), { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  clearHook();
  if (img.complete) pivot(); else img.addEventListener('load', pivot, { once: true });
  pivot(); wake();
}

