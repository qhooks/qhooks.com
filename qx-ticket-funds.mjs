// Buy ticket money line (2026-11-12, Randall on iPhone: "how many dropdown menus do I need in one screen").
// One line directly above the amount says what can be spent on this token right now, with its symbol and chain.
// Tapping it opens the breakdown: this chain first, then every other chain, and the total across chains.
// Balances across chains come from qx-balances (read only here; the design build owns that module).
import {cachedBalances, refreshBalances} from './qx-balances.mjs';

const fmt = (n, max = 4) => {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n === 0) return '0';
  if (n < 0.0001) return '<0.0001';
  return n.toLocaleString('en-US', {maximumFractionDigits: n >= 1000 ? 0 : n >= 1 ? 3 : max});
};
const usd = n => n == null ? '' : '$' + n.toLocaleString('en-US', {maximumFractionDigits: n >= 100 ? 0 : 2});
const short = name => String(name || '').replace(/ Chain$/, '');

/// The one-line summary. `main` = {amount, symbol, chain}; `extras` = [{amount, symbol}] also usable here (e.g. WETH
/// next to ETH). Pure, so it is tested without a page.
export function availableText({main, extras = [], side = 'buy', home = false, usdPrice = null}) {
  if (!main) return '';
  // Dollars first (2026-11-12, Randall's one-dollar-balance model), then the asset and its chain.
  const dollars = Number.isFinite(usdPrice) && usdPrice > 0 && Number.isFinite(main.amount) ? usd(main.amount * usdPrice) + ' · ' : '';
  const head = (side === 'sell' ? 'You hold ' : 'Available ') + dollars + fmt(main.amount) + ' ' + main.symbol + (main.chain ? ' on ' + short(main.chain) : '') + (home ? ' (home)' : '');
  const more = extras.filter(x => x.amount > 0).map(x => fmt(x.amount) + ' ' + x.symbol);
  return head + (more.length ? ' · incl. ' + more.join(', ') : '');
}

/// Breakdown rows from a qx-balances reading: [{chainId, name, here, lines:[{symbol, amount, usd}], usd}], token chain first.
export function breakdownRows(data, chainId) {
  const rows = (data?.rows || []).map(r => {
    const lines = [r.native, ...(r.tokens || []).filter(t => t.kind === 'wrapped' || t.kind === 'launch'), r.stable]
      .filter(a => a && a.amount > 0).map(a => ({symbol: a.symbol, amount: a.amount, usd: a.usd ?? null}));
    return {chainId: String(r.chainId), name: short(r.name), here: String(r.chainId) === String(chainId), lines, usd: lines.reduce((t, l) => t + (l.usd || 0), 0)};
  }).filter(r => r.here || r.lines.length);
  return rows.sort((a, b) => (b.here - a.here) || b.usd - a.usd);
}

export function mountAvailable({h, getOwner, getChain}) {
  try { if (!document.getElementById('qxt-funds-style')) { const l = document.createElement('link'); l.id = 'qxt-funds-style'; l.rel = 'stylesheet'; l.href = '/qx-ticket-funds.css'; document.head.append(l); } } catch {}
  const line = h('button', {type: 'button', class: 'qxt-avail', ariaExpanded: 'false', hidden: true});
  const more = h('div', {class: 'qxt-avail-more', hidden: true, role: 'region', ariaLabel: 'Balances across chains'});
  let seq = 0;
  function paint(data) {
    const rows = breakdownRows(data, getChain()), chains = rows.filter(r => r.lines.length).length;
    more.replaceChildren(
      h('p', {class: 'qxt-avail-total'}, h('b', {}, usd(data?.total || 0)), ' across ' + chains + (chains === 1 ? ' chain' : ' chains')),
      ...rows.map(r => h('div', {class: 'qxt-avail-row' + (r.here ? ' here' : '')},
        h('span', {class: 'qxt-avail-chain'}, r.name + (r.here ? ' · this token' : '')),
        h('span', {class: 'qxt-avail-assets'}, r.lines.length ? r.lines.map(l => fmt(l.amount) + ' ' + l.symbol).join(' · ') : 'Nothing yet'),
        h('span', {class: 'qxt-avail-usd'}, r.usd ? usd(r.usd) : ''))));
  }
  async function open() {
    const owner = getOwner(); if (!owner) return;
    const mine = ++seq, cached = cachedBalances(owner).data;
    if (cached) paint(cached); else more.replaceChildren(h('p', {class: 'qxt-avail-total'}, 'Reading balances across chains…'));
    try { const d = await refreshBalances(owner); if (mine === seq && !more.hidden) paint(d); } catch { if (!cached && mine === seq) more.replaceChildren(h('p', {}, 'Balances across chains are refreshing. Try again in a moment.')); }
  }
  line.addEventListener('click', () => { more.hidden = !more.hidden; line.setAttribute('aria-expanded', String(!more.hidden)); if (!more.hidden) void open(); });
  return {
    elements: [line, more],
    set(text) { line.textContent = text; line.hidden = !text; if (!text) { more.hidden = true; line.setAttribute('aria-expanded', 'false'); } },
    close() { more.hidden = true; line.setAttribute('aria-expanded', 'false'); seq++; },
  };
}
