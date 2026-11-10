// Wallets (pro terminal phase W1, 2026-11-10): follow any wallet with your own name, emoji and group; see its trades,
// PnL, win rate and holdings on QHooks markets; browse the smart-money board. Read-only: nothing here moves money.
// Follows sync across devices through /api/wallets (one free sign-in signature, the community session). The page also
// offers to bring in wallets tracked in this device's terminal. Cards open from anywhere via 'qhooks:wallet-open'.
import '/qx-confirm-top.mjs'; // Privy confirms stay on top of these sheets
import { connectedAddress, onWalletChange } from '/qx-chain.mjs';
import { authHeaders, signIn, boardSession } from '/qx-board-session.mjs';
import { chainById } from '/chains.mjs';

const ADDR = /^0x[0-9a-f]{40}$/, TERMINAL_KEY = 'qhooks:terminal:tracked';
const SCOPE_NOTE = 'PnL on QHooks markets, from our own trade index. Other tokens are not counted yet.';
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (v == null || v === false) continue; if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v); }
  for (const k of kids.flat()) if (k != null && k !== false) n.append(k.nodeType ? k : String(k));
  return n;
};
const short = a => a.slice(0, 6) + '…' + a.slice(-4);
export const usd = v => v == null || !Number.isFinite(v) ? '—' : (v < 0 ? '−$' : '$') + Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 2, minimumFractionDigits: Math.abs(v) >= 100 ? 0 : 2 });
export const signedUsd = v => v == null || !Number.isFinite(v) ? '—' : (v > 0 ? '+' : '') + usd(v);
export const pct = v => v == null ? '—' : Math.round(v * 100) + '%';
export const age = ts => { const s = Math.max(0, Math.floor(Date.now() / 1000 - ts)); return s < 60 ? s + 's' : s < 3600 ? Math.floor(s / 60) + 'm' : s < 86400 ? Math.floor(s / 3600) + 'h' : Math.floor(s / 86400) + 'd'; };
export const hold = s => s == null ? '—' : s < 3600 ? Math.max(1, Math.round(s / 60)) + 'm' : s < 86400 ? Math.round(s / 3600) + 'h' : Math.round(s / 86400) + 'd';
const compact = v => !Number.isFinite(v) ? '—' : v >= 1e9 ? (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(1) + 'K' : v.toLocaleString('en-US', { maximumFractionDigits: 4 });
const tone = v => v > 0 ? 'up' : v < 0 ? 'down' : '';
const terminalLink = (chainId, controller) => '/terminal.html#m=' + chainId + ':' + controller;

/// The wallets this device's terminal tracks ({address: name}), for a one-tap import.
export function terminalTracked(storage = globalThis.localStorage) {
  try { const t = JSON.parse(storage.getItem(TERMINAL_KEY) || '{}'); return Object.entries(t).filter(([a]) => ADDR.test(a)).map(([wallet, label]) => ({ wallet, label: String(label || '').slice(0, 24) })); } catch { return []; }
}

/// Parses an import: our own export, a [{address,name,emoji}] list (as other tools export), or one address per line.
export function parseImport(text) {
  const t = String(text || '').trim(); if (!t) return [];
  try {
    const j = JSON.parse(t), list = Array.isArray(j) ? j : Array.isArray(j?.follows) ? j.follows : Array.isArray(j?.wallets) ? j.wallets : [];
    return list.map(x => typeof x === 'string' ? { wallet: x } : { wallet: x.wallet ?? x.address, label: x.label ?? x.name, emoji: x.emoji, group: x.group })
      .map(x => ({ ...x, wallet: String(x.wallet || '').toLowerCase() })).filter(x => ADDR.test(x.wallet));
  } catch {
    return t.split(/[\s,;]+/).map(w => w.toLowerCase()).filter(w => ADDR.test(w)).map(wallet => ({ wallet }));
  }
}

async function api(path, init = {}) {
  const r = await fetch(path, { ...init, cache: 'no-store', headers: { ...(init.body ? { 'content-type': 'application/json' } : {}), ...authHeaders(), ...(init.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || 'request_failed'), { status: r.status, body: j });
  return j;
}
const words = { sign_in: 'Sign in to keep your list.', slow_down: 'Too many changes this hour. Try again shortly.', follow_limit: 'You follow the most wallets allowed (500).', own_wallet: 'That is your own wallet.', invalid_follow: 'That is not a wallet address.', wallets_unavailable: 'Wallets are refreshing. Try again in a moment.' };
const say = e => words[e?.message] || 'Something went wrong. Try again.';

// ---------------------------------------------------------------- state
const S = { follows: [], signedIn: false, group: 'All', tab: 'following', board: { window: '7d', rows: null }, cards: new Map(), activity: [], seen: new Set() };
let root = null, status = null, activityTimer = null;

async function loadFollows() {
  S.signedIn = !!boardSession();
  if (!S.signedIn) { S.follows = []; return; }
  try { S.follows = (await api('/api/wallets/follows')).follows || []; }
  catch (e) { if (e.status === 401) S.signedIn = false; S.follows = []; }
}
async function follow(wallet, fields = {}, on = true) {
  await api('/api/wallets/follow', { method: 'POST', body: JSON.stringify({ wallet, on, ...fields }) });
  await loadFollows(); syncTerminal(); render(); pollActivity();
}
/// Keep the terminal's own tracked list in step (names only), so + Track and the terminal feed see the same wallets.
function syncTerminal() {
  try {
    const t = JSON.parse(localStorage.getItem(TERMINAL_KEY) || '{}');
    for (const f of S.follows) if (!t[f.wallet]) t[f.wallet] = (f.label || 'Wallet ' + f.wallet.slice(2, 6)).slice(0, 24);
    localStorage.setItem(TERMINAL_KEY, JSON.stringify(t));
    window.dispatchEvent(new CustomEvent('qhooks:tracked-set', { detail: { tracked: t } }));
  } catch {}
}

async function card(wallet, windowKey) {
  const k = wallet + ':' + windowKey, hit = S.cards.get(k);
  if (hit && Date.now() - hit.at < 30000) return hit.data;
  const data = await api('/api/wallets/card/' + wallet + '?window=' + windowKey);
  S.cards.set(k, { at: Date.now(), data }); return data;
}

// ---------------------------------------------------------------- live activity of followed wallets
async function pollActivity() {
  clearTimeout(activityTimer);
  const list = S.follows.slice(0, 50).map(f => f.wallet);
  if (list.length && !document.hidden) {
    try {
      const r = await fetch('/api/terminal/activity?w=' + list.join(','), { cache: 'no-store' });
      if (r.ok) {
        const trades = (await r.json()).trades || [], first = !S.seen.size;
        for (const t of trades) { const id = t.tx + t.trader + t.token; if (!S.seen.has(id)) { S.seen.add(id); if (!first) t.fresh = true; } }
        S.activity = trades; if (S.tab === 'following') renderActivity();
      }
    } catch {}
  }
  activityTimer = setTimeout(pollActivity, 10000);
}

// ---------------------------------------------------------------- rendering
function nameOf(wallet) {
  const f = S.follows.find(x => x.wallet === wallet); if (f?.label || f?.emoji) return (f.emoji ? f.emoji + ' ' : '') + (f.label || short(wallet));
  const local = terminalTracked().find(t => t.wallet === wallet)?.label; // the name given in this device's terminal
  return local || short(wallet);
}

function render() {
  if (!root) return;
  const me = connectedAddress();
  const tabs = el('div', { class: 'qpw-tabs', role: 'tablist' },
    ...[['following', 'Following'], ['board', 'Smart money']].map(([id, label]) => el('button', { type: 'button', role: 'tab', 'aria-selected': String(S.tab === id), class: 'qpw-tab', onclick: () => { S.tab = id; render(); } }, label)));
  root.replaceChildren(tabs, el('p', { class: 'qpw-scope' }, SCOPE_NOTE), S.tab === 'board' ? boardView() : followingView(me));
}

function followingView(me) {
  const box = el('section', { class: 'qpw-following', 'aria-label': 'Wallets you follow' });
  if (!me) { box.append(el('p', { class: 'qpw-empty' }, 'Connect a wallet to follow wallets. Your list is yours: nobody else sees it.')); return box; }
  if (!S.signedIn) {
    const go = el('button', { type: 'button', class: 'qpw-btn qpw-primary' }, 'Sign in to follow wallets');
    go.addEventListener('click', async () => { go.disabled = true; status.textContent = 'Check your wallet. Signing in is free and moves nothing.'; try { await signIn(); await loadFollows(); status.textContent = ''; render(); pollActivity(); } catch (e) { status.textContent = e?.message || 'Sign-in cancelled.'; go.disabled = false; } });
    box.append(el('p', { class: 'qpw-empty' }, 'One free signature keeps your list on every device. It moves nothing.'), go);
    const local = terminalTracked(); if (local.length) box.append(el('p', { class: 'qpw-note' }, local.length + ' wallet' + (local.length === 1 ? '' : 's') + ' tracked in this device’s terminal can come along after you sign in.'));
    return box;
  }
  // Add a wallet
  const addr = el('input', { type: 'text', inputmode: 'text', autocomplete: 'off', spellcheck: 'false', placeholder: '0x… wallet address', 'aria-label': 'Wallet address', class: 'qpw-in qpw-addr' });
  const name = el('input', { type: 'text', maxlength: '24', placeholder: 'Name', 'aria-label': 'Name', class: 'qpw-in' });
  const emoji = el('input', { type: 'text', maxlength: '4', placeholder: '🙂', 'aria-label': 'Emoji', class: 'qpw-in qpw-emoji' });
  const group = el('input', { type: 'text', maxlength: '16', placeholder: 'Group', 'aria-label': 'Group', class: 'qpw-in', list: 'qpw-groups' });
  const groups = [...new Set(S.follows.map(f => f.group).filter(Boolean))].sort();
  const add = el('button', { type: 'submit', class: 'qpw-btn qpw-primary' }, 'Follow');
  const form = el('form', { class: 'qpw-add' }, addr, el('div', { class: 'qpw-add-row' }, emoji, name, group), add, el('datalist', { id: 'qpw-groups' }, ...groups.map(g => el('option', { value: g }))));
  form.addEventListener('submit', async e => {
    e.preventDefault(); const w = addr.value.trim().toLowerCase();
    if (!ADDR.test(w)) { status.textContent = words.invalid_follow; addr.focus(); return; }
    add.disabled = true; try { await follow(w, { label: name.value, emoji: emoji.value, group: group.value }); status.textContent = 'Following ' + nameOf(w) + '.'; } catch (err) { status.textContent = say(err); } finally { add.disabled = false; }
  });
  box.append(form);
  const local = terminalTracked().filter(t => !S.follows.some(f => f.wallet === t.wallet));
  if (local.length) {
    const bring = el('button', { type: 'button', class: 'qpw-btn' }, 'Add ' + local.length + ' from this device’s terminal');
    bring.addEventListener('click', async () => { bring.disabled = true; try { await api('/api/wallets/follows', { method: 'PUT', body: JSON.stringify({ follows: local }) }); await loadFollows(); syncTerminal(); render(); pollActivity(); status.textContent = 'Added.'; } catch (e) { status.textContent = say(e); bring.disabled = false; } });
    box.append(bring);
  }
  // Group chips
  if (groups.length) box.append(el('div', { class: 'qpw-chips', role: 'group', 'aria-label': 'Groups' }, ...['All', ...groups].map(g => el('button', { type: 'button', class: 'qpw-chip', 'aria-pressed': String(S.group === g), onclick: () => { S.group = g; render(); } }, g))));
  const shown = S.follows.filter(f => S.group === 'All' || f.group === S.group);
  const list = el('ul', { class: 'qpw-list' });
  if (!shown.length) list.append(el('li', { class: 'qpw-empty' }, 'Follow a wallet above, or tap “+ Track” on any trade in the terminal.'));
  for (const f of shown) {
    const stats = el('span', { class: 'qpw-stats' }, 'Refreshing…');
    card(f.wallet, '30d').then(c => stats.replaceChildren(el('span', { class: tone(c.pnlUsd) }, signedUsd(c.pnlUsd)), el('span', {}, 'Win ' + pct(c.winRate)), el('span', {}, c.recent[0] ? 'Last ' + age(c.recent[0].ts) : 'No trades yet')), () => stats.textContent = 'Refreshing');
    list.append(el('li', {}, el('button', { type: 'button', class: 'qpw-row', onclick: () => openCard(f.wallet) },
      el('span', { class: 'qpw-who' }, el('b', {}, (f.emoji ? f.emoji + ' ' : '') + (f.label || short(f.wallet))), el('small', {}, short(f.wallet) + (f.group ? ' · ' + f.group : ''))), stats)));
  }
  box.append(list, el('h2', { class: 'qpw-h' }, 'Their latest trades'), el('ul', { class: 'qpw-act', id: 'qpw-act' }), ioRow());
  queueMicrotask(renderActivity);
  return box;
}

function renderActivity() {
  const ul = document.getElementById('qpw-act'); if (!ul) return;
  const items = S.activity.slice(0, 30).map(t => el('li', { class: t.fresh ? 'qpw-fresh' : null }, el('a', { class: 'qpw-trade', href: terminalLink(t.chainId, t.controller) },
    el('span', {}, el('b', {}, nameOf(t.trader)), ' ', el('span', { class: t.buy ? 'up' : 'down' }, t.buy ? 'bought' : 'sold'), ' ', el('b', {}, t.symbol)),
    el('small', {}, compact(t.token) + ' ' + t.symbol + ' · ' + compact(t.quote) + ' ' + (t.quoteSymbol || '') + ' · ' + (chainById(String(t.chainId))?.name || '') + ' · ' + age(t.ts)))));
  ul.replaceChildren(...(items.length ? items : [el('li', { class: 'qpw-empty' }, S.follows.length ? 'No trades by these wallets on QHooks markets yet. New ones show here within seconds.' : 'Trades by wallets you follow show here.')]));
}

function ioRow() {
  const exp = el('button', { type: 'button', class: 'qpw-btn' }, 'Export list');
  exp.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(S.follows.map(f => ({ address: f.wallet, name: f.label, emoji: f.emoji, group: f.group })), null, 1)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: 'qhooks-wallets.json' }); document.body.append(a); a.click(); a.remove();
  });
  const imp = el('button', { type: 'button', class: 'qpw-btn' }, 'Import list');
  const area = el('textarea', { class: 'qpw-in qpw-import', rows: '4', placeholder: 'Paste a list: JSON [{"address":"0x…","name":"…"}] or one address per line', 'aria-label': 'Wallet list to import', hidden: true });
  const go = el('button', { type: 'button', class: 'qpw-btn qpw-primary', hidden: true }, 'Add these wallets');
  imp.addEventListener('click', () => { area.hidden = !area.hidden; go.hidden = area.hidden; if (!area.hidden) area.focus(); });
  go.addEventListener('click', async () => {
    const list = parseImport(area.value); if (!list.length) { status.textContent = 'No wallet addresses found in that list.'; return; }
    go.disabled = true; try { await api('/api/wallets/follows', { method: 'PUT', body: JSON.stringify({ follows: list }) }); await loadFollows(); syncTerminal(); render(); pollActivity(); status.textContent = 'Added ' + list.length + '.'; } catch (e) { status.textContent = say(e); go.disabled = false; }
  });
  return el('div', { class: 'qpw-io' }, exp, imp, area, go);
}

