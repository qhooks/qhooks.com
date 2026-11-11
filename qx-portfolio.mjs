import {LIVE} from './chains.mjs';

const known = n => typeof n === 'number' && Number.isFinite(n);
const names = Object.fromEntries(LIVE.map(c => [c.id, c.short]));
const wrapped = Object.fromEntries(LIVE.map(c => [c.id, c.wrappedNative]));
const sumKnown = values => { const xs = values.filter(known); return xs.length ? xs.reduce((a, b) => a + b, 0) : null; };
export const money = n => known(n) ? new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD', maximumFractionDigits: n !== 0 && Math.abs(n) < .01 ? 6 : 2}).format(n) : '—';
export const quantity = n => known(n) ? n.toLocaleString('en-US', {maximumSignificantDigits: 6}) : '—';
export const percent = n => known(n) ? (n > 0 ? '+' : '') + (n * 100).toLocaleString('en-US', {maximumFractionDigits: 2}) + '%' : '—';
const signedMoney = n => known(n) ? (n > 0 ? '+' : '') + money(n) : '—';
export const chainName = c => names[c.chainId] || c.name || c.chainId;
export const tradeHref = row => '/terminal#' + (row.qhooks ? 'm=' + row.chainId + ':' + row.qhooks.controller : 't=' + row.chainId + ':' + row.address);
export function pnlText(cost) {
 if (!cost || !known(cost.pnlQuote)) return 'unknown';
 return (cost.pnlQuote > 0 ? '+' : '') + quantity(cost.pnlQuote) + ' ' + (cost.quoteSymbol || 'unknown') + (known(cost.pnlUsd) ? ' (≈ ' + money(cost.pnlUsd) + ')' : ' (≈ —)');
}
export function mergePortfolios(reports) {
 const chains = reports.flatMap(p => p.chains || []), rows = [];
 for (const c of chains) {
  const n = c.native, units = n.balance == null ? null : Number(n.balance) / 10 ** n.decimals;
  if (units > 0) rows.push({...n, address: c.chainId === 'solana' ? 'So11111111111111111111111111111111111111112' : wrapped[c.chainId],
   name: n.symbol === 'ETH' ? 'Ether' : n.symbol === 'SOL' ? 'Solana' : n.symbol, units, native: true, spam: false, cost: null, qhooks: null, chainId: c.chainId, chainName: chainName(c)});
  for (const t of c.tokens) rows.push({...t, chainId: c.chainId, chainName: chainName(c)});
 }
 rows.sort((a, b) => (b.valueUsd ?? -1) - (a.valueUsd ?? -1) || String(a.symbol || a.address).localeCompare(String(b.symbol || b.address)));
 const valueUsd = sumKnown(reports.map(p => p.totals.valueUsd));
 // The 24h change covers holdings with a 24h price; the line says how much of the value that is.
 const change24Usd = sumKnown(reports.map(p => p.totals.change24Usd)), coveredUsd = sumKnown(reports.map(p => p.totals.change24CoveredUsd));
 const prior = known(coveredUsd) && known(change24Usd) ? coveredUsd - change24Usd : null;
 const allocation = chains.map(c => ({chainId: c.chainId, name: chainName(c), valueUsd: reports.find(p => p.chains.includes(c))?.totals.byChain[c.chainId] ?? null}))
  .sort((a, b) => (b.valueUsd ?? -1) - (a.valueUsd ?? -1));
 return {chains, rows, valueUsd, change24Usd, coveredUsd, change24: prior > 0 ? change24Usd / prior : null, allocation,
  top: rows.filter(r => !r.spam && r.valueUsd > 0).slice(0, 5), at: reports.length ? Math.min(...reports.map(p => p.at)) : null,
  partial: reports.some(p => p.partial)};
}
export function filterHoldings(rows, {search = '', chain = 'all', hideSmall = true, showSpam = false} = {}) {
 const query = search.trim().toLowerCase();
 return rows.filter(r => (showSpam || !r.spam) && (chain === 'all' || r.chainId === chain)
  && (!hideSmall || r.valueUsd === null || r.valueUsd >= 1)
  && (!query || [r.symbol, r.name, r.address, r.chainName].some(v => String(v || '').toLowerCase().includes(query))));
}
export function readPreferences(storage) {
 try { const p = JSON.parse(storage.getItem('qhooks:portfolio') || '{}'); return {hideSmall: p.hideSmall !== false, showSpam: p.showSpam === true}; }
 catch { return {hideSmall: true, showSpam: false}; }
}
export function savePreferences(storage, value) { try { storage.setItem('qhooks:portfolio', JSON.stringify({hideSmall: value.hideSmall, showSpam: value.showSpam})); } catch { /* Private browsing still works. */ } }

