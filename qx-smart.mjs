// Smart money board (2026-11-10, redesign): every chain, any token, from /api/wallets/smart (sampled pools). A dense sortable
// table on desktop and tight cards on phones; a live "Smart money buys" feed; Follow and Copy trades on every row; the wallet
// drawer's cross-chain section (PnL line, holdings, best and worst, recent trades). Read-only: nothing here moves money.
import {memberIdentity} from './qx-member-identity.mjs';
const CHAINS = [['all', 'All'], ['4663', 'Robinhood'], ['8453', 'Base'], ['56', 'BNB'], ['42161', 'Arbitrum'], ['99901', 'Elysium'], ['1', 'Ethereum'],['solana','Solana']];
const SHORT = { '4663': 'RH', '8453': 'Base', '56': 'BNB', '42161': 'Arb', '99901': 'Ely', '1': 'ETH',solana:'SOL' };
const TFS = [['6h', '6H'], ['24h', '24H'], ['7d', '7D']];
const TF_TEXT = { '6h': 'Last 6 hours', '24h': 'Last 24 hours', '7d': 'Last 7 days' };
const NAME = { '4663': 'Robinhood Chain', '8453': 'Base', '56': 'BNB Chain', '42161': 'Arbitrum', '99901': 'Elysium', '1': 'Ethereum',solana:'Solana' };
const TAGS = { smart: 'Smart money', sniper: 'Sniper', whale: 'Whale', fresh: 'Fresh wallet', verified: 'Verified' };
const EXPLORER = { '4663': 'https://robinhoodchain.blockscout.com', '8453': 'https://basescan.org', '56': 'https://bscscan.com', '42161': 'https://arbiscan.io', '99901': 'https://elysium.kinetiq.xyz', '1': 'https://etherscan.io',solana:'https://solscan.io' };
const NS = 'http://www.w3.org/2000/svg';
export const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (v == null || v === false) continue; if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v); }
  for (const k of kids.flat()) if (k != null && k !== false) n.append(k.nodeType ? k : String(k));
  return n;
};
const svg = (tag, attrs = {}, ...kids) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); n.append(...kids); return n; };
export const short = a => a.slice(0, 6) + '…' + a.slice(-4);
const money = v => v == null || !Number.isFinite(v) ? '—' : (v < 0 ? '−$' : '$') + compactNum(Math.abs(v));
const pnlText = r => r.closed === 0 && !r.pnlUsd ? 'Open' : signed(r.pnlUsd); // bought, not sold yet in this period
const signed = v => v == null || !Number.isFinite(v) ? '—' : (v > 0 ? '+' : '') + money(v);
const compactNum = v => v >= 1e6 ? (v / 1e6).toFixed(v >= 1e7 ? 1 : 2) + 'M' : v >= 1e4 ? (v / 1e3).toFixed(v >= 1e5 ? 0 : 1) + 'K' : v.toLocaleString('en-US', { maximumFractionDigits: v >= 100 ? 0 : 2 });
const pct = v => v == null ? '—' : Math.round(v * 100) + '%';
const pctSigned = v => v == null || !Number.isFinite(v) ? '—' : (v > 0 ? '+' : '') + (Math.abs(v) >= 100 ? Math.round(v) : v.toFixed(1)) + '%';
export const ago = ts => { if (!ts) return '—'; const s = Math.max(0, Math.floor(Date.now() / 1000 - ts)); return s < 60 ? s + 's' : s < 3600 ? Math.floor(s / 60) + 'm' : s < 86400 ? Math.floor(s / 3600) + 'h' : Math.floor(s / 86400) + 'd'; };
const holdText = s => s == null ? '—' : s < 3600 ? Math.max(1, Math.round(s / 60)) + 'm' : s < 86400 ? (s / 3600).toFixed(s < 36000 ? 1 : 0) + 'h' : (s / 86400).toFixed(1) + 'd';
const tone = v => v > 0 ? 'up' : v < 0 ? 'down' : '';
export const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
const hash = s => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
export const terminalHref = (chainId, token) => '/terminal.html#t=' + chainId + ':' + token;

