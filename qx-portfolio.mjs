import * as portfolioContext from './qx-portfolio-context.mjs';
import * as portfolioSol from './qx-solana.mjs';
import {mountPortfolioSelling,rowCanSell} from './qx-portfolio-row-trade.mjs';
import {assetPriceFields,priceState} from './qx-price-state.mjs';
import {allocatePortfolioValuation as allocatePortfolioBasis,portfolioPriceFields,portfolioPriceQuarantined,pricingCoverage,PORTFOLIO_PRICE_MAX_MS} from './qx-portfolio-pricing.mjs';
import {bindTokenAvatar,tokenAvatar} from './qx-token-avatar.mjs';
import {portfolioReader,chainReadState,portfolioNeedsRefresh,portfolioBalanceAt} from './qx-portfolio-read.mjs';
import {priceDigits} from './qx-price.mjs'; // one price format sitewide (2026-11-12)
import {profileUrl} from './qx-profile-address.mjs';
import {LIVE} from './chains.mjs';
import {withHoldingPrices} from './qx-portfolio-price-col.mjs'; // ux-pricemc: Price column
import {outsideCosts} from './qx-wallet-pnl.mjs';
import * as T from './qx-portfolio-tabs.mjs';
import {isTestLaunch, orderLaunches} from './qx-test-tag.mjs';
// watch-only addresses (2026-11-18): read-only public addresses merged into the owner's total (qx-portfolio-watch.mjs)
import {mountWatchOnly} from './qx-portfolio-watch.mjs';
const mergeOwnPortfolios = reports => mergePortfolios(reports);

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
// walletpos: the chain's coin and its wrapped form are cash, not a position: their PnL is "—", never "unknown".
const COST_NOTE = {pending: 'Reading this wallet’s buys and sells of this token from the chain.',
 limited: 'This chain’s free endpoint doesn’t serve history this old, so the cost basis isn’t available here.',
 none: 'No buy of this token found in this wallet’s history (received by transfer, or bought with another token).'};
export const cashRow = r => !!r && (r.native === true || (!!r.address && String(r.address).toLowerCase() === String(wrapped[r.chainId] || '').toLowerCase()));
// An unavailable financial value stays neutral; acquisition age is shown by
// the shared status, never substituted for a cost basis or PnL.
export function pnlText(cost, row = null) {
 if (cashRow(row)) return '—';
 if (!cost || !known(cost.pnlQuote)) return '—';
 return (cost.pnlQuote > 0 ? '+' : '') + quantity(cost.pnlQuote) + ' ' + (cost.quoteSymbol || 'unknown') + (known(cost.pnlUsd) ? ' (≈ ' + money(cost.pnlUsd) + ')' : ' (≈ —)');
}
// Personal trade PnL and the token's daily move are independent readings.
export function holdingRowView(row) {
 const pnl=cashRow(row)?null:row.cost?.pnlUsd;
 return {pnl:known(pnl)?(row.cost?.approximate?'≈ ':'')+signedMoney(pnl):'—',
  pnlDirection:known(pnl)?Math.sign(pnl):0,day:percent(row.change24),dayDirection:known(row.change24)?Math.sign(row.change24):0,
  value:money(row.valueUsd),cash:cashRow(row)};
}
export function portfolioReadLabel(at,now=Date.now()) {
 if(!known(at)||at<=0||at>now)return 'Time unavailable';
 const seconds=Math.max(0,Math.floor((now-at)/1000)),age=seconds<60?seconds+'s':seconds<3600?Math.floor(seconds/60)+'m':Math.floor(seconds/3600)+'h';
 return (now-at<30000?'Live · ':'Read · ')+age+' ago';
}
export function portfolioValuationLabel(state,now=Date.now()) {
 if(!state)return 'Time unavailable';
 return pricingCoverage(state,{now}).priceLabel;
}
export function savedPortfolioSnapshot({reader,owner,now=Date.now()}={}) {
 if(!/^0x[\da-f]{40}$/.test(owner||''))return null;
 const report=reader.cached('evm',owner)?.report;if(!report||report.address!==owner)return null;
 const at=portfolioBalanceAt(report);if(!known(at)||at<=0||at>now+5000)return null;
 // An empty, unfinished native-only frame is not evidence of an empty wallet.
 const held=report.chains.some(c=>[c.native,...c.tokens].some(a=>Number(a?.units)>0||Number(a?.balance)>0));
 if(!held&&(report.partial||!report.chains.length||report.chains.some(c=>{const s=chainReadState(c);return s.balances||s.positions;})))return null;
 // Normal verified reads reapply the existing history cache. This display-only
 // preview must not reuse an outside token's old mark-to-market PnL after its
 // price expires; acquisition history itself remains intact.
 for(const chain of report.chains)for(const asset of [chain.native,...chain.tokens])if(asset.cost&&!priceState(asset.priceAt,now).usable)asset.cost={...asset.cost,pnlUsd:null,pnlQuote:null,unrealizedQuote:null,quoteUsd:null};
 return report;
}
const pnlNativeQuote=(native,now=Date.now())=>priceState(native?.priceAt,now).usable&&native.priceAt<=now?native:{...native,priceUsd:null};
export function pnlNativeQuotes(chains,{now=Date.now()}={}) {
 return Object.fromEntries((chains||[]).map(c=>[c.chainId,pnlNativeQuote(c.native,now)]));
}
export function mergePortfolios(reports) {
 reports=reports.map(r=>allocatePortfolioBasis(structuredClone(r)));
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
 const heldReports=reports.filter(p=>(p.chains||[]).some(c=>[c.native,...(c.tokens||[])].some(a=>Number(a?.units)>0||Number(a?.balance)>0)));
 const balanceClocks=(heldReports.length?heldReports:reports).map(portfolioBalanceAt);
 return {chains, rows, valueUsd, change24Usd, coveredUsd, change24: prior > 0 ? change24Usd / prior : null, allocation,
  top: rows.filter(r => !r.spam && r.valueUsd > 0).slice(0, 5), at: balanceClocks.length&&balanceClocks.every(known) ? Math.min(...balanceClocks) : null,
  partial: reports.some(p => p.partial)};
}
export function filterHoldings(rows, {search = '', chain = 'all', hideSmall = true, showSpam = false} = {}) {
 const query = search.trim().toLowerCase();
 return rows.filter(r => (showSpam || !r.spam) && (chain === 'all' || r.chainId === chain)
  && (!hideSmall || r.valueUsd === null || r.valueUsd >= 1)
  && (!query || [r.symbol, r.name, r.address, r.chainName].some(v => String(v || '').toLowerCase().includes(query))));
}
// Read-only disclosure: names/identities remain inspectable even when the holdings filters hide a row.
// This does not reprice, include, unflag or enable actions for any holding.
export function unpricedHoldingDetails(rows,{now=Date.now()}={}) {
 const result=[],seen=new Set();
 for(const [index,row]of (rows||[]).entries()){
  if(!(Number(row?.units)>0||typeof row?.balance==='string'&&/^\d+$/.test(row.balance)&&/[1-9]/.test(row.balance)))continue;
  const chainId=String(row.chainId??'unknown'),address=String(row.address||''),key=chainId+':'+(row.native===true?'native':chainId==='solana'?address:address.toLowerCase()||'unknown-'+index);
  if(seen.has(key))continue;seen.add(key);
  const price=portfolioPriceFields(row,{chainId,now});
  if(known(price.priceUsd)&&price.priceUsd>0&&known(price.priceAt)&&price.priceAt>0&&price.priceAt<=now&&now-price.priceAt<=PORTFOLIO_PRICE_MAX_MS)continue;
  const explicit=String(price.unpricedReason||row.unpricedReason||'').trim();
  const reason=explicit||(!known(row.priceAt)||row.priceAt<=0?'No usable price observation':row.priceAt>now?'Price observation is in the future':now-row.priceAt>PORTFOLIO_PRICE_MAX_MS?'Price observation has expired':'Price unavailable');
  result.push({key,chainId,address,native:row.native===true,name:String(price.displayName||row.displayName||row.symbol||row.name||'Unnamed token').trim()||'Unnamed token',chainName:names[chainId]||row.chainName||chainId,reason,priceAt:row.priceAt??null,
   flags:[...(T.isTestRow(row)?['Test token · subject to Hide tests']:[]),...(price.spam?[String(price.spamReason||'Flagged as spam')]:[])]});
 }
 return result;
}
export function renderUnpricedHoldings(h,items) {
 if(!items?.length)return null;
 const list=items.map(item=>h('li',{'data-unpriced-key':item.key},
  h('strong',{'data-unpriced-name':''},item.name),' · '+item.chainName+' — ',h('span',{'data-unpriced-reason':''},item.reason),
  h('div',{},h('code',{style:'overflow-wrap:anywhere;word-break:break-word'},item.native?'Native asset':item.address||'Identity unavailable')),
  ...item.flags.map(flag=>h('div',{'data-unpriced-flag':''},flag))));
 return h('section',{'data-unpriced-inventory':'','aria-label':'Unpriced holdings',style:'overflow-wrap:anywhere;min-width:0'},
  h('p',{},h('strong',{},items.length+' unpriced holding'+(items.length===1?'':'s'))),
  h('p',{},'Prices unavailable. Holdings hidden by your filters are named here too.'),
  h('ul',{style:'margin:6px 0;padding-left:18px;display:grid;gap:8px'},...list));
}

export function readPreferences(storage) {
 try { const p = JSON.parse(storage.getItem('qhooks:portfolio') || '{}'); return {hideSmall: p.hideSmall !== false, showSpam: p.showSpam === true}; }
 catch { return {hideSmall: true, showSpam: false}; }
}
export function savePreferences(storage, value) { try { storage.setItem('qhooks:portfolio', JSON.stringify({hideSmall: value.hideSmall, showSpam: value.showSpam})); } catch { /* Private browsing still works. */ } }