function boardView() {
  const box = el('section', { class: 'qpw-board', 'aria-label': 'Smart money' });
  box.append(el('div', { class: 'qpw-chips', role: 'group', 'aria-label': 'Period' }, ...[['7d', '7 days'], ['30d', '30 days']].map(([w, l]) =>
    el('button', { type: 'button', class: 'qpw-chip', 'aria-pressed': String(S.board.window === w), onclick: () => { S.board = { window: w, rows: null }; render(); } }, l))),
  el('p', { class: 'qpw-note' }, 'Wallets with at least 5 trades on QHooks markets in the period, ranked by PnL. Launch creators and QHooks contracts are left out.'));
  const list = el('ol', { class: 'qpw-list qpw-ranked' });
  box.append(list);
  if (!S.board.rows) {
    list.append(el('li', { class: 'qpw-empty' }, 'Refreshing…'));
    const want = S.board.window;
    api('/api/wallets/leaderboard?window=' + want).then(j => { if (S.board.window === want) { S.board.rows = j.rows || []; render(); } }, () => { list.replaceChildren(el('li', { class: 'qpw-empty' }, 'The board is refreshing. Try again in a moment.')); });
    return box;
  }
  if (!S.board.rows.length) list.append(el('li', { class: 'qpw-empty' }, 'Smart money fills in as wallets trade QHooks launches. Wallets need 5 or more trades in the period to appear.'));
  for (const r of S.board.rows) {
    const following = S.follows.some(f => f.wallet === r.wallet);
    list.append(el('li', {}, el('button', { type: 'button', class: 'qpw-row', onclick: () => openCard(r.wallet) },
      el('span', { class: 'qpw-who' }, el('b', {}, nameOf(r.wallet)), el('small', {}, r.tokens + ' tokens · ' + r.trades + ' trades')),
      el('span', { class: 'qpw-stats' }, el('span', { class: tone(r.pnlUsd) }, signedUsd(r.pnlUsd)), el('span', {}, 'Win ' + pct(r.winRate)), following ? el('span', { class: 'qpw-tag' }, 'Following') : null))));
  }
  return box;
}

