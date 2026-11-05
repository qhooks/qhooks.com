// Board rows and small formatters shared by the board page, the Community hub and profiles (no side effects on import).
import { CHAIN_NAME, h } from '/qx-chain.mjs';
export const num = n => Number(n || 0).toLocaleString();
export const boardPath = b => '/board.html#' + (b.kind === 'token' ? 't=' + b.chainId + ':' + b.address : 'm=' + b.chainId + ':' + b.controller);
export const chainName = chain => chain === 'solana' ? 'Solana' : CHAIN_NAME[chain] || chain;
// The same address mark works for EVM and case-sensitive Solana identities.
export function addressMark(address) {
  const value = String(address || ''), n = /^0x[0-9a-f]+$/i.test(value) ? BigInt(value) : [...value].reduce((n, ch) => (n * 31n + BigInt(ch.charCodeAt(0))) & 0xffffffffn, 0n);
  const hue = Number(n % 50n) + 25, hue2 = Number((n >> 8n) % 60n) + 90, ang = Number((n >> 16n) % 360n);
  return h('span', { class: 'qb-mark', 'aria-hidden': 'true', style: `background:conic-gradient(from ${ang}deg, hsl(${hue} 48% 58%), hsl(${hue2} 22% 42%), hsl(${hue} 30% 22%), hsl(${hue} 48% 58%))` });
}
export function boardIcon(b) {
  const fallback = addressMark(b.address || b.controller), icon = h('span', { class: 'qb-token-icon', 'aria-hidden': 'true' }, fallback);
  let url; try { const u = new URL(b.logo); if (u.protocol === 'https:') url = u.href; } catch {}
  if (url) {
    const img = h('img', { class: 'qb-token-logo', src: url, alt: '', width: 32, height: 32, referrerpolicy: 'no-referrer' });
    fallback.hidden = true; img.addEventListener('error', () => { img.hidden = true; fallback.hidden = false; }); icon.append(img);
  }
  return icon;
}
export function ago(ms) {
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min'; if (s < 86400) return Math.floor(s / 3600) + ' h';
  if (s < 7 * 86400) return Math.floor(s / 86400) + ' d';
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(s > 300 * 86400 ? { year: 'numeric' } : {}) });
}
export const emptyNote = text => h('p', { class: 'qa-empty' }, text);
// Calls use quote-token prices and percentage moves, never a dollar-profit estimate.
export function priceText(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const n = Number(value); return n === 0 ? '0' : n.toLocaleString(undefined, { maximumSignificantDigits: 6 });
}
export function moveText(value, base = 1) {
  if (value == null || !(Number(base) > 0) || !Number.isFinite(Number(value))) return '—';
  const n = (Number(value) / Number(base) - 1) * 100;
  return (n > 0 ? '+' : '') + Math.round(n) + '%';
}
export const qualityText = value => value == null ? '—' : moveText(1 + Number(value));
export function callLabels(call) {
  const labels = new Set(call?.labels || []); if (call?.soldAfter) labels.add('soldAfter');
  if (call?.kind === 'token' || call?.boardKind === 'token') { labels.delete('soldAfter'); labels.delete('linked'); }
  return [...labels].map(k => ({ creator_call: "Creator's call", linked: 'Linked to the creator', soldAfter: 'Sold after calling' })[k]).filter(Boolean);
}
export function callLabelPills(call) { return callLabels(call).map(label => h('span', { class: 'qb-badge qb-call-label' }, label)); }
export function callRecord(call) {
  const c = call || {}, top = h('div', { class: 'qb-call-head' }, h('b', {}, 'Call'), h('span', { class: 'qb-call-price' }, priceText(c.price) + ' ' + (c.quoteSymbol || '')));
  const figures = h('div', { class: 'qb-call-figures' }, ...[['1 h', 'price1h'], ['24 h', 'price24h'], ['7 d', 'price7d'], ['now', 'priceNow']].map(([label, key]) => {
    const value = c[key], change = moveText(value, c.price), direction = value == null ? '' : Number(value) > Number(c.price) ? ' is-up' : Number(value) < Number(c.price) ? ' is-down' : '';
    return h('div', { class: 'qb-call-figure' + direction }, h('span', {}, label), h('b', { title: priceText(value) + ' ' + (c.quoteSymbol || '') }, priceText(value)), value == null ? null : h('small', {}, change));
  }));
  const labels = callLabelPills(c), ref = callRef(c.ref);
  return h('section', { class: 'qb-call', 'aria-label': 'Call record' }, top, figures, labels.length ? h('div', { class: 'qb-call-labels' }, ...labels) : null,
    ref ? h('a', { class: 'qb-call-ref', href: ref, rel: 'nofollow ugc noopener' }, 'Trade via this call') : null);
}
function callRef(ref) {
  try {
    const u = new URL(ref), launch = /^\/l\/\d+\/0x[0-9a-f]{40}$/.test(u.pathname);
    const token = u.pathname === '/terminal.html' && /^#t=(?:(?:8453|1|42161|56|4663):0x[0-9a-f]{40}|solana:[1-9A-HJ-NP-Za-km-z]{32,44})$/.test(u.hash);
    return u.origin === 'https://qhooks.com' && (launch || token) && /^0x[0-9a-f]{40}$/.test(u.searchParams.get('ref') || '') ? u.href : null;
  } catch { return null; }
}
export function callerRow(c, rank) {
  const wallet = String(c.wallet || '');
  return h('a', { class: 'qb-caller-row', href: '/profile.html#' + wallet, title: wallet },
    h('span', { class: 'qb-caller-rank' }, String(rank)), h('code', { class: 'qb-caller-wallet' }, wallet.slice(0, 6) + '…' + wallet.slice(-4)),
    h('span', { class: 'qb-caller-hit' }, h('b', {}, Math.round(Number(c.hitRate) * 100) + '%'), h('small', {}, ' hit')),
    h('span', { class: 'qb-caller-quality' }, h('b', {}, qualityText(c.quality)), h('small', {}, ' median move')),
    h('span', { class: 'qb-caller-count' }, num(c.counted) + ' counted'));
}
/** The boards with recent posts, across launches and outside tokens. */
export function boardRow(b) {
  const token = b.kind === 'token';
  return h('a', { class: 'qb-row', href: boardPath(b) },
    h('span', { class: 'qb-row-name' }, token ? boardIcon(b) : null, h('b', {}, b.name), ' ', h('code', {}, '$' + b.symbol), h('span', { class: 'qa-chain' }, chainName(b.chainId)), token ? h('span', { class: 'qb-outside' }, 'Not a QHooks launch') : b.gate ? h('span', { class: 'qb-gate-chip is-gated' }, 'Holders post') : null),
    b.announcement ? h('span', { class: 'qb-row-ann' }, b.announcement) : null,
    h('span', { class: 'qb-row-meta' }, num(b.posts) + ' post' + (b.posts === 1 ? '' : 's') + (b.replies ? ' · ' + num(b.replies) + ' repl' + (b.replies === 1 ? 'y' : 'ies') : '') + (b.lastPostAt ? ' · latest ' + ago(b.lastPostAt) : '')));
}