// Token art (System A): QHooks launches carry their profile image from the live feed, native coins their chain's mark,
// everything else a lettered coin tinted from its address. Every coin wears its chain as a small badge.
const CHAIN_ICON = {'8453': 'base', '4663': 'robinhood', '1': 'ethereum', '42161': 'arbitrum', '56': 'bnb', '5042': 'arc', '99901': 'elysium', '143': 'monad', solana: 'solana'};
export const chainIcon = id => CHAIN_ICON[id] ? '/chain-symbol-icons/' + CHAIN_ICON[id] + '.svg' : null;
export const marketKey = (chainId, address) => String(chainId) + ':' + (String(chainId)==='solana'?String(address||''):String(address||'').toLowerCase());
// Feed logos may be absolute on qhooks.com; the page reads them from its own origin.
export const sameOrigin = url => typeof url === 'string' && url ? url.replace(/^https:\/\/qhooks\.com(?=\/)/, '') : null;
const SUB = '₀₁₂₃₄₅₆₇₈₉';
// Long zero runs read as a subscript count: $0.0₃6362.
export const priceText = n => {
 if (!known(n) || n <= 0) return money(n);
 return '$' + priceDigits(n); // the site's one price format (qx-price.mjs)
};
export function liveFeed(markets,{previous,now=Date.now()}={}) {
 const map = new Map([...(previous||[])].filter(([,v])=>known(v.priceAt)&&v.priceAt<=now&&now-v.priceAt<=PORTFOLIO_PRICE_MAX_MS));
 for (const m of Array.isArray(markets) ? markets : []) {
  if (!m || !m.chainId || !m.controller) continue;
  const s = portfolioPriceFields(m.summary||{},{chainId:m.chainId,token:m.token||m.controller,at:m.priceAt??m.observedAt??(m.summary?.lastTradeAt?m.summary.lastTradeAt*1000:null),now}), entry = {token:m.token||m.controller,chainId:String(m.chainId),controller:m.controller,priceAt:s.priceAt,priceSource:s.priceSource,pricePoolId:s.pricePoolId,pricesRefreshing:s.pricesRefreshing,priceUsd: known(s.priceUsd) && s.priceUsd > 0 ? s.priceUsd : null, change24: known(s.change24) ? s.change24 : null, logo: sameOrigin(tokenAvatar(m).src)};
  for(const id of [m.controller,m.token].filter(Boolean)){const key=marketKey(m.chainId,id),prior=map.get(key);if(!prior||known(entry.priceUsd)&&(!known(prior.priceUsd)||(entry.priceAt||0)>=(prior.priceAt||0)))map.set(key,entry);}
 }
 return map;
}
// Reprices QHooks launch rows from live trade prices. Returns the rows whose value moved and the total move in USD.
export function applyLive(state, feed) {
 const moved = [], covered = {out: 0, in: 0, priorOut: 0, priorIn: 0}; let delta = 0, logos = false;
 if (!state || !feed) return {moved, delta, logos};
 for (const r of state.rows) {
  if (!(r.units > 0) || r.native || portfolioPriceQuarantined(r,{chainId:r.chainId,token:r.address})) continue;
  const m = feed.get(marketKey(r.qhooks?.chainId || r.chainId, r.qhooks?.controller || r.address)) || feed.get(marketKey(r.chainId, r.address));
  if (!m || m.token&&marketKey(r.chainId,m.token)!==marketKey(r.chainId,r.address)||m.chainId&&String(m.chainId)!==String(r.chainId)) continue;
  if (m.logo && r.logo !== m.logo) { r.logo = m.logo; logos = true; }
  if(!known(m.priceUsd)||!known(m.priceAt)||m.priceAt>Date.now()||Date.now()-m.priceAt>PORTFOLIO_PRICE_MAX_MS||(r.priceAt||0)>(m.priceAt||0))continue;
  const fresh=priceState(m.priceAt).usable;
  Object.assign(r,{priceAt:m.priceAt,priceSource:m.priceSource,pricePoolId:m.pricePoolId,pricesRefreshing:priceState(m.priceAt).refreshing||!!m.pricesRefreshing,...(!fresh?{priceStatus:'last-known',lastKnownPriceUsd:m.priceUsd,lastKnownPriceAt:m.priceAt,lastKnownPriceSource:m.priceSource,lastKnownPricePoolId:m.pricePoolId}:{})});
  if(!fresh){r.change24=null;r.changeAt=null;}
  if(!fresh&&r.cost)r.cost={...r.cost,pnlUsd:null,pnlQuote:null,unrealizedQuote:null,quoteUsd:null};
  if(m.priceUsd===r.priceUsd)continue;
  const had = known(r.valueUsd), before = had ? r.valueUsd : 0, after = r.units * m.priceUsd, d = after - before;
  const oldChg = had && known(r.change24) ? r.change24 : null, newChg = !fresh?null:known(m.change24) ? m.change24 : oldChg;
  r.dir = known(r.priceUsd) ? Math.sign(m.priceUsd - r.priceUsd) : 0; r.priceUsd = m.priceUsd; r.valueUsd = after; r.change24 = newChg;
  if (fresh && had && r.cost && known(r.cost.pnlUsd)) {
   const quoteUsd = r.cost.quoteUsd > 0 ? r.cost.quoteUsd : known(r.cost.pnlQuote) && r.cost.pnlQuote !== 0 ? r.cost.pnlUsd / r.cost.pnlQuote : null;
   r.cost = {...r.cost, pnlUsd: r.cost.pnlUsd + d, pnlQuote: quoteUsd ? r.cost.pnlQuote + d / quoteUsd : r.cost.pnlQuote, unrealizedQuote: quoteUsd && known(r.cost.unrealizedQuote) ? r.cost.unrealizedQuote + d / quoteUsd : r.cost.unrealizedQuote};
  }
  moved.push(r);
  if (r.spam) continue;
  delta += d;
  const slot = state.allocation?.find(c => c.chainId === r.chainId); if (slot) slot.valueUsd = (known(slot.valueUsd) ? slot.valueUsd : 0) + d;
  // The 24h line stays exact: each holding's value 24h ago is its value now over (1 + its 24h change).
  const priorOld = oldChg !== null && oldChg > -1 ? before / (1 + oldChg) : null, priorNew = newChg !== null && newChg > -1 ? after / (1 + newChg) : null;
  covered.out += priorOld !== null ? before : 0; covered.in += priorNew !== null ? after : 0;
  covered.priorOut += priorOld ?? 0; covered.priorIn += priorNew ?? 0;
 }
 if (moved.length && delta) {
  const prior = known(state.coveredUsd) && known(state.change24Usd) ? state.coveredUsd - state.change24Usd : 0;
  const coveredNow = (known(state.coveredUsd) ? state.coveredUsd : 0) - covered.out + covered.in, priorNow = prior - covered.priorOut + covered.priorIn;
  state.valueUsd = (known(state.valueUsd) ? state.valueUsd : 0) + delta;
  if (coveredNow > 0 && priorNow > 0 && (known(state.change24Usd) || !known(state.coveredUsd))) { state.coveredUsd = coveredNow; state.change24Usd = coveredNow - priorNow; state.change24 = state.change24Usd / priorNow; }
  state.top = state.rows.filter(r => !r.spam && r.valueUsd > 0).sort((a, b) => b.valueUsd - a.valueUsd).slice(0, 5);
 }
 return {moved, delta, logos};
}
// QHooks launches only: tokens bought elsewhere carry a cost too since walletpnl (2026-11-12), and this line says "on QHooks trades".
export const qhooksPnl = rows => sumKnown(rows.filter(r => !r.spam && r.cost && r.qhooks).map(r => r.cost.pnlUsd));


// ---------- Portfolio v6 page (2026-11-13) ----------
// Header: total value across chains with the chain bar, Your PnL (Today / All), Realized · Unrealized · Creator fees.
// Tabs: Holding (the reading's rows), Closed (realized QHooks-market positions), Created (your launches and their creator
// fees), Staked & locked (launch-module stakes and QHOOKS timed locks). Data and rules: qx-portfolio-tabs.mjs.
// /portfolio?wallet=0x… views any wallet read-only: no connection, no Sell, no Claim.
// balances on a row: compact above a million (19.81M); the exact figure is the row's title
const units = n => known(n) && Math.abs(n) >= 1e6 ? new Intl.NumberFormat('en-US', {notation: 'compact', maximumFractionDigits: 2}).format(n) : quantity(n);
// row PnL: whole dollars from $1,000 and whole percents from 100% (the exact figure is in the row's title), so the avg fits
const rowPnl = (r, v) => { const n = r.cost?.pnlUsd; return known(n) && Math.abs(n) >= 1000 && !v.cash ? (r.cost.approximate ? '≈ ' : '') + (n > 0 ? '+' : '-') + '$' + Math.round(Math.abs(n)).toLocaleString('en-US') : v.pnl; };
const rowPct = p => Math.abs(p) >= 1 ? (p > 0 ? '+' : '-') + Math.round(Math.abs(p) * 100) + '%' : percent(p);
const TABS = [['holding', 'Holding'], ['closed', 'Closed'], ['created', 'Created'], ['staked', 'Staked & locked']];
const COLS = {holding: ['Token', 'Price · 24h', 'Value', 'Your PnL', ''], closed: ['Token', 'Last trade', 'Realized', '', ''],
 created: ['Your launch', 'Pool', 'Creator fees waiting', '', ''], staked: ['Position', 'Unlock', 'Value', '', '']};
