// Markets lane: live QHooks launch data for lists (markets, orders). One public read, /api/terminal/feed?chain=all, the
// same feed the terminal and home use; USD price, market cap, 24h change and the last trade come from its summaries.
// Prices tick (flash up or down) only when the feed reports a new price.
import { fmt, RM } from '/qx-a/components.mjs';
import {createMarketQuoteLookup, marketQuoteState} from '/qx-market-quote-state.mjs';
import {priceState} from '/qx-price-state.mjs';

const ADDR = /^0x[0-9a-f]{40}$/;
const num = (v) => typeof v === 'number' && Number.isFinite(v) ? v : null;
/// A token image the page may show: same-origin token-profile paths, https URLs, or small inline images.
export function artURL(v) {
  if (typeof v !== 'string' || !v) return null;
  if (v.startsWith('/api/token-profiles/') && !/[\s"'\\]/.test(v)) return v;
  if (/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v) && v.length <= 200000) return v;
  try { const u = new URL(v); if (u.protocol !== 'https:' || u.username || u.password) return null; return u.hostname === 'qhooks.com' || u.host === location.host ? u.pathname + u.search : u.href; } catch { return null; }
}
export async function launchFeed({ fetcher = fetch } = {}) {
  const r = await fetcher('/api/terminal/feed?chain=all', { signal: AbortSignal.timeout(8000), cache: 'no-store', headers: { accept: 'application/json' } });
  if (!r.ok) throw Error('feed ' + r.status);
  const j = await r.json();
  if (!Array.isArray(j?.markets)) throw Error('feed shape');
  const lookup = createMarketQuoteLookup({fetcher}); lookup.seed(j.markets);
  const missing = j.markets.filter(m => !marketQuoteState(m)?.usable).slice(0,24);
  const filled = missing.length ? await lookup.read(missing) : {rows: []};
  const quotes = new Map(filled.rows.map(r => [String(r.chainId) + ':' + String(r.controller).toLowerCase(), r]));
  return j.markets.filter((m) => /^\d+$/.test(String(m?.chainId)) && ADDR.test(String(m?.controller).toLowerCase())).map((m) => {
    const s = m.summary || {}, cached = quotes.get(String(m.chainId) + ':' + String(m.controller).toLowerCase()), quote=marketQuoteState(cached || m);
    return { ...quote, key: m.chainId + ':' + String(m.controller).toLowerCase(), chainId: String(m.chainId), controller: String(m.controller).toLowerCase(), token: m.token, live: !!m.live,
      symbol: String(m.symbol || m.name || 'Token').slice(0, 24), name: String(m.name || '').slice(0, 48), logo: artURL(m.logo || m.profileImage), banner: artURL(m.profileBanner),
      priceUsd: quote?.priceUsd??null, mcapUsd: quote?.marketCapUsd??null, volUsd: quote?.volume24Usd??null, change: quote?.change24??null, trades24: priceState(quote?.observedAt).usable?num(s.trades24):null, holders: num(s.holders), lastTradeAt: num(s.lastTradeAt) };
  });
}
/// A coin: the token's own image, or its first letter on gold.
export function coinEl(row, cls = 'mk-coin') {
  const el = document.createElement('span'); el.className = cls; el.setAttribute('aria-hidden', 'true');
  const letter = (row.symbol || '?').replace(/^\$/, '').slice(0, 1).toUpperCase();
  if (row.logo) { const img = document.createElement('img'); img.src = row.logo; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; img.addEventListener('error', () => { img.remove(); el.textContent = letter; }, { once: true }); el.append(img); }
  else el.textContent = letter;
  return el;
}
export const priceText = (v, unit = 'USD') => v == null ? '—' : unit === 'USD' ? fmt.price(v) : new Intl.NumberFormat('en-US', {maximumSignificantDigits: 5}).format(v) + ' ' + unit;
export const capText = (v) => v == null ? '—' : fmt.usd(v);
export const changeText = (v) => v == null ? '—' : fmt.pct(v);
export const ageText = (ts) => ts ? fmt.age(Date.now() / 1000 - ts) : '—';
/// Set text; flash up or down when a number moved.
export function tick(node, text, value, prev) {
  if (!node || node.textContent === text) return;
  node.textContent = text;
  if (RM || prev == null || value == null || value === prev) return;
  node.classList.add('mk-tick'); node.classList.remove('is-up', 'is-down'); void node.offsetWidth;
  node.classList.add(value > prev ? 'is-up' : 'is-down');
  requestAnimationFrame(() => requestAnimationFrame(() => node.classList.remove('is-up', 'is-down')));
}
/// Ages count up every second on [data-ts] nodes under root.
export function ageClock(root,{beforePaint}={}) {
  const paint = () => { if(document.hidden)return;beforePaint?.();root.querySelectorAll('[data-ts]').forEach((n) => { n.textContent = ageText(Number(n.dataset.ts)); }); };
  paint(); return setInterval(paint, 1000);
}