// ---------------------------------------------------------------- the wallet card (a sheet)
let sheet = null;
export async function openCard(wallet, { windowKey = '30d', chainId = null } = {}) {
  wallet = String(wallet || '').toLowerCase(); if (!ADDR.test(wallet)) return;
  if (!sheet) { sheet = el('dialog', { class: 'qpw-sheet', 'aria-labelledby': 'qpw-sheet-h' }); document.body.append(sheet); sheet.addEventListener('click', e => { if (e.target === sheet) sheet.close(); }); }
  const draw = async w => {
    const f = S.follows.find(x => x.wallet === wallet), explorer = chainById(String(chainId || '4663'))?.explorer;
    const head = el('div', { class: 'qpw-sheet-head' }, el('div', {}, el('h2', { id: 'qpw-sheet-h' }, nameOf(wallet)), el('small', {}, wallet)),
      el('button', { type: 'button', class: 'qpw-x', 'aria-label': 'Close', onclick: () => sheet.close() }, '×'));
    const windows = el('div', { class: 'qpw-chips', role: 'group', 'aria-label': 'Period' }, ...[['7d', '7D'], ['30d', '30D'], ['all', 'All']].map(([k, l]) => el('button', { type: 'button', class: 'qpw-chip', 'aria-pressed': String(w === k), onclick: () => draw(k) }, l)));
    const body = el('div', { class: 'qpw-sheet-body' }, el('p', { class: 'qpw-empty' }, 'Refreshing…'));
    const me = connectedAddress();
    const followBtn = me && me.toLowerCase() !== wallet ? el('button', { type: 'button', class: 'qpw-btn ' + (f ? '' : 'qpw-primary') }, f ? 'Unfollow' : 'Follow') : null;
    followBtn?.addEventListener('click', async () => {
      if (!boardSession()) { try { await signIn(); await loadFollows(); } catch { return; } }
      followBtn.disabled = true; try { await follow(wallet, f ? {} : { label: '' }, !f); draw(w); } catch (e) { followBtn.disabled = false; followBtn.after(el('p', { class: 'qpw-note' }, say(e))); }
    });
    const links = el('div', { class: 'qpw-io' }, followBtn, explorer ? el('a', { class: 'qpw-btn', href: explorer + '/address/' + wallet, target: '_blank', rel: 'noopener' }, 'Explorer') : null);
    sheet.replaceChildren(el('div', { class: 'qpw-sheet-in' }, head, windows, body, links));
    if (!sheet.open) sheet.showModal();
    try {
      const c = await card(wallet, w);
      const tiles = el('div', { class: 'qpw-tiles' },
        tile('PnL', signedUsd(c.pnlUsd), tone(c.pnlUsd)), tile('Realized', signedUsd(c.realizedUsd), tone(c.realizedUsd)), tile('Unrealized', signedUsd(c.unrealizedUsd), tone(c.unrealizedUsd)),
        tile('Win rate', pct(c.winRate)), tile('Tokens', String(c.positionsCounted)), tile('Avg hold', hold(c.avgHoldSec)));
      const holdings = el('ul', { class: 'qpw-mini' }, ...(c.holdings.length ? c.holdings.slice(0, 12).map(p => el('li', {}, el('a', { href: terminalLink(p.chainId, p.controller) }, el('b', {}, p.symbol || '—'), el('span', {}, compact(p.held)), el('span', {}, usd(p.valueUsd))))) : [el('li', { class: 'qpw-empty' }, 'No QHooks tokens held.')]));
      const recent = el('ul', { class: 'qpw-mini' }, ...(c.recent.length ? c.recent.map(t => el('li', {}, el('a', { href: terminalLink(t.chainId, t.controller) }, el('span', { class: t.buy ? 'up' : 'down' }, t.buy ? 'Buy' : 'Sell'), el('b', {}, t.symbol || '—'), el('span', {}, compact(t.quote) + ' ' + (t.quoteSymbol || '')), el('span', {}, age(t.ts))))) : [el('li', { class: 'qpw-empty' }, 'No trades on QHooks markets in this period.')]));
      body.replaceChildren(tiles, el('h3', {}, 'Holdings'), holdings, el('h3', {}, 'Recent trades'), recent,
        el('p', { class: 'qpw-note' }, (w === 'all' ? 'All indexed trades' : 'Last ' + (w === '7d' ? '7' : '30') + ' days') + ' · ' + SCOPE_NOTE + (c.partial ? ' Some tokens have no dollar price yet.' : '')));
    } catch { body.replaceChildren(el('p', { class: 'qpw-empty' }, 'This wallet is refreshing. Try again in a moment.')); }
  };
  draw(windowKey);
}
const tile = (label, value, cls = '') => el('div', { class: 'qpw-tile' }, el('small', {}, label), el('b', { class: cls }, value));