/// A 5×5 mirrored identicon from the address (no network): the same wallet always looks the same.
export function identicon(addr, size = 32) {
  const h = hash(addr), hue = h % 360, fg = `hsl(${hue} 46% 46%)`, bg = `hsl(${(hue + 40) % 360} 30% 88%)`;
  const s = svg('svg', { viewBox: '0 0 5 5', width: size, height: size, class: 'qsm-ident', 'aria-hidden': 'true' }, svg('rect', { width: 5, height: 5, fill: bg }));
  let bits = hash(addr + 'x');
  for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) { if (bits & 1) { s.append(svg('rect', { x, y, width: 1, height: 1, fill: fg })); if (x < 2) s.append(svg('rect', { x: 4 - x, y, width: 1, height: 1, fill: fg })); } bits >>>= 1; if (!bits) bits = hash(addr + y + x); }
  return s;
}
/// A token's icon: its logo when GeckoTerminal has one, else its first letter on a colour from its address.
export function tokenIcon(t, size = 20) {
  const letter = el('span', { class: 'qsm-tok', style: `--h:${hash(t.token || '') % 360};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.5)}px`, title: (t.symbol || 'token') + (t.chainId ? ' · ' + (SHORT[t.chainId] || '') : '') }, String(t.symbol || '?').slice(0, 1).toUpperCase());
  if (!t.logo) return letter;
  const img = el('img', { class: 'qsm-tok', src: t.logo, alt: '', width: size, height: size, loading: 'lazy', title: letter.title });
  img.addEventListener('error', () => img.replaceWith(letter), { once: true });
  return img;
}
/// A small PnL line: cumulative realised PnL across the period.
export function spark(points, w = 84, h = 26) {
  const p = (points || []).length ? [0, ...points] : [0, 0], lo = Math.min(...p, 0), hi = Math.max(...p, 0), span = hi - lo || 1;
  const xy = p.map((v, i) => `${(i / (p.length - 1) * w).toFixed(1)},${(h - 2 - (v - lo) / span * (h - 4)).toFixed(1)}`).join(' ');
  const zero = (h - 2 - (0 - lo) / span * (h - 4)).toFixed(1), end = p.at(-1);
  return svg('svg', { viewBox: `0 0 ${w} ${h}`, width: w, height: h, class: 'qsm-spark ' + (end > 0 ? 'is-up' : end < 0 ? 'is-down' : ''), 'aria-hidden': 'true' },
    svg('line', { x1: 0, x2: w, y1: zero, y2: zero, class: 'qsm-zero' }), svg('polyline', { points: xy, fill: 'none' }));
}
function copyBtn(addr) {
  const b = el('button', { type: 'button', class: 'qsm-copy', 'aria-label': 'Copy address ' + addr, title: 'Copy address' }, '⧉');
  b.addEventListener('click', async e => { e.stopPropagation(); try { await navigator.clipboard.writeText(addr); b.textContent = '✓'; setTimeout(() => { b.textContent = '⧉'; }, 1200); } catch {} });
  return b;
}
const tagChips = (r, max = 4) => (r.tags || []).slice(0, max).map(t => el('span', { class: 'qsm-tag qsm-tag-' + t }, t === 'verified' && r.handle ? '@' + r.handle : TAGS[t] || t));
const chainChips = ids => (ids || []).map(id => el('span', { class: 'qsm-chain', 'data-chain': id }, SHORT[id] || id));

// ---------------------------------------------------------------- the board
const COLS = [
  ['rank', '#', null], ['wallet', 'Wallet', null], ['chains', 'Chains', null], ['pnlUsd', 'PnL', r => r.pnlUsd], ['pnlPct', 'PnL %', r => r.pnlPct ?? -Infinity], ['spark', 'PnL line', null],
  ['winRate', 'Win', r => r.winRate ?? -1], ['trades', 'Trades', r => r.trades], ['volumeUsd', 'Volume', r => r.volumeUsd], ['avgHoldSec', 'Avg hold', r => r.avgHoldSec ?? Infinity], ['lastTs', 'Last active', r => r.lastTs],
  ['top', 'Top tokens', null], ['act', '', null]];
