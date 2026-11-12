// Auto-copy in System A: the shell, the wallet you picked with its live trades, and a board of traders to copy in one tap.
// The copy account, limits and every signature stay in /qx-pro-copy.mjs. Reads public wallet data only:
// /api/wallets/activity and /api/wallets/live for the picked wallet, /api/wallets/smart for the board (visible tab only).
import { laneShell, quietWhenConnected, visiblePoll } from './markets-shell.mjs';
import { RM } from '/qx-a/components.mjs';
import { identicon, spark, tokenIcon, short, ago } from '/qx-smart.mjs';

laneShell({ active: 'trade' });
quietWhenConnected(document.querySelector('[data-qa-connect]'));

const $ = (id) => document.getElementById(id);
const make = (tag, cls, ...kids) => { const n = document.createElement(tag); if (cls) n.className = cls; for (const k of kids.flat()) if (k != null && k !== false) n.append(k.nodeType ? k : String(k)); return n; };
const COPY_CHAINS = ['4663', '56', '99901', '8453', '42161']; // chains with a copy account (qx-pro-copy BASES)
const SHORT = { 4663: 'Robinhood', 8453: 'Base', 56: 'BNB', 42161: 'Arbitrum', 99901: 'Elysium', 1: 'Ethereum', solana: 'Solana' };
const money = (v) => { if (v == null || !Number.isFinite(v)) return '—'; const a = Math.abs(v), s = v < 0 ? '−$' : '$'; return s + (a >= 1e6 ? (a / 1e6).toFixed(2) + 'M' : a >= 1e4 ? (a / 1e3).toFixed(a >= 1e5 ? 0 : 1) + 'K' : a.toLocaleString('en-US', { maximumFractionDigits: a >= 100 ? 0 : 2 })); };
const signed = (v) => v == null || !Number.isFinite(v) ? '—' : (v > 0 ? '+' : '') + money(v);
const pctS = (v) => v == null || !Number.isFinite(v) ? '' : (v > 0 ? '+' : '') + (Math.abs(v) >= 100 ? Math.round(v) : v.toFixed(1)) + '%';
const tone = (v) => v > 0 ? 'qa-up' : v < 0 ? 'qa-down' : '';
const getJSON = async (url) => { const r = await fetch(url, { cache: 'no-store', headers: { accept: 'application/json' } }); if (!r.ok) throw Error(String(r.status)); return r.json(); };
const q = new URLSearchParams(location.search), leader = String(q.get('w') || '').toLowerCase();
const copyHref = (w, chains) => '/copy?w=' + w + ((chains || []).filter((c) => COPY_CHAINS.includes(c)).length === 1 ? '&chain=' + chains.find((c) => COPY_CHAINS.includes(c)) : '');

/* ---------- the wallet you picked: who, its week, its last hour ---------- */
let leaderStop = null;
async function paintLeader(wallet = leader, featured = null) {
  const box = $('mkc-leader');
  if (!/^0x[0-9a-f]{40}$/.test(wallet) || !box) return;
  leaderStop?.();
  const stats = make('dl', 'mkc-leader__stats'), live = make('ol', 'mkc-live'), chart = make('div', 'mkc-leader__chart');
  box.replaceChildren(...[
    make('div', 'mkc-leader__who', make('span', 'mkc-leader__ava', identicon(leader, 72)), make('div', null, make('p', 'mkc-leader__k', featured ? 'Top trader · ' + featured.label : 'You picked'), make('h2', 'mkc-leader__n', short(wallet)),
      make('p', 'mkc-leader__links', (() => { const a = make('a', 'qa-link', 'Wallet card'); a.href = '/wallets?w=' + wallet; return a; })()))),
    featured ? (() => { const a = make('a', 'qa-btn qa-btn--secondary mkc-copy mkc-leader__copy', 'Copy this wallet'); a.href = copyHref(wallet, featured.row.chains); return a; })() : null,
    stats, chart, make('div', 'mkc-live__h', make('span', 'mkc-live__dot'), make('b', null, 'Their last hour'), make('small', 'mkc-live__at', 'Refreshing')), live].filter(Boolean));
  box.hidden = false;
  getJSON('/api/wallets/activity?w=' + wallet + '&tf=7d').then((a) => {
    const t = a?.total; if (!t) { stats.replaceChildren(make('div', null, make('dt', null, 'Last 7 days'), make('dd', null, 'No sampled trades'))); return; }
    stats.replaceChildren(
      make('div', 'is-big', make('dt', null, 'PnL · 7 days'), make('dd', tone(t.pnlUsd), signed(t.pnlUsd), make('small', tone(t.pnlPct), ' ' + pctS(t.pnlPct)))),
      make('div', null, make('dt', null, 'Win'), make('dd', null, t.winRate == null ? '—' : Math.round(t.winRate * 100) + '%')),
      make('div', null, make('dt', null, 'Trades'), make('dd', null, String(t.trades))),
      make('div', null, make('dt', null, 'Volume'), make('dd', null, money(t.volumeUsd))));
    if (Array.isArray(a.series) && a.series.length > 1) chart.append(spark(a.series.map((p) => p[1]), 320, 56));
  }).catch(() => stats.replaceChildren(make('div', null, make('dt', null, 'Last 7 days'), make('dd', null, 'Refreshing'))));
  let seen = null;
  leaderStop = visiblePoll(async () => {
    const l = await getJSON('/api/wallets/live?w=' + wallet);
    $('mkc-leader').querySelector('.mkc-live__at').textContent = l?.at ? 'Live · ' + ago(Math.floor(l.at / 1000)) + ' ago' : 'Refreshing';
    const rows = (l?.trades || []).slice(0, 6), keys = rows.map((x) => x.tx + x.token + x.side);
    if (!rows.length) { live.replaceChildren(make('li', 'mkc-live__empty', 'No trades in the last hour. New ones show here.')); seen = new Set(); return; }
    live.replaceChildren(...rows.map((x, i) => {
      const li = make('li', 'mkc-tr ' + (x.side === 'buy' ? 'is-buy' : 'is-sell') + (seen && !seen.has(keys[i]) && !RM ? ' mk-enter is-new' : ''),
        make('span', 'mkc-tr__side', x.side === 'buy' ? 'Buy' : 'Sell'), tokenIcon(x, 22), make('b', null, x.symbol || short(x.token)), make('span', 'mkc-tr__c', SHORT[x.chainId] || ''),
        make('span', 'mkc-tr__v', x.usd == null ? '—' : money(x.usd)), make('span', 'mkc-tr__t', ago(x.ts)));
      return li;
    }));
    seen = new Set(keys);
  }, 60e3);
}