const retry = async (fn, tries = 2, wait = 700) => { let e; for (let i = 0; i < tries; i++) { try { return await fn(); } catch (x) { e = x; if (i < tries - 1) await new Promise(r => setTimeout(r, wait)); } } throw e; };

export function holdingArt(h, r, size = '') {
  const letter = String(r.symbol || '').trim().charAt(0).toUpperCase();
  const coin = h('span', {class: 'qp-art' + (size ? ' qp-art--' + size : '') + (r.wallet ? ' qp-art--wallet' : ''), 'data-letter': letter, 'aria-hidden': 'true'});
  const a = String(r.address || ''), x = parseInt(a.slice(2, 6), 16) || 7, y = parseInt(a.slice(6, 10), 16) || 3, hue = x % 360;
  const pal = [['#e8c88c','#2a1d0e'],['#d2ad72','#14110c'],['#f1e7d0','#4a3418'],['#b98d4e','#0d0c0a'],['#9a7a4a','#1b1a17'],['#ece2cc','#2b241a']][(hue + y) % 6]; coin.style?.setProperty?.('--a1', pal[0]); coin.style?.setProperty?.('--a2', pal[1]);
  // Fixed chain marks are local SVGs; token-profile image validation intentionally excludes those.
  const nativeIcon = cashRow(r) ? chainIcon(r.chainId) : null;
  if (nativeIcon) coin.append(h('img', {src: nativeIcon, alt: '', decoding: 'async', onerror: e => e.currentTarget.remove()}));
  else if (!r.native && tokenAvatar(r).src) {
   const img = h('img', {alt: '', decoding: 'async', hidden: ''});
   coin.append(img); bindTokenAvatar(img, r);
  }
  if (!cashRow(r) && !r.wallet && chainIcon(r.chainId)) coin.append(h('img', {class: 'qp-art__chain', src: chainIcon(r.chainId), alt: ''}));
  return coin;
 }

export function groupNativeEther(rows,{chain='all'}={}) {
 const eth=rows.filter(r=>r.native&&r.symbol==='ETH');
 if(chain!=='all'||eth.length<2)return rows.map(row=>({row}));
 const group={rows:eth,units:eth.reduce((n,r)=>n+r.units,0),valueUsd:sumKnown(eth.map(r=>r.valueUsd)),partial:eth.some(r=>!known(r.valueUsd))};
 let added=false;return rows.flatMap(row=>{if(!eth.includes(row))return [{row}];if(added)return [];added=true;return [group];});
}
export function renderHoldingRows(rows,options={}) { // ux-pricemc: every holding row gets its Price cell
 return withHoldingPrices(holdingRowNodes(rows,options),rows,{h:options.h,key:r=>marketKey(r.chainId,r.address)});
}
function holdingRowNodes(rows,options={}) {
 return groupNativeEther(rows,options).map(item=>{
  if(item.row)return renderHoldingRow(item.row,options);
  const {h}=options,details=h('details',{class:'pf-eth-group',role:'listitem'}),summary=h('summary',{class:'pf-holding pf-eth-summary'},
   holdingArt(h,{native:true,symbol:'ETH',chainId:'1'}),h('div',{class:'pf-holding__name'},h('b',{},'ETH'),h('span',{},'all chains')),
   h('div',{class:'pf-holding__value'},money(item.valueUsd),h('small',{},item.partial?'Partial value':quantity(item.units)+' ETH')),
   h('span',{class:'pf-holding__basis'},item.rows.length+' chains'),h('span',{class:'pf-holding__actions'},'Expand ⌄'));
  details.append(summary,h('div',{class:'pf-eth-children'},...item.rows.map(row=>renderHoldingRow(row,options))));return details;
 });
}
export function renderHoldingRow(r,{h,natives={},owner=null,mine=false,readonly=false,chain='all',onSell}={}) {
 readonly = readonly || !!r.watch;
 const v=holdingRowView(r),split=T.rowCost(r,pnlNativeQuote(natives[r.chainId])),canSell=!readonly&&mine&&!v.cash&&rowCanSell(r,owner),pnlCls=v.pnlDirection>0?' qp-positive':v.pnlDirection<0?' qp-negative':'';
 const metadata=h('details',{class:'pf-holding__details'},h('summary',{},r.priceLabel==='on curve'?'on curve':r.chainName||names[r.chainId]||r.chainId),h('p',{},priceText(r.priceUsd)+' · '+percent(r.change24)+' 24h · '+(r.chainName||r.chainId)+(r.priceStatus==='last-known'?' · Cached · '+portfolioReadLabel(r.priceAt).replace(/^(Live|Read) · /,''):r.pricesRefreshing?' · Price update pending':'')));
 return h('article',{class:'pf6-row pf-holding'+(v.cash?' is-cash':'')+(r.spam?' is-spam':''),role:'listitem','data-key':marketKey(r.chainId,r.address)},holdingArt(h,r),
  h('div',{class:'pf-holding__name'},h('a',{href:tradeHref(r),'aria-label':'Open '+(r.symbol||'token')},h('b',{},r.symbol||'unknown')),h('span',{title:quantity(r.units)},units(r.units))),
  h('div',{class:'pf-holding__value'},known(r.valueUsd)?v.value:h('span',{class:'pf-holding__refreshing'},'Price unavailable'),h('small',{class:pnlCls,title:pnlText(r.cost,r)},v.cash?'':rowPnl(r,v)+(known(split.pnlPct)?' · '+rowPct(split.pnlPct):''))),
  h('div',{class:'pf-holding__basis'},known(split.avgEntryUsd)?h('span',{title:'Approximate average entry; quote valued at its current USD price'},'avg ≈ '+T.smallPrice(split.avgEntryUsd)):null,metadata),
  h('div',{class:'pf-holding__actions'},...(canSell?[25,50,100].map(percent=>h('button',{type:'button',class:'pf-holding__sell','aria-label':'Sell '+percent+'% '+r.symbol,onclick:event=>onSell?.(r,percent,event.currentTarget)},String(percent))):!readonly&&(v.cash||mine)?[h('a',{href:tradeHref(r),class:'pf-holding__trade'},'Trade')]:[])));
}