// ---------------------------------------------------------------- boot
window.addEventListener('qhooks:wallet-open', e => { const d = e.detail || {}; loadFollows().finally(() => openCard(d.wallet, { chainId: d.chainId })); });
export async function mount(node) {
  root = node; status = document.getElementById('qpw-status');
  const wantWallet = new URLSearchParams(location.search).get('w');
  await loadFollows(); render(); pollActivity();
  if (wantWallet) openCard(wantWallet);
  onWalletChange?.(async () => { S.cards.clear(); await loadFollows(); render(); });
}
const node = document.getElementById('qpw-root');
if (node) { import('/qx-account-wallet.mjs').catch(() => {}); mount(node); }
else {
  // On the terminal: styles for the card and the clickable tracked names, and "+ Track" kept in the signed-in list.
  if (!document.querySelector('link[href="/qx-pro.css"]')) document.head.append(el('link', { rel: 'stylesheet', href: '/qx-pro.css' }));
  let pushTimer = null;
  window.addEventListener('qhooks:tracked-change', e => {
    const t = e.detail?.tracked; if (!t || !boardSession()) return;
    clearTimeout(pushTimer);
    // Merge only: wallets followed on another device are never removed from here.
    pushTimer = setTimeout(() => api('/api/wallets/follows', { method: 'PUT', body: JSON.stringify({ follows: Object.entries(t).slice(0, 500).map(([wallet, label]) => ({ wallet, label })) }) }).catch(() => {}), 1500);
  });
}
