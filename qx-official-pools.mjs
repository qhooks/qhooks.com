// Official-pool notice for QHooks launch tokens (2026-11-08): "Only trade X through qhooks.com or the official pool 0x….
// Other X pools were created by third parties with a–b% fees." plus a Trade here link and the third-party pools, each
// tagged "Unofficial · <fee>%". Data: /api/terminal/official-pools. Shown only when such pools exist.
// Mounts on [data-pool-warning][data-chain][data-token]; the terminal calls mountPoolWarning for every QHooks launch.
import {warningText, trapText, trapTag} from '/qx-official-pools-core.mjs';
const cache = new Map();
if (typeof document !== 'undefined' && !document.querySelector('link[data-qop]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/qx-official-pools.css'; l.dataset.qop = ''; document.head.append(l); }
export function readOfficialPools(chainId, token, fetcher = globalThis.fetch) {
  const k = chainId + ':' + String(token).toLowerCase();
  if (!cache.has(k)) cache.set(k, fetcher('/api/terminal/official-pools?chain=' + chainId + '&token=' + String(token).toLowerCase(), {cache: 'no-store'})
    .then(r => r.ok ? r.json() : null).catch(() => null).then(d => { if (!d?.official || d.partial) setTimeout(() => cache.delete(k), 60000); return d; }));
  return cache.get(k);
}
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const short = id => id.slice(0, 10) + '…' + id.slice(-6);
export function renderPoolWarning(root, d, {tradeHref} = {}) {
  root.replaceChildren(); root.classList.add('qop-warn');
  if (!d?.official || !d.officialPools?.length || !(d.unofficial?.length || d.partial)) { root.hidden = true; return false; }
  // Fail open: no (complete) list still shows the warning, worded for pools we can't list.
  const text = warningText(d.symbol, d.officialPools[0].id, d.feeRange, {unknown: !d.unofficial?.length}), cut = text.indexOf(d.officialPools[0].id);
  const p = el('p', 'qop-text'), strong = el('strong', null, text.slice(0, cut)), code = el('code', 'qop-id', d.officialPools[0].id);
  const rest = text.slice(cut + d.officialPools[0].id.length), stop = rest.indexOf('. ') + 1;
  strong.append(code, rest.slice(0, stop)); p.append(strong, rest.slice(stop) + ' ');
  if (tradeHref !== null) { const a = el('a', 'qop-trade', 'Trade here'); a.href = tradeHref || d.tradeHref; p.append(a); }
  if (!d.unofficial?.length) { root.append(p); root.hidden = false; root.setAttribute('role', 'note'); return true; }
  const details = el('details', 'qop-list'), sum = el('summary', null, d.unofficial.length + ' unofficial pool' + (d.unofficial.length === 1 ? '' : 's')), ul = el('ul');
  for (const u of d.unofficial) { const li = el('li'); li.append(el('code', null, short(u.id)), el('span', 'qop-tag', trapTag(u))); if (u.name) li.append(el('span', 'qop-name', u.name)); ul.append(li); }
  const trap = trapText(d.unofficial), tp = trap ? el('p', 'qop-trap', trap) : null; if (trap) { details.open = true; root.dataset.trap = 'true'; } else delete root.dataset.trap;
  details.append(sum, ul); root.append(...[p, tp, details].filter(Boolean)); root.hidden = false; root.setAttribute('role', 'note');
  return true;
}
export async function mountPoolWarning(root, {chainId, token, tradeHref, fallback = null, retries = 3, retryMs = 15000} = {}) {
  // fallback {symbol, pool}: a page that knows the launch shows the warning even when the endpoint can't answer.
  // A partial or unknown answer is read again a few times (the server keeps filling its on-chain pool index).
  let d = null;
  for (let i = 0; i <= retries && root.isConnected; i++) {
    if (i) { await new Promise(r => setTimeout(r, retryMs)); cache.delete(chainId + ':' + String(token).toLowerCase()); }
    const got = await readOfficialPools(chainId, token);
    d = (got && got.official != null ? got : null) || (fallback && {official: true, symbol: fallback.symbol, officialPools: [{id: fallback.pool}], unofficial: [], partial: true, tradeHref: '/terminal#t=' + chainId + ':' + token});
    if (root.isConnected && (d || i === retries)) renderPoolWarning(root, d, {tradeHref});
    if (got && got.official === false || got && got.official && !got.partial) break;
  }
  return d;
}
if (typeof document !== 'undefined') for (const root of document.querySelectorAll('[data-pool-warning][data-chain][data-token]'))
  mountPoolWarning(root, {chainId: root.dataset.chain, token: root.dataset.token, tradeHref: root.dataset.tradeHref || undefined,
    fallback: root.dataset.officialPool ? {symbol: root.dataset.symbol || '', pool: root.dataset.officialPool} : null});