export function createSmartBoard({ nameOf = short, isFollowing = () => false, toggleFollow, openWallet, say = () => {} } = {}) {
  const S = { fallback: false, more: 0, chain: 'all', tf: '6h', coverage: [], minTrades: 5, minPnl: -Infinity, sort: 'pnlUsd', dir: -1, rows: null, key: '', feed: null, feedTimer: null, err: false };
  const box = el('section', { class: 'qsm', 'aria-label': 'Smart money' });
  const controls = el('div', { class: 'qsm-controls' }), main = el('div', { class: 'qsm-main' }), tableBox = el('div', { class: 'qsm-table' }), feedBox = el('aside', { class: 'qsm-feed', 'aria-label': 'Smart money buys' });
  main.append(feedBox, tableBox); box.append(controls, main);
  const seg = (label, items, cur, set, cls = '') => el('div', { class: 'qsm-seg ' + cls, role: 'group', 'aria-label': label }, ...items.map(([v, l]) => el('button', { type: 'button', 'aria-pressed': String(cur === v), onclick: () => set(v) }, l)));
  const pick = (label, items, cur, set) => el('label', { class: 'qsm-pick' }, el('span', {}, label), (() => { const s = el('select', { 'aria-label': label }, ...items.map(([v, l]) => el('option', { value: v, selected: v === cur }, l))); s.addEventListener('change', () => set(s.value)); return s; })());
  function drawControls() {
    controls.replaceChildren(
      seg('Chain', CHAINS, S.chain, v => { S.chain = v; load(); loadFeed(); }, 'qsm-chains'),
      el('div', { class: 'qsm-row2' },
        seg('Period', TFS, S.tf, v => { S.tf = v; load(); }),
        pick('Min trades', [[5, '5+'], [10, '10+'], [25, '25+'], [50, '50+']].map(([v, l]) => [String(v), l]), String(S.minTrades), v => { S.minTrades = Number(v); draw(); }),
        pick('Min PnL', [['any', 'Any'], ['0', 'In profit'], ['1000', '$1K+'], ['10000', '$10K+'], ['50000', '$50K+']], S.minPnl === -Infinity ? 'any' : String(S.minPnl), v => { S.minPnl = v === 'any' ? -Infinity : Number(v); draw(); }),
        pick('Sort', COLS.filter(c => c[2]).map(c => [c[0], c[1]]), S.sort, v => { S.sort = v; S.dir = v === 'avgHoldSec' ? 1 : -1; draw(); })));
  }
  const shown = () => (S.rows || []).filter(r => r.trades >= S.minTrades && r.pnlUsd >= S.minPnl).sort((a, b) => { const f = COLS.find(c => c[0] === S.sort)?.[2] || (r => r.pnlUsd); return (f(a) - f(b)) * S.dir; });
  function actions(r) {
    const fol = isFollowing(r.wallet);
    const f = el('button', { type: 'button', class: 'qsm-btn ' + (fol ? 'is-on' : 'qsm-primary') }, fol ? 'Following' : 'Follow');
    f.addEventListener('click', async e => { e.stopPropagation(); f.disabled = true; try { await toggleFollow?.(r.wallet); } catch (err) { say(err?.message || 'Sign-in cancelled.'); } f.disabled = false; draw(); });
    const c = el('a', { class: 'qsm-btn', href: '/copy?w=' + r.wallet + (r.chains?.[0] && r.chains.length === 1 ? '&chain=' + r.chains[0] : ''), onclick: e => e.stopPropagation() }, 'Copy trades');
    return [f, c];
  }
  function who(r) {
    return el('div', { class: 'qsm-who' }, identicon(r.wallet, 32),
      el('div', { class: 'qsm-who-t' }, el('div', { class: 'qsm-name' }, el('b', {}, nameOf(r.wallet)), copyBtn(r.wallet)),memberIdentity(r.wallet,{supplement:true,linked:false,className:'qmi-inline'}), el('div', { class: 'qsm-tags' }, tagChips(r))));
  }
  function tableView(list) {
    const head = el('tr', {}, ...COLS.map(([k, label, f]) => {
      if (!f) return el('th', { scope: 'col', class: 'qsm-c-' + k }, label);
      const on = S.sort === k, b = el('button', { type: 'button', class: 'qsm-sort', onclick: () => { if (S.sort === k) S.dir *= -1; else { S.sort = k; S.dir = k === 'avgHoldSec' ? 1 : -1; } draw(); } }, label, el('span', { 'aria-hidden': 'true' }, on ? (S.dir < 0 ? ' ↓' : ' ↑') : ''));
      return el('th', { scope: 'col', class: 'qsm-c-' + k, 'aria-sort': on ? (S.dir < 0 ? 'descending' : 'ascending') : 'none' }, b);
    }));
    const body = el('tbody', {}, ...list.map((r, i) => {
      const tr = el('tr', { tabindex: '0', onclick: () => openWallet?.(r), onkeydown: e => { if (e.key === 'Enter') openWallet?.(r); } },
        el('td', { class: 'qsm-c-rank' }, String(i + 1)), el('td', { class: 'qsm-c-wallet' }, who(r)), el('td', { class: 'qsm-c-chains' }, el('div', { class: 'qsm-chips' }, chainChips(r.chains))),
        el('td', { class: 'qsm-c-pnlUsd num ' + tone(r.pnlUsd), title: r.closed === 0 ? 'Bought in this period, nothing sold yet' : null }, pnlText(r)), el('td', { class: 'qsm-c-pnlPct num ' + tone(r.pnlPct) }, pctSigned(r.pnlPct)), el('td', { class: 'qsm-c-spark' }, spark(r.spark)),
        el('td', { class: 'num' }, pct(r.winRate)), el('td', { class: 'num' }, String(r.trades)), el('td', { class: 'num' }, money(r.volumeUsd)), el('td', { class: 'num' }, holdText(r.avgHoldSec)), el('td', { class: 'num qsm-muted' }, ago(r.lastTs)),
        el('td', { class: 'qsm-c-top' }, el('div', { class: 'qsm-toks' }, (r.topTokens || []).map(t => tokenIcon(t, 22)))), el('td', { class: 'qsm-c-act' }, el('div', { class: 'qsm-acts' }, actions(r))));
      return tr;
    }));
    return el('table', { class: 'qsm-tbl' }, el('thead', {}, head), body);
  }
  function cardsView(list) {
    return el('ol', { class: 'qsm-cards' }, ...list.map((r, i) => el('li', {}, el('article', { class: 'qsm-card', tabindex: '0', onclick: () => openWallet?.(r), onkeydown: e => { if (e.key === 'Enter') openWallet?.(r); } },
      el('div', { class: 'qsm-card-top' }, el('span', { class: 'qsm-rank' }, String(i + 1)), who(r),
        el('div', { class: 'qsm-pnl' }, el('b', { class: tone(r.pnlUsd) }, pnlText(r)), el('span', { class: 'qsm-pnl-sub' }, spark(r.spark, 56, 18), el('small', { class: tone(r.pnlPct) }, pctSigned(r.pnlPct))))),
      el('div', { class: 'qsm-card-mid' }, el('dl', { class: 'qsm-stats' },
        el('div', {}, el('dt', {}, 'Win'), el('dd', {}, pct(r.winRate))), el('div', {}, el('dt', {}, 'Trades'), el('dd', {}, String(r.trades))), el('div', {}, el('dt', {}, 'Vol'), el('dd', {}, money(r.volumeUsd))),
        el('div', {}, el('dt', {}, 'Hold'), el('dd', {}, holdText(r.avgHoldSec))), el('div', {}, el('dt', {}, 'Last'), el('dd', {}, ago(r.lastTs))))),
      el('div', { class: 'qsm-card-bot' }, el('div', { class: 'qsm-chips' }, chainChips(r.chains)), el('div', { class: 'qsm-toks' }, (r.topTokens || []).map(t => tokenIcon(t, 22))), el('div', { class: 'qsm-acts' }, actions(r)))))));
  }
  function draw() {
    drawControls();
    if (!S.rows) { tableBox.replaceChildren(el('p', { class: 'qsm-empty' }, S.err ? 'The board is refreshing. Try again in a moment.' : 'Refreshing…')); return; }
    // One plain line on what the period covers, and which chains have few sampled trades in it.
    const want = S.chain === 'all' ? Object.keys(NAME) : [S.chain], thin = want.filter(id => (S.coverage.find(c => c.chainId === id)?.trades || 0) < 30).map(id => NAME[id]);
    const head = S.fallback ? el('p', { class: 'qsm-period' }, el('b', {}, 'QHooks launches, 7 days'), ' · All-token smart money is filling in from each chain. Meanwhile, these are the top wallets on QHooks launches.') : el('p', { class: 'qsm-period' }, el('b', {}, TF_TEXT[S.tf]), ' · ' + plural(shown().length, 'wallet') + ' ranked · updates every 15 minutes' + (thin.length ? '. Few sampled trades on ' + thin.join(', ') + ' in this period, so ' + (thin.length === want.length ? 'this list is short' : 'they show less here') + '.' : '.'));
    const list = shown(), wideN = 50 + S.more * 50, narrowN = 20 + S.more * 20;
    const more = n => list.length > n ? el('button', { type: 'button', class: 'qsm-btn qsm-more', onclick: () => { S.more++; draw(); } }, 'Show more (' + (list.length - n) + ')') : null;
    tableBox.replaceChildren(...[head,
      list.length ? el('div', { class: 'qsm-wide' }, tableView(list.slice(0, wideN)), more(wideN)) : el('p', { class: 'qsm-empty' }, S.rows.length ? 'No wallets match these filters.' : 'Smart money fills in as trades are sampled from each chain. Wallets need 5 or more trades in the period to appear.'),
      list.length ? el('div', { class: 'qsm-narrow' }, cardsView(list.slice(0, narrowN)), more(narrowN)) : null,
      el('p', { class: 'qsm-foot' }, 'Ranked by realised PnL on each chain’s busiest and trending pools, any token, any DEX: trades of $50 or more, sampled every few minutes. Bots, contracts and QHooks system wallets are left out.')].filter(Boolean));
  }
  async function load() {
    const key = S.chain + ':' + S.tf; S.rows = null; S.err = false; S.key = key; S.more = 0; draw();
    try { const r = await fetch('/api/wallets/smart?chain=' + S.chain + '&tf=' + S.tf, { cache: 'no-store' }); if (!r.ok) throw 0; const j = await r.json(); if (S.key !== key) return;
      S.rows = j.rows || []; S.coverage = j.coverage || []; S.fallback = false;
      // Never an empty board: while all-token data fills in, show the top wallets on QHooks launches (our own index).
      if (!S.rows.length) {
        const q = await fetch('/api/wallets/leaderboard?window=7d', { cache: 'no-store' }).then(x => x.ok ? x.json() : null).catch(() => null);
        if (S.key === key && q?.rows?.length) { S.rows = q.rows.map(x => ({ ...x, lastTs: x.lastAt ?? x.lastTs, chains: x.chains || [], topTokens: x.topTokens || [], tags: [], spark: [] })); S.fallback = true; }
      }
      draw(); }
    catch { if (S.key === key) { S.err = true; draw(); } }
  }
  // ---- the live feed of buys by top-ranked wallets
  function drawFeed() {
    const items = (S.feed || []).slice(0, 14);
    feedBox.replaceChildren(el('div', { class: 'qsm-feed-h' }, el('span', { class: 'qsm-live', 'aria-hidden': 'true' }), el('h2', {}, 'Smart money buys'), el('small', { class: 'qsm-feed-note' }, 'updates every 15 minutes')),
      S.feed == null ? el('p', { class: 'qsm-empty' }, 'Refreshing…') : !items.length ? el('p', { class: 'qsm-empty' }, 'No buys by ranked wallets in the last day yet.')
        : el('ul', {}, ...items.map(b => el('li', {}, el('a', { href: terminalHref(b.chainId, b.token), class: 'qsm-buy' },
          tokenIcon(b, 26), el('span', { class: 'qsm-buy-t' }, el('b', {}, b.symbol || short(b.token)), el('small', {}, '#' + b.rank + ' ' + nameOf(b.wallet) + ' · ' + (SHORT[b.chainId] || '')),memberIdentity(b.wallet,{supplement:true,linked:false,className:'qmi-inline'})),
          el('span', { class: 'qsm-buy-v' }, el('b', {}, money(b.usd)), el('small', {}, ago(b.ts))))))));
  }
  async function loadFeed() {
    clearTimeout(S.feedTimer);
    if (!box.isConnected && S.feed) return; // stopped when the board is off screen
    if (!document.hidden) { try { const r = await fetch('/api/wallets/smart/buys?chain=' + S.chain, { cache: 'no-store' }); if (r.ok) { S.feed = (await r.json()).buys || []; drawFeed(); } } catch {} }
    S.feedTimer = setTimeout(loadFeed, 60000); // the data refreshes every 15 minutes; a minute is plenty
  }
  drawFeed(); load(); loadFeed();
  return { node: box, refresh: draw, chain: () => S.chain, tf: () => S.tf };
}

