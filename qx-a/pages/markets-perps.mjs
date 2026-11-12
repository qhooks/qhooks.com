// Perps in System A: the shell, the funding countdown, the live order book and trades, and the phone's Long / Short dock.
// Reads only public Hyperliquid data (the same wss://api.hyperliquid.xyz the page already uses). Every movement here is a
// real book update, a real trade or the real funding clock. Trading itself stays in /qx-perps.mjs, untouched in its flows.
import { laneShell } from './markets-shell.mjs';
import { RM, toast, liveLabel } from '/qx-a/components.mjs';

laneShell({ active: 'trade', mode: 'detail', title: 'Perps', back: '/terminal' });
const $ = (id) => document.getElementById(id);
const make = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const wide = matchMedia('(min-width: 1100px)');

/* ---------- last trade label in the market meta ---------- */
const last = liveLabel();
last.refreshing(true);
$('pp-last')?.append(last.el);

/* ---------- funding: Hyperliquid pays funding every hour, on the hour ---------- */
function tickFunding() {
  const now = Date.now(), hour = 3600e3, left = hour - (now % hour), s = Math.floor(left / 1000);
  const t = $('pp-next-funding'); if (t) t.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  $('pp-fuse')?.style.setProperty('--pp-fuse', ((1 - left / hour) * 100).toFixed(2) + '%');
}
tickFunding(); setInterval(tickFunding, 1000);

/* ---------- Long / Short dock (phone): picks the side and brings the ticket up ---------- */
const dock = $('pp-dock'), ticket = $('ticket');
if (dock && ticket) {
  document.body.append(dock);
  const sync = () => { dock.hidden = ticket.hidden; };
  new MutationObserver(sync).observe(ticket, { attributes: true, attributeFilter: ['hidden'] }); sync();
  dock.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pp-side]'); if (!b) return;
    $(b.dataset.ppSide)?.click();
    ticket.scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'center' });
    setTimeout(() => $('amount')?.focus({ preventScroll: true }), RM ? 0 : 420);
  });
}

/* ---------- Book / Trades tabs ---------- */
const tabs = [['pp-tab-book', 'pp-book'], ['pp-tab-trades', 'pp-trades']];
function showTab(id) {
  for (const [t, p] of tabs) { const on = t === id; $(t).setAttribute('aria-selected', String(on)); $(p).hidden = !on; }
}
for (const [t] of tabs) $(t)?.addEventListener('click', () => showTab(t));
showTab('pp-tab-book');