export async function startPortfolio({document = globalThis.document, fetchImpl = globalThis.fetch,
 loadChain = () => Promise.resolve(portfolioContext), loadWallet = () => import('/qx-account-wallet.mjs'),
 loadSol = () => Promise.resolve(portfolioSol), loadEarningsModule = () => import('/qx-earnings.mjs'),
 storage = (() => { try { return globalThis.localStorage; } catch { return null; } })(), clipboard = globalThis.navigator?.clipboard,
 loadFeed = ({signal}={}) => fetchImpl('/api/terminal/feed?chain=all', {cache: 'no-store',signal}).then(r => r.ok ? r.json() : null), liveMs = 25000,
 costs = outsideCosts(), view = T.viewWallet(globalThis.location?.search),
 loadStakeLocks = defaultStakeLocks, initialTab = (() => { try { return new URLSearchParams(globalThis.location?.search || '').get('tab'); } catch { return null; } })()} = {}) {
 const $ = id => document.getElementById(id);
 const reader=portfolioReader({fetchImpl,storage});
 const root = $('qp-content'); if (!root) return;
 let disposed=false,walletReady=false,walletFlight=null,connectIntent=null;
 const walletTools=()=>walletFlight??=Promise.resolve().then(loadWallet).then(module=>{walletReady=true;return module;},error=>{walletFlight=null;throw error;});
 // Preserve a tap made while the Connect wiring is still loading. Reuse that
 // import, and open the standard chooser exactly once after it is ready.
 const earlyConnect=event=>{const target=event.target?.closest?.('[data-qa-connect]');if(walletReady||!target)return;
  event.preventDefault();event.stopImmediatePropagation();if(connectIntent)return;
  const label=target.textContent;target.textContent='Opening wallet…';target.setAttribute('aria-busy','true');$('qp-status').textContent='Opening wallet…';
  connectIntent=walletTools().then(module=>{if(disposed)return;if(typeof module.openWallet!=='function')throw Error('Wallet chooser unavailable');target.textContent=label;$('qp-status').textContent='';module.openWallet();})
   .catch(()=>{if(disposed)return;target.textContent='Retry Connect';target.title='Wallet tools could not load. Tap to retry.';$('qp-status').textContent='Wallet tools could not load. Tap Connect to retry.';})
   .finally(()=>{target.removeAttribute('aria-busy');connectIntent=null;});
 };
 document.addEventListener('click',earlyConnect,true);
 // Paint a working connect prompt before loading the heavier earnings and wallet code.
 const [chain, sol] = await Promise.all([loadChain(), loadSol()]);
 if (!view) void walletTools().catch(() => {}); // Connect wiring must not delay cached/read-only holdings.
 const {h, connectedAddress, onWalletChange, savedPortfolioAddress=portfolioContext.savedPortfolioAddress} = chain;
 let sequence = 0, earningsSequence = 0, current = null, aborter = null, walletKey = '',savedPreview=null;
 const viewingLabel=$('qp-viewing')?.textContent;
 const prefs = {...readPreferences(storage), search: '', chain: 'all', hideTest: readHideTest(storage), period: readPeriod(storage)};
 let tab = TABS.some(([k]) => k === initialTab) ? initialTab : 'holding';
 // Extras per wallet: Closed (wallet card), Created (launches + income), Staked (module stakes + timed locks). Last good kept.
 const extra = {owner: '', closed: null, closedState: 'idle', launches: null, incomes: new Map(), createdState: 'idle', stakes: null, locks: null, stakedState: 'idle', earnState: 'idle'};
 let extraSequence = 0;
 const set = (id, prop, v) => { const el = $(id); if (el) el[prop] = v; };
 set('qp-small', 'checked', prefs.hideSmall); set('qp-spam', 'checked', prefs.showSpam); set('qp-test', 'checked', prefs.hideTest);
 const me = () => view || connectedAddress();
 const own = () => !view && !!connectedAddress();
 const seller=mountPortfolioSelling({h,getOwner:()=>own()?me():null,fetchImpl});
 const button = (label, onclick, attrs = {}) => h('button', {type: 'button', class: 'qa-btn', onclick, ...attrs}, label);
 const copyButton = address => button('Copy', async e => {
  const b = e.currentTarget;
  try { await clipboard.writeText(address); b.textContent = 'Copied'; }
  catch { b.textContent = 'Select address'; }
 }, {'aria-label': 'Copy wallet address'});
 const short = a => a.length > 14 ? a.slice(0, 6) + '…' + a.slice(-4) : a;
 const walletOptions=h('details',{class:'pf-wallet-options'},h('summary',{},'Wallets'));if($('qp-wallets'))walletOptions.append($('qp-wallets'));
 function addresses(evm, solana,{saved=false}={}) {
  $('qp-addresses')?.replaceChildren(...[evm, solana].filter(Boolean).map(a => h('div', {class: 'qp-address'}, art({symbol: a === solana ? 'S' : '', address: a, wallet: true}), h('span', {class: 'qp-addr', title: a}, short(a)), copyButton(a),
   view||saved ? null : h('a', {class: 'qa-btn', href: profileUrl({wallet:a===solana?'solana:'+a:a,edit:true})}, 'Edit profile'))),...(saved?[button('Connect wallet',null,{'data-qa-connect':''})]:view?[]:[walletOptions]));
  const chip = $('qp-viewing'); if (chip) {chip.hidden = !view&&!saved;chip.textContent=saved?'Saved wallet · read only':viewingLabel;}
 }
 // Token art: the token's own art when it has one, else a lettered tile tinted from its address, with its chain as a badge.
 const art=(r,size='')=>holdingArt(h,r,size);
 const chainBadge = id => h('span', {class: 'pf6-chain'}, names[id] || String(id));
 const logoOf = (chainId, address) => sameOrigin(feed?.get(marketKey(chainId, address))?.logo) || current?.rows.find(r => r.chainId === String(chainId) && (String(r.address).toLowerCase() === String(address).toLowerCase() || String(r.qhooks?.controller || '').toLowerCase() === String(address).toLowerCase()))?.logo || null;
 function solPicker() {
  if (view) { $('qp-wallets')?.replaceChildren(); return; }
  const wallets = sol.solWallets(), address = sol.solAddress();
  const detail = h('details', {}, h('summary', {}, address ? 'Solana wallet connected' : 'Add a Solana wallet'));
  detail.append(h('div', {class: 'qp-sol-options'}, ...(wallets.length ? wallets.map(w => button(w.name, async e => {
   e.currentTarget.disabled = true;
   try { await sol.connectSol(w.name); $('qp-status').textContent = ''; }
   catch { $('qp-status').textContent = 'Could not connect the Solana wallet. Try again.'; }
   finally { e.currentTarget.disabled = false; }
  })) : [h('p', {}, 'Open this page in a Solana wallet browser, or enable your wallet extension.')] )));
  // watch-only: #qp-wallets lives in the detached Wallets disclosure until addresses() attaches it, so look there first
  // (getElementById alone missed it on first paint and the disclosure opened empty).
  (walletOptions.querySelector?.('#qp-wallets')||$('qp-wallets'))?.replaceChildren(h('span', {}, 'Base · Ethereum · Arbitrum · BNB · Robinhood'), detail, watch.panel);
 }
 function skeleton() {
  $('qp-total').textContent = '—'; $('qp-total').classList.add('qp-skeleton');
  $('qp-at').textContent = 'Reading balances…';
  $('qp-overview')?.setAttribute('aria-busy', 'true');
  for (const id of ['qp-allocation', 'qp-holdings']) $(id)?.replaceChildren(h('div', {class: 'qp-loading-lines', 'aria-hidden': 'true'}, ...[1, 2, 3].map(() => h('span', {class: 'qp-skeleton'}))));
  $('qp-notes').replaceChildren(); $('qp-count').textContent = '';
  paintPnl();
 }
 const natives = () => pnlNativeQuotes(current?.chains);
 // ---------- header ----------
 function shownValue() {
  if (!current || prefs.chain === 'all') return current?.valueUsd ?? null;
  return sumKnown(current.rows.filter(r => r.chainId === prefs.chain && !r.spam).map(r => r.valueUsd));
 }
 function paintHeroValue(dir = 0, failed = []) {
  const pick = prefs.chain !== 'all' && current?.allocation.find(c => c.chainId === prefs.chain);
  paintTotal(shownValue(), dir);
  $('qp-value-label').textContent = pick ? 'Value on ' + pick.name : 'Total value · all chains'; // "partial" lives in the one status line
  // headertotal (held in its own tree): the header follows this list's own total while it's on screen; EVM wallet only.
  const me = !view && connectedAddress?.(); // (shadows the page's me(): the header follows the connected wallet only)
  if (me && !sol.solAddress() && Number.isFinite(current?.valueUsd)) globalThis.dispatchEvent?.(new CustomEvent('qhooks:portfolio-total', {detail: {owner: me, valueUsd: current.valueUsd, partial: !!current.partial,pricingCoverage:pricingCoverage(current)}}));
 }
 // The balance: whole dollars large, cents small; a live price move flashes it green or red once.
 function paintTotal(value, dir) {
  const el = $('qp-total'), text = money(value), cut = text.lastIndexOf('.');
  if (cut > 0 && /^\.\d{2}$/.test(text.slice(cut))) el.replaceChildren(text.slice(0, cut), h('small', {}, text.slice(cut))); else el.textContent = text;
  if (dir && el.classList) { el.classList.remove('is-up', 'is-down'); el.classList.add(dir > 0 ? 'is-up' : 'is-down'); setTimeout(() => el.classList.remove('is-up', 'is-down'), 1100); }
 }
 function paintAllocation() {
  const m = current, bar = h('div', {class: 'qp-bar', 'aria-hidden': 'true'}), legend = h('p', {class: 'pf6-split__legend'});
  for (const [i, c] of [...m.allocation].sort((a, b) => (b.valueUsd ?? -1) - (a.valueUsd ?? -1)).entries()) {
   const pct = m.valueUsd > 0 && known(c.valueUsd) ? c.valueUsd / m.valueUsd * 100 : null;
   if (!(pct > 0)) continue;
   const seg = h('span', {class: 'qp-segment qp-tone-' + i % 6}); if (seg.style) seg.style.width = pct + '%'; bar.append(seg);
   if (pct >= 0.5) legend.append(h('span', {}, h('i', {class: 'qp-tone-' + i % 6}), c.name + ' ', h('b', {}, money(c.valueUsd))));
  }
  $('qp-allocation').replaceChildren(bar,h('details',{class:'pf-chain-split'},h('summary',{},'Chain split'),legend));
 }
 const summary = () => T.pnlSummary({rows: current?.rows || [], natives: natives(), closed: extra.closed, change24Usd: current?.change24Usd ?? null, partial: !!current?.partial});
 function paintPnl() {
  const v = $('qp-pnl'), note = $('qp-pnl-note'), stats = $('qp-stats'); if (!v) return;
  const s = current ? summary() : null, loading = !current || extra.closedState === 'loading' || current.rows.some(r => r.costState === 'pending');
  const fig = s?.unrealized ?? null;
  set('qp-pnl-label', 'textContent', 'Unrealized PnL');if($('qp-period'))$('qp-period').hidden=true;
  v.className = 'pf6-pnl__v' + (known(fig) ? fig > 0 ? ' qp-positive' : fig < 0 ? ' qp-negative' : '' : ' is-wait');
  v.textContent = known(fig) ? '≈ '+signedMoney(fig) : '—';
  if (note) note.textContent = !s ? '' : !known(fig) ? 'Cost basis is not available for this reading.' : 'Cost known for '+s.allCovered+' of '+s.allCounted+' positions';
  for (const b of $('qp-period')?.children || []) b.setAttribute?.('aria-pressed', String(b.dataset?.p === prefs.period));
  if (!stats) return;
  const fees = T.creatorFeesUsd([...extra.incomes.values()], natives());
  const cell = (label, value, wait) => known(value) ? h('div', {}, h('dt', {}, label), h('dd', {}, (label.startsWith('Creator fees') ? money(value) : (label==='Realized · all'?'≈ ':'')+signedMoney(value))))
   : wait ? h('div', {}, h('dt', {}, label), h('dd', {class: 'is-wait',title:'Value is not available for this reading.'}, '—')) : null;
  stats.replaceChildren(...[h('div',{title:'Realized PnL for today is unavailable.'},h('dt',{},'Realized today'),h('dd',{},'—')),cell('Realized · all', s?.realized ?? null, loading),
   cell('Creator fees · pool total',fees,extra.createdState==='loading'||extra.createdState==='idle')].filter(Boolean));
 }
 function paintNotes(failed = []) {
  const m = current, notes = [...failed];
  for (const c of m.chains) {
   const state=chainReadState(c),code=c.error,name=chainName(c),chainCoverage=pricingCoverage({chains:[c],progress:m.progress});
   if(c.balancesRefreshing&&!code)notes.push(name+': balance coverage incomplete');
   if(c.pricesRefreshing&&!code&&chainCoverage.pricedCount&&!chainCoverage.priceLive)notes.push(name+': using available dated prices');
   if (code) notes.push(name + ': ' + ({balances_unavailable: 'balance coverage incomplete', prices_unavailable: 'some prices unavailable', prices_refreshing: 'price coverage incomplete', index_unavailable: 'indexed positions unavailable', metadata_unavailable: 'some token details unavailable', token_limit: 'more tokens may be held than this reading includes', metadata_limit: 'some token balances have unknown units'}[code] || 'some data unavailable'));
   if (c.source === 'index-only' && c.chainId !== 'solana') notes.push(name + ': native balance and indexed QHooks tokens only');
  }
  const coverage=pricingCoverage(m),unpriced=unpricedHoldingDetails(m.rows);
  if(coverage.unpriced)notes.push(coverage.unpriced+' unpriced token'+(coverage.unpriced===1?'':'s')+' excluded from the total.');
  if(coverage.cachedPrices)notes.push('Cached prices for '+coverage.cachedPrices+' token'+(coverage.cachedPrices===1?'':'s')+' · '+portfolioReadLabel(coverage.observedAt)+'.');
  // one line per message: "Base, Robinhood: Refreshing prices" instead of a line per chain
  const grouped = new Map();
  for (const t of notes) { const i = t.indexOf(': '), k = i > 0 ? t.slice(i + 2) : '\u0000' + t; if (!grouped.has(k)) grouped.set(k, []); if (i > 0) grouped.get(k).push(t.slice(0, i)); }
  $('qp-notes').replaceChildren(...[...[...grouped].map(([k, who]) => h('p', {}, k.startsWith('\u0000') ? k.slice(1) : who.join(', ') + ': ' + k)),renderUnpricedHoldings(h,unpriced)].filter(Boolean));
  // one status line: the per-chain detail folds behind "Some chains refreshing" (partial reading said there, not in the label)
  const more = $('qp-more'), sep = $('qp-more-sep'), busy = m.chains.some(c => c.error) || failed.length;
  if (more) { more.hidden = !notes.length&&!unpriced.length; more.textContent = coverage.liquidUnpriced?coverage.label:unpriced.length?unpriced.length+' other unpriced holding'+(unpriced.length===1?'':'s')+' · Details':coverage.balanceError||coverage.transportTimedOut||failed.length?'Partial · details':'Details'; }
  if (sep) sep.hidden = !notes.length&&!unpriced.length;
  if (!notes.length&&!unpriced.length) { const box = $('qp-notes'); if (box) box.hidden = true; more?.setAttribute('aria-expanded', 'false'); }
 }
 function paintOverview(failed = []) {
  $('qp-total').classList.remove('qp-skeleton'); paintHeroValue(0, failed);
  paintReadAge();
  $('qp-overview')?.setAttribute('aria-busy', 'false');
  paintAllocation(); paintPnl(); paintNotes(failed); watch.paint(current); // watch-only: incl. N watched + per-address notes
 }
 // ---------- tabs ----------
 function counts() {
  return {holding: current ? T.filterRows(current.rows, {...prefs, chain: 'all', search: ''}).length : null, closed: extra.closed ? extra.closed.filter(p => !prefs.hideTest || !p.test).length : null,
   created: extra.launches ? extra.launches.filter(L => !prefs.hideTest || !isTestLaunch(L)).length : null, staked: extra.stakes && extra.locks ? extra.stakes.length + extra.locks.length : null};
 }
 function paintTabs() {
  const n = counts();
  $('qp-tabs')?.replaceChildren(...TABS.map(([k, label]) => h('button', {type: 'button', role: 'tab', class: 'qa-tab' + (k === tab ? ' is-on' : ''), 'aria-selected': String(k === tab), 'data-tab': k,
   onclick: () => { if (tab === k) return; tab = k; paintTabs(); paintList(); if (k === 'staked') void loadStaked(); }}, label, known(n[k]) ? h('small', {}, String(n[k])) : null)));
  for (const [k] of TABS) { const pane = $('qp-' + (k === 'holding' ? 'holdings' : k)); if (pane) pane.hidden = k !== tab; }
  const filters = $('qp-filters'); if (filters) filters.hidden = tab !== 'holding';
  if (tab !== 'holding') $('qp-count').textContent = '';
  $('qp-cols')?.replaceChildren(...COLS[tab].map(t => h('span', {}, t)));
 }
 function paintList() { if (tab === 'holding') paintHoldings(); else if (tab === 'closed') paintClosed(); else if (tab === 'created') paintCreated(); else paintStaked(); }
 const pending = (text, again) => h('p', {class: 'qa-empty pf6-wait'}, text, again ? ' ' : null, again ? button('Retry', again, {class: 'qa-btn qa-btn--quiet'}) : null);
 function paintHoldings() {
  if (!current) return;
  const rows = T.filterRows(current.rows, prefs), nat = natives(), owner = me(), mine = own();
  $('qp-count').textContent = tab === 'holding' ? rows.length + (rows.length === 1 ? ' holding shown' : ' holdings shown') : '';
  $('qp-holdings').replaceChildren(...(rows.length ? watch.rows(rows,list=>renderHoldingRows(list,{h,natives:nat,owner,mine,readonly:!!savedPreview,chain:prefs.chain,onSell:(row,p,trigger)=>seller.begin(row,p,trigger)}),{natives:nat}) : [h('p', {class: 'qa-empty'}, current.rows.length ? 'No holdings match these filters.' : 'No holdings found in this reading.')]));
  if(!savedPreview)seller.attach($('qp-holdings'));
 }
 function paintClosed() {
  const box = $('qp-closed'); if (!box) return;
  if (!extra.closed) { box.replaceChildren(pending(extra.closedState === 'failed' ? 'Closed positions are refreshing.' : 'Reading closed positions…', extra.closedState === 'failed' ? () => void loadClosed(true) : null)); return; }
  const rows = extra.closed.filter(p => !prefs.hideTest || !p.test);
  box.replaceChildren(...(extra.closedState === 'failed' ? [pending('Closed positions are refreshing.', () => void loadClosed(true))] : []), h('p', {class: 'pf6-group'}, 'Positions you closed on QHooks markets'), ...(rows.length ? rows.map(p => {
   const href = '/terminal#m=' + p.chainId + ':' + p.controller;
   return h('article', {class: 'pf6-row', role: 'listitem'}, art({symbol: p.symbol, address: p.controller, chainId: p.chainId, logo: logoOf(p.chainId, p.controller)}),
    h('div', {class: 'pf6-name'}, h('a', {class: 'qp-open-token', href, 'aria-label': 'Open ' + (p.symbol || 'token')}, h('b', {}, p.symbol || 'unknown')), chainBadge(p.chainId), p.test ? h('span', {class: 'pf6-tag'}, 'Test') : null),
    h('div', {class: 'pf6-sub'}, p.trades + (p.trades === 1 ? ' trade' : ' trades')),
    h('div', {class: 'pf6-meta'}, T.ago(p.lastAt) ? 'Last trade ' + T.ago(p.lastAt) : ''),
    h('div', {class: 'pf6-val' + (p.realizedUsd > 0 ? ' qp-positive' : p.realizedUsd < 0 ? ' qp-negative' : '')}, known(p.realizedUsd) ? signedMoney(p.realizedUsd) : '—'),
    h('div', {class: 'pf6-pl pf6-dim'}, 'Realized'),
    h('div', {class: 'pf6-act'}, h('a', {class: 'qa-btn pf6-quiet', href}, 'Trade')));
  }) : [h('p', {class: 'qa-empty'}, 'No closed positions on QHooks markets yet.')]));
 }
 function paintCreated() {
  const box = $('qp-created'); if (!box) return;
  if (!extra.launches) { box.replaceChildren(pending(extra.createdState === 'failed' ? 'Your launches are refreshing.' : 'Reading your launches…', extra.createdState === 'failed' ? () => void earnings(me(), true) : null)); return; }
  const nat = natives(), mine = own(), owner = me(), context = extraSequence;
  const list = orderLaunches(extra.launches).filter(L => !prefs.hideTest || !isTestLaunch(L));
  box.replaceChildren(...(extra.createdState === 'failed' ? [pending('Your launches are refreshing.', () => void earnings(me(), true))] : []), ...(list.length ? list.map(L => {
   const inc = extra.incomes.get(L.chainId + ':' + L.controller), usd = T.createdUsd(inc, nat), status = h('p', {class: 'qa-status pf6-status', role: 'status'});
   const claim = mine && L.open && inc && (inc.quoteRaw > 0n || inc.tokenRaw > 0n) ? h('button', {type: 'button', class: 'qa-btn pf6-claim', title: 'Pays the waiting creator fees out to every payee of this launch',
    onclick: async e => {
     const b = e.currentTarget, assertContext = () => { if (disposed || !own() || me() !== owner || context !== extraSequence) throw Error('Your wallet changed. Review this action again.'); };
     b.disabled = true;
     try { assertContext(); const shared = await loadEarningsModule(); assertContext(); await shared.payOutLaunch(L, t => { status.textContent = t; }, assertContext); status.textContent = 'Done.'; setTimeout(() => { if (!disposed && me() === owner && context === extraSequence) void earnings(owner, true); }, 600); }
     catch (x) { status.textContent = /reject|denied|cancel/i.test(x?.message || '') ? 'Cancelled in your wallet. Nothing was sent.' : x?.message || 'That did not go through.'; b.disabled = false; }
    }}, 'Claim') : null;
   const waiting = inc === undefined ? 'Reading creator fees…' : inc === null ? L.open ? h('span', {}, 'Creator fees are refreshing. ', button('Retry', () => void earnings(me(), true))) : 'Open the dashboard for this launch' : inc.waiting ? 'Pool waiting: ' + inc.waiting : 'Nothing waiting to pay out';
   return h('article', {class: 'pf6-row pf6-row--created', role: 'listitem'}, art({symbol: L.symbol, address: L.controller, chainId: L.chainId, logo: logoOf(L.chainId, L.controller)}),
    h('div', {class: 'pf6-name'}, h('a', {class: 'qp-open-token', href: '/terminal#m=' + L.chainId + ':' + L.controller, 'aria-label': 'Open ' + (L.symbol || L.name)}, h('b', {}, L.symbol || L.name)), chainBadge(L.chainId), isTestLaunch(L) ? h('span', {class: 'pf6-tag'}, 'Test') : null),
    h('div', {class: 'pf6-sub'}, waiting),
    h('div', {class: 'pf6-meta'}, [inc?.phase, inc && inc.shareBps ? 'your share ' + inc.shareBps / 100 + '%' : null, L.summary?.mcap > 0 ? 'MC ' + money(L.summary.mcap) : null].filter(Boolean).join(' · ')),
    h('div', {class: 'pf6-val'}, known(usd) ? money(usd) : inc?.waiting ? '' : inc ? money(0) : ''),
    h('div', {class: 'pf6-pl pf6-dim'}, known(usd) && usd > 0 ? 'pool total' : ''),
    h('div', {class: 'pf6-act'}, h('a', {class: 'qa-btn pf6-quiet', href: '/creator#m=' + L.chainId + ':' + L.controller}, 'Manage'), claim), status);
  }) : [h('p', {class: 'qa-empty'}, 'No launches from this wallet yet. ', h('a', {href: '/create'}, 'Launch a token'), '.')]));
 }
 function paintStaked() {
  const box = $('qp-staked'); if (!box) return;
  const qh = current?.rows.find(r => r.chainId === '4663' && String(r.address).toLowerCase() === QHOOKS_TOKEN), parts = [];
  if (extra.locks) {
   if (extra.stakedState === 'failed') parts.push(pending('Timed locks are refreshing.', () => void loadStaked(true)));
   const rows = T.stakedRows({locks: extra.locks, priceUsd: qh?.priceUsd ?? null}).filter(x => x.kind === 'locked');
   if (rows.length) parts.push(h('p', {class: 'pf6-group'}, 'QHOOKS timed locks'), ...rows.map(x => {
    const bar = h('span', {class: 'pf6-lockbar__bar'}, h('i', {})); const fill = bar.children?.[0]; if (fill?.style && known(x.progress)) fill.style.width = Math.round(x.progress * 100) + '%';
    return h('article', {class: 'pf6-row', role: 'listitem'}, art({symbol: 'QHOOKS', address: QHOOKS_TOKEN, chainId: '4663', logo: qh?.logo || null}),
     h('div', {class: 'pf6-name'}, h('a', {class: 'qp-open-token', href: '/stake', 'aria-label': 'Open QHOOKS staking'}, h('b', {}, 'QHOOKS')), chainBadge('4663'), h('span', {class: 'pf6-chain'}, 'Locked · ' + (T.TERM_LABEL[x.term] || ''))),
     h('div', {class: 'pf6-sub'}, quantity(x.amount) + ' QHOOKS'),
     h('div', {class: 'pf6-lockbar'}, bar, x.ended ? 'Ended · withdraw with bonus' : 'Unlocks ' + new Date(x.end * 1000).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})),
     h('div', {class: 'pf6-val'}, known(x.valueUsd) ? money(x.valueUsd) : ''), h('div', {class: 'pf6-pl pf6-dim'}, 'Locked'),
     h('div', {class: 'pf6-act'}, h('a', {class: 'qa-btn pf6-quiet', href: '/stake'}, 'Manage')));
   }));
  } else parts.push(pending(extra.stakedState === 'failed' ? 'Timed locks are refreshing.' : 'Reading timed locks…', extra.stakedState === 'failed' ? () => void loadStaked(true) : null));
  if (extra.stakes) {
   if (extra.earnState === 'failed') parts.push(pending('Stakes are refreshing.', () => void earnings(me(), true)));
   if (extra.stakes.length) {
    parts.push(h('p', {class: 'pf6-group'}, 'Staking and raffles in launch modules'));
    for (const node of extra.stakes) { if (!own()) node.querySelector?.('.qa-actions')?.remove?.(); node.classList?.add('pf6-module'); parts.push(node); }
   }
  } else parts.push(pending(extra.earnState === 'failed' ? 'Stakes are refreshing.' : 'Reading stakes…', extra.earnState === 'failed' ? () => void earnings(me(), true) : null));
  if (extra.locks && extra.stakes && !parts.some(p => p?.classList)) parts.push(h('p', {class: 'qa-empty'}, 'Nothing staked or locked from this wallet. ', h('a', {href: '/stake'}, 'Stake QHOOKS'), '.'));
  box.replaceChildren(...parts);
 }
 function paintChips() {
  const choices = [{chainId: 'all', name: 'All chains'}, ...current.allocation.filter(c => c.valueUsd > 0 || current.rows.some(r => r.chainId === c.chainId))];
  if (!choices.some(c => c.chainId === prefs.chain)) prefs.chain = 'all';
  const pick = id => { prefs.chain = id; paintChips(); paintHoldings(); paintHeroValue(); };
  const select = h('select', {class: 'pf6-chip pf6-chip--menu', 'aria-label': 'Chain', onchange: e => pick(e.target.value)}, ...choices.map(c => h('option', {value: c.chainId, ...(c.chainId === prefs.chain ? {selected: true} : {})}, c.name)));
  $('qp-chains')?.replaceChildren(select, ...choices.map(c => button(c.name, () => pick(c.chainId), {class: 'pf6-chip pf6-chip--chain', 'aria-pressed': String(c.chainId === prefs.chain), 'data-chain': c.chainId})));
 }
 // ---------- extras ----------
 async function loadClosed(force = false) {
  const owner = me(), context = extraSequence; if (!owner || !/^0x/i.test(owner)) { extra.closed = []; extra.closedState = 'ready'; return; }
  if (extra.closedState === 'loading' || (!force && extra.closedState === 'ready' && extra.owner === owner)) return;
  extra.closedState = 'loading'; paintPnl(); if (tab === 'closed') paintClosed();
  try {
   const card = await retry(async () => { const r = await fetchImpl('/api/wallets/card/' + owner.toLowerCase() + '?window=all', {cache: 'no-store'}); if (!r.ok) throw Error('card'); return r.json(); });
   if (owner !== me() || context !== extraSequence || disposed) return;
   const closed = T.closedPositions(card, current?.rows || []); if (!closed) throw Error('card shape');
   extra.closed = closed; extra.closedState = 'ready';
  } catch { if (owner === me() && context === extraSequence) extra.closedState = 'failed'; }
  if (!disposed) { paintPnl(); paintTabs(); if (tab === 'closed') paintClosed(); }
 }
 async function loadStaked(force = false) {
  const owner = me(), context = extraSequence; if (!owner || !/^0x/i.test(owner)) return;
  if (extra.stakedState === 'loading' || (!force && extra.stakedState === 'ready')) return;
  extra.stakedState = 'loading'; if (tab === 'staked') paintStaked();
  try { const locks = await retry(() => loadStakeLocks(owner, fetchImpl)); if (owner !== me() || context !== extraSequence || disposed) return; extra.locks = locks; extra.stakedState = 'ready'; }
  catch { if (owner === me() && context === extraSequence) extra.stakedState = 'failed'; } // last good locks stay on screen with Retry
  if (!disposed) { paintTabs(); if (tab === 'staked') paintStaked(); }
 }
 async function earnings(owner, force = false) {
  const mine = ++earningsSequence, target = $('qp-earnings');
  if (!owner || !/^0x/i.test(owner)) { target?.replaceChildren(h('p', {class: 'qa-empty'}, 'Connect an EVM wallet to see your QHooks earnings.')); extra.launches = []; extra.stakes = []; extra.createdState = 'ready'; extra.earnState = 'ready'; return; }
  if (!extra.launches) { extra.createdState = 'loading'; extra.earnState = 'loading'; }
  if (!extra.launches && !extra.stakes) target?.replaceChildren(h('p', {class: 'qa-loading'}, 'Reading your earnings…'));
  try {
   const shared = await loadEarningsModule(), refresh = () => { if (!disposed && me() === owner) { void earnings(owner, true); void load(true); } };
   const data = await retry(() => shared.loadEarnings(owner, {refresh, includeRewards: own()}));
   if (mine !== earningsSequence || disposed) return;
   extra.launches = data.coverage?.launches === 'unavailable' ? extra.launches : data.launches || [];
   extra.createdState = data.coverage?.launches === 'unavailable' ? 'failed' : 'ready';
   extra.stakes = data.partial && !data.earn?.length ? extra.stakes : Array.isArray(data.earn) ? data.earn : []; extra.earnState = data.partial ? 'failed' : 'ready';
   if (!own()) for (const node of [...(extra.stakes || []), ...(data.vests || []), data.built, ...(data.rewards?.rows || [])].filter(Boolean)) {
    for (const actions of node.querySelectorAll?.('.qa-actions') || []) actions.remove?.();
   }
   paintTabs(); paintList(); paintPnl();
   // creator fees per launch, read on chain (qx-earnings.mjs launchIncome); a launch that can't be read says so in its row
   if (shared.launchIncome) void Promise.all((extra.launches || []).map(async L => {
    const key = L.chainId + ':' + L.controller;
    try { const inc = await retry(() => shared.launchIncome(owner, L)); if (mine === earningsSequence) extra.incomes.set(key, inc); }
    catch { if (mine === earningsSequence && !extra.incomes.has(key)) extra.incomes.set(key, null); }
    if (mine === earningsSequence && !disposed) { if (tab === 'created') paintCreated(); }
   })).then(() => { if (mine === earningsSequence && !disposed) { paintPnl(); } });
   const sections = [];
   if (shared.section) {
    if (data.rewards?.rows?.length) sections.push(shared.section('qa-rewards', 'Cashback and referrals', null, data.rewards.rows));
    if (data.vests?.length) sections.push(shared.section('qa-vest', 'Vesting', null, data.vests));
    if (data.built) sections.push(shared.section('qa-built', 'Builder earnings', null, data.built));
   }
   if (!sections.length) sections.push(h('p', {class: 'qa-empty'}, data.partial ? 'Refreshing earnings. Refresh to try again.' : 'No cashback, referral, vesting or builder earnings yet.'));
   else if (data.partial) sections.push(h('p', {class: 'qa-muted'}, 'Some earnings could not be read. Refresh to try again.'));
   if (mine === earningsSequence && !disposed) target?.replaceChildren(...sections);
  } catch {
   if (mine !== earningsSequence || disposed) return;
   extra.createdState = 'failed'; extra.earnState = 'failed';
   const retained = [...(target?.children || [])].filter(n => !String(n.className || '').includes('pf6-wait'));
   target?.replaceChildren(...retained, pending('Earnings are refreshing.', () => void earnings(owner, true)));
   paintTabs(); paintList(); paintPnl();
  }
 }
 // Live: QHooks launch holdings reprice from the terminal's trade feed while the page is in view, so the balance and
 // PnL move with real trades. Nothing is re-read from the wallet's chains; the next Refresh reads balances again.
 let feed = null, liveTimer = 0, liveAt = 0, ageTimer = 0, balanceTimer = 0,feedAbort=null;
 const canLive = typeof document.visibilityState === 'string' && typeof setInterval === 'function';
 async function liveTick() {
  if (disposed || !current || feedAbort || document.visibilityState !== 'visible') return;
  const owner=walletKey,controller=new AbortController();feedAbort=controller;
  let data = null; try { data = await loadFeed({signal:controller.signal}); } catch { data = null; } finally {if(feedAbort===controller)feedAbort=null;}
  if (disposed || controller.signal.aborted || owner!==walletKey || document.visibilityState!=='visible' || !current || !data || !Array.isArray(data.markets)) return;
  feed = liveFeed(data.markets,{previous:feed}); liveAt = Date.now();
  const before = current.valueUsd, {moved, logos} = applyLive(current, feed);
  if (moved.length) {
   paintHeroValue(Math.sign((current.valueUsd ?? 0) - (before ?? 0))); paintAllocation(); paintPnl(); paintHoldings();
   for (const r of moved) { const row = $('qp-holdings').querySelector?.('[data-key="' + marketKey(r.chainId, r.address) + '"]'); if (row && r.dir) { row.classList.add(r.dir > 0 ? 'is-up' : 'is-down'); setTimeout(() => row.classList.remove('is-up', 'is-down'), 1200); } }
  } else if (logos) paintList();
  paintAge();
 }
 function paintReadAge() { const at=$('qp-at');at.textContent=portfolioValuationLabel(current);at.title='Oldest price in the shown total. Individual holdings keep their own observation times.'; }

 function paintAge() {
  if(current?.rows.some(r=>priceState(r.priceAt).refreshing&&!r.pricesRefreshing||known(r.priceUsd)&&(!known(r.priceAt)||r.priceAt>Date.now()||Date.now()-r.priceAt>PORTFOLIO_PRICE_MAX_MS))){
   const reports=[kept('evm',me()),view?null:kept('solana',sol.solAddress())].filter(Boolean);
   if(reports.length){current=mergePortfolios(reports);if(feed)applyLive(current,feed);paintAll();}
  }
  paintReadAge();
 }
 function startLive() {
  if(disposed||savedPreview||document.visibilityState!=='visible')return;
  if (canLive && !balanceTimer) balanceTimer = setInterval(() => { if (current && document.visibilityState === 'visible' && !$('qp-refresh').disabled) void load(true); }, 25000);
  if(canLive&&!ageTimer)ageTimer=setInterval(paintAge,1000);
  if (!canLive || liveTimer || !current?.rows.some(r => r.qhooks)) return;
  void liveTick(); liveTimer = setInterval(() => void liveTick(), liveMs);
 }
 function stopLive() { feedAbort?.abort();feedAbort=null;clearInterval(liveTimer); clearInterval(ageTimer); clearInterval(balanceTimer); liveTimer = ageTimer = balanceTimer = 0; liveAt = 0; }
 async function read(family,address,signal){
  let report=await reader.read(family,address,{signal,force:true});
  if(family==='evm'&&costs?.apply(report))report=reader.accept(family,address,report,{derived:true,refreshing:!!report.refreshing});
  return report;
 }
 function kept(family,address){const item=reader.cached(family,address);return item?{...item.report,refreshing:!item.fresh||!!item.report.refreshing}:null;}
 const paintAll = (failed = []) => { paintOverview(failed); paintChips(); paintTabs(); paintList(); };
 // ---------- watch-only addresses (qx-portfolio-watch.mjs) ----------
 // Own wallet only (never in ?wallet= view or the saved snapshot). Every merge on this page goes through watch.merge.
 const watch=mountWatchOnly({h,reader,storage,document,fetchImpl,owner:()=>own()?me():null,solOwner:()=>view?null:sol.solAddress(),active:()=>!disposed&&own()&&!savedPreview,
  // watched rows get the same Price cell as the owner's rows (ux-pricemc x watch-only integration)
  renderRow:(r,o)=>withHoldingPrices([renderHoldingRow(r,o)],[r],{h:o.h,key:x=>marketKey(x.chainId,x.address)})[0],chainName,getChain:()=>prefs.chain,marketKey,onChange:()=>{
   const repaint=()=>{if(disposed||!current||savedPreview)return;const reports=[kept('evm',me()),view?null:kept('solana',sol.solAddress())].filter(Boolean);if(!reports.length)return;
    for(const r of reports)if(r.address===me())costs?.apply(r);current=mergePortfolios(reports);if(feed)applyLive(current,feed);paintAll();};
   if(activeLoad)void activeLoad.finally(repaint).catch(()=>{});else repaint();}});
 const mergePortfolios=reports=>watch.merge(reports,mergeOwnPortfolios);
 onWalletChange(()=>void watch.ownerChanged(),{storage});void watch.ownerChanged();
 // ---------- end watch-only ----------
 function clearSavedDisplay(){savedPreview=null;delete root.dataset.readonlySnapshot;current=null;for(const id of ['qp-addresses','qp-holdings','qp-top','qp-chains','qp-allocation','qp-notes','qp-stats'])$(id)?.replaceChildren();$('qp-total').textContent='—';$('qp-at').textContent='Time unavailable';$('qp-count').textContent='';paintPnl();paintTabs();}
 function paintSavedSnapshot(){
  const owner=savedPortfolioAddress({storage}),report=owner?savedPortfolioSnapshot({reader,owner}):null;if(!report)return false;
  stopLive();savedPreview=owner;root.dataset.readonlySnapshot='true';root.hidden=false;$('qp-connect').hidden=true;
  addresses(owner,null,{saved:true});current=mergePortfolios([report]);paintAll();$('qp-refresh').disabled=true;
  $('qp-status').textContent='Saved wallet snapshot · connect to update.';
  if(document.visibilityState==='visible')ageTimer=setInterval(()=>{if(!savedPreview||disposed)return;
   if(current?.rows.some(r=>known(r.priceUsd)&&(!known(r.priceAt)||r.priceAt>Date.now()||Date.now()-r.priceAt>PORTFOLIO_PRICE_MAX_MS))){const next=savedPortfolioSnapshot({reader,owner:savedPreview});if(next){current=mergePortfolios([next]);paintAll();}else{stopLive();clearSavedDisplay();$('qp-connect').hidden=false;root.hidden=true;return;}}
   paintReadAge();
  },1000);
  return true;
 }
 let follow = 0, followTimer = 0;
 let activeLoad=null,activeWallet=null;
 function load(quiet=false){const key=[me(),view?null:sol.solAddress()].join(':');if(activeLoad&&activeWallet===key&&!aborter?.signal.aborted)return activeLoad;activeWallet=key;const task=runLoad(quiet);activeLoad=task;void task.finally(()=>{if(activeLoad===task)activeLoad=null;}).catch(()=>{});return task;}
 async function runLoad(quiet = false) {
  if (disposed) return;
  const owner = me(), solana = view ? null : sol.solAddress(), mine = ++sequence;
  const changed = walletKey !== [owner, solana].join(':'); walletKey = [owner, solana].join(':');
  aborter?.abort(); const controller = new AbortController(); aborter = controller;
  $('qp-connect').hidden = Boolean(owner || solana); root.hidden = !owner && !solana;
  if (!owner && !solana) { stopLive();earningsSequence++;if(paintSavedSnapshot())return;clearSavedDisplay();$('qp-connect').hidden=false;root.hidden=true;return; }
  if(savedPreview){stopLive();clearSavedDisplay();$('qp-status').textContent='Updating holdings…';}
  addresses(owner, solana);
  if (changed) { current = null; stopLive();feed=null; $('qp-chains')?.replaceChildren(); }
  const jobs = [...(owner ? [['evm', owner, 'EVM chains']] : []), ...(solana ? [['solana', solana, 'Solana']] : [])];
  if (!quiet) { follow = 0; clearTimeout(followTimer); }
  const last=jobs.map(([family,address])=>kept(family,address)).filter(Boolean);
  const liveReports=new Map(last.map(r=>[r.address,r]));
  const shownKept=last.length>0;
  if (shownKept) {
   for (const r of last) if (r.address === owner) costs?.apply(r);
   current = mergePortfolios(last); if (feed) applyLive(current, feed);
   paintAll();
  } else if (changed || !quiet || !current) skeleton();
  if(canLive&&document.visibilityState!=='visible'){$('qp-refresh').disabled=false;return;}
  $('qp-refresh').disabled = true;
  const timer = setTimeout(() => controller.abort(), 45000);
  // Accept each chain as it arrives on the same request, including a single EVM
  // family. Keep other families/chains until their own replacement is available.
  const stopProgress=reader.subscribe(({family,owner:who,report})=>{
   if(mine!==sequence||disposed||!jobs.some(([f,w])=>f===family&&w===who))return;
   const local=structuredClone(report);if(family==='evm')costs?.apply(local);
   liveReports.set(who,local);current=mergePortfolios([...liveReports.values()]);
   const waiting=jobs.filter(([,w])=>!liveReports.has(w)).map(([, ,label])=>label+': Refreshing balances');
   if(waiting.length)current.partial=true;if(feed)applyLive(current,feed);paintAll(waiting);
   $('qp-status').textContent='Updating holdings…';startLive();
  });
  try {
   const results=await Promise.allSettled(jobs.map(async([family,address])=>{
    const report=await read(family,address,controller.signal);if(mine!==sequence||disposed)return report;
    liveReports.set(address,report);current=mergePortfolios([...liveReports.values()]);
    const waiting=jobs.filter(([,w])=>!liveReports.has(w)).map(([, ,label])=>label+': Refreshing balances');
    if(waiting.length)current.partial=true;if(feed)applyLive(current,feed);paintAll(waiting);startLive();return report;
   }));
   if (mine !== sequence || disposed) return;
   const reports=[...liveReports.values()], failed = results.flatMap((r, i) => r.status === 'rejected' ? [jobs[i][2] + ': balance coverage unavailable'] : []);
   if (!reports.length && shownKept) { $('qp-status').textContent = pricingCoverage(current).label; return; } // keep the kept reading
   current = mergePortfolios(reports);
   if (failed.length) { current.partial = true; current.change24 = null; current.change24Usd = null; }
   if (feed) applyLive(current, feed);
   paintAll(failed);
   const refreshing = reports.some(r => portfolioNeedsRefresh(r));
   paintReadAge();
   const balancePartial=current.chains.some(c=>{const s=chainReadState(c);return s.balances||s.positions;});
   $('qp-status').textContent = !reports.length?'Holdings could not be read. Refresh to try again.':pricingCoverage(current).label;
   if (reports.length) startLive();
   clearTimeout(followTimer);
   if (balancePartial && follow < 2 && document.visibilityState==='visible') followTimer = setTimeout(() => { follow++; void load(true); }, follow ? 7000 : 3500);
   // outside tokens' cost basis and chain prices: one pass of reads from this device, then a quiet repaint
   const evm = reports.find(r => r.address === owner);
   if (evm && costs) void costs.refresh(evm).then(changedCost => {
    if (!changedCost || mine !== sequence || disposed) return;
    const accepted=reader.accept('evm',owner,evm,{derived:true,refreshing:!!evm.refreshing});
    current = mergePortfolios(reports.map(r=>r===evm?accepted:r)); if (failed.length) { current.partial = true; current.change24 = null; current.change24Usd = null; }
    if (feed) applyLive(current, feed);
    paintAll(failed);
   }, () => {});
  } finally { stopProgress();clearTimeout(timer); if (mine === sequence) $('qp-refresh').disabled = false; }
 }
 const resetExtras = () => { extraSequence++; Object.assign(extra, {owner: me(), closed: null, closedState: 'idle', launches: null, incomes: new Map(), createdState: 'idle', stakes: null, locks: null, stakedState: 'idle', earnState: 'idle'}); };
 $('qp-refresh').addEventListener('click', () => { void load(true); void earnings(me(), true); void loadClosed(true); if (extra.stakedState !== 'idle') void loadStaked(true); });
 $('qp-more')?.addEventListener('click', () => { const box = $('qp-notes'), open = !!box?.hidden; if (box) box.hidden = !open; $('qp-more').setAttribute('aria-expanded', String(open)); });
 $('qp-search')?.addEventListener('input', e => { prefs.search = e.target.value; paintHoldings(); });
 for (const [id, key] of [['qp-small', 'hideSmall'], ['qp-spam', 'showSpam'], ['qp-test', 'hideTest']]) $(id)?.addEventListener('change', e => { prefs[key] = e.target.checked; savePreferences(storage, prefs); saveHideTest(storage, prefs.hideTest); paintTabs(); paintList(); paintPnl(); });
 for (const b of $('qp-period')?.children || []) b.addEventListener?.('click', () => { prefs.period = b.dataset.p === 'today' ? 'today' : 'all'; savePeriod(storage, prefs.period); paintPnl(); });
 const walletChanged = () => { seller.changed();if (extra.owner !== me()) resetExtras(); void load();if(savedPreview)return; void loadClosed(); void earnings(me()); if (tab === 'staked') void loadStaked(); };
 const refreshBalances = () => { if (!disposed && current && document.visibilityState === 'visible' && !$('qp-refresh').disabled) return load(true); };
 document.addEventListener?.('qhooks:traded', refreshBalances);
 const visibilityChanged=()=>{if(document.visibilityState!=='visible'){stopLive();clearTimeout(followTimer);aborter?.abort();sequence++;$('qp-refresh').disabled=false;}else if(savedPreview){paintSavedSnapshot();}else{startLive();void refreshBalances();}};
 document.addEventListener?.('visibilitychange', visibilityChanged);
 const lifecycle=document.defaultView||globalThis,hidePage=()=>{stopLive();clearTimeout(followTimer);aborter?.abort();sequence++;$('qp-refresh').disabled=false;},showPage=()=>{if(document.visibilityState==='visible')visibilityChanged();};
 lifecycle.addEventListener?.('pagehide',hidePage);lifecycle.addEventListener?.('pageshow',showPage);
 const stopWallet=onWalletChange(!view?walletChanged:() => { paintList(); },{storage}); // viewing: a wallet change only toggles the own-wallet buttons
 const stopSol = view ? null : sol.onSolChange(() => { solPicker(); if (walletKey !== [me(), sol.solAddress()].join(':')) walletChanged(); });
 const stopReports=reader.subscribe(({family,owner:who})=>{if(disposed||activeLoad||!current||who!==(family==='evm'?me():sol.solAddress()))return;const reports=[kept('evm',me()),view?null:kept('solana',sol.solAddress())].filter(Boolean);if(!reports.length)return;current=mergePortfolios(reports);if(feed)applyLive(current,feed);paintAll();});
 solPicker(); paintTabs(); walletChanged();
 return {refresh: () => load(true), dispose() { seller.dispose();disposed = true;lifecycle.removeEventListener?.('pagehide',hidePage);lifecycle.removeEventListener?.('pageshow',showPage);document.removeEventListener('click',earlyConnect,true);stopWallet?.(); stopReports(); sequence++; earningsSequence++; aborter?.abort(); stopSol?.(); stopLive(); clearTimeout(followTimer); document.removeEventListener?.('qhooks:traded', refreshBalances); document.removeEventListener?.('visibilitychange', visibilityChanged); }};
}
const QHOOKS_TOKEN = '0x20429af7ca3b0ce4d99edbaa0693f26c5df05195';
function readHideTest(storage) { try { return JSON.parse(storage?.getItem('qhooks:portfolio:v6') || '{}').hideTest !== false; } catch { return true; } }
function saveHideTest(storage, v) { try { const p = JSON.parse(storage?.getItem('qhooks:portfolio:v6') || '{}'); storage?.setItem('qhooks:portfolio:v6', JSON.stringify({...p, hideTest: v})); } catch { /* private browsing */ } }
function readPeriod(storage) { try { return JSON.parse(storage?.getItem('qhooks:portfolio:v6') || '{}').period === 'today' ? 'today' : 'all'; } catch { return 'all'; } }
function savePeriod(storage, v) { try { const p = JSON.parse(storage?.getItem('qhooks:portfolio:v6') || '{}'); storage?.setItem('qhooks:portfolio:v6', JSON.stringify({...p, period: v})); } catch { /* private browsing */ } }
// QHOOKS timed locks: the staking page's own config and reader (qx-stake-lock-data.mjs readTimedLocks through the public
// read client), so this tab shows exactly what /stake shows.
async function defaultStakeLocks(owner, fetchImpl) {
 const cfg = await fetchImpl('/full-launch/stake-lock-v1.json', {cache: 'no-store'}).then(r => { if (!r.ok) throw Error('config'); return r.json(); });
 if (!cfg || String(cfg.chainId) !== '4663' || !/^0x[0-9a-f]{40}$/i.test(cfg.lock || '') || !cfg.sel?.locks) throw Error('config');
 const [{readTimedLocks}, {createReadClient}] = await Promise.all([import('/qx-stake-lock-data.mjs'), import('/qx-taps.mjs')]);
 const client = createReadClient({fetchImpl: (url, init = {}) => fetch(url, {...init, qhooksPublicOnly: true})});
 return readTimedLocks({owner, cfg: {...cfg, lock: cfg.lock.toLowerCase(), token: String(cfg.token).toLowerCase()}, rpc: client.rpc});
}
if (typeof document !== 'undefined' && document.getElementById('qp-content')) startPortfolio().catch(() => {
 const line = document.getElementById('qp-status'); if (line) line.textContent = 'Could not load wallet tools. Reload to try again.';
});
