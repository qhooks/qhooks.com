// The minted coin (2026-11-12, site overhaul): one drawing of a QHooks token as a gold coin, shared by every page that
// shows tokens as objects (/create's launch scene, Portfolio's orbit). A token's own art is minted into the gold (its
// light and shade in the coin's colour), so any image reads as part of one family.
const cache = new Map();
export function mintedArt(img, px) {
  if (!img?.complete || !img.naturalWidth) return null;
  const key = img.src + '@' + px; if (cache.has(key)) return cache.get(key);
  try {
    const c = document.createElement('canvas'); c.width = c.height = px; const x = c.getContext('2d');
    const g = x.createRadialGradient(px * .3, px * .25, px * .05, px * .5, px * .5, px * .7);
    g.addColorStop(0, '#fff0c8'); g.addColorStop(.5, '#d9b06a'); g.addColorStop(1, '#8a6428');
    x.fillStyle = g; x.fillRect(0, 0, px, px);
    x.globalCompositeOperation = 'luminosity'; x.drawImage(img, 0, 0, px, px);
    x.globalCompositeOperation = 'soft-light'; x.fillStyle = g; x.fillRect(0, 0, px, px);
    cache.set(key, c); return c;
  } catch { return null; }
}
const clamp01 = (v) => Math.min(1, Math.max(0, v));
// A coin at (cx, cy), radius R, turned `turn` radians around its vertical axis. front/back: images (or null for a letter).
export function drawCoin(ctx, { cx, cy, R, turn = 0, front = null, back = null, letter = '', alpha = 1, k = 0, dpr = 1, glow = 0 }) {
  if (alpha <= 0 || R < 1) return;
  const sx = Math.cos(turn), w = Math.max(.06, Math.abs(sx)), edge = R * .14, dir = sx >= 0 ? 1 : -1, off = (1 - w) * edge;
  ctx.save(); ctx.globalAlpha = Math.min(1, alpha);
  if (glow > 0) { const gl = ctx.createRadialGradient(cx, cy, R * .6, cx, cy, R * 1.9); gl.addColorStop(0, `rgba(255,228,170,${.35 * glow})`); gl.addColorStop(1, 'rgba(255,228,170,0)'); ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(cx, cy, R * 1.9, 0, Math.PI * 2); ctx.fill(); }
  for (let i = 8; i >= 0; i--) { // the rim, seen as the coin turns
    ctx.beginPath(); ctx.ellipse(cx - dir * off * (i / 8), cy, R * w, R, 0, 0, Math.PI * 2);
    ctx.fillStyle = i ? `rgb(${120 + i * 6}, ${88 + i * 4}, ${40 + i * 2})` : '#7a5a26'; ctx.fill();
  }
  ctx.translate(cx, cy); ctx.scale(w, 1);
  const fg = ctx.createRadialGradient(-R * .35, -R * .45, R * .1, 0, 0, R * 1.05);
  fg.addColorStop(0, '#fff2cf'); fg.addColorStop(.35, '#e8c88c'); fg.addColorStop(.75, '#b98a3e'); fg.addColorStop(1, '#6e5021');
  ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = R * .035; ctx.strokeStyle = 'rgba(255, 244, 214, .55)'; ctx.beginPath(); ctx.arc(0, 0, R * .86, 0, Math.PI * 2); ctx.stroke();
  const src = sx >= 0 ? front : back, art = src ? mintedArt(src, Math.max(16, Math.round(R * 1.56 * dpr))) : null;
  ctx.save(); ctx.beginPath(); ctx.arc(0, 0, R * .78, 0, Math.PI * 2); ctx.clip();
  if (art) {
    ctx.drawImage(art, -R * .78, -R * .78, R * 1.56, R * 1.56);
    const v = ctx.createRadialGradient(0, 0, R * .45, 0, 0, R * .8); v.addColorStop(0, 'rgba(60,40,12,0)'); v.addColorStop(1, 'rgba(60,40,12,.55)'); ctx.fillStyle = v; ctx.fillRect(-R, -R, R * 2, R * 2);
  } else if (letter) {
    ctx.fillStyle = 'rgba(40, 28, 10, .55)'; ctx.font = `880 ${Math.round(R * .9)}px "Mona Sans", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(letter, 0, R * .05);
  }
  if (k) { // light sweeping across the face
    const sweep = ((k * .18) % 1.6) - .3, sg = ctx.createLinearGradient(-R, -R, R, R);
    sg.addColorStop(clamp01(sweep - .12), 'rgba(255,255,255,0)'); sg.addColorStop(clamp01(sweep), 'rgba(255,250,235,.35)'); sg.addColorStop(clamp01(sweep + .12), 'rgba(255,255,255,0)');
    ctx.fillStyle = sg; ctx.fillRect(-R, -R, R * 2, R * 2);
  }
  ctx.restore(); ctx.restore();
}
export function loadImage(src) { const im = new Image(); im.decoding = 'async'; if (src) im.src = src; return im; }