/* ---------- live book and trades over Hyperliquid's public socket ---------- */
const note = (t) => { const n = $('pp-flow-note'); if (n) n.textContent = t; };
const fmtSz = (v) => { const n = Number(v); if (!Number.isFinite(n)) return '—'; return n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'K' : n >= 100 ? n.toLocaleString('en-US', { maximumFractionDigits: 1 }) : n.toLocaleString('en-US', { maximumSignificantDigits: 5 }); };
const fmtPx = (v) => { const n = Number(v); if (!Number.isFinite(n)) return '—'; return n.toLocaleString('en-US', { maximumFractionDigits: n >= 1000 ? 1 : n >= 1 ? 4 : 6, minimumFractionDigits: n >= 1000 ? 1 : 0 }); };
const usdShort = (v) => v >= 1e6 ? '$' + (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? '$' + (v / 1e3).toFixed(1) + 'K' : '$' + v.toFixed(0);
const clock = (ms) => new Date(ms).toLocaleTimeString('en-GB', { hour12: false });

let coin = null, ws = null, lastMsg = 0, pending = null, raf = 0, prevSizes = new Map(), lastMid = 0, seen = new Set(), lastWhale = 0, gotTrades = false;
const ROWS = 12, TRADES = 40;

function send(method, c) {
  if (ws?.readyState !== 1 || !c) return;
  ws.send(JSON.stringify({ method, subscription: { type: 'l2Book', coin: c } }));
  ws.send(JSON.stringify({ method, subscription: { type: 'trades', coin: c } }));
}
function connect() {
  try { ws = new WebSocket('wss://api.hyperliquid.xyz/ws'); } catch { note('Refreshing'); return; }
  note('Refreshing');
  ws.onopen = () => { lastMsg = Date.now(); send('subscribe', coin); };
  ws.onmessage = (e) => {
    lastMsg = Date.now();
    let p; try { p = JSON.parse(e.data); } catch { return; }
    if (p.channel === 'l2Book' && p.data?.coin === coin) { pending = p.data; if (!raf) raf = requestAnimationFrame(paintBook); note('Live'); }
    else if (p.channel === 'trades' && Array.isArray(p.data)) onTrades(p.data.filter((t) => t.coin === coin));
  };
  ws.onclose = () => { ws = null; note('Refreshing'); last.refreshing(true); };
  ws.onerror = () => note('Refreshing');
}
setInterval(() => {
  if (ws?.readyState === 1) { if (Date.now() - lastMsg > 45e3) ws.close(); else ws.send(JSON.stringify({ method: 'ping' })); }
  else if (!ws && coin && !document.hidden) connect();
}, 15e3);

function setCoin(next) {
  if (!next || next === coin) return;
  if (coin) send('unsubscribe', coin);
  coin = next; pending = null; prevSizes = new Map(); lastMid = 0; seen = new Set(); gotTrades = false;
  $('pp-asks').replaceChildren(); $('pp-bids').replaceChildren(); $('pp-trades-list').replaceChildren(); $('pp-mid').textContent = '—'; $('pp-spread').textContent = '—';
  last.refreshing(true);
  if (!ws) connect(); else send('subscribe', coin);
}
addEventListener('qx:perps-market', (e) => setCoin(e.detail?.coin));

let lastPaint = 0;
function paintBook(now) {
  raf = 0;
  if (now - lastPaint < 220) { raf = requestAnimationFrame(paintBook); return; } // a calm 4–5 repaints a second
  lastPaint = now;
  const data = pending; if (!data?.levels) return;
  const [bids = [], asks = []] = data.levels, b = bids.slice(0, ROWS), a = asks.slice(0, ROWS);
  let cb = 0, ca = 0; const cumB = b.map((l) => (cb += Number(l.sz))), cumA = a.map((l) => (ca += Number(l.sz)));
  const top = Math.max(cb, ca) || 1, sizes = new Map();
  const rows = (list, cum, side) => list.map((l, i) => {
    const li = make('li', 'pp-lvl is-' + side), key = side + l.px, sz = Number(l.sz), was = prevSizes.get(key);
    li.style.setProperty('--d', (cum[i] / top * 100).toFixed(1) + '%');
    li.append(make('span', 'pp-lvl__px', fmtPx(l.px)), make('span', 'pp-lvl__sz', fmtSz(l.sz)), make('span', 'pp-lvl__tot', fmtSz(cum[i])));
    if (!RM && was != null && was !== sz) li.classList.add(sz > was ? 'is-grow' : 'is-shrink');
    sizes.set(key, sz); return li;
  });
  $('pp-asks').replaceChildren(...rows(a, cumA, 'ask'));
  $('pp-bids').replaceChildren(...rows(b, cumB, 'bid'));
  prevSizes = sizes;
  if (b[0] && a[0]) {
    const bb = Number(b[0].px), ba = Number(a[0].px), mid = (bb + ba) / 2, midEl = $('pp-mid');
    midEl.textContent = fmtPx(mid);
    midEl.className = mid > lastMid && lastMid ? 'qa-up' : mid < lastMid ? 'qa-down' : midEl.className;
    lastMid = mid;
    $('pp-spread').textContent = fmtPx(ba - bb) + ' · ' + ((ba - bb) / mid * 100).toFixed(3) + '%';
  }
  const share = cb / ((cb + ca) || 1);
  $('pp-lean-b').style.flexGrow = share.toFixed(3); $('pp-lean-a').style.flexGrow = (1 - share).toFixed(3);
  $('pp-lean-bl').textContent = 'Bids ' + Math.round(share * 100) + '%'; $('pp-lean-al').textContent = Math.round((1 - share) * 100) + '% Asks';
}

function tradeRow(t, enter) {
  const buy = t.side === 'B', li = make('li', 'pp-trade ' + (buy ? 'is-buy' : 'is-sell') + (enter && !RM ? ' is-enter' : ''));
  const notional = Number(t.px) * Number(t.sz);
  li.style.setProperty('--w', Math.min(100, 6 + 15 * Math.log10(1 + notional / 100)).toFixed(1) + '%');
  li.append(make('span', 'pp-trade__px', fmtPx(t.px)), make('span', 'pp-trade__sz', fmtSz(t.sz)), make('span', 'pp-trade__t', clock(t.time)));
  li.title = (buy ? 'Buy ' : 'Sell ') + usdShort(notional);
  return li;
}
function onTrades(list) {
  if (!list.length) return;
  const fresh = list.filter((t) => { const id = t.tid ?? t.hash + t.time; if (seen.has(id)) return false; seen.add(id); return true; }).sort((x, y) => x.time - y.time);
  if (seen.size > 4000) seen = new Set([...seen].slice(-1000));
  if (!fresh.length) return;
  const box = $('pp-trades-list'), first = !gotTrades; gotTrades = true;
  for (const t of fresh) box.prepend(tradeRow(t, !first));
  while (box.children.length > TRADES) box.lastElementChild.remove();
  const newest = fresh[fresh.length - 1];
  if (Date.now() - newest.time < 120e3) last.hit(); else last.setLast(Date.now() - newest.time);
  if (first) return;
  // A trade of a million dollars or more rises as a toast, at most one every eight seconds.
  const whale = fresh.reduce((best, t) => (Number(t.px) * Number(t.sz) > (best ? Number(best.px) * Number(best.sz) : 0) ? t : best), null);
  const value = whale ? Number(whale.px) * Number(whale.sz) : 0;
  if (value >= 1e6 && Date.now() - lastWhale > 8000) {
    lastWhale = Date.now();
    const buy = whale.side === 'B', ico = make('span', 'pp-toast-coin', coin.replace(/^k/, '').slice(0, 1));
    toast({ kind: buy ? 'holder' : 'error', badge: buy ? 'up' : 'down', ava: ico, title: (buy ? 'Large buy · ' : 'Large sell · ') + coin, body: usdShort(value) + ' at ' + fmtPx(whale.px), tag: 'Hyperliquid', ms: 3600 });
  }
}

/* ---------- desktop: the book column matches the chart's height ---------- */
function fitFlow() {
  const chart = document.querySelector('.pp-chart'), flow = $('pp-flow');
  if (!chart || !flow) return;
  flow.style.setProperty('--pp-flow-h', wide.matches ? chart.getBoundingClientRect().height + 'px' : 'auto');
}
new ResizeObserver(fitFlow).observe(document.querySelector('.pp-chart')); wide.addEventListener('change', fitFlow); fitFlow();

/* the coin read before qx-perps announces (it starts on BTC) */
setCoin(($('coin')?.textContent || 'BTC').trim());
document.addEventListener('visibilitychange', () => { if (!document.hidden && !ws && coin) connect(); });