/** Two tabs over the active boards: "QHooks launches" (default) and "All tokens", each by latest activity (/api/community/boards?kind=).
 *  Returns one element; each tab loads its list once, on first open. */
export function boardTabs({ limit = 50, empty = {} } = {}) {
  const TABS = [['launch', 'QHooks launches'], ['token', 'All tokens']], cache = new Map();
  const list = h('div', { class: 'qb-rows', 'aria-live': 'polite' }), bar = h('div', { class: 'qb-orders qb-tabs', role: 'tablist', 'aria-label': 'Boards' });
  let current = null;
  const show = async kind => {
    current = kind;
    for (const b of bar.children) { const on = b.getAttribute('data-kind') === kind; b.setAttribute('aria-selected', String(on)); b.setAttribute('aria-pressed', String(on)); b.tabIndex = on ? 0 : -1; }
    if (!cache.has(kind)) cache.set(kind, fetch('/api/community/boards?kind=' + kind, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null));
    list.replaceChildren(h('p', { class: 'qa-loading' }, 'Reading boards…'));
    const j = await cache.get(kind), rows = (j?.boards || []).slice(0, limit);
    if (current !== kind) return;
    list.replaceChildren(...(rows.length ? rows.map(boardRow) : [emptyNote(!j ? 'The boards didn’t answer. Try again in a moment.'
      : empty[kind] || (kind === 'launch' ? 'No QHooks launch board has posts yet.' : 'No token board has posts yet. Open any token in the terminal and start one.'))]));
  };
  for (const [kind, label] of TABS) { const b = h('button', { type: 'button', class: 'qb-order', role: 'tab', 'data-kind': kind }, label); b.addEventListener('click', () => show(kind)); bar.append(b); }
  bar.addEventListener('keydown', e => { if (!/^Arrow(Left|Right)$/.test(e.key)) return; const next = [...bar.children].find(b => b.getAttribute('data-kind') !== current); next?.click(); next?.focus(); });
  show('launch');
  return h('div', { class: 'qb-tabbed' }, bar, list);
}