// ---------------------------------------------------------------- the wallet drawer's cross-chain section
function pnlChart(series, w = 640, h = 140) {
  if (!series || series.length < 2) return null;
  const xs = series.map(p => p[0]), ys = series.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), lo = Math.min(0, ...ys), hi = Math.max(0, ...ys), sx = x1 - x0 || 1, sy = hi - lo || 1;
  const X = x => ((x - x0) / sx * (w - 8) + 4).toFixed(1), Y = y => (h - 6 - (y - lo) / sy * (h - 12)).toFixed(1);
  let d = ''; series.forEach(([x, y], i) => { d += (i ? ' H' + X(x) + ' V' + Y(y) : 'M' + X(x) + ' ' + Y(y)); }); // a step line: PnL changes at each sell
  const end = ys.at(-1);
  return svg('svg', { viewBox: `0 0 ${w} ${h}`, class: 'qsm-chart ' + (end > 0 ? 'is-up' : end < 0 ? 'is-down' : ''), preserveAspectRatio: 'none', role: 'img', 'aria-label': 'Realised PnL over the period, ending at ' + signed(end) },
    svg('line', { x1: 0, x2: w, y1: Y(0), y2: Y(0), class: 'qsm-zero' }), svg('path', { d: d + ` V${Y(0)} H${X(x0)} Z`, class: 'qsm-area' }), svg('path', { d, fill: 'none', class: 'qsm-line' }));
}
/// The drawer's live strip: this wallet's trades on every chain in the last hour, read when the drawer opens (cached 60 s).
export function liveSection(l) {
  const sec = el('section', { class: 'qsm-live-sec', 'aria-label': 'Live' });
  const stamp = l?.at ? 'Live · ' + ago(Math.floor(l.at / 1000)) + ' ago' : 'Live';
  sec.append(el('div', { class: 'qsm-feed-h' }, el('span', { class: 'qsm-live', 'aria-hidden': 'true' }), el('h3', {}, stamp), el('small', { class: 'qsm-feed-note' }, 'last hour, every chain')));
  if (!l?.trades?.length) { sec.append(el('p', { class: 'qsm-empty' }, l?.at ? 'No trades in the last hour.' : 'Refreshing…')); return sec; }
  sec.append(el('ul', { class: 'qsm-list' }, l.trades.slice(0, 8).map(x => el('li', {}, el('a', { href: EXPLORER[x.chainId] + '/tx/' + x.tx, target: '_blank', rel: 'noopener', class: 'qsm-line-row' },
    el('span', { class: 'qsm-side ' + (x.side === 'buy' ? 'up' : 'down') }, x.side === 'buy' ? 'Buy' : 'Sell'), tokenIcon(x, 20), el('b', {}, x.symbol || short(x.token)), el('span', { class: 'qsm-chain', 'data-chain': x.chainId }, SHORT[x.chainId]),
    el('span', { class: 'num' }, x.usd == null ? '—' : money(x.usd)), el('span', { class: 'num qsm-muted' }, ago(x.ts)))))));
  return sec;
}