export async function startPortfolio({document = globalThis.document, fetchImpl = (...args) => globalThis.fetch(...args),
 loadChain = () => import('/qx-chain.mjs'), loadWallet = () => import('/qx-account-wallet.mjs'),
 loadSol = () => import('/qx-solana.mjs'), loadEarningsModule = () => import('/qx-earnings.mjs'),
 storage = (() => { try { return globalThis.localStorage; } catch { return null; } })(), clipboard = globalThis.navigator?.clipboard} = {}) {
 const $ = id => document.getElementById(id);
 const root = $('qp-content'); if (!root) return;
 // Paint a working connect prompt before loading the heavier earnings and wallet code.
 const [chain, sol] = await Promise.all([loadChain(), loadSol()]);
 await loadWallet();
 const {h, connectedAddress, onWalletChange} = chain;
 let sequence = 0, earningsSequence = 0, current = null, aborter = null, walletKey = '', disposed = false;
 const prefs = {...readPreferences(storage), search: '', chain: 'all'};
 $('qp-small').checked = prefs.hideSmall; $('qp-spam').checked = prefs.showSpam;
 const button = (label, onclick, attrs = {}) => h('button', {type: 'button', class: 'qa-btn', onclick, ...attrs}, label);
 const copyButton = address => button('Copy', async e => {
  const b = e.currentTarget;
  try { await clipboard.writeText(address); b.textContent = 'Copied'; }
  catch { b.textContent = 'Select address'; }
 }, {'aria-label': 'Copy wallet address'});
 function addresses(evm, solana) {
  $('qp-addresses').replaceChildren(...[evm, solana].filter(Boolean).map(a => h('div', {class: 'qp-address'}, h('code', {}, a), copyButton(a))));
 }
 function solPicker() {
  const wallets = sol.solWallets(), address = sol.solAddress();
  const detail = h('details', {}, h('summary', {}, address ? 'Solana wallet connected' : 'Add a Solana wallet'));
  detail.append(h('div', {class: 'qp-sol-options'}, ...(wallets.length ? wallets.map(w => button(w.name, async e => {
   e.currentTarget.disabled = true;
   try { await sol.connectSol(w.name); $('qp-status').textContent = ''; }
   catch { $('qp-status').textContent = 'Could not connect the Solana wallet. Try again.'; }
   finally { e.currentTarget.disabled = false; }
  })) : [h('p', {}, 'Open this page in a Solana wallet browser, or enable your wallet extension.')] )));
  $('qp-wallets').replaceChildren(h('span', {}, 'Base · Ethereum · Arbitrum · BNB · Robinhood'), detail);
 }
 function skeleton() {
  $('qp-total').textContent = '—'; $('qp-total').classList.add('qp-skeleton');
  $('qp-change').textContent = 'Reading balances…'; $('qp-at').textContent = 'Reading balances…';
  $('qp-overview').setAttribute('aria-busy', 'true');
  for (const id of ['qp-allocation', 'qp-top', 'qp-holdings']) $(id).replaceChildren(h('div', {class: 'qp-loading-lines', 'aria-hidden': 'true'}, ...[1, 2, 3].map(() => h('span', {class: 'qp-skeleton'}))));
  $('qp-notes').replaceChildren(); $('qp-count').textContent = '';
 }
 function paintHoldings() {
  if (!current) return;
  const rows = filterHoldings(current.rows, prefs);
  $('qp-count').textContent = rows.length + (rows.length === 1 ? ' holding shown' : ' holdings shown');
  const cell = (label, value, extra = '') => h('div', {class: extra}, h('span', {class: 'qp-cell-label'}, label), h('span', {class: 'qp-cell-value qp-number'}, value));
  $('qp-holdings').replaceChildren(...(rows.length ? rows.map(r => h('article', {class: 'qp-holding', role: 'listitem'},
   h('div', {class: 'qp-token'}, h('b', {}, r.symbol || 'unknown'), h('p', {}, r.name || 'unknown'), h('span', {class: 'qa-chain'}, r.chainName),
    r.spam ? h('span', {class: 'qp-reason'}, r.spamReason || 'Spam') : null),
   cell('Balance', quantity(r.units)), cell('Price', money(r.priceUsd)), cell('Value', money(r.valueUsd)),
   cell('24h', percent(r.change24), r.change24 > 0 ? 'qp-positive' : r.change24 < 0 ? 'qp-negative' : ''),
   h('div', {class: 'qp-pnl', ...(r.cost ? {title: "Approximate USD value at the quote’s current price. Cost basis uses indexed QHooks trades and the last indexed launch price."} : {})}, h('span', {class: 'qp-cell-label'}, 'PnL'), h('span', {class: 'qp-cell-value'}, pnlText(r.cost))),
   h('a', {class: 'qa-btn', href: tradeHref(r), 'aria-label': 'Trade ' + (r.symbol || 'token') + ' on ' + r.chainName}, 'Trade')))
   : [h('p', {class: 'qa-empty'}, current.rows.length ? 'No holdings match these filters.' : 'No holdings found in this reading.')]));
 }
 function paintChips() {
  const choices = [{chainId: 'all', name: 'All chains'}, ...current.allocation];
  if (!choices.some(c => c.chainId === prefs.chain)) prefs.chain = 'all';
  $('qp-chains').replaceChildren(...choices.map(c => button(c.name, () => {
   prefs.chain = c.chainId;
   for (const b of $('qp-chains').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.chain === c.chainId));
   paintHoldings();
  }, {'aria-pressed': String(c.chainId === prefs.chain), 'data-chain': c.chainId})));
 }
 function paintOverview(failed = []) {
  const m = current; $('qp-total').classList.remove('qp-skeleton'); $('qp-total').textContent = money(m.valueUsd);
  $('qp-value-label').textContent = m.partial || failed.length ? 'Known value · partial reading' : 'Total value';
  const delta = h('b', {class: m.change24Usd > 0 ? 'qp-positive' : m.change24Usd < 0 ? 'qp-negative' : ''}, signedMoney(m.change24Usd) + ' (' + percent(m.change24) + ')');
  const part = known(m.coveredUsd) && known(m.valueUsd) && m.valueUsd > 0 && m.coveredUsd < m.valueUsd * 0.995 ? ', on ' + Math.round(m.coveredUsd / m.valueUsd * 100) + '% of the value (the rest has no 24h price)' : '';
  $('qp-change').replaceChildren(delta, h('span', {}, ' over 24 hours' + part));
  $('qp-at').textContent = m.at ? 'Read ' + new Date(m.at).toLocaleTimeString(undefined, {hour: 'numeric', minute: '2-digit', second: '2-digit'}) : 'Refreshing';
  $('qp-overview').setAttribute('aria-busy', 'false');
  const bar = h('div', {class: 'qp-bar', 'aria-hidden': 'true'});
  const legend = h('ul', {class: 'qp-legend'});
  for (const [i, c] of m.allocation.entries()) {
   const pct = m.valueUsd > 0 && known(c.valueUsd) ? c.valueUsd / m.valueUsd * 100 : null;
   if (pct > 0) { const seg = h('span', {class: 'qp-segment qp-tone-' + i % 6}); seg.style.width = pct + '%'; bar.append(seg); }
   legend.append(h('li', {}, h('span', {class: 'qp-dot qp-tone-' + i % 6, 'aria-hidden': 'true'}), h('b', {}, c.name),
    h('small', {}, (pct === null ? '—' : pct.toFixed(1) + '%') + ' · ' + money(c.valueUsd))));
  }
  $('qp-allocation').replaceChildren(bar, legend);
  $('qp-top').replaceChildren(m.top.length ? h('ol', {class: 'qp-top-list'}, ...m.top.map(r => h('li', {},
   h('span', {}, h('b', {}, r.symbol || 'unknown'), h('small', {}, r.chainName)), h('span', {class: 'qp-number'}, money(r.valueUsd))))) : h('p', {class: 'qa-muted'}, 'No priced holdings yet.'));
  const notes = [...failed];
  for (const c of m.chains) {
   const code = c.error, name = chainName(c);
   if (code) notes.push(name + ': ' + ({balances_unavailable: 'Refreshing balances', prices_unavailable: 'Refreshing prices', prices_refreshing: 'Refreshing', index_unavailable: 'Refreshing QHooks positions', metadata_unavailable: 'Refreshing token details', token_limit: 'more tokens may be held than this reading includes', metadata_limit: 'some token balances have unknown units'}[code] || 'Refreshing data'));
   if (c.source === 'index-only' && c.chainId !== 'solana') notes.push(name + ': native balance and indexed QHooks tokens only');
  }
  if (m.rows.some(r => !r.spam && r.valueUsd === null)) notes.push('Unpriced holdings are not included in the total.');
  $('qp-notes').replaceChildren(...notes.map(t => h('p', {}, t)));
 }
 async function earnings(me) {
  const mine = ++earningsSequence, target = $('qp-earnings');
  if (!me) { target.replaceChildren(h('p', {class: 'qa-empty'}, 'Connect an EVM wallet to see your QHooks earnings.')); return; }
  target.replaceChildren(h('p', {class: 'qa-loading'}, 'Reading your earnings…'));
  try {
   const shared = await loadEarningsModule(), refresh = () => { if (!disposed && connectedAddress() === me) { void earnings(me); void load(true); } };
   const data = await shared.loadEarnings(me, {refresh});
   if (mine !== earningsSequence || disposed) return;
   const active = data.launches.length || data.earn.length || data.vests.length || data.rewards.rows.length || data.built;
   if (!active) { target.replaceChildren(h('p', {class: 'qa-empty'}, data.partial ? 'Refreshing earnings. Refresh to try again.' : 'No QHooks earnings to show yet.')); return; }
   const sections = [];
   if (data.rewards.rows.length) sections.push(shared.section('qa-rewards', 'Cashback and referrals', null, data.rewards.rows));
   if (data.earn.length) sections.push(shared.section('qa-earn', 'Stakes and raffle entries', null, data.earn));
   if (data.vests.length) sections.push(shared.section('qa-vest', 'Vesting', null, data.vests));
   if (data.built) sections.push(shared.section('qa-built', 'Builder earnings', null, data.built));
   if (data.launches.length) sections.push(shared.section('qa-launches', 'Creator income', null, await shared.launchesSection(me, data.launches, refresh)));
   if (data.partial) sections.push(h('p', {class: 'qa-muted'}, 'Some earnings could not be read. Refresh to try again.'));
   if (mine === earningsSequence && !disposed) target.replaceChildren(...sections);
  } catch { if (mine === earningsSequence && !disposed) target.replaceChildren(h('p', {class: 'qa-muted'}, 'Refreshing earnings. Refresh to try again.')); }
 }
 async function read(family, address, signal) {
  const res = await fetchImpl('/api/portfolio/' + family + '/' + encodeURIComponent(address), {cache: 'no-store', signal});
  if (!res.ok) throw new Error('unavailable');
  const report = await res.json();
  if (report.version !== 1 || report.address !== address || !Array.isArray(report.chains) || !report.totals) throw new Error('unavailable');
  return report;
 }
 async function load(quiet = false) {
  if (disposed) return;
  const me = connectedAddress(), solana = sol.solAddress(), mine = ++sequence;
  const changed = walletKey !== [me, solana].join(':'); walletKey = [me, solana].join(':');
  aborter?.abort(); const controller = new AbortController(); aborter = controller;
  $('qp-connect').hidden = Boolean(me || solana); root.hidden = !me && !solana;
  if (!me && !solana) { current = null; earningsSequence++; return; }
  addresses(me, solana);
  if (changed) { current = null; $('qp-chains').replaceChildren(); }
  if (changed || !quiet || !current) skeleton();
  $('qp-refresh').disabled = true;
  const jobs = [...(me ? [['evm', me, 'EVM chains']] : []), ...(solana ? [['solana', solana, 'Solana']] : [])];
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
   const results = await Promise.allSettled(jobs.map(([family, address]) => read(family, address, controller.signal)));
   if (mine !== sequence || disposed) return;
   const reports = results.filter(r => r.status === 'fulfilled').map(r => r.value), failed = results.flatMap((r, i) => r.status === 'rejected' ? [jobs[i][2] + ': Refreshing balances'] : []);
   current = mergePortfolios(reports);
   if (failed.length) { current.partial = true; current.change24 = null; current.change24Usd = null; }
   paintOverview(failed); paintChips(); paintHoldings();
   $('qp-status').textContent = reports.length ? 'Portfolio updated.' : 'Refreshing portfolio. Refresh to try again.';
  } finally { clearTimeout(timer); if (mine === sequence) $('qp-refresh').disabled = false; }
 }
 $('qp-refresh').addEventListener('click', () => { void load(true); void earnings(connectedAddress()); });
 $('qp-search').addEventListener('input', e => { prefs.search = e.target.value; paintHoldings(); });
 for (const [id, key] of [['qp-small', 'hideSmall'], ['qp-spam', 'showSpam']]) $(id).addEventListener('change', e => { prefs[key] = e.target.checked; savePreferences(storage, prefs); paintHoldings(); });
 const walletChanged = () => { void load(); void earnings(connectedAddress()); };
 onWalletChange(walletChanged);
 const stopSol = sol.onSolChange(() => { solPicker(); if (walletKey !== [connectedAddress(), sol.solAddress()].join(':')) walletChanged(); });
 solPicker(); walletChanged();
 return {refresh: () => load(true), dispose() { disposed = true; sequence++; earningsSequence++; aborter?.abort(); stopSol?.(); }};
}
if (typeof document !== 'undefined' && document.getElementById('qp-content')) startPortfolio().catch(() => {
 const line = document.getElementById('qp-status'); if (line) line.textContent = 'Could not load wallet tools. Reload to try again.';
});
