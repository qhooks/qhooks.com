import { priceDigits } from '../qx-price.mjs'; // one price format sitewide (2026-11-12)
// QHooks System A: component helpers. ES module, no dependencies, CSP-safe (no inline styles in markup; styles go through CSSOM).
// Import what you need:  import { h, icon, toast, tape, bigPrice } from '/system-a/components.mjs';
// Every motion here is tied to a call you make for a real event (a trade, a call, a new holder). Reduced motion is honoured.

export const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ================= DOM ================= */
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') for (const [sk, sv] of Object.entries(v)) el.style.setProperty(sk, sv);
    else if (k === 'text') el.textContent = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}
const NS = 'http://www.w3.org/2000/svg';
export function icon(id, cls = 'qa-i') { const s = document.createElementNS(NS, 'svg'); s.setAttribute('class', cls); s.setAttribute('aria-hidden', 'true'); const u = document.createElementNS(NS, 'use'); u.setAttribute('href', '#qa-' + (id === 'wallet' ? 'i-wallet' : id)); s.append(u); return s; }
export const restart = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
export function inView(el, fn, threshold = .4) { const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); fn(); } }, { threshold }); io.observe(el); return io; }

/* icon sprite: one copy per page, injected on first import */
const ICONS = {
  back: '<path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  star: '<path d="M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.6l-5.1 2.7 1-5.7-4.1-4 5.7-.8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  share: '<path d="M12 15V4m0 0L8 8m4-4l4 4M5 13v5a2 2 0 002 2h10a2 2 0 002-2v-5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  globe: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.5 5.2 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.2-3.5-8.5S9.6 5.9 12 3.5z" fill="none" stroke="currentColor" stroke-width="1.7"/>',
  x: '<path d="M17.8 3.5h3.1l-6.8 7.7 8 9.3h-6.2l-4.9-5.9-5.6 5.9H2.3l7.2-8.2L1.9 3.5h6.4l4.4 5.4zm-1.1 15.2h1.7L7.4 5.2H5.5z" fill="currentColor"/>',
  tg: '<path d="M20.6 4.3L3.4 11c-1.2.5-1.1 1.2-.2 1.5l4.4 1.4 1.7 5.2c.2.6.4.8.9.8.4 0 .6-.2.9-.4l2.2-2.1 4.5 3.3c.8.5 1.4.2 1.6-.8l2.9-13.7c.3-1.2-.4-1.8-1.7-1.3zM9.6 14.1l8.3-7.4-6.6 8.6-.3 3.1z" fill="currentColor"/>',
  shield: '<path d="M12 2.8l7.5 3v5.6c0 4.6-3.1 8.4-7.5 9.8-4.4-1.4-7.5-5.2-7.5-9.8V5.8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8.6 12.1l2.3 2.3 4.6-4.8" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  flame: '<path d="M12.4 2.5c.6 3.2-1.4 4.9-2.9 6.7-1.4 1.6-2.6 3.3-2.6 5.9a5.1 5.1 0 0010.2 0c0-1.7-.6-3-1.4-4.1-.2 1.3-.9 2.3-1.9 2.6.9-3.8-.2-8.1-1.4-11.1z" fill="currentColor"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  out: '<path d="M14 4h6v6m0-6l-9 9M18 14v4a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  candles: '<path d="M7 3v4m0 10v4M17 3v3m0 11v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><rect x="4.5" y="7" width="5" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="14.5" y="6" width="5" height="11" rx="1" fill="currentColor"/>',
  line: '<path d="M3 17l5-6 4 3 5-7 4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  search: '<circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M16 16l4 4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
  hook: '<circle cx="14" cy="3.8" r="1.8" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M14 5.6v9a4.6 4.6 0 01-9.2 0V11" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M4.8 9.6l2.9 3" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
  person: '<circle cx="12" cy="8.5" r="3.8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4.8 20c.9-3.7 3.7-5.6 7.2-5.6s6.3 1.9 7.2 5.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  megaphone: '<path d="M4 10v4a1 1 0 001 1h2l6 4V5L7 9H5a1 1 0 00-1 1zM16.5 8.5a5 5 0 010 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  up: '<path d="M12 4.5l8 13H4z" fill="currentColor"/>',
  down: '<path d="M12 19.5l-8-13h16z" fill="currentColor"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.1A4.3 4.3 0 0112 7.4a4.3 4.3 0 017.5 2.5C19.5 15.4 12 20 12 20z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  heartfill: '<path d="M12 20s-7.5-4.6-7.5-10.1A4.3 4.3 0 0112 7.4a4.3 4.3 0 017.5 2.5C19.5 15.4 12 20 12 20z" fill="currentColor"/>',
  reply: '<path d="M4 12.5c0-4.1 3.6-7 8-7s8 2.9 8 7-3.6 7-8 7c-1.2 0-2.3-.2-3.3-.6L4.5 20l1-3.6A6.6 6.6 0 014 12.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0112 0v5.5l1.5 2h-15zM10 20.5a2 2 0 004 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  plus: '<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="9" cy="10" r="1.8" fill="currentColor"/><path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  alert: '<path d="M12 3.5l9 16H3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 10v4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="17.2" r="1.1" fill="currentColor"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 11-2.2-5.3M19.5 4.5v4.2h-4.2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  wallet: '<rect x="3.5" y="6" width="17" height="13" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M15.5 12.5h5M6 6l9-2.5 1 2.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  trade: '<path d="M7 4v16M17 4v16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><rect x="4.5" y="8" width="5" height="7" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="14.5" y="6" width="5" height="9" rx="1.2" fill="currentColor"/>',
  community: '<circle cx="9" cy="9" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="16.5" cy="10" r="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 19c.7-3 2.9-4.6 5.5-4.6s4.8 1.6 5.5 4.6M15 14.6c2.7-.3 4.8 1.1 5.5 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  sun: '<circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  moon: '<path d="M19.5 14.5A8 8 0 019.5 4.5a8 8 0 1010 10z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  more: '<circle cx="5.5" cy="12" r="1.7" fill="currentColor"/><circle cx="12" cy="12" r="1.7" fill="currentColor"/><circle cx="18.5" cy="12" r="1.7" fill="currentColor"/>',
  seal: '<path d="M12 1.8l2.4 1.9 3-.3.9 2.9 2.7 1.4-.6 3 1.6 2.6-2.2 2.1.1 3-2.9.8-1.4 2.7-3-.5L12 22.2l-2.4-1.9-3 .3-.9-2.9-2.7-1.4.6-3L2 10.7l2.2-2.1-.1-3 2.9-.8L8.4 2.1l3 .5z" fill="currentColor"/><path d="M8.3 12.2l2.5 2.5 4.9-5" fill="none" stroke="var(--qa-floor, #111)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
};
export function ensureSprite() {
  if (document.getElementById('qa-sprite')) return;
  const svg = document.createElementNS(NS, 'svg');
  svg.id = 'qa-sprite'; svg.setAttribute('class', 'qa-sprite'); svg.setAttribute('aria-hidden', 'true');
  // The wallet symbol is #qa-i-wallet: #qa-wallet is the shell's wallet slot, and the same id twice blanked the icon.
  svg.innerHTML = Object.entries(ICONS).map(([k, v]) => `<symbol id="qa-${k === 'wallet' ? 'i-wallet' : k}" viewBox="0 0 24 24">${v}</symbol>`).join('');
  document.body.prepend(svg);
}
if (document.body) ensureSprite(); else addEventListener('DOMContentLoaded', ensureSprite, { once: true });

