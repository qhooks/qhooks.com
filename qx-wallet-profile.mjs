// Wallet profile page (prototype that renders the engine's JSON). Production reads /api/wallets/profile/<chain>/<addr>.
const $root = document.getElementById('qwp-root');
let tabNow = new URLSearchParams(location.search).get('tab') || 'Holdings', periodNow = new URLSearchParams(location.search).get('p') || '30d';
const qs = new URLSearchParams(location.search);
const route = /^\/wallet\/(\d+)\/(0x[0-9a-fA-F]{40})\/?$/.exec(location.pathname);
const CHAIN = route ? route[1] : (qs.get('chain') || '4663');
const ADDRESS = (route ? route[2] : qs.get('w') || '').toLowerCase();
const src = qs.get('f') || ('/api/wallets/profile/' + CHAIN + '/' + ADDRESS);
const EXPLORERS = { '4663': 'https://robinhoodchain.blockscout.com', '8453': 'https://basescan.org', '1': 'https://etherscan.io', '42161': 'https://arbiscan.io', '56': 'https://bscscan.com', '143': 'https://monadvision.com', '99901': 'https://elysium.kinetiq.xyz' };
const EXPLORER = EXPLORERS[CHAIN] || EXPLORERS['4663'];

const h = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) { if (v == null || v === false) continue; if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v); }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(String(c)));
  return n;
};
const short = a => a ? a.slice(0, 6) + '…' + a.slice(-4) : '—';
const UNK = () => h('span', { class: 'unk', title: 'Unknown: we could not read this from the chain' }, '—');
function usd(v, { sign = false } = {}) {
  if (v == null || !isFinite(v)) return null;
  const a = Math.abs(v), s = sign ? (v > 0 ? '+' : v < 0 ? '−' : '') : (v < 0 ? '−' : '');
  const t = a >= 1e9 ? (a / 1e9).toFixed(2) + 'B' : a >= 1e6 ? (a / 1e6).toFixed(2) + 'M' : a >= 1e4 ? (a / 1e3).toFixed(1) + 'K' : a >= 100 ? a.toFixed(0) : a >= 1 ? a.toFixed(2) : a >= 0.01 ? a.toFixed(3) : a > 0 ? a.toPrecision(2) : '0';
  return s + '$' + t;
}
const price = v => v == null ? null : v >= 1 ? '$' + v.toFixed(v >= 1000 ? 0 : 3) : '$' + v.toPrecision(3);
const qty = v => v == null ? null : v >= 1e9 ? (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(1) + 'K' : v >= 1 ? v.toFixed(2) : v.toPrecision(3);
const tone = v => v > 0 ? 'up' : v < 0 ? 'down' : '';
const pct = v => v == null ? null : (v * 100).toFixed(v >= 0.995 || v < 0.1 ? 0 : 1) + '%';
const dur = s => s == null ? null : s < 60 ? Math.round(s) + 's' : s < 3600 ? Math.round(s / 60) + 'm' : s < 86400 ? (s / 3600).toFixed(1) + 'h' : (s / 86400).toFixed(1) + 'd';
const ago = ts => { if (!ts) return null; const s = Date.now() / 1000 - ts; return s < 60 ? Math.round(s) + 's' : s < 3600 ? Math.round(s / 60) + 'm' : s < 86400 ? Math.round(s / 3600) + 'h' : Math.round(s / 86400) + 'd'; };
const date = ts => ts ? new Date(ts * 1000).toISOString().slice(0, 16).replace('T', ' ') : null;
const cell = (v, cls = '') => h('td', { class: cls }, v == null ? UNK() : v);
const txLink = (tx, text) => h('a', { href: EXPLORER + '/tx/' + tx, target: '_blank', rel: 'noopener' }, text);
const addrLink = a => h('a', { href: '/wallet/' + CHAIN + '/' + a, title: a }, short(a));

function stat(label, value, sub, cls = '') {
  return h('div', { class: 'qwp-stat' }, h('small', {}, label), h('b', { class: cls }, value == null ? UNK() : value), sub ? h('i', {}, sub) : null);
}

function render(p) {
  const s = p.summary;
  // Total adds only the parts we could read; any unknown part is said in the line under it.
  const total = s.realizedUsd == null && s.unrealizedUsd == null ? null : (s.realizedUsd ?? 0) + (s.unrealizedUsd ?? 0); // unknown is never $0
  const partial = s.realizedPartial || s.unrealizedPartial;
  const labels = h('div', { class: 'qwp-labels' }, ...p.labels.map(l => h('span', { class: 'qwp-tag', 'data-k': l.id, title: (l.evidence || []).filter(Boolean).join('\n') || l.text }, l.text)));
  const f = p.funder;
  const funded = f?.known ? h('span', {}, 'First funded ', f.via === 'bridge_deposit' ? h('b', {}, 'by bridge deposit') : h('span', {}, 'by ', addrLink(f.funder)), ' · ', h('b', {}, (f.amountEth ?? 0).toPrecision(3) + ' ETH'), ' · ', txLink(f.tx, ago(f.ts) + ' ago'))
    : h('span', {}, 'First funder ', h('span', { class: 'unk', title: f?.note || f?.reason || '' }, f?.reason === 'internal_transfer' ? 'via a contract call (block ' + f.block + ')' : 'unknown'));
  const kind = { eoa: 'Wallet', eoa_7702: 'Wallet · 7702', contract: 'Contract' }[p.kind] || 'Address';
  const head = h('header', { class: 'qwp-head' },
    h('div', { class: 'qwp-id' },
      h('h1', {}, short(p.wallet), h('small', {}, kind + ' · Robinhood Chain'), h('button', { type: 'button', class: 'qwp-copy', onclick: () => navigator.clipboard?.writeText(p.wallet) }, 'Copy')),
      h('div', { class: 'qwp-meta' }, funded, h('span', {}, h('b', {}, String(p.coverage.txs)), ' transactions'), s.closedPositions ? h('span', {}, h('b', {}, String(s.tokensTraded)), ' tokens traded') : null, h('span', { class: 'dim' }, 'Read ' + ago(Date.parse(p.builtAt) / 1000) + ' ago · block ' + p.head))),
    h('div', { class: 'qwp-acts' }, h('a', { class: 'qwp-btn qwp-btn--pri', href: '/mirror?w=' + p.wallet + '&chain=' + CHAIN }, 'Copy trades'), h('button', { type: 'button', class: 'qwp-btn', onclick: () => window.dispatchEvent(new CustomEvent('qhooks:wallet-open', { detail: { wallet: p.wallet, chainId: CHAIN } })) }, 'Follow'), h('a', { class: 'qwp-btn', href: EXPLORER + '/address/' + p.wallet, target: '_blank', rel: 'noopener' }, 'Explorer')),
    p.labels.length ? labels : null);

  const stats = h('section', { class: 'qwp-stats', 'aria-label': 'Totals' },
    stat('Total PnL', usd(total, { sign: true }), partial || s.realizedUsd == null ? 'known parts only; some cost unknown' : 'realized + unrealized', tone(total)),
    stat('Realized', usd(s.realizedUsd, { sign: true }), s.realizedUsd == null ? 'sold tokens had no readable cost' : s.realizedCoverage != null && s.realizedCoverage < 0.999 ? 'known for ' + pct(s.realizedCoverage) + ' of sold value' : null, tone(s.realizedUsd)),
    stat('Unrealized', usd(s.unrealizedUsd, { sign: true }), s.unrealizedPartial ? 'partial' : null, tone(s.unrealizedUsd)),
    stat('Win rate', pct(s.winRate), s.closedWithKnownPnl ? s.closedWithKnownPnl + ' closed with known PnL' : 'no closed positions with known cost'),
    stat('Avg hold', dur(s.avgHoldSec), s.medianHoldSec != null ? 'median ' + dur(s.medianHoldSec) : null),
    stat('Holdings', usd(s.holdingsValueUsd), s.holdingsValuePartial ? 'some tokens have no price' : null),
    stat('Buys', String(s.buys), usd(s.buyUsd)), stat('Sells', String(s.sells), usd(s.sellUsd)),
    stat('Volume', usd(s.buyUsd + s.sellUsd)), stat('Tokens traded', String(s.tokensTraded)),
    stat('Closed positions', String(s.closedPositions)), stat('Unpriced trades', String(p.coverage.unpricedTrades), 'kept as unknown'));

  // Period block: realized PnL inside 7D / 30D / All, its return on the cost it released, and the cumulative line.
  let period = periodNow;
  const perBox = h('section', { class: 'qwp-period', 'aria-label': 'PnL by period' });
  const drawPeriod = () => {
    const P = s.periods?.[period] || {};
    const chips = h('div', { class: 'qwp-chips', role: 'group', 'aria-label': 'Period' }, ...[['7d', '7D'], ['30d', '30D'], ['all', 'All']].map(([k, l]) => h('button', { type: 'button', class: 'qwp-chip', 'aria-pressed': String(k === period), onclick: () => { period = periodNow = k; drawPeriod(); } }, l)));
    const c = s.checks || {};
    const chk = (label, v, title) => h('div', { class: 'qwp-chk', title }, h('span', {}, label), h('b', { class: v > 0.5 ? 'down' : '' }, v == null ? UNK() : pct(v)));
    perBox.replaceChildren(
      h('div', { class: 'qwp-pbig' }, h('small', {}, (period === 'all' ? 'All-time' : period.toUpperCase()) + ' realized PnL'), chips,
        h('b', { class: tone(P.realizedUsd) }, P.realizedUsd == null ? UNK() : usd(P.realizedUsd, { sign: true })),
        h('i', { class: tone(P.roi) }, P.roi == null ? '' : (P.roi > 0 ? '+' : '') + (P.roi * 100).toFixed(1) + '% on ' + usd(P.costUsd) + ' cost · ' + P.sells + ' sells')),
      spark(s.pnlCurve || [], period),
      h('div', { class: 'qwp-checks' }, h('small', {}, 'Behaviour'),
        chk('Sold without buying', c.soldWithoutBuying, 'Share of sold tokens this wallet never bought (received by transfer)'),
        chk('Sold more than bought', c.soldMoreThanBought, 'Share of sold tokens where it sold more units than it bought'),
        chk('Buy and sell within 10 s', c.buySellWithin10s, 'Share of traded tokens with a sell within 10 seconds of a buy'),
        h('div', { class: 'qwp-chk' }, h('span', {}, 'Tokens sold / traded'), h('b', {}, (c.tokensSold ?? 0) + ' / ' + (c.tokensTraded ?? 0)))));
  };
  drawPeriod();
  const d = s.pnlDistribution, dn = Object.values(d).reduce((a, b) => a + b, 0);
  const buckets = [['>500%', d.gt500, '#3EDD8F'], ['200–500%', d.p200to500, '#2FA56B'], ['0–200%', d.p0to200, '#1F6E48'], ['0 to −50%', d.m50to0, '#8A3B3E'], ['< −50%', d.ltm50, '#FF5E64']];
  const dist = h('section', { class: 'qwp-dist', 'aria-label': 'Closed positions by return' }, h('small', {}, 'Closed positions by return'),
    h('div', {}, h('div', { class: 'qwp-bar' }, ...(dn ? buckets.filter(b => b[1]).map(b => h('span', { style: `width:${b[1] / dn * 100}%;background:${b[2]}`, title: b[0] + ': ' + b[1] })) : [])),
      h('div', { class: 'qwp-leg' }, ...buckets.map(b => h('span', {}, h('i', { style: 'background:' + b[2] }), b[0] + ' ' + b[1])))));

  // Holdings: priced tokens and tokens this wallet bought. Received-only tokens with no readable price (airdrops) and
  // lookalike tickers are counted and hidden unless ?all is set.
  const bought = new Set(p.positions.filter(x => x.buys > 0).map(x => x.token));
  const hide = x => !qs.has('all') && (x.lookalike || (x.priceUsd == null && !bought.has(x.token)));
  const shownHoldings = p.holdings.filter(x => !hide(x));
  const hidden = p.holdings.filter(hide);
  const hiddenNote = hidden.length ? `${hidden.length} received token${hidden.length === 1 ? '' : 's'} hidden: no readable price and never bought by this wallet${hidden.some(x => x.lookalike) ? ', including ' + hidden.filter(x => x.lookalike).length + ' copying the USDG, WETH or ETH ticker at another address' : ''}. Add ?all to the link to show them.` : null;
  const panels = {
    Holdings: () => table(['Token', 'Balance', 'Price', 'Value', 'Avg cost', 'Unrealized', 'Held for'], shownHoldings, x => [
      h('td', { class: 'qwp-tok' }, h('b', {}, x.symbol || short(x.token)), h('small', { class: 'w-hide' }, short(x.token)), x.unknownCostQty ? h('span', { class: 'qwp-flag', title: qty(x.unknownCostQty) + ' received without a readable price' }, 'cost partly unknown') : null),
      cell(qty(x.balance)), cell(price(x.priceUsd)), cell(usd(x.valueUsd)), cell(price(x.avgCostUsd), 'w-hide'), cell(usd(x.unrealizedUsd, { sign: true }), tone(x.unrealizedUsd)), cell(dur(x.openSince ? Date.now() / 1000 - x.openSince : null), 'w-hide')],
      hiddenNote),
    Positions: () => table(['Token', 'Bought', 'Sold', 'Avg buy', 'Avg sell', 'Realized', 'Trades', 'Last'], p.positions.filter(x => x.buys + x.sells > 0).sort((a, b) => (b.lastTs || 0) - (a.lastTs || 0)), x => [
      h('td', { class: 'qwp-tok' }, h('b', {}, x.symbol || short(x.token)), x.realizedPartial ? h('span', { class: 'qwp-flag', title: 'Some sold units had no readable cost' }, 'partial') : null),
      cell(usd(x.buyUsd)), cell(usd(x.sellUsd)), cell(price(x.avgBuyUsd), 'w-hide'), cell(price(x.avgSellUsd), 'w-hide'), cell(usd(x.realizedUsd, { sign: true }), tone(x.realizedUsd)), cell(x.buys + '/' + x.sells, 'w-hide'), cell(ago(x.lastTs))]),
    Trades: () => table(['Token', 'Side', 'Amount', 'Price', 'Value', 'Venue', 'Time'], p.trades, t => [
      h('td', { class: 'qwp-tok' }, h('b', {}, t.symbol || short(t.token))), h('td', {}, h('span', { class: 'qwp-side ' + (t.side === 'buy' ? 'up' : 'down') }, t.side)),
      cell(qty(t.amount)), cell(price(t.priceUsd)), cell(usd(t.usd)), cell(t.venue === 'wallet-flow' ? 'wallet legs' : t.venue, 'w-hide'), h('td', {}, txLink(t.tx, ago(t.ts) || '#' + t.block))]),
    Transfers: () => table(['Token', 'Direction', 'Amount', 'Counterparty', 'Time'], p.transfers, t => [
      h('td', { class: 'qwp-tok' }, h('b', {}, t.symbol || short(t.token))), cell(t.mint ? 'mint' : t.burn ? 'burn' : t.dir === 'in' ? 'received' : 'sent'), cell(qty(t.amount)), h('td', {}, t.counterparty ? addrLink(t.counterparty) : UNK()), h('td', {}, txLink(t.tx, ago(t.ts) || '#' + t.block))]),
    'Over time': () => timeline(p)
  };
  const counts = { Holdings: shownHoldings.length, Positions: p.positions.filter(x => x.buys + x.sells > 0).length, Trades: p.trades.length, Transfers: p.transfers.length };
  const body = h('div', {});
  let current = tabNow;
  const tabs = h('div', { class: 'qwp-tabs', role: 'tablist' });
  const draw = () => { tabs.replaceChildren(...Object.keys(panels).map(k => h('button', { class: 'qwp-tab', role: 'tab', 'aria-selected': String(k === current), onclick: () => { current = tabNow = k; draw(); } }, k, counts[k] != null ? h('span', {}, String(counts[k])) : null))); body.replaceChildren(panels[current]()); };
  draw();
  const cov = p.coverage;
  const note = h('p', { class: 'qwp-note' }, `Read from Robinhood Chain through block ${p.head}: ${cov.transferLogs} token transfers in ${cov.txs} transactions${cov.olderTxsNotPriced ? `, the latest ${cov.decodedTxs} priced` : ''}. Prices come from the swap that moved the token in the same transaction (Uniswap v4, v3 and v2 pools), ETH priced from our ETH/USDG pool at that block. A dash means we could not read it, never zero.`);
  $root.replaceChildren(...[head, perBox, stats, s.closedPositions ? dist : null, tabs, body, note].filter(Boolean));
}

// Cumulative realized PnL as a stepped line (SVG polyline, no markers), cut to the chosen period.
function spark(curve, period) {
  const cut = period === '7d' ? Date.now() / 1000 - 7 * 86400 : period === '30d' ? Date.now() / 1000 - 30 * 86400 : -Infinity;
  const pts = curve.filter(x => x[0] >= cut);
  const box = h('div', { class: 'qwp-spark' });
  if (pts.length < 2) { box.append(h('p', { class: 'qwp-empty' }, 'Not enough closed sells in this period for a line.')); return box; }
  const base = curve.filter(x => x[0] < cut).at(-1)?.[1] ?? 0;
  const ys = pts.map(p => p[1] - base), x0 = pts[0][0], x1 = Math.max(pts.at(-1)[0], x0 + 1);
  const lo = Math.min(0, ...ys), hi = Math.max(0, ...ys), W = 600, H = 120, sy = v => H - 4 - (v - lo) / ((hi - lo) || 1) * (H - 8);
  let d = ''; pts.forEach((p, i) => { const x = (p[0] - x0) / (x1 - x0) * W, y = sy(ys[i]); d += i ? ` H${x.toFixed(1)} V${y.toFixed(1)}` : `M${x.toFixed(1)} ${y.toFixed(1)}`; });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Cumulative realized PnL');
  svg.innerHTML = `<line x1="0" x2="${W}" y1="${sy(0)}" y2="${sy(0)}" stroke="rgba(255,255,255,.12)" stroke-width="1" vector-effect="non-scaling-stroke"/><path d="${d}" fill="none" stroke="${ys.at(-1) >= 0 ? '#3EDD8F' : '#FF5E64'}" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`;
  box.append(svg);
  return box;
}

function table(cols, rows, row, foot) {
  const LIMIT = 60; let n = LIMIT;
  const wrap = h('div', {});
  const paint = () => {
    const t = h('table', { class: 'qwp-table' }, h('thead', {}, h('tr', {}, ...cols.map((c, i) => h('th', { class: [3, 4, 5].includes(i) && cols.length > 6 ? '' : '' }, c)))), h('tbody', {}, ...rows.slice(0, n).map(r => h('tr', {}, ...row(r)))));
    // hide the same columns on phones as the cells marked w-hide
    const hideIdx = rows.length ? row(rows[0]).map((c, i) => c.classList?.contains('w-hide') ? i : -1).filter(i => i >= 0) : [];
    hideIdx.forEach(i => t.querySelectorAll('thead th')[i]?.classList.add('w-hide'));
    wrap.replaceChildren(...[rows.length ? t : h('p', { class: 'qwp-empty' }, 'Nothing here yet.'), rows.length > n ? h('button', { class: 'qwp-btn qwp-more', onclick: () => { n += LIMIT * 2; paint(); } }, 'Show more (' + (rows.length - n) + ')') : null, foot ? h('p', { class: 'qwp-note' }, foot) : null].filter(Boolean));
  };
  paint();
  return wrap;
}

function timeline(p) {
  // One row per token the wallet traded; each held span (open to close) is a bar on a shared time axis.
  const rows = p.positions.filter(x => x.buys > 0).map(x => ({ x, spans: [...(x.closed || []).map(c => [c.openTs, c.closeTs, false]), ...(x.balance > 0 ? [[p.holdings.find(hh => hh.token === x.token)?.openSince || x.lastTs, Date.now() / 1000, true]] : [])].filter(s => s[0]) }))
    .filter(r => r.spans.length).sort((a, b) => Math.min(...a.spans.map(s => s[0])) - Math.min(...b.spans.map(s => s[0]))).slice(0, 40);
  if (!rows.length) return h('p', { class: 'qwp-empty' }, 'No held positions to chart yet.');
  const t0 = Math.min(...rows.flatMap(r => r.spans.map(s => s[0]))), t1 = Date.now() / 1000, W = t1 - t0 || 1;
  return h('div', { class: 'qwp-time' }, ...rows.map(r => h('div', { class: 'qwp-trow' }, h('b', {}, r.x.symbol || short(r.x.token)), h('div', { class: 'qwp-track' }, ...r.spans.map(([a, b, open]) => h('span', { class: open ? 'open' : '', style: `left:${(a - t0) / W * 100}%;width:${Math.max(0.4, (b - a) / W * 100)}%`, title: date(a) + ' → ' + (open ? 'now' : date(b)) }))))),
    h('div', { class: 'qwp-axis' }, h('span', {}), h('div', {}, h('span', {}, date(t0)?.slice(0, 10)), h('span', {}, 'now'))));
}

// Load: a building wallet shows its progress and polls; a refreshing one renders now and polls once more.
let polls = 0;
async function load() {
  try {
    const r = await fetch(src, { headers: { accept: 'application/json' } });
    const j = await r.json();
    const p = j.profile || (j.version ? j : null);
    if (p) render(p);
    else if (j.state === 'building' || j.state === 'waiting') {
      const pr = j.progress;
      $root.replaceChildren(h('p', { class: 'qwp-empty' }, 'Reading wallet' + (pr?.of ? ` · ${pr.receipts} of ${pr.of} transactions` : '…') + (j.state === 'waiting' ? ' · queued, the page fills in when it is ready' : '')));
    } else if (j.error) { $root.replaceChildren(h('p', { class: 'qwp-empty' }, j.error === 'chain_not_supported_yet' ? 'Wallet pages for this chain are coming next.' : 'Could not read this wallet.')); return; }
    if ((j.state === 'building' || j.state === 'waiting' || j.state === 'refreshing') && polls++ < 120) setTimeout(load, j.state === 'refreshing' ? 8000 : 3000);
  } catch (e) { $root.replaceChildren(h('p', { class: 'qwp-empty' }, 'Could not read this wallet. Try again in a moment.')); }
}
load();
