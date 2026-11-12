// Portfolio, signed out: what you get, alive. Live QHooks markets with their art and prices from the terminal's trade
// feed (the same read the terminal makes), repolled every 15 s while the page is in view and nobody is signed in.
// Changed prices flash green or red. Nothing here is a sample: every number is a live market's own.
import { h, fmt, RM } from '/qx-a/components.mjs';
import { liveFeed, priceText, sameOrigin } from '/qx-portfolio.mjs';

const box = document.getElementById('mn-pf-live'), gate = document.getElementById('qp-connect');
const age = document.getElementById('mn-pf-live-age');
const CHAIN = { '4663': 'Robinhood Chain', '8453': 'Base', '1': 'Ethereum', '42161': 'Arbitrum', '56': 'BNB Chain', '143': 'Monad', '99901': 'Elysium', solana: 'Solana' };
const last = new Map();
let at = 0;

function coin(m) {
  const el = h('span', { class: 'qp-art', 'data-letter': String(m.symbol || '?').charAt(0).toUpperCase(), 'aria-hidden': 'true' });
  const a = String(m.controller || ''), x = parseInt(a.slice(2, 6), 16) || 7, hue = x % 360;
  el.style.setProperty('--a1', `hsl(${hue} 62% 58%)`); el.style.setProperty('--a2', `hsl(${(hue + 80) % 360} 52% 24%)`);
  const logo = sameOrigin(m.logo || m.profileImage || m.logoURI);
  if (logo) { const img = h('img', { src: logo, alt: '', loading: 'lazy', decoding: 'async' }); img.addEventListener('error', () => img.remove()); el.append(img); }
  return el;
}
function paint(markets) {
  const top = markets.filter((m) => m.summary && m.summary.priceUsd > 0 && (m.summary.volume24Usd || 0) >= 1)
    .sort((a, b) => (b.summary.volume24Usd || 0) - (a.summary.volume24Usd || 0)).slice(0, 5);
  if (!top.length) return;
  box.replaceChildren(...top.map((m) => {
    const s = m.summary, key = m.chainId + ':' + m.controller, prev = last.get(key), dir = prev ? Math.sign(s.priceUsd - prev) : 0;
    last.set(key, s.priceUsd);
    const chg = typeof s.change24 === 'number' ? s.change24 : null;
    const row = h('a', { class: 'qa-row mn-pf-mkt' + (dir && !RM ? (dir > 0 ? ' is-up' : ' is-down') : ''), href: '/terminal#m=' + m.chainId + ':' + m.controller },
      coin(m),
      h('span', { class: 'qa-row__main' }, h('span', { class: 'qa-row__t' }, m.symbol), h('span', { class: 'qa-row__s' }, [CHAIN[m.chainId] || m.chainId, s.mcapUsd > 0 ? 'MC ' + fmt.usd(s.mcapUsd) : null].filter(Boolean).join(' · '))),
      h('span', { class: 'qa-row__v' }, priceText(s.priceUsd), chg == null ? null : h('small', { class: chg > 0.0005 ? 'qa-up' : chg < -0.0005 ? 'qa-down' : 'qa-muted' }, fmt.pct(chg))));
    return row;
  }));
  box.setAttribute('aria-busy', 'false');
}
async function tick() {
  if (!box || gate?.hidden || document.visibilityState !== 'visible') return;
  try {
    const r = await fetch('/api/terminal/feed?chain=all', { cache: 'no-store' });
    if (!r.ok) throw Error('feed');
    const data = await r.json();
    if (Array.isArray(data.markets)) { paint(liveFeedRows(data.markets)); at = Date.now(); paintAge(); }
  } catch { if (age) age.textContent = 'Refreshing'; }
}
// keep only rows the feed would also price (liveFeed drops malformed rows)
function liveFeedRows(markets) { const ok = liveFeed(markets); return markets.filter((m) => m && ok.has(m.chainId + ':' + String(m.controller).toLowerCase())); }
function paintAge() { if (!age || !at) return; const s = Math.max(0, Math.round((Date.now() - at) / 1000)); age.textContent = 'Live · ' + (s < 60 ? s + 's' : Math.floor(s / 60) + 'm') + ' ago'; }
if (box) {
  void tick();
  setInterval(() => void tick(), 15000);
  setInterval(paintAge, 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void tick(); });
}