/* ================= formatting ================= */
const SUB = '₀₁₂₃₄₅₆₇₈₉';
const sub = (n) => String(n).split('').map((d) => SUB[d]).join('');
export const fmt = {
  price(p) { return p > 0 ? '$' + priceDigits(p) : '$0'; },
  axis(p) { return p > 0 ? priceDigits(p) : '0'; },
  usd(v) { const a = Math.abs(v); if (a >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B'; if (a >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M'; if (a >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K'; if (a >= .01) return '$' + v.toFixed(2); return a ? '<$0.01' : '$0'; },
  usdExact(v) { return v >= 1000 ? '$' + Math.round(v).toLocaleString('en-US') : v >= .01 ? '$' + v.toFixed(2) : v ? '<$0.01' : '$0'; },
  tok(n) { const a = Math.abs(n); if (a >= 1e9) return (n / 1e9).toFixed(2) + 'B'; if (a >= 1e6) return (n / 1e6).toFixed(2) + 'M'; if (a >= 1e4) return (n / 1e3).toFixed(1) + 'K'; if (a >= 1e3) return (n / 1e3).toFixed(2) + 'K'; return Math.round(n).toLocaleString('en-US'); },
  pct(x, d = 1) { if (Math.abs(x) < .0005) return '0.0%'; return (x >= 0 ? '+' : '−') + Math.abs(x * 100).toLocaleString('en-US', { minimumFractionDigits: Math.abs(x) >= 10 ? 0 : d, maximumFractionDigits: Math.abs(x) >= 10 ? 0 : d }) + '%'; },
  mult(m) { return m >= 2 ? m.toFixed(2) + '×' : fmt.pct(m - 1); },
  age(s) { s = Math.max(0, Math.round(s)); if (s < 60) return s + 's'; if (s < 3600) return Math.floor(s / 60) + 'm'; if (s < 86400) return Math.floor(s / 3600) + 'h'; return Math.floor(s / 86400) + 'd'; },
  short(a) { return a ? a.slice(0, 6) + '…' + a.slice(-4) : ''; },
};

/* ================= avatars, coins, tags ================= */
export function avatar(addr, size = '', img) {
  const cls = 'qa-ava' + (size ? ' qa-ava--' + size : '');
  if (img) return h('span', { class: cls, style: { 'background-image': `url("${img}")` } });
  if (!addr) return h('span', { class: cls });
  const a = parseInt(addr.slice(2, 6), 16) || 7, b = parseInt(addr.slice(6, 10), 16) || 3;
  // flat (design audit #35, 2026-11-12; was noir + gold wedges): a two-tone split from ivory/gold/bronze/black pairs, own angle and split point per address
  return h('span', { class: cls, style: { background: (function(v){/* design audit #35 (2026-11-12): a flat avatar, one tone from the noir palette + two characters of the address; no wedges */const s=String(v||'').replace(/^solana:/,'').replace(/^0x/i,''),n=[...s].reduce((a,c)=>(a*31+c.charCodeAt(0))>>>0,7),T=[['#1b1a17','#e8c88c'],['#2b241a','#f1e7d0'],['#4a3a22','#f1e7d0'],['#7a5c2e','#f6efe0'],['#b98d4e','#14110c'],['#d9bd84','#1a140b'],['#ece2cc','#2a1d0e'],['#3a3a35','#e8c88c']][n%8],t=(s.slice(0,2)||'?').toUpperCase().replace(/[^0-9A-Z]/g,'');return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'><rect width='40' height='40' fill='${T[0]}'/><text x='20' y='25.5' text-anchor='middle' font-family='system-ui,-apple-system,Segoe UI,sans-serif' font-size='14' font-weight='700' letter-spacing='.5' fill='${T[1]}'>${t}</text></svg>`)}") center / cover no-repeat`;})(addr) } });
}
export const keeperAvatar = (size = '') => h('span', { class: 'qa-ava qa-ava--keeper' + (size ? ' qa-ava--' + size : '') }, icon('flame'));
export function avatarStack(addrs, more) { return h('span', { class: 'qa-ava-stack' }, addrs.map((a) => avatar(a)), more ? h('span', { class: 'qa-ava-stack__more' }, more) : null); }
export function coin(src, { size = '', alt = '' } = {}) {
  const pulse = h('span', { class: 'qa-coin__pulse', 'aria-hidden': 'true' });
  const el = h('span', { class: 'qa-coin' + (size ? ' qa-coin--' + size : '') }, h('img', { class: 'qa-coin__img', src, alt, width: 96, height: 96 }), h('span', { class: 'qa-coin__ring', 'aria-hidden': 'true' }), pulse);
  el.pulse = (dir) => { if (!RM) { pulse.className = 'qa-coin__pulse'; void pulse.offsetWidth; pulse.classList.add(dir > 0 ? 'is-buy' : 'is-sell'); } };
  return el;
}
export const tag = (text, kind = '') => h('span', { class: 'qa-tag' + (kind ? ' qa-tag--' + kind : '') }, text);
export const xBadge = (handle) => h('span', { class: 'qa-xbadge', title: 'X account linked' }, icon('x'), handle, h('span', { class: 'qa-xbadge__check' }, icon('check')));
export const seal = (title = 'Official') => h('span', { class: 'qa-seal', title }, icon('seal', ''), h('span', { class: 'qa-vh' }, title));
export function tokenChip(symbol, img) { return h('span', { class: 'qa-token-chip' }, h('i', { style: img ? { 'background-image': `url("${img}")` } : null }), symbol); }

/* ================= art ================= */
// Sets the page light from a token's art. banner: 3:1 image; blur: a small pre-blurred copy (240x80); icon: square image.
export const absUrl = (u) => new URL(u, location.href).href; // CSS vars resolve url() against the stylesheet, so pass absolute URLs
export function setArt({ banner, blur, icon: ic } = {}, root = document.documentElement) {
  if (blur || banner) root.style.setProperty('--qa-banner-blur', `url("${absUrl(blur || banner)}")`);
  if (ic) root.style.setProperty('--qa-icon', `url("${absUrl(ic)}")`);
}
export function ambient() { return h('div', { class: 'qa-ambient', 'aria-hidden': 'true' }, h('div', { class: 'qa-ambient__art' }), h('div', { class: 'qa-ambient__grain' })); }
// Art stage: banner with glow, coin, name, socials and meta. Returns { el, coin }.
export function artStage({ banner, icon: ic, name, official, socials = [], meta = [], wide = false, quote }) {
  const c = coin(ic, { alt: name + ' icon' });
  const el = h('section', { class: 'qa-stage' + (wide ? ' qa-stage--wide' : ''), 'aria-label': name },
    h('div', { class: 'qa-stage__art', 'aria-hidden': 'true' }, h('div', { class: 'qa-stage__glow' }),
      h('div', { class: 'qa-stage__frame' }, h('img', { class: 'qa-stage__img', src: banner, alt: '' }), h('span', { class: 'qa-stage__sheen' }))),
    h('div', { class: 'qa-stage__copy' },
      h('div', { class: 'qa-ident' }, c, h('h1', { class: 'qa-sym' }, name, official ? seal() : null),
        h('div', { class: 'qa-socials' }, socials.map((s) => h('a', { href: s.href, 'aria-label': s.label }, icon(s.icon)))),
        h('p', { class: 'qa-meta' }, meta)),
      quote || null));
  if (!RM) {
    const img = el.querySelector('.qa-stage__img'), frame = el.querySelector('.qa-stage__frame');
    addEventListener('scroll', () => img.style.setProperty('--qa-par-y', (scrollY * .32).toFixed(1) + 'px'), { passive: true });
    if (wide) el.addEventListener('pointermove', (e) => { if (innerWidth < 1100) return; const r = el.getBoundingClientRect(); frame.style.setProperty('--qa-tilt-y', (((e.clientX - r.left) / r.width - .5) * -5).toFixed(2) + 'deg'); frame.style.setProperty('--qa-tilt-x', (((e.clientY - r.top) / r.height - .5) * 4).toFixed(2) + 'deg'); });
  }
  return { el, coin: c };
}

/* ================= big price + change ================= */
export function bigPrice(el = h('div', { class: 'qa-price' })) {
  let prev = '';
  return {
    el,
    set(p, dir = 0) {
      const str = fmt.price(p);
      let diff = -1; for (let k = 0; k < str.length; k++) if (str[k] !== prev[k]) { diff = k; break; }
      el.textContent = ''; let lead = true;
      for (let k = 0; k < str.length; k++) {
        const c = str[k]; if (/[1-9₀-₉]/.test(c)) lead = false;
        const s = h('span', { class: 'qa-dg' + (lead && k > 0 && /[0.]/.test(c) ? ' z' : '') }, c);
        if (dir && !RM && prev && diff >= 0 && k >= diff) s.classList.add(dir > 0 ? 'is-up' : 'is-down');
        el.append(s);
      }
      if (dir && !RM) requestAnimationFrame(() => requestAnimationFrame(() => el.querySelectorAll('.is-up,.is-down').forEach((s) => s.classList.remove('is-up', 'is-down'))));
      prev = str;
    },
  };
}
export function changeLine() {
  const chg = h('span', { class: 'qa-change' }), range = h('span', { class: 'qa-range' });
  const el = h('p', { class: 'qa-change-line' }, chg, range);
  return {
    el,
    set(ratio, { label = '24h', delta, words, pulse = false } = {}) {
      chg.className = 'qa-change' + (ratio < 0 ? ' is-neg' : ''); chg.textContent = '';
      chg.append(icon(ratio < 0 ? 'down' : 'up'), Math.abs(ratio * 100).toLocaleString('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + '%', h('small', null, label));
      if (pulse && !RM) restart(chg, 'is-pulse');
      range.textContent = '';
      if (delta != null) range.append(h('b', { class: delta >= 0 ? 'qa-up' : 'qa-down' }, (delta >= 0 ? '+' : '−') + fmt.price(Math.abs(delta))), ' ' + (words || ''));
    },
  };
}

/* ================= stat strip ================= */
// defs: [{ key, label, value: () => string, bar: () => [a, b] }]
export function statStrip(defs) {
  const track = h('div', { class: 'qa-stats__track' });
  const el = h('section', { class: 'qa-stats', 'aria-label': 'Stats' }, track);
  const cells = defs.map((d) => {
    const v = h('div', { class: 'qa-stat__v' }); const cell = h('div', { class: 'qa-stat' }, v, h('div', { class: 'qa-stat__l' }, d.label));
    let bars = null;
    if (d.bar) { bars = [h('span', { style: { background: 'var(--qa-buy)' } }), h('span', { style: { background: 'var(--qa-sell)' } })]; cell.append(h('div', { class: 'qa-stat__bar' }, bars)); }
    track.append(cell); return { d, v, bars };
  });
  const update = (flash = false) => cells.forEach(({ d, v, bars }) => {
    const nv = d.value(); if (flash && !RM && v.textContent && v.textContent !== nv && !d.static) { v.classList.add('is-tick'); setTimeout(() => v.classList.remove('is-tick'), 60); }
    v.textContent = nv; if (bars) { const [a, b] = d.bar(); bars[0].style.flexGrow = a; bars[1].style.flexGrow = b; }
  });
  update();
  return { el, update };
}

/* ================= ticker band ================= */
// items: [{ symbol, img, price, change, mcap }]
export function ticker(items, copies = 6) {
  const track = h('div', { class: 'qa-ticker__track' });
  const one = () => items.map((m) => h('a', { class: 'qa-tk', href: m.href || '#' },
    h('i', { style: m.img ? { 'background-image': `url("${m.img}")` } : null }, m.img ? '' : m.symbol[0]),
    m.symbol, h('span', null, fmt.price(m.price)),
    h('b', { class: m.change > .0005 ? 'qa-up' : m.change < -.0005 ? 'qa-down' : '' }, fmt.pct(m.change)),
    m.mcap != null ? h('span', null, 'MC ' + fmt.usd(m.mcap)) : null));
  for (let k = 0; k < copies; k++) track.append(...one());
  return h('div', { class: 'qa-ticker', role: 'marquee', 'aria-label': 'Markets' }, track);
}

/* ================= trades tape ================= */
// trade: { ts, b (1 buy / 0 sell), usd, tok, w (wallet), bb (buyback), nh (new holder) }
export function tradeRow(t, { enter = false, keeperName = 'Buyback' } = {}) {
  const kind = t.bb ? 'is-burn' : t.b ? 'is-buy' : 'is-sell';
  const g = icon(t.bb ? 'flame' : t.b ? 'up' : 'down', 'qa-glyph');
  const age = h('span', { class: 'qa-trow__age' }); age.dataset.ts = t.ts;
  const who = t.bb ? h('span', { class: 'qa-trow__who' }, keeperAvatar(), h('span', null, keeperName))
    : h('span', { class: 'qa-trow__who' }, avatar(t.w), h('span', null, fmt.short(t.w)), t.nh ? tag('New', 'new') : null);
  return h('li', { class: `qa-trow ${kind}${t.usd >= 300 ? ' is-big' : ''}${enter && !RM ? ' is-enter' : ''}`, style: { '--w': Math.min(100, 8 + 21 * Math.log10(1 + t.usd)).toFixed(1) + '%' }, 'aria-label': (t.bb ? 'Buyback ' : t.b ? 'Buy ' : 'Sell ') + fmt.usdExact(t.usd) },
    g, h('span', { class: 'qa-trow__usd' }, fmt.usdExact(t.usd)), h('span', { class: 'qa-trow__amt' }, fmt.tok(t.tok)), who, age);
}
export function tape({ rows = 12, compact = false } = {}) {
  const el = h('ol', { class: 'qa-tape' + (compact ? ' qa-tape--compact' : ''), 'aria-live': 'off' });
  const api = {
    el,
    render(list) { el.textContent = ''; list.slice(0, rows).forEach((t) => el.append(tradeRow(t))); },
    push(t) { el.prepend(tradeRow(t, { enter: true })); while (el.children.length > rows) el.lastElementChild.remove(); },
    ages(now) { el.querySelectorAll('[data-ts]').forEach((n) => (n.textContent = fmt.age(now - +n.dataset.ts))); },
  };
  return api;
}

/* ================= toasts ================= */
let toastBox;
export function toastHost(parent = document.body) { if (!toastBox) toastBox = h('div', { class: 'qa-toasts', 'aria-live': 'polite' }); if (toastBox.parentElement !== parent) parent.append(toastBox); return toastBox; }
// kind: holder | call | burn | error
export function toast({ kind = 'holder', title, body, ava, badge, tag: t, ms = 3600 }) {
  const box = toastHost(toastBox?.parentElement || document.body);
  const el = h('div', { class: 'qa-toast qa-toast--' + kind, role: 'status' },
    h('span', { class: 'qa-toast__ico' }, ava || avatar(), h('span', { class: 'qa-toast__badge' }, icon(badge || ({ holder: 'person', call: 'megaphone', burn: 'flame', error: 'alert' }[kind] || 'person')))),
    h('span', { class: 'qa-toast__main' }, h('span', { class: 'qa-toast__t' }, title), h('span', { class: 'qa-toast__b' }, body)),
    t ? h('span', { class: 'qa-toast__tag' }, t) : null);
  box.prepend(el);
  while (box.children.length > 2) box.lastElementChild.remove();
  setTimeout(() => { if (RM) return el.remove(); el.classList.add('is-out'); setTimeout(() => el.remove(), 280); }, ms);
  return el;
}

/* ================= live label ================= */
export function liveLabel() {
  const txt = h('span'), el = h('span', { class: 'qa-live' }, h('span', { class: 'qa-live__dot' }), txt);
  let last = performance.now(), refreshing = false;
  const paint = () => { if (refreshing) { txt.textContent = 'Refreshing'; return; } const s = (performance.now() - last) / 1000; txt.textContent = ''; if (s < 1.5) txt.append('Last trade ', h('b', null, 'just now')); else txt.append('Last trade ', h('b', null, fmt.age(s)), ' ago'); };
  setInterval(paint, 1000); paint();
  return { el, hit() { last = performance.now(); refreshing = false; el.classList.remove('is-refreshing'); if (!RM) restart(el, 'is-hot'); paint(); }, refreshing(on = true) { refreshing = on; el.classList.toggle('is-refreshing', on); paint(); }, setLast(msAgo) { last = performance.now() - msAgo; paint(); } };
}

/* ================= tabs ================= */
// items: [{ id, label, count }]; variant: '' | 'section' | 'big'
export function tabs(items, { active, onChange, variant = '', label = 'Tabs', href = false } = {}) {
  const ink = h('span', { class: 'qa-tabs__ink', 'aria-hidden': 'true' });
  const el = h(href ? 'nav' : 'div', { class: 'qa-tabs' + (variant ? ' qa-tabs--' + variant : ''), role: href ? null : 'tablist', 'aria-label': label });
  const btns = items.map((it) => {
    const b = h(href ? 'a' : 'button', { class: 'qa-tab' + (it.id === active ? ' is-on' : ''), href: href ? '#' + it.id : null, type: href ? null : 'button', role: href ? null : 'tab', 'aria-selected': href ? null : String(it.id === active),
      onclick: () => set(it.id, true) }, it.label, it.count != null ? h('span', { class: 'qa-tab__n' }, it.count) : null);
    b.dataset.id = it.id; return b;
  });
  el.append(...btns, ink);
  const place = () => { const on = btns.find((b) => b.classList.contains('is-on')); if (!on) return; const cs = getComputedStyle(on); const pl = parseFloat(cs.paddingLeft), pr = parseFloat(cs.paddingRight); ink.style.setProperty('--qa-ink-x', (on.offsetLeft + pl) + 'px'); ink.style.setProperty('--qa-ink-w', (on.offsetWidth - pl - pr) + 'px'); };
  function set(id, user) { btns.forEach((b) => { const on = b.dataset.id === id; b.classList.toggle('is-on', on); if (!href) b.setAttribute('aria-selected', String(on)); }); place(); if (user && onChange) onChange(id); }
  requestAnimationFrame(place); addEventListener('resize', place); document.fonts?.ready.then(place);
  return { el, set, place };
}
// Section nav that follows scroll (scroll-spy). sections: [{ id, label }]
export function sectionNav(sections) {
  const t = tabs(sections, { active: sections[0].id, variant: 'section', href: true, label: 'Sections' });
  const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) t.set(e.target.id); }, { rootMargin: '-40% 0px -55% 0px' });
  requestAnimationFrame(() => sections.forEach((s) => { const n = document.getElementById(s.id); if (n) io.observe(n); }));
  return t;
}

/* ================= section head ================= */
// The four brand words are the recurring anchors: Builders, Callers, Holders, Traders. Use them as titles where a section is about those people.
export function sectionHead({ title, count, note, small = false, id }) {
  return h('header', { class: 'qa-head', id },
    h('h2', { class: 'qa-head__t' + (small ? ' qa-head__t--s' : '') }, title),
    count != null ? h('sup', { class: 'qa-head__count' }, count) : null,
    note ? (note.nodeType ? note : h('span', { class: 'qa-head__note' }, note)) : null);
}

/* ================= buttons ================= */
export function button(label, { kind = 'primary', size = '', block = false, iconId, onclick, type = 'button', href } = {}) {
  return h(href ? 'a' : 'button', { class: `qa-btn qa-btn--${kind}${size ? ' qa-btn--' + size : ''}${block ? ' qa-btn--block' : ''}`, type: href ? null : type, href, onclick }, iconId ? icon(iconId) : null, label);
}

/* ================= rows ================= */
export function row({ lead, title, sub, value, valueSub, valueClass = '', w, wash, href }) {
  return h(href ? 'a' : 'div', { class: 'qa-row', href, style: w != null ? { '--w': w + '%', ...(wash ? { '--wash': wash } : {}) } : null },
    lead || h('span'), h('span', { class: 'qa-row__main' }, h('span', { class: 'qa-row__t' }, title), sub ? h('span', { class: 'qa-row__s' }, sub) : null),
    h('span', { class: 'qa-row__v ' + valueClass }, value, valueSub != null ? h('small', null, valueSub) : null));
}
export function sparkline(values, { up } = {}) {
  const s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '0 0 64 26'); s.setAttribute('class', 'qa-spark'); s.setAttribute('preserveAspectRatio', 'none');
  if (!values || values.length < 2) return s;
  const lo = Math.min(...values), hi = Math.max(...values);
  const d = values.map((v, i) => (i ? 'L' : 'M') + (i / (values.length - 1) * 64).toFixed(1) + ' ' + (23 - (v - lo) / (hi - lo || 1) * 20).toFixed(1)).join(' ');
  const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); p.style.stroke = (up ?? values[values.length - 1] >= values[0]) ? 'var(--qa-buy)' : 'var(--qa-sell)'; s.append(p);
  return s;
}
export function marketRow(m) {
  const ic = h('span', { class: 'qa-market__icon', style: m.img ? { 'background-image': `url("${m.img}")` } : null }, m.img ? '' : m.symbol[0]);
  const r = h(m.href ? 'a' : 'div', { class: 'qa-row qa-market', href: m.href }, ic,
    h('span', { class: 'qa-row__main' }, h('span', { class: 'qa-row__t' }, m.symbol), h('span', { class: 'qa-row__s' }, [m.chain, m.age].filter(Boolean).join(' · '))),
    sparkline(m.spark), h('span', { class: 'qa-row__v' }, fmt.usd(m.mcap), h('small', { class: m.change > .0005 ? 'qa-up' : m.change < -.0005 ? 'qa-down' : 'qa-muted' }, fmt.pct(m.change))));
  return r;
}

/* ================= states ================= */
export function state(kind, { title, body, action, onAction } = {}) {
  const mark = { empty: 'hook', loading: 'refresh', error: 'alert' }[kind];
  const el = h('div', { class: 'qa-state qa-state--' + kind, role: kind === 'error' ? 'alert' : 'status' },
    h('span', { class: 'qa-state__mark' }, icon(mark)), h('p', { class: 'qa-state__t' }, title), body ? h('p', { class: 'qa-state__b' }, body) : null,
    action ? button(action, { kind: kind === 'error' ? 'secondary' : 'primary', size: 'sm', onclick: onAction }) : null);
  return el;
}
export function skeletonRows(n = 4) { return h('div', { 'aria-hidden': 'true' }, Array.from({ length: n }, () => h('span', { class: 'qa-skel qa-skel--row' }))); }

/* ================= forms ================= */
export function field({ label, aside, input, help, error }) {
  return h('label', { class: 'qa-field' + (error ? ' is-error' : '') }, h('span', { class: 'qa-field__l' }, label, aside ? h('b', null, aside) : null), input, help || error ? h('span', { class: 'qa-field__help' }, error || help) : null);
}
export function upload({ shape = 'banner', label, src, onpick }) {
  const el = h('button', { class: `qa-upload qa-upload--${shape}${src ? ' is-filled' : ''}`, type: 'button', onclick: onpick, 'aria-label': label }, src ? h('img', { src, alt: '' }) : [icon('image'), h('span', null, label)]);
  el.fill = (url) => { el.textContent = ''; el.append(h('img', { src: url, alt: '' })); el.classList.add('is-filled'); if (!RM) restart(el, 'is-filled'); };
  return el;
}
export function toggle({ on = false, label }) { const b = h('button', { class: 'qa-switch', type: 'button', role: 'switch', 'aria-checked': String(on), 'aria-label': label, onclick: () => b.setAttribute('aria-checked', String(b.getAttribute('aria-checked') !== 'true')) }); return b; }
export function steps(n, of, label) { return h('div', { class: 'qa-steps' }, h('span', { class: 'qa-steps__bar' }, Array.from({ length: of }, (_, i) => h('span', { class: i < n ? 'is-done' : '' }))), `Step ${n} of ${of}` + (label ? ' · ' + label : '')); }

/* ================= ticket, dock, sheet ================= */
// A Buy/Sell ticket. quote(amount, side) returns { get: string, impact: number } so the page owns the maths.
export function ticket({ symbol, presets = [0.01, 0.05, 0.1, 0.5], start = 0.05, quote, charge = '2%', fine, connect = true }) {
  let side = 'buy';
  const amt = h('input', { inputmode: 'decimal', value: String(start), 'aria-label': 'Amount in ETH' });
  const get = h('dd'), imp = h('dd'), go = h('button', { class: 'qa-btn qa-btn--buy qa-btn--block', type: 'button' });
  const sides = ['buy', 'sell', 'limit'].map((s) => h('button', { class: 'qa-ticket__side' + (s === side ? ' is-on' : ''), type: 'button', role: 'tab', 'aria-selected': String(s === side), dataset: { side: s }, onclick: () => setSide(s) }, s[0].toUpperCase() + s.slice(1)));
  const pre = h('div', { class: 'qa-presets' }, presets.map((v) => h('button', { type: 'button', class: v === start ? 'is-on' : '', onclick: (e) => { amt.value = v; pre.querySelectorAll('button').forEach((b) => b.classList.toggle('is-on', b === e.currentTarget)); render(); } }, String(v))));
  const el = h('div', { class: 'qa-ticket' }, h('div', { class: 'qa-ticket__sides', role: 'tablist' }, sides),
    h('label', { class: 'qa-amount' }, h('span', { class: 'qa-amount__top' }, h('span', null, 'You pay'), h('span', null, 'Balance 0 ETH')), h('span', { class: 'qa-amount__row' }, amt, h('span', { class: 'qa-amount__unit' }, h('span', { class: 'qa-eth' }), 'ETH'))),
    pre, h('dl', { class: 'qa-lines' }, h('div', null, h('dt', null, 'You get about'), get), h('div', null, h('dt', null, 'Price impact about'), imp), h('div', null, h('dt', null, (side === 'sell' ? 'Sell' : 'Buy') + ' charge'), h('dd', null, charge))),
    go, fine ? h('p', { class: 'qa-fine' }, fine) : null);
  function setSide(s) { side = s; sides.forEach((b) => { b.classList.toggle('is-on', b.dataset.side === s); b.setAttribute('aria-selected', String(b.dataset.side === s)); }); render(); }
  function render() {
    const a = parseFloat(amt.value) || 0; const q = quote ? quote(a, side) : { get: '—', impact: 0 };
    get.textContent = q.get; imp.textContent = (q.impact * 100).toFixed(2) + '%'; imp.className = q.impact > .1 ? 'qa-down' : '';
    go.textContent = connect ? (side === 'sell' ? 'Connect wallet to sell' : side === 'limit' ? 'Connect wallet to place a limit' : 'Connect wallet to buy') : (side === 'sell' ? 'Sell ' : 'Buy ') + symbol;
    go.className = 'qa-btn qa-btn--block ' + (side === 'sell' ? 'qa-btn--sell' : 'qa-btn--buy');
  }
  amt.addEventListener('input', render); render();
  return { el, setSide, render };
}
export function dock({ onBuy, onSell } = {}) { return h('div', { class: 'qa-dock' }, button('Buy', { kind: 'buy', onclick: onBuy }), button('Sell', { kind: 'sell', onclick: onSell })); }
let sheetEls;
export function openSheet(content, { label = 'Sheet', onClose } = {}) {
  closeSheet();
  const scrim = h('div', { class: 'qa-scrim' }); const body = h('div'); const sh = h('div', { class: 'qa-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': label }, h('span', { class: 'qa-sheet__grip', 'aria-hidden': 'true' }), body);
  const home = content.parentElement, next = content.nextSibling; body.append(content);
  sheetEls = { scrim, sh, content, home, next, onClose };
  scrim.addEventListener('click', closeSheet); document.body.append(scrim, sh);
  const esc = (e) => { if (e.key === 'Escape') closeSheet(); }; addEventListener('keydown', esc, { once: true });
}
export function closeSheet() { if (!sheetEls) return; const { scrim, sh, content, home, next, onClose } = sheetEls; if (home) home.insertBefore(content, next); scrim.remove(); sh.remove(); sheetEls = null; onClose && onClose(); }

/* ================= brand line ================= */
// "For the next generation of token builders / callers / holders / traders", resolving to "For the next generation."
export function brandLine({ words = ['builders', 'callers', 'holders', 'traders'], play = 'inview', hook = true, hold = 1750 } = {}) {
  const word = h('span', { class: 'qa-line__word' }, words[0]);
  const el = h('div', { class: 'qa-line' }, hook ? h('span', { class: 'qa-line__hook', 'aria-hidden': 'true' }) : null,
    h('p', { class: 'qa-line__text', 'aria-label': 'For the next generation of token ' + words.join(', ') + '.' }, h('span', null, 'For the next generation'), h('span', { class: 'qa-line__b' }, ' of token ', word), '.'));
  const rest = () => { el.classList.add('is-rest'); setTimeout(() => el.classList.add('is-rested'), RM ? 0 : 460); };
  const run = () => {
    if (RM) return rest();
    let k = 0;
    const next = () => { k++; if (k >= words.length) return setTimeout(rest, hold); restart(word, 'is-swap'); word.classList.add('is-swap'); setTimeout(() => { word.textContent = words[k]; word.classList.remove('is-swap'); setTimeout(next, hold); }, 230); };
    setTimeout(next, hold);
  };
  if (play === 'now') requestAnimationFrame(run); else if (play === 'inview') inView(el, run, .5); else if (play === 'rest') { el.classList.add('is-rest', 'is-rested'); }
  return { el, run, rest };
}

/* ================= community ================= */
// Called -> Now scoreboard with the multiple. update(nowPrice) as the price moves.
export function callOutcome({ callPrice, nowPrice, calledLabel = 'Called at', nowLabel = 'Now' }) {
  const now = h('b'), x = h('b');
  const el = h('div', { class: 'qa-outcome' },
    h('div', { class: 'qa-outcome__col' }, h('span', null, calledLabel), h('b', null, fmt.price(callPrice))),
    h('div', { class: 'qa-outcome__col' }, h('span', null, nowLabel), now),
    h('div', { class: 'qa-outcome__x' }, x, h('span', null, 'since the call')));
  const update = (p) => { now.textContent = fmt.price(p); const m = p / callPrice; x.textContent = fmt.mult(m); x.className = m >= 1 ? 'qa-up' : 'qa-down'; };
  update(nowPrice); el.update = update; return el;
}
// Caller's own position: { heldAtCall, holdsNow, staked, movedOut, movedTo, minutesAfter, callPrice }, price for USD.
export function positionBars(p, price) {
  const scale = Math.max(p.heldAtCall, p.holdsNow + (p.staked || 0), p.movedOut || 0, 1) * 1.04;
  const bar = (cls, f) => h('span', { class: cls, style: { width: (Math.max(0, f) * 100).toFixed(2) + '%' } });
  const nowUsd = h('small');
  const el = h('div', { class: 'qa-posbars' },
    h('div', { class: 'qa-cb' }, h('span', { class: 'qa-cb__l' }, 'At the call'), h('span', { class: 'qa-cb__track' }, bar('qa-cb__held', p.heldAtCall / scale)), h('span', { class: 'qa-cb__v' }, fmt.tok(p.heldAtCall), p.callPrice ? h('small', null, fmt.usd(p.heldAtCall * p.callPrice)) : null)),
    h('div', { class: 'qa-cb' }, h('span', { class: 'qa-cb__l' }, 'Holds now'), h('span', { class: 'qa-cb__track' }, p.holdsNow ? bar('qa-cb__now', p.holdsNow / scale) : h('span', { class: 'qa-cb__zero' }), p.staked ? bar('qa-cb__staked', p.staked / scale) : null), h('span', { class: 'qa-cb__v' }, fmt.tok(p.holdsNow), nowUsd)),
    p.staked ? h('div', { class: 'qa-cb' }, h('span', { class: 'qa-cb__l' }, 'Staked'), h('span', { class: 'qa-cb__track' }, bar('qa-cb__staked', p.staked / scale)), h('span', { class: 'qa-cb__v' }, fmt.tok(p.staked), h('small', null, 'sold ' + fmt.tok(p.sold || 0))))
      : h('div', { class: 'qa-cb' }, h('span', { class: 'qa-cb__l' }, 'Moved out'), h('span', { class: 'qa-cb__track' }, bar('qa-cb__out', (p.movedOut || 0) / scale)), h('span', { class: 'qa-cb__v' }, fmt.tok(p.movedOut || 0), h('small', null, 'since the call'))));
  const wrap = h('div', null, el);
  if (!p.holdsNow && p.movedOut) wrap.append(h('p', { class: 'qa-note qa-note--warn' }, `Moved all ${fmt.tok(p.movedOut)} out ${p.minutesAfter} min after the call${p.movedTo ? ', to ' + fmt.short(p.movedTo) : ''}`));
  else if (p.holdsNow >= p.heldAtCall) wrap.append(h('p', { class: 'qa-note qa-note--good' }, `Added ${fmt.tok(p.holdsNow + (p.staked || 0) - p.heldAtCall + (p.sold || 0))} since the call${p.staked ? ', staked ' + fmt.tok(p.staked) : ''}. Sold ${p.sold ? fmt.tok(p.sold) : 'none'}.`));
  wrap.update = (pr) => { nowUsd.textContent = p.holdsNow ? fmt.usd(p.holdsNow * pr) : '$0'; };
  wrap.update(price); return wrap;
}
export function reactions({ likes = null, fires = null, replies = null, buy, onBuy } = {}) {
  const mk = (cls, ic, icOn, n, label) => {
    const count = h('span', null, n != null ? n : ''); let on = false; let num = n;
    const b = h('button', { class: 'qa-react ' + cls, type: 'button', 'aria-pressed': 'false', 'aria-label': label, onclick: () => { on = !on; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)); b.querySelector('use').setAttribute('href', '#qa-' + (on ? icOn : ic)); if (num != null) { num += on ? 1 : -1; count.textContent = num; } if (on && !RM) restart(b, 'is-pop'); } }, icon(ic), count);
    return b;
  };
  return h('div', { class: 'qa-reacts' },
    mk('qa-react--like', 'heart', 'heartfill', likes, 'Like'), mk('qa-react--fire', 'flame', 'flame', fires, 'Fire'),
    h('button', { class: 'qa-react', type: 'button', 'aria-label': 'Reply' }, icon('reply'), h('span', null, replies != null ? replies : '')),
    h('button', { class: 'qa-react', type: 'button', 'aria-label': 'Share' }, icon('share')),
    buy ? h('button', { class: 'qa-react qa-react--buy', type: 'button', onclick: onBuy }, buy) : null);
}
export function replies(list) { return h('div', { class: 'qa-replies' }, list.map((r) => h('div', { class: 'qa-reply' }, avatar(r.w, '', r.img), h('div', null, h('b', null, r.name), h('span', null, r.age), h('p', null, r.text))))); }
// A feed post. what: a line like "called $QHOOKS". media: any node (outcome, bars, chart). tags: extra marks (Sample, Replay).
export function post({ w, img, name, handle, x, age, what, text, media = [], reacts, replies: reps, tags = [], enter = false, keeper = false }) {
  return h('article', { class: 'qa-post' + (enter && !RM ? ' is-enter' : '') },
    keeper ? keeperAvatar('lg') : avatar(w, 'lg', img),
    h('div', { class: 'qa-post__body' },
      h('div', { class: 'qa-post__head' }, h('span', { class: 'qa-post__name' }, name || fmt.short(w)), x ? xBadge(x) : handle ? h('span', null, handle) : null, age ? h('span', null, age) : null, tags,
        what ? h('span', { class: 'qa-post__what' }, what) : null),
      text ? h('p', { class: 'qa-post__text' }, text) : null,
      media.length ? h('div', { class: 'qa-post__media' }, media) : null,
      reacts || null, reps || null));
}
// A one-line event in the feed (new holder, buyback, launch).
export function feedEvent({ lead, text, value, valueClass = '', enter = false }) {
  return h('article', { class: 'qa-post qa-post--event' + (enter && !RM ? ' is-enter' : '') }, lead, h('p', { class: 'qa-post__text' }, text), value ? h('span', { class: 'qa-row__v ' + valueClass }, value) : null);
}
export function composer({ w, placeholder = 'Make a call on a token', action = 'Call' } = {}) {
  return h('div', { class: 'qa-composer' }, avatar(w, 'md'), h('input', { placeholder, 'aria-label': placeholder }), button(action, { kind: 'primary', size: 'sm' }));
}
// Caller identity with a record strip. record: [{ value, label, cls }]
export function caller({ w, img, name, x, sub = [], record = [], actions = true, row = false, value, valueClass }) {
  if (row) return h('div', { class: 'qa-caller qa-caller--row' }, avatar(w, 'lg', img),
    h('div', null, h('div', { class: 'qa-caller__name' }, h('b', null, name || fmt.short(w)), x ? xBadge(x) : null), h('div', { class: 'qa-caller__sub' }, sub)),
    value != null ? h('span', { class: 'qa-row__v ' + (valueClass || '') }, value) : null);
  return h('section', { class: 'qa-caller-block' },
    h('div', { class: 'qa-caller' }, avatar(w, 'xl', img),
      h('div', null, h('div', { class: 'qa-caller__name' }, h('b', null, name || fmt.short(w)), x ? xBadge(x) : null), h('div', { class: 'qa-caller__sub' }, sub)),
      actions ? h('div', { class: 'qa-caller__actions' }, button('Follow', { kind: 'primary' }), button('Copy trades', { kind: 'secondary' }), h('button', { class: 'qa-btn qa-btn--icon', type: 'button', 'aria-label': 'Alerts for this caller' }, icon('bell'))) : null),
    record.length ? h('div', { class: 'qa-record' }, record.map((r) => h('div', null, h('b', { class: r.cls || '' }, r.value), h('span', null, r.label)))) : null);
}

/* ================= holders, burn, proof ================= */
export function supplyMap(parts, colors) {
  return h('div', null,
    h('div', { class: 'qa-supply', role: 'img', 'aria-label': parts.map((p) => `${p.label} ${p.share.toFixed(1)}%`).join(', ') }, parts.map((p, i) => h('span', { style: { 'flex-grow': String(p.share), background: colors[p.key] || 'var(--qa-rule-2)', 'animation-delay': i * 60 + 'ms' } }))),
    h('div', { class: 'qa-legend' }, parts.map((p) => h('div', null, h('i', { style: { background: colors[p.key] || 'var(--qa-rule-2)' } }), p.label, h('b', null, p.share.toFixed(1) + '%')))));
}
export function countdown({ label = 'until the next buyback', total = 900 } = {}) {
  const num = h('b'), fuse = h('i');
  const el = h('div', { class: 'qa-countdown' }, num, h('span', null, label), h('div', { class: 'qa-fuse' }, fuse));
  el.set = (left) => { if (left <= 0) { num.textContent = 'Due'; fuse.style.setProperty('--qa-fuse', '100%'); return; } num.textContent = Math.floor(left / 60) + ':' + String(Math.floor(left % 60)).padStart(2, '0'); fuse.style.setProperty('--qa-fuse', ((1 - left / total) * 100).toFixed(1) + '%'); };
  return el;
}
export function figures(list) { return h('div', { class: 'qa-figures' }, list.map((f) => h('div', null, h('b', { class: f.cls || '' }, f.value), h('span', null, f.label)))); }
export function checks(list) { return h('ul', { class: 'qa-checks' }, list.map((c) => h('li', { class: c.status === 'clear' ? '' : 'is-' + c.status }, c.title))); }

/* ================= replay: drive a page from real recorded events ================= */
// Feeds recorded events back in order, sped up. Label the surface "Replay" wherever you use it.
export function replay(events, { onEvent, gap = (realGap) => Math.min(3.4, Math.max(1.15, .85 + Math.log10(1 + realGap) * .72)) * 1000, first = 1100, loop = true, onEnd } = {}) {
  let i = 0, timer;
  const step = () => {
    if (i >= events.length) { onEnd && onEnd(); if (loop) { i = 0; timer = setTimeout(step, 9000); } return; }
    const e = events[i++]; onEvent(e, i - 1);
    const n = events[i]; timer = setTimeout(step, n ? gap((n.ts || 0) - (e.ts || 0)) : 1500);
  };
  timer = setTimeout(step, first);
  return { stop: () => clearTimeout(timer) };
}

/* ================= live chart (canvas) ================= */
// series: [[ts, price], ...] ascending; opts.getLive() -> { ts, price }; marks: [{ ts, price, kind: 'buy'|'sell'|'burn', usd }]; pins: [{ ts, price, label }]
// Draws a gold glowing line, the live price hanging from a fine line at the right edge, trade rings and a spring on each trade.
export function liveChart(canvas, { series, getLive, marks = () => [], pins = () => [], span = 86400 } = {}) {
  const ctx = canvas.getContext('2d');
  const S = { span, w: 0, h: 0, dpr: 1, xc: 0, lo: null, hi: null, rings: [], spring: null, tween: null, t0: performance.now(), hover: null, colors: null };
  const readColors = () => { const cs = getComputedStyle(canvas); const v = (n) => cs.getPropertyValue(n).trim(); S.colors = { gold: v('--qa-gold'), goldHi: v('--qa-gold-hi'), rule: v('--qa-rule'), tx3: v('--qa-tx-3'), buy: v('--qa-buy'), sell: v('--qa-sell'), fire: v('--qa-fire'), floor: v('--qa-floor'), light: document.documentElement.dataset.theme === 'light' }; };
  const resize = () => { const r = canvas.getBoundingClientRect(); S.dpr = Math.min(3, devicePixelRatio || 1); S.w = r.width; S.h = r.height; canvas.width = Math.round(r.width * S.dpr); canvas.height = Math.round(r.height * S.dpr); readColors(); draw(); };
  new ResizeObserver(resize).observe(canvas);
  new MutationObserver(() => { readColors(); S.lo = null; }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  canvas.addEventListener('pointermove', (e) => { const r = canvas.getBoundingClientRect(); S.hover = { x: e.clientX - r.left }; if (RM) draw(); });
  canvas.addEventListener('pointerleave', () => { S.hover = null; if (RM) draw(); });
  const liveP = () => { const L = getLive(); if (!S.tween) return L.price; const k = Math.min(1, (performance.now() - S.tween.t0) / S.tween.d); const e = 1 - Math.pow(1 - k, 3); if (k >= 1) { S.tween = null; return L.price; } return S.tween.a + (S.tween.b - S.tween.a) * e; };
  function draw() {
    const { w, h: H, dpr } = S; if (!w || !S.colors) return; const C = S.colors; const now = performance.now();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, H);
    const desk = w > 700, padR = desk ? 78 : 66, padL = desk ? 14 : 0, padT = 46, padB = 24, pw = w - padR - padL, ph = H - padT - padB;
    const L = getLive(); const target = L.ts; S.xc = S.xc ? S.xc + (target - S.xc) * (RM ? 1 : .12) : target;
    const x1 = S.xc, x0 = x1 - S.span, live = liveP();
    const pts = series().filter((p) => p[0] >= x0 && p[0] <= x1);
    let lo = live, hi = live; for (const p of pts) { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); }
    const pad = (hi - lo) * .14 || hi * .02, tlo = lo - pad, thi = hi + pad * 1.6;
    S.lo = S.lo == null || RM ? tlo : S.lo + (tlo - S.lo) * .15; S.hi = S.hi == null || RM ? thi : S.hi + (thi - S.hi) * .15;
    const X = (t) => padL + (t - x0) / S.span * pw, Y = (p) => padT + (1 - (p - S.lo) / (S.hi - S.lo)) * ph, xr = X(x1), yl = Y(live);
    ctx.font = `500 ${desk ? 11.5 : 11}px "Mona Sans"`; ctx.textBaseline = 'middle';
    for (let i = 0; i <= 4; i++) { const p = S.lo + (S.hi - S.lo) * i / 4, y = Y(p); ctx.strokeStyle = C.rule; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(padL, Math.round(y) + .5); ctx.lineTo(padL + pw, Math.round(y) + .5); ctx.stroke(); ctx.fillStyle = C.tx3; ctx.textAlign = 'left'; ctx.fillText(fmt.axis(p), padL + pw + 10, y); }
    ctx.textAlign = 'center';
    for (let i = 1; i <= 3; i++) { const t = x0 + S.span * i / 4, d = new Date(t * 1000); ctx.fillText(S.span <= 86400 ? d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }), X(t), H - 10); }
    const pool = ctx.createRadialGradient(xr, yl, 0, xr, yl, Math.max(pw, ph) * .62); pool.addColorStop(0, C.light ? 'rgba(139,102,49,.10)' : 'rgba(232,196,132,.13)'); pool.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = pool; ctx.fillRect(0, 0, w, H);
    ctx.save(); ctx.beginPath(); ctx.rect(padL, 0, pw + 1, H); ctx.clip();
    if (pts.length) {
      const P = pts.map((p) => [X(p[0]), Y(p[1])]); P.push([xr, yl]);
      const g = ctx.createLinearGradient(0, padT, 0, padT + ph); g.addColorStop(0, C.light ? 'rgba(139,102,49,.22)' : 'rgba(226,190,128,.34)'); g.addColorStop(1, 'rgba(210,173,114,0)');
      ctx.beginPath(); ctx.moveTo(P[0][0], padT + ph); P.forEach((p) => ctx.lineTo(p[0], p[1])); ctx.lineTo(xr, padT + ph); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
      ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.shadowColor = C.light ? 'rgba(0,0,0,0)' : 'rgba(232,196,132,.55)'; ctx.shadowBlur = 14; ctx.strokeStyle = C.light ? C.gold : '#E4C48C'; ctx.lineWidth = desk ? 2.2 : 2;
      ctx.beginPath(); P.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke(); ctx.shadowBlur = 0;
    }
    if (S.span <= 86400 * 1.01) for (const m of marks()) { if (m.ts < x0 || m.ts > x1) continue; const r = m.kind === 'burn' ? 1.6 : Math.min(5, 1.8 + Math.log10(1 + (m.usd || 1)) * .95); ctx.beginPath(); ctx.arc(X(m.ts), Y(m.price), r + 1.4, 0, 7); ctx.fillStyle = C.floor; ctx.fill(); ctx.beginPath(); ctx.arc(X(m.ts), Y(m.price), r, 0, 7); ctx.fillStyle = m.kind === 'burn' ? C.fire : m.kind === 'buy' ? C.buy : C.sell; ctx.fill(); }
    for (const p of pins()) { if (p.ts < x0 || p.ts > x1) continue; const x = X(p.ts), y = Y(p.price); ctx.setLineDash([2, 4]); ctx.strokeStyle = C.gold; ctx.globalAlpha = .6; ctx.beginPath(); ctx.moveTo(x, padT + 4); ctx.lineTo(x, y - 12); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.fillStyle = C.floor; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = C.gold; ctx.stroke(); ctx.fillStyle = C.goldHi; ctx.font = '800 10px "Mona Sans"'; ctx.textAlign = 'center'; ctx.fillText('C', x, y + .5); }
    ctx.restore();
    let off = 0; if (S.spring && !RM) { const st = (now - S.spring.t0) / 1000; off = S.spring.a * Math.exp(-st * 4.2) * Math.cos(st * 17); if (st > 1.6) S.spring = null; }
    const yb = yl + off, hg = ctx.createLinearGradient(0, 0, 0, yb); hg.addColorStop(0, 'rgba(0,0,0,0)'); hg.addColorStop(1, C.goldHi); ctx.strokeStyle = hg; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(xr, 0); ctx.lineTo(xr, yb - 6); ctx.stroke();
    ctx.setLineDash([3, 4]); ctx.strokeStyle = C.gold; ctx.globalAlpha = .45; ctx.beginPath(); ctx.moveTo(xr + 8, yl); ctx.lineTo(padL + pw + 4, yl); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    S.rings = S.rings.filter((r) => now - r.t0 < 750); for (const r of S.rings) { const k = (now - r.t0) / 750, e = 1 - Math.pow(1 - k, 3); ctx.globalAlpha = (1 - k) * .8; ctx.beginPath(); ctx.arc(xr, yb, 6 + e * (r.big ? 30 : 18), 0, 7); ctx.strokeStyle = r.c; ctx.lineWidth = r.big ? 2 : 1.5; ctx.stroke(); ctx.globalAlpha = 1; }
    const pulse = RM ? 0 : (Math.sin((now - S.t0) / 1000 * 3.2) + 1) / 2, glow = ctx.createRadialGradient(xr, yb, 0, xr, yb, 18 + pulse * 6); glow.addColorStop(0, C.light ? 'rgba(139,102,49,.35)' : 'rgba(246,226,184,.55)'); glow.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(xr, yb, 24, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(xr, yb, 5.2, 0, 7); ctx.fillStyle = C.light ? '#fff' : '#FFF3DA'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = C.gold; ctx.stroke();
    const label = fmt.axis(live); ctx.font = `700 ${desk ? 12 : 11.5}px "Mona Sans"`; const tw = ctx.measureText(label).width + 14, th = 22, px = padL + pw + 4, py = Math.max(th / 2 + 2, Math.min(H - padB - th / 2, yl)) - th / 2;
    const pg = ctx.createLinearGradient(0, py, 0, py + th); pg.addColorStop(0, '#F3DFB4'); pg.addColorStop(1, '#C69C5C'); ctx.fillStyle = pg; ctx.beginPath(); ctx.roundRect(px, py, Math.min(tw, w - px - 2), th, 7); ctx.fill();
    ctx.fillStyle = '#1d1406'; ctx.textAlign = 'left'; ctx.fillText(label, px + 7, py + th / 2 + .5);
    if (S.hover && pts.length) { const t = x0 + (S.hover.x - padL) / pw * S.span; let b = pts[0]; for (const p of pts) if (Math.abs(p[0] - t) < Math.abs(b[0] - t)) b = p; ctx.strokeStyle = C.tx3; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X(b[0]), padT); ctx.lineTo(X(b[0]), padT + ph); ctx.stroke(); ctx.beginPath(); ctx.arc(X(b[0]), Y(b[1]), 4, 0, 7); ctx.fillStyle = C.goldHi; ctx.fill(); }
  }
  const loop = () => { draw(); if (!RM) requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  return {
    draw, setSpan(s) { S.span = s; S.lo = null; draw(); },
    trade({ from, to, side, usd = 0 }) { S.tween = { a: from, b: to, t0: performance.now(), d: RM ? 1 : 520 }; if (!RM) { S.rings.push({ t0: performance.now(), c: side === 'burn' ? S.colors.fire : side === 'buy' ? S.colors.buy : S.colors.sell, big: usd >= 300 }); S.spring = { t0: performance.now(), a: (side === 'sell' ? 1 : -1) * Math.min(9, 3 + Math.log10(1 + usd) * 2) }; } else draw(); },
  };
}

/* ================= theme ================= */
export function setTheme(t) { document.documentElement.dataset.theme = t; try { localStorage.setItem('qa-theme', t); } catch {} dispatchEvent(new CustomEvent('qa:theme', { detail: t })); }
export function initTheme(def = 'dark') { let t = def; try { t = localStorage.getItem('qa-theme') || def; } catch {} document.documentElement.dataset.theme = t; return t; }