/* ---------- traders to copy: the smart-money board, copy chains only ---------- */
async function loadBoard() {
  for (const url of ['/api/wallets/smart?chain=all&tf=7d', '/api/wallets/smart?chain=all&tf=24h', '/api/wallets/smart?chain=all&tf=6h']) {
    try { const j = await getJSON(url); if (j?.rows?.length) return { rows: j.rows, tf: j.tf || url.split('tf=')[1] }; } catch {}
  }
  const lb = await getJSON('/api/wallets/leaderboard?window=7d');
  return { rows: (lb.rows || []).map((x) => ({ ...x, chains: x.chains || ['4663'], topTokens: x.topTokens || [], tags: [], spark: [] })), tf: 'QHooks launches, 7 days' };
}
const TF = { '6h': 'Last 6 hours', '24h': 'Last 24 hours', '7d': 'Last 7 days' };
let boardKeys = null;
async function paintBoard() {
  const list = $('mkc-list'), note = $('mkc-who-note');
  let data;
  try { data = await loadBoard(); } catch { if (!list.childElementCount) list.replaceChildren(make('li', 'mkc-empty', 'The board is refreshing. Try again in a moment.')); note.textContent = 'Refreshing'; return; }
  const rows = data.rows.filter((r) => (r.chains || []).some((c) => COPY_CHAINS.includes(c)) && r.wallet !== leader).sort((a, b) => (b.pnlUsd || 0) - (a.pnlUsd || 0)).slice(0, 12);
  note.textContent = (TF[data.tf] || data.tf) + ' · ranked by PnL';
  if (!rows.length) { list.replaceChildren(make('li', 'mkc-empty', 'Traders fill in as trades are sampled on the copy chains.')); return; }
  const keys = rows.map((r) => r.wallet + r.pnlUsd);
  list.replaceChildren(...rows.map((r, i) => {
    const copy = make('a', 'qa-btn qa-btn--secondary qa-btn--sm mkc-copy', 'Copy');
    copy.href = copyHref(r.wallet, r.chains); copy.setAttribute('aria-label', 'Copy ' + short(r.wallet));
    const who = make('a', 'mkc-row__who', identicon(r.wallet, 40), make('span', 'mkc-row__t', make('b', null, short(r.wallet)),
      make('small', null, [...(r.tags || []).slice(0, 1).map((t) => make('span', 'mkc-tag mkc-tag--' + t, t === 'smart' ? 'Smart money' : t === 'whale' ? 'Whale' : t === 'sniper' ? 'Sniper' : t === 'fresh' ? 'Fresh wallet' : t === 'verified' && r.handle ? '@' + r.handle : t)),
        make('span', null, (r.chains || []).map((c) => SHORT[c] || c).join(' · ')), make('span', null, (r.trades ?? '—') + ' trades')])));
    who.href = '/wallets?w=' + r.wallet;
    const li = make('li', 'mkc-row' + (i < 3 ? ' is-top' : '') + (boardKeys && !boardKeys.has(keys[i]) && !RM ? ' mk-enter' : ''),
      make('span', 'mkc-row__rank', String(i + 1)), who,
      make('span', 'mkc-row__spark', spark(r.spark, 72, 26)),
      make('span', 'mkc-row__pnl', make('b', tone(r.pnlUsd), signed(r.pnlUsd)), make('small', null, r.winRate == null ? '' : 'Win ' + Math.round(r.winRate * 100) + '%')),
      copy);
    return li;
  }));
  boardKeys = new Set(keys);
  if (!leader && rows[0] && $('mkc-leader').dataset.featured !== rows[0].wallet) { $('mkc-leader').dataset.featured = rows[0].wallet; paintLeader(rows[0].wallet, { row: rows[0], label: TF[data.tf] || data.tf }); }
}

paintLeader();
visiblePoll(paintBoard, 5 * 60e3);