export function walletSection(a) {
  const sec = el('section', { class: 'qsm-wallet', 'aria-label': 'Across chains' });
  if (!a?.total) { sec.append(el('h3', {}, 'Across chains'), el('p', { class: 'qsm-empty' }, 'No trades sampled for this wallet in this period.')); return sec; }
  const t = a.total;
  sec.append(el('div', { class: 'qsm-tags' }, tagChips(a, 5)),
    el('div', { class: 'qsm-hero' }, el('div', {}, el('small', {}, 'Realised PnL'), el('b', { class: tone(t.pnlUsd) }, signed(t.pnlUsd)), el('span', { class: tone(t.pnlPct) }, pctSigned(t.pnlPct))),
      el('dl', { class: 'qsm-stats' }, el('div', {}, el('dt', {}, 'Win'), el('dd', {}, pct(t.winRate))), el('div', {}, el('dt', {}, 'Trades'), el('dd', {}, String(t.trades))), el('div', {}, el('dt', {}, 'Volume'), el('dd', {}, money(t.volumeUsd))),
        el('div', {}, el('dt', {}, 'Avg hold'), el('dd', {}, holdText(t.avgHoldSec))), el('div', {}, el('dt', {}, 'Chains'), el('dd', {}, String(a.chains.length))))),
    pnlChart(a.series));
  const tok = (x, extra) => el('li', {}, el('a', { href: terminalHref(x.chainId, x.token), class: 'qsm-line-row' }, tokenIcon(x, 22), el('b', {}, x.symbol || short(x.token)), el('span', { class: 'qsm-chain', 'data-chain': x.chainId }, SHORT[x.chainId]), ...extra));
  const cols = el('div', { class: 'qsm-two' },
    el('div', {}, el('h3', {}, 'Holdings'), a.holdings.length ? el('ul', { class: 'qsm-list' }, a.holdings.slice(0, 8).map(x => tok(x, [el('span', { class: 'num' }, money(x.valueUsd)), el('span', { class: 'num ' + tone(x.valueUsd - x.costUsd) }, pctSigned(x.costUsd > 0 ? (x.valueUsd / x.costUsd - 1) * 100 : null))]))) : el('p', { class: 'qsm-empty' }, 'Nothing bought in this period is still held.')),
    el('div', {}, el('h3', {}, 'Best and worst'), (a.best.length || a.worst.length) ? el('ul', { class: 'qsm-list' }, [...a.best, ...a.worst].map(x => tok(x, [el('span', { class: 'num ' + tone(x.pnlUsd) }, signed(x.pnlUsd)), el('span', { class: 'num ' + tone(x.pnlPct) }, pctSigned(x.pnlPct))]))) : el('p', { class: 'qsm-empty' }, 'No closed trades in this period.')));
  const per = el('ul', { class: 'qsm-list' }, a.chains.map(c => el('li', {}, el('span', { class: 'qsm-line-row' }, el('span', { class: 'qsm-chain', 'data-chain': c.chainId }, SHORT[c.chainId]), el('b', {}, plural(c.trades, 'trade')), el('span', { class: 'num' }, money(c.volumeUsd)), el('span', { class: 'num ' + (c.winRate == null ? '' : tone(c.pnlUsd)) }, c.winRate == null ? 'Open' : signed(c.pnlUsd))))));
  const recent = el('ul', { class: 'qsm-list' }, a.recent.slice(0, 12).map(x => el('li', {}, el('a', { href: EXPLORER[x.chainId] + '/tx/' + x.tx, target: '_blank', rel: 'noopener', class: 'qsm-line-row' },
    el('span', { class: 'qsm-side ' + (x.side === 'buy' ? 'up' : 'down') }, x.side === 'buy' ? 'Buy' : 'Sell'), tokenIcon(x, 20), el('b', {}, x.symbol || short(x.token)), el('span', { class: 'qsm-chain', 'data-chain': x.chainId }, SHORT[x.chainId]), el('span', { class: 'num' }, money(x.usd)), el('span', { class: 'num qsm-muted' }, ago(x.ts))))));
  sec.append(cols, el('h3', {}, 'By chain'), per, el('h3', {}, 'Recent trades, any token'), recent, el('p', { class: 'qsm-foot' }, 'Sampled trades of $50 or more on each chain’s busiest and trending pools. PnL counts trades inside the period.'));
  return sec;
}
