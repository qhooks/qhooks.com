// /create v4 (2026-11-12): the launch scene. One object under light: a gold coin, its face the latest real launch on
// QHooks, standing on a lit floor in a shaft of light with gold dust falling through it. Motion follows real events:
// the coin forms from the dust when the page opens, and again when a new launch lands in the page's own
// "Launched on QHooks" list (#cr-launched-list, filled by create-create.mjs from the public feed every minute).
// No extra network reads. Reduced motion: one still frame. Paused off screen and in background tabs.
const doc = document, $ = (id) => doc.getElementById(id);
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const hero = doc.querySelector('.cr-hero'), list = $('cr-launched-list');
// the ideas heading gets the same hierarchy as the hero: its first sentence bold, the rest light (same words)
const ideasH = doc.getElementById('qq-ideas-title');
if (ideasH && !ideasH.querySelector('span')) { const m = ideasH.textContent.match(/^([^.]+\.)\s+(.+)$/); if (m) ideasH.replaceChildren(doc.createTextNode(m[1] + ' '), Object.assign(doc.createElement('span'), { textContent: m[2] })); }
if (hero && !hero.querySelector('.cr4-stage')) {
  doc.querySelector('main')?.classList.add('cr4');
  const stage = doc.createElement('div'); stage.className = 'cr4-stage'; stage.setAttribute('aria-hidden', 'true');
  const cv = doc.createElement('canvas'), tag = doc.createElement('p'); tag.className = 'cr4-tag'; tag.hidden = true;
  stage.append(cv, tag); hero.prepend(stage);
  const ctx = cv.getContext('2d');
  // polish (2026-11-12): where WebGL runs, the lit set (a pre-rendered loop of the light shaft, dust and floor) with the
  // coin live on top in real PBR gold (/qx-a/scene3d.mjs, loaded after first paint). Otherwise this 2D scene.
  const webgl = (() => { try { const c = doc.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } })();
  let use2d = !webgl, s3 = null, last = null;
  const face3d = (fresh) => { if (s3) s3.setFace(last?.src || '', last?.sym || 'Q', fresh); };
  let W = 0, H = 0, dpr = 1, raf = 0, visible = true, t0 = performance.now();
  const mark = new Image(); mark.src = '/app-icons/icon-192.png';
  let face = null, faceKey = '', formAt = -1e9, prevFace = null;
  const N = matchMedia('(min-width: 900px)').matches ? 520 : 260;
  const dust = Array.from({ length: N }, () => ({ x: Math.random(), y: Math.random(), z: Math.random(), s: Math.random(), tx: 0, ty: 0, a: Math.random() * Math.PI * 2 }));

  function size() {
    const r = stage.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1);
    W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
    cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  // the scene's geometry, from the stage size
  const geo = () => { const R = Math.min(W * .26, H * .25, 150), cx = W / 2, cy = H * .47; return { R, cx, cy, floorY: cy + R * 1.55 }; };

  function shaft(g, k) { // a vertical shaft of light (no cone)
    const w = g.R * 1.1, grd = ctx.createLinearGradient(g.cx - w, 0, g.cx + w, 0);
    grd.addColorStop(0, 'rgba(255, 246, 230, 0)'); grd.addColorStop(.5, `rgba(255, 246, 230, ${.13 + .02 * Math.sin(k * 1.3)})`); grd.addColorStop(1, 'rgba(255, 246, 230, 0)');
    ctx.fillStyle = grd; ctx.fillRect(g.cx - w, 0, w * 2, g.floorY);
  }
  function floor(g, glow) { // a pool of light on the floor (no rings: Randall, circles read as bundle/bubble maps)
    const pool = ctx.createRadialGradient(g.cx, g.floorY, 0, g.cx, g.floorY, g.R * 1.6);
    pool.addColorStop(0, `rgba(255, 240, 215, ${.2 * (.6 + .4 * glow)})`); pool.addColorStop(1, 'rgba(255, 240, 215, 0)');
    ctx.fillStyle = pool; ctx.beginPath(); ctx.ellipse(g.cx, g.floorY, g.R * 1.6, g.R * .36, 0, 0, Math.PI * 2); ctx.fill();
  }
  // the coin: turned around its vertical axis by `turn`; formed 0..1
  function coin(g, turn, formed, k) {
    if (formed <= 0) return;
    const sx = Math.cos(turn), w = Math.max(.06, Math.abs(sx)), bob = Math.sin(k * .9) * g.R * .04, cy = g.cy + bob, edge = g.R * .14;
    ctx.save(); ctx.globalAlpha = Math.min(1, formed * 1.15);
    // shadow on the floor
    const sh = ctx.createRadialGradient(g.cx, g.floorY, 0, g.cx, g.floorY, g.R * 1.1);
    sh.addColorStop(0, 'rgba(0,0,0,.55)'); sh.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = sh;
    ctx.beginPath(); ctx.ellipse(g.cx, g.floorY + 2, g.R * 1.05 * (.55 + .45 * w), g.R * .16, 0, 0, Math.PI * 2); ctx.fill();
    // rim (thickness seen when turned)
    const dir = sx >= 0 ? 1 : -1, off = (1 - w) * edge;
    for (let i = 8; i >= 0; i--) {
      ctx.beginPath(); ctx.ellipse(g.cx - dir * off * (i / 8), cy, g.R * w, g.R, 0, 0, Math.PI * 2);
      ctx.fillStyle = i ? `rgb(${120 + i * 6}, ${88 + i * 4}, ${40 + i * 2})` : '#7a5a26'; ctx.fill();
    }
    // face
    ctx.translate(g.cx, cy); ctx.scale(w, 1);
    const fg = ctx.createRadialGradient(-g.R * .35, -g.R * .45, g.R * .1, 0, 0, g.R * 1.05);
    fg.addColorStop(0, '#fff2cf'); fg.addColorStop(.35, '#e8c88c'); fg.addColorStop(.75, '#b98a3e'); fg.addColorStop(1, '#6e5021');
    ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(0, 0, g.R, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = g.R * .035; ctx.strokeStyle = 'rgba(255, 244, 214, .55)'; ctx.beginPath(); ctx.arc(0, 0, g.R * .86, 0, Math.PI * 2); ctx.stroke();
    // the art: the latest launch on the front, the QHooks mark on the back
    const img = sx >= 0 ? (face?.complete && face.naturalWidth ? face : null) : (mark.complete && mark.naturalWidth ? mark : null);
    ctx.save(); ctx.beginPath(); ctx.arc(0, 0, g.R * .78, 0, Math.PI * 2); ctx.clip();
    if (img) { // minted: the art's light and shade, in the coin's gold
      const m = minted(img, Math.round(g.R * 1.56 * dpr)); if (m) ctx.drawImage(m, -g.R * .78, -g.R * .78, g.R * 1.56, g.R * 1.56);
      const v = ctx.createRadialGradient(0, 0, g.R * .45, 0, 0, g.R * .8); v.addColorStop(0, 'rgba(60,40,12,0)'); v.addColorStop(1, 'rgba(60,40,12,.55)'); ctx.fillStyle = v; ctx.fillRect(-g.R, -g.R, g.R * 2, g.R * 2); }
    else { ctx.fillStyle = 'rgba(40, 28, 10, .55)'; ctx.font = `880 ${Math.round(g.R * .9)}px "Mona Sans", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(sx >= 0 ? (faceLetter || 'Q') : 'Q', 0, g.R * .05); }
    // light sweeping across the face
    const sweep = ((k * .18) % 1.6) - .3, sg = ctx.createLinearGradient(-g.R, -g.R, g.R, g.R);
    const cl = (v) => Math.min(1, Math.max(0, v));
    sg.addColorStop(cl(sweep - .12), 'rgba(255,255,255,0)'); sg.addColorStop(cl(sweep), 'rgba(255,250,235,.35)'); sg.addColorStop(cl(sweep + .12), 'rgba(255,255,255,0)');
    ctx.fillStyle = sg; ctx.fillRect(-g.R, -g.R, g.R * 2, g.R * 2);
    ctx.restore(); ctx.restore();
  }
  let faceLetter = '';
  // the token art minted into gold: its luminance over the coin's gold, cached per image and size
  const mintCache = new Map();
  function minted(img, px) {
    const key = img.src + '@' + px; if (mintCache.has(key)) return mintCache.get(key);
    try {
      const c = document.createElement('canvas'); c.width = c.height = px; const x = c.getContext('2d');
      const gg = x.createRadialGradient(px * .3, px * .25, px * .05, px * .5, px * .5, px * .7);
      gg.addColorStop(0, '#fff0c8'); gg.addColorStop(.5, '#d9b06a'); gg.addColorStop(1, '#8a6428');
      x.fillStyle = gg; x.fillRect(0, 0, px, px);
      x.globalCompositeOperation = 'luminosity'; x.drawImage(img, 0, 0, px, px);
      x.globalCompositeOperation = 'soft-light'; x.fillStyle = gg; x.fillRect(0, 0, px, px);
      mintCache.set(key, c); return c;
    } catch { return null; }
  }
  function drawDust(g, k, form) {
    for (const p of dust) {
      let x, y;
      if (form < 1) { // gathering into the coin: from its sky position to a point on the face
        const r = Math.sqrt(p.s) * g.R * .95, ex = g.cx + Math.cos(p.a) * r * Math.abs(Math.cos(k * .35)), ey = g.cy + Math.sin(p.a) * r;
        const sx = g.cx + (p.x - .5) * W * 1.1, sy = (p.y * H * .9) - H * .25 + ((k * 40 * (.4 + p.z)) % H);
        const e = form < 0 ? 0 : 1 - Math.pow(1 - Math.min(1, form * 1.25), 3);
        x = sx + (ex - sx) * e; y = sy + (ey - sy) * e;
      } else { // resting: dust falling slowly through the shaft
        const fall = ((p.y * H + k * 22 * (.3 + p.z)) % (g.floorY + 30)) - 20;
        const spread = (g.R * .5 + (fall / g.floorY) * g.R * 2) * (p.x - .5) * 2;
        x = g.cx + spread + Math.sin(k * .6 + p.a) * 6; y = fall;
      }
      const tw = .35 + .65 * Math.abs(Math.sin(k * 1.7 + p.a * 3));
      ctx.fillStyle = `rgba(255, ${226 + Math.round(p.z * 20)}, ${170 + Math.round(p.z * 50)}, ${(.18 + .55 * p.z) * tw})`;
      const s = .6 + p.z * 1.6; ctx.fillRect(x, y, s, s);
    }
  }
  function frame(now) {
    raf = 0; if (!use2d) return; const k = (now - t0) / 1000, g = geo();
    ctx.clearRect(0, 0, W, H);
    const since = (now - formAt) / 1000, form = Math.min(1, since / 1.6);
    shaft(g, k); floor(g, form);
    drawDust(g, k, RM ? 1 : form);
    coin(g, RM ? .18 : (since < 1.6 ? Math.PI * 2 * (1 - form) * 1.5 + .18 : .18 + Math.sin(k * .45) * .22), RM ? 1 : form, RM ? 0 : k);
    if (!RM && visible && !doc.hidden) raf = requestAnimationFrame(frame);
  }
  const go = () => { if (!raf) raf = requestAnimationFrame(frame); };
  // the latest launch from the page's own list
  function readList(isUpdate) {
    const li = list?.querySelector('li'); if (!li) return;
    const key = li.dataset.key || '', sym = li.querySelector('b')?.textContent || '', when = li.querySelector('small')?.textContent || '', src = li.querySelector('img')?.getAttribute('src') || '';
    if (key === faceKey) return;
    faceKey = key; faceLetter = sym.slice(0, 1).toUpperCase();
    if (src) { const im = new Image(); im.decoding = 'async'; im.src = src; face = im; } else face = null;
    tag.replaceChildren(doc.createTextNode('Latest launch'), Object.assign(doc.createElement('b'), { textContent: sym }), doc.createTextNode(when));
    tag.hidden = !sym;
    last = { src, sym }; face3d(!isUpdate || li.classList.contains('is-fresh'));
    if (!isUpdate || li.classList.contains('is-fresh') || formAt > performance.now()) { formAt = performance.now(); go(); }
  }
  // the coin forms once the latest launch is known (the list fills within a second or two); the QHooks mark if not
  size(); formAt = performance.now() + 1e7;
  setTimeout(() => { if (formAt > performance.now()) { formAt = performance.now(); go(); face3d(true); } }, 2500);
  addEventListener('resize', () => { size(); go(); });
  new IntersectionObserver((e) => { visible = e[0].isIntersecting; if (visible) go(); }).observe(stage);
  doc.addEventListener('visibilitychange', () => { if (!doc.hidden) go(); });
  if (list) { readList(false); new MutationObserver(() => readList(true)).observe(list, { childList: true }); }
  mark.onload = go; go();
  if (!use2d) {
    stage.classList.add('cr4-stage--set'); cv.hidden = true;
    const start = () => import('/qx-a/scene3d.mjs').then(({ mountSet }) => {
      s3 = mountSet(stage, { variant: 'create', posY: .7 }); if (!s3) throw new Error('no webgl');
      if (last || formAt < performance.now()) face3d(true);
    }).catch(() => { use2d = true; cv.hidden = false; go(); });
    (window.requestIdleCallback || ((f) => setTimeout(f, 200)))(start, { timeout: 1200 });
  }
  if (RM) setTimeout(go, 600);
}

// The image and banner pickers (pass 2): each file input becomes a drop tile that shows the art the way it will appear,
// a round coin for the image, a 3:1 frame for the banner. The input itself stays (same element, id, handlers), laid
// over the tile, so clicking, dragging, keyboard and the page's own previews and checks all work as before.
function dropTile(input) {
  // the Sale first and token profile pickers are already tiles (create-create.mjs dressUpload, live): one implementation
  // per input, so those stay theirs (styled below to match) and this dresses only the quick-launch pickers
  if (!input || input.closest('.cr4-drop, #qsf-root, .qtp-editor') || input.dataset.crTile) return;
  const kind = /banner/i.test(input.id) ? 'banner' : 'image';
  const tile = doc.createElement('div'); tile.className = 'cr4-drop cr4-drop--' + kind;
  const shot = doc.createElement('img'); shot.alt = ''; shot.hidden = true; shot.className = 'cr4-drop__img';
  const plus = doc.createElement('span'); plus.className = 'cr4-drop__plus'; plus.setAttribute('aria-hidden', 'true');
  input.before(tile); tile.append(shot, plus, input); input.classList.add('cr4-drop__input');
  const show = () => {
    const f = input.files?.[0]; if (!f || !/^image\//.test(f.type)) { shot.hidden = true; tile.classList.remove('has-art'); return; }
    const url = URL.createObjectURL(f); shot.onload = () => URL.revokeObjectURL(url); shot.src = url; shot.hidden = false; tile.classList.add('has-art');
  };
  input.addEventListener('change', show);
  tile.addEventListener('dragover', (e) => { e.preventDefault(); tile.classList.add('is-over'); });
  for (const ev of ['dragleave', 'drop']) tile.addEventListener(ev, () => tile.classList.remove('is-over'));
}
const mainEl = doc.querySelector('main');
const tiles = () => mainEl?.querySelectorAll('input[type=file][accept*="image"]').forEach(dropTile);
tiles(); if (mainEl) new MutationObserver(tiles).observe(mainEl, { childList: true, subtree: true });
