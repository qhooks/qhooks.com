import {mountRecapturePanel} from '/qx-recapture-panel.mjs';
import {mountArbGapPanel} from '/qx-arb-gap-panel.mjs';
import {mountRelaunchBadge} from '/qx-relaunch-badge.mjs';
import {createProviderChartRenderer,directProviderChart} from '/qx-provider-chart.mjs';
import {mountPriceAlerts} from '/qx-price-alerts.mjs';
import {mountChartTools} from '/qx-chart-tools.mjs';
import {createTradeTape,mountTapeControls,recentTraders} from '/qx-trade-tape.mjs';
import {createExternalHolderPanel} from '/qx-market-holders.mjs';
// Trading terminal: every listed QHooks launch across six chains in one feed, a live chart, tape,
// holders and positions from the worker's index (/api/terminal), and a trade ticket that quotes through
// each pool and its blocks. The launch tools (rules, auction, limit orders, second pool, team locks) are
// the Trade page's own panels, mounted here unchanged and fed the same pool event.
import { CHAIN_NAME, h, connectedAddress, rpc } from '/qx-chain.mjs';
import { menuChains, chainMap, chainById } from '/chains.mjs';
import { hasDirectRoute } from '/qx-elysium-direct.mjs';
import { fetchDexPairs, pickPair, headerPatch } from '/qx-dex-live.mjs';
import { createChart, CrosshairMode } from '/vendor/lightweight-charts/lightweight-charts.standalone.production.mjs';
import { mountTicket } from '/qx-terminal-trade.mjs';
import {createWorkspaceMemory,createWorkspaceSearch,workspaceSearchRows,workspaceAsset,createMarketWorkspace,renderWorkspaceContext,nativeMarketView} from '/qx-terminal-workspace.mjs';
import {syncBuilder} from '/qx-hey-builder.mjs';
import {createPositionsPanel} from '/qx-terminal-positions.mjs';
import {solAddress,onSolChange} from '/qx-solana.mjs';
import {mountTokenConversation} from '/qx-community-activity.mjs';
import {mountSelectedRepoProof} from '/qx-repoproof.mjs';
import { createTerminalSelection, prepareNativeTicket, withTerminalTradeReady, createTerminalShortcutHandler, closeTerminalOverlayOnEscape, tradeAddressLabel } from '/qx-terminal-selection.mjs';
import { afterBuy, onReached } from '/qx-terminal-tpsl.mjs';
import { getWalletHub } from '/wallet-hub.mjs';
import { trustList, trustOf, verdictOf, badge, copyLabel, forget } from '/qx-trust.mjs';
import { officialFor, officialLogo, impostorOf, officialBadge, notOfficialBadge, impostorBanner, rowMark, pinOfficial } from '/qx-official.mjs';
import { externalQuick } from '/qx-terminal-feed-core.mjs';
import {freshnessState,historyState,loadExternalHeader,loadExternalHistory} from '/qx-terminal-data.mjs';
import {ownChartView,ownHolderLabel,ownTapeValue,ownTapeRows,ownTapePrice} from '/qx-terminal-own.mjs';
import {fillNativeUsd,ethUsd as browserEthUsd} from '/qx-native-usd.mjs';
import {coldPoolSpec,readColdPrice,coldMayPaint,spotFromSlot0,GET_SLOT0,COLD_CHART_MESSAGE} from '/qx-cold-price.mjs';
import {renderMarketHolders,holderSource} from '/qx-terminal-holders.mjs';
import {renderChartHistory,renderTapeHistory,tapeHistoryState,refreshHistoryPresentation} from '/qx-terminal-history.mjs';
import {createOnchainEvmFallback,renderOnchainHolderSample} from '/qx-terminal-onchain.mjs';
import { parseTerminalHash, applyTradePrefill, readTokenBalance, openTerminalView, applyTokenQuery } from '/qx-tg-prefill.mjs';
// ?chain=&token= deep links become #t= before anything reads the hash (shared with qx-terminal-feed.mjs).
let paneReady=false;
globalThis.__qxTokenQuery = globalThis.__qxTokenQuery || applyTokenQuery();

// Chain filter: live chains, plus hidden/testnet ones with the hidden-chain flag (chains.mjs).
// Header chain chips follow the feed's order (Randall, 2026-11-09: "sol-rh-bnb-Elysium-eth-base-arb"); other chains after.
const CHIP_ORDER = ['4663', '56', '99901', '1', '8453', '42161'];
const CHAINS = [['all', 'All'],['solana','Solana'], ...menuChains().map((c, i) => [c, CHIP_ORDER.indexOf(c.id) < 0 ? 99 + i : CHIP_ORDER.indexOf(c.id)]).sort((x, y) => x[1] - y[1]).map(([c]) => [c.id, c.short])];
const ICON = { ...chainMap(c => c.icon), solana: 'solana' };
const EXPLORER = { ...chainMap(c => c.explorer), solana: 'https://solscan.io' };
const TFS = [[1, '1s'], [60, '1m'], [300, '5m'], [900, '15m'], [3600, '1h'], [14400, '4h'], [86400, '1D']];
const BITS = ['Opening bell', 'Anti-snipe', 'Wallet cap', 'Max trade', 'Cooldown', 'Holder gate', 'Exit clock', 'Sandwich guard', 'Impact fee', 'Storm fee', 'Session fee', 'Tax', 'Whale tiers', 'Auto burn', 'King', 'Last buyer wins', 'Buyback', 'Referrals', 'Points'];
const QUICK = { usd: '10', eth: '0.01', bnb: '0.05', hype: '0.1' }; // hype: Elysium (2026-11-09), same first preset as the ticket
const $ = id => document.getElementById(id);
const store = (k, v) => { try { if (v === undefined) return localStorage.getItem('qhooks:terminal:' + k); localStorage.setItem('qhooks:terminal:' + k, v); } catch {} return null; };
const now = () => Math.floor(Date.now() / 1000);
const marketListeners = new Set();

const state = { chain: store('chain') || 'all', feed: store('feed') || 'recent', tf: Number(store('tf')) || 60, unit: 'price', filter: 'all', pane: 'trades',
  markets: [], sel: null, pool: null, data: null, cursor: -1, watch: new Set(JSON.parse(store('watch') || '[]')), quick: { ...QUICK, ...JSON.parse(store('quick') || '{}') }, me: null,
  tracked: JSON.parse(store('tracked') || '{}'), activity: [], alerts: store('alerts') === '1', xhits: [], xq: '', xchain:'all',xstatus:'idle',xerror:null,trust: {} };
if (!TFS.some(([t]) => t === state.tf)) state.tf = 60;
let memoryStorage;try{memoryStorage=localStorage;}catch{}
const workspaceMemory=createWorkspaceMemory({storage:memoryStorage});
let marketWorkspace=null,positionsPanel=null,conversationView=null,conversationKey=null,renderedWorkspaceKey=null,renderedWorkspacePhone=null,selectedProof=null;

// ---- Formatting ----
const SUB = '₀₁₂₃₄₅₆₇₈₉';
function price(p) {
  if(p===0)return '0';
  if (!p) return '—';
  if (p >= 1) return p.toLocaleString('en-US', { maximumFractionDigits: p >= 1000 ? 2 : 4 });
  if (!(p > 0) || !Number.isFinite(p)) return '—';
  // Leading zeros after the point are written as a subscript count: 0.0₅1234 = 0.000001234.
  const e = Math.floor(Math.log10(p)), z = -e - 1, digits = String(Math.round(p / 10 ** (e - 3))).slice(0, 4).replace(/0+$/, '') || '0';
  return z >= 4 ? '0.0' + String(z).split('').map(d => SUB[d]).join('') + digits : '0.' + '0'.repeat(z) + digits;
}
function compact(n) {
  if (n == null || Number.isNaN(n)) return '—';
  const a = Math.abs(n);
  return a >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : a >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : a >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : a >= 1 ? n.toFixed(2) : a ? price(n) : '0';
}
const stable = sym => /^(USDC|USDT|DAI|USD)/.test(sym || '');
// No number yet: a bare dash, not "— WETH".
const money = (n, sym) => n == null || Number.isNaN(n) ? '—' : stable(sym) ? '$' + compact(n) : compact(n) + ' ' + (sym || '');
const pct = (n, sign = true) => n == null ? '—' : (sign && n > 0 ? '+' : '') + (n * 100).toFixed(Math.abs(n) < 0.1 ? 2 : 1) + '%';
const age = ts => { const d = Math.floor(Math.max(0, now() - ts)); return d < 60 ? d + 's' : d < 3600 ? Math.floor(d / 60) + 'm' : d < 86400 ? Math.floor(d / 3600) + 'h' : Math.floor(d / 86400) + 'd'; };
const clock = s => { s = Math.max(0, s); const m = Math.floor(s / 60); return m >= 60 ? Math.floor(m / 60) + 'h ' + (m % 60) + 'm' : m + ':' + String(s % 60).padStart(2, '0'); };
const short = a => a ? a.slice(0, 6) + '…' + a.slice(-4) : '—';
// A token's avatar: its ticker's first letter on a colour drawn from its address, with the chain as a small badge.
const hue = a => { let x = 0; for (const c of String(a || '').slice(2, 14)) x = (x * 31 + parseInt(c, 16)) % 360; return x; };
// The official token shows its own logo over the letter (qx-official.mjs).
const avLogo = (chainId, token) => { const src = officialLogo(chainId, token); if (!src) return null; const i = h('img', { src, alt: '', class: 'qxt-av-logo', decoding: 'async' }); i.addEventListener('error', () => i.remove(), { once: true }); return i; };
const avatar = (m, size = '') => h('span', { class: 'qxt-av ' + size, style: '--h:' + hue(m.token || m.controller), 'aria-hidden': 'true' }, h('span', {}, (m.symbol || '?').replace(/^\$/, '').slice(0, 1).toUpperCase()), avLogo(m.chainId, m.token), icon(m.chainId));
const icon = id => h('img', { src: '/chain-symbol-icons/' + ICON[id] + '.svg', alt: CHAIN_NAME[id] || '', width: 14, height: 14, class: 'qxt-ci' });
const keyOf = m => m.chainId + ':' + m.controller;
// A row without a quote symbol falls back to its chain's quote (WHYPE on Elysium), never to a dollar default.
const quoteSym = m => m.quoteSymbol || chainById(m.chainId)?.quote?.symbol || '';
const unitOf = m => /^W?ETH$/.test(quoteSym(m)) ? 'eth' : /^W?BNB$/.test(quoteSym(m)) ? 'bnb' : /^W?HYPE$/.test(quoteSym(m)) ? 'hype' : 'usd';
const QUNIT = { usd: 'USDC', eth: 'ETH', bnb: 'BNB', hype: 'HYPE' };
function selectedContext() {
 if(!state.sel)return null;
 const meta=state.data?.meta,constructor=state.pool?.constructor,launchToken=constructor?(constructor.currency0===constructor.quote?constructor.currency1:constructor.currency0):null,token=state.sel.ext||launchToken||meta?.token||null,summary=marketDisplay()?.summary||{};
 return Object.freeze({kind:state.sel.ext?'external':'launch',chainId:state.sel.chainId,token,controller:state.sel.controller||null,
  revision:selectionFlow?.current()?.intent?.revision??mseq,symbol:meta?.symbol||'',name:meta?.name||'',decimals:state.data?.token?.decimals??null,
  priceUsd:summary.priceUsd??(state.data?.ext||stable(meta?.quoteSymbol)?summary.price??null:null),priceQuote:summary.price??null,quoteSymbol:meta?.quoteSymbol||'',
  liquidityUsd:state.data?.ext?summary.liquidity??null:null,change24:summary.change24??null});
}
function renderWorkspace() {
 if(!marketWorkspace)return;
 const selected=selectedContext(),asset=workspaceAsset(selected),key=asset?asset.key+':'+asset.token+':'+selected.revision:null,same=key===renderedWorkspaceKey;
 const prior=$('qxt-check-coverage').querySelector('details'),keepOpen=same&&prior?.open,summaryFocused=same&&prior?.querySelector('summary')===document.activeElement;
 const view=renderWorkspaceContext({h,selection:selected,snapshot:marketWorkspace.snapshot(),chainName:id=>CHAIN_NAME[id]||id,
  onRetry:()=>marketWorkspace.retry(),onCopy:async address=>{try{await navigator.clipboard.writeText(address);$('qxt-sync').textContent='Contract copied.';}catch{$('qxt-sync').textContent='Select and copy the displayed contract address.';}}});
 const phone=matchMedia('(max-width:760px)').matches;
 if(!same||renderedWorkspacePhone!==phone||!$('qxt-market-identity').firstChild){
  let identity=view.identity;
  if(phone&&asset){
   const chain=asset.chainId==='solana'?'Solana':CHAIN_NAME[asset.chainId]||asset.chainId,address=asset.token||asset.controller;
   identity=h('details',{class:'qxt-token-details'},h('summary',{ariaLabel:'Contract and links for '+(selected.symbol||'selected token')+' on '+chain},
    h('span',{},chain),h('code',{},short(address)),h('span',{class:'qxt-token-details-label'},'Contract & links')),view.identity);
  }
  $('qxt-market-identity').replaceChildren(identity);
 }
 renderedWorkspaceKey=key;renderedWorkspacePhone=phone;
 $('qxt-data-health').replaceChildren(view.data);if(view.checks)view.checks.open=!!keepOpen;$('qxt-check-coverage').replaceChildren(...(view.checks?[view.checks]:[]));
 if(summaryFocused)view.checks?.querySelector('summary')?.focus({preventScroll:true});
 syncBuilder($('qxt-builder'),asset?{chainId:asset.chainId,token:asset.token}:{});
}
function clearConversation(){conversationView?.dispose();conversationView=null;conversationKey=null;$('qxt-conversation').hidden=true;$('qxt-launch-actions').hidden=true;$('qxt-launch-actions').open=false;}
function syncConversation(){
 const selected=selectedContext(),asset=workspaceAsset(selected);if(!asset||!state.data)return;
 const key=asset.key+':'+selected.revision;if(key===conversationKey)return;clearConversation();conversationKey=key;
 conversationView=mountTokenConversation($('qxt-conversation-body'),asset.kind==='launch'?{kind:'launch',chainId:asset.chainId,controller:asset.controller,token:asset.token||null,name:asset.name,symbol:asset.symbol}:{kind:'token',chainId:asset.chainId,address:asset.token,name:asset.name,symbol:asset.symbol});
 $('qxt-conversation').hidden=false;
}
function renderLaunchActions(){
 const meta=state.data?.meta,own=!!meta&&!state.data.ext&&!!state.me&&meta.owner?.toLowerCase()===state.me;
 $('qxt-launch-actions').hidden=!own;if(!own){$('qxt-launch-actions').open=false;return;}
 $('qxt-launch-intro').href='/board#m='+state.sel.chainId+':'+state.sel.controller+'&compose=intro';
 // A different saved launch may be active on Create; expose its receipt only
 // when it belongs to the exact market being viewed.
 let same=false;try{const id=localStorage.getItem('qhooks:create:active:v1'),record=JSON.parse(localStorage.getItem('qhooks:create:launch:v1:'+id)||'null');same=record?.status==='done'&&String(record.chainId)===state.sel.chainId&&record.addresses?.controller?.toLowerCase()===state.sel.controller;}catch{}
 $('qxt-launch-actions').querySelector('a[href="/create"]').hidden=!same;
}
// The safety scan has no Elysium (400). RepoProof's own check covers outside tokens there once its release is live, and
// queues a token on first view (2026-11-10, via the main thread). Until it accepts the chain: "No automated checks…".
// Chains where RepoProof's token check answers. Add '99901' when RepoProof's release supports Elysium (until then its
// check answers 400 and the page would log an error): the terminal then asks it instead of showing the unsupported copy.
// 2026-11-10: the set was empty, so this fallback never ran. RepoProof's API (/api/repoproof/check) accepts tokens on
// these chains (Elysium answers 400 invalid_proof_subject, so it stays out). The safety scan also answers 503 for
// uncached tokens, and those now fall back here too: a cached RepoProof report shows its verdict, otherwise "Not checked
// yet" with the RepoProof link instead of "Checks paused · retry".
const REPOPROOF_TOKEN_CHAINS=new Set(['1','8453','42161','56','4663']);
const SAFETY_SKIP=new Set(['99901']); // /api/terminal/x/safety has no Elysium (400).
async function repoproofTokenChecks(selected,signal){
 if(!REPOPROOF_TOKEN_CHAINS.has(String(selected.chainId)))return {unsupported:true,chainId:selected.chainId,address:selected.token};
 const none={unsupported:true,chainId:selected.chainId,address:selected.token};
 try{const r=await fetch('/api/repoproof/check?'+new URLSearchParams({kind:'token',chainId:String(selected.chainId),address:String(selected.token).toLowerCase()}),{cache:'no-store',signal});if(!r.ok)return none;
  const v=await r.json();if(v?.version!==1||v.subject?.kind!=='token'||String(v.subject?.chainId)!==String(selected.chainId)||String(v.subject?.address).toLowerCase()!==String(selected.token).toLowerCase())return none;
  const rep=v.report&&['danger','caution','clear','unknown'].includes(v.report.level)&&Array.isArray(v.report.checks)?v.report:null;
  return {...(rep||{}),level:rep?.level??null,verdict:rep?(rep.level==='clear'?'ok':rep.level):undefined,unavailable:!rep,state:v.state,retryAt:v.retryAt??null,source:'RepoProof via QHooks',checkedAt:v.checkedAt||rep?.completedAt||null,chainId:String(selected.chainId),address:String(selected.token).toLowerCase()};
 }catch(e){if(signal?.aborted)throw e;return none;}
}
// 2026-11-10 (release lead: BRETT showed "No flags" while RepoProof rated it danger; QHOOKS showed "Not checked yet"):
// - Every available source counts. GoPlus/RugCheck (the safety scan) and RepoProof are merged; the panel shows the worst
//   level, and each flag is labelled by its source.
// - On Robinhood the selected market gets one RepoProof check on view when it has no report (once per subject per browser
//   session; the server's allowance of 20 checks an hour, 5 per visitor, still applies). Other chains read cached reports
//   only, so views don't spend the shared allowance; "Check with RepoProof" runs one there.
// - The trade ticket gets the same flags, but its "danger" title says "may not be sellable": a danger that only comes from
//   RepoProof (e.g. holder concentration) without a failed sell probe reaches the ticket as caution.
const RISK_RANK={danger:3,caution:2,ok:1,clear:1,unknown:0};
const sourceName=s=>({goplus:'GoPlus',rugcheck:'RugCheck','RepoProof via QHooks':'RepoProof'})[s]||String(s||'Safety scan');
const lvl=v=>v==='clear'?'ok':v||'unknown';
export function mergeRisk(base,rp){
 const r=rp&&!rp.unsupported&&!rp.unavailable&&Array.isArray(rp.checks)?rp:null;
 if(!r)return base;if(!base)return rp;
 const b=lvl(base.verdict),x=lvl(r.level),verdict=(RISK_RANK[x]??0)>(RISK_RANK[b]??0)?x:b;
 const rpFlags=r.checks.filter(c=>c&&(c.status==='danger'||c.status==='caution')).sort((p,q)=>(p.status==='danger'?0:1)-(q.status==='danger'?0:1)).map(c=>'RepoProof: '+String(c.title||c.id));
 const baseFlags=(Array.isArray(base.flags)?base.flags:[]).map(f=>sourceName(base.source)+': '+f);
 return {...base,verdict,flags:[...rpFlags,...baseFlags],checks:r.checks,source:sourceName(base.source)+' + RepoProof',checkedAt:r.checkedAt||base.checkedAt||null};
}
export function ticketRisk(c,scan=null){
 if(!c||lvl(c.verdict)!=='danger'||scan&&lvl(scan.verdict)==='danger')return c;
 const sellFail=(c.checks||[]).some(k=>/sell/i.test(String(k?.id||''))&&k.status==='danger');
 return sellFail?c:{...c,verdict:'caution'};
}
const AUTO_KEY='qhooks:repoproof:auto:v1';
async function autoRepoProof(kind,chainId,address,signal){
 if(String(chainId)!=='4663')return false;
 const key=kind+':'+chainId+':'+String(address).toLowerCase();let seen=[];
 try{seen=JSON.parse(sessionStorage.getItem(AUTO_KEY)||'[]');}catch{}
 if(seen.includes(key))return false;
 try{sessionStorage.setItem(AUTO_KEY,JSON.stringify([...seen,key].slice(-40)));}catch{}
 try{const r=await fetch('/api/repoproof/check',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind,chainId:String(chainId),address:String(address).toLowerCase()}),signal});return r.ok;}
 catch(e){if(signal?.aborted)throw e;return false;}
}
async function tokenRepoProof(selected,signal){
 let rp=await repoproofTokenChecks(selected,signal);
 if(rp?.state==='not_checked'&&!rp.retryAt&&await autoRepoProof('token',selected.chainId,selected.token,signal))rp=await repoproofTokenChecks(selected,signal);
 return rp;
}
async function refreshSelectedChecks() {
 const selected=selectedContext(),run=selectionFlow?.current();if(!selected||!run||!state.data)return;
 const signal=run.controller.signal;
 try{
  let checks,forTicket=null;
  if(selected.kind==='launch'){
   checks=await verdictOf(selected.chainId,selected.controller);
   if(checks?.state==='not_checked'&&await autoRepoProof('launch',selected.chainId,selected.controller,signal)){forget(selected.chainId,selected.controller);checks=await verdictOf(selected.chainId,selected.controller);}
  }
  else if(SAFETY_SKIP.has(String(selected.chainId)))checks=await repoproofTokenChecks(selected,signal);
  else {
   const response=await fetch(`/api/terminal/x/safety/${selected.chainId}/${selected.token}`,{cache:'no-store',signal}),rpChain=REPOPROOF_TOKEN_CHAINS.has(String(selected.chainId));
   if(response.status===400){checks=rpChain?await tokenRepoProof(selected,signal):await repoproofTokenChecks(selected,signal);}
   else if(response.status>=500&&rpChain){checks=await tokenRepoProof(selected,signal);if(checks?.unsupported)throw Error('Checks paused. Refresh data to retry.');}
   else{if(!response.ok)throw Error('Checks paused. Refresh data to retry.');const scan=await response.json();checks=rpChain?mergeRisk(scan,await tokenRepoProof(selected,signal)):scan;forTicket=ticketRisk(checks,scan);}
  }
  if(!run.active())return;if(!checks)throw Error('Check provider returned no coverage.');if(selected.kind==='external'){const t=forTicket||ticketRisk(checks);state.data.safety=t;ticket.setSafety(t,run.intent);}
  marketWorkspace.receiveRisk(selected,checks);renderHead();
 }catch(error){if(run.active()){marketWorkspace.failRisk(selected,error);if(state.data)renderHead();}}
}
async function refreshSelectedMarket() {
 if(!state.sel||!ticket.canSelect()){$('qxt-sync').textContent='Current trade retained. Refresh market data after the trade or funded recovery is resolved.';return false;}
 const selected=selectedContext();
 if(!state.data)return state.sel.ext?selectExternal(state.sel.chainId,state.sel.ext):select(state.sel.chainId,state.sel.controller);
 marketWorkspace.refreshing(selected);const result=await loadMarket();await refreshSelectedChecks();return result;
}


// ---- Wallet: the site's shared wallet dialog (email or Google, MetaMask Mobile, browser wallets), the same one
// Trade and Launch use. The address goes into #qt-connection, which the shared panels read. ----
const hub = getWalletHub(window);
function setConnection(address, chainId) {
  state.me = address ? address.toLowerCase() : null;
  $('qt-connection').textContent = state.me ? (CHAIN_NAME[chainId] || 'EVM') + ' · ' + state.me : '';
  $('qxt-connect').textContent = state.me ? short(state.me) : 'Connect wallet';
  $('qxt-connect').classList.toggle('on', !!state.me);
  renderPane(); renderLaunchActions(); loadPositions(); if (state.data) renderChart();
}
// Trading a launch on another chain switches the wallet's network, which the hub treats as a new connection.
// When the terminal asked for that switch, rejoin the same wallet instead of showing it disconnected.
let walletKey = '', walletUuid = null, rejoinUntil = 0, rejoining = false, rejoinTimer = null, rejoinTries = 0;
window.addEventListener('qhooks:chain-switch', () => { rejoinUntil = Date.now() + 20000; rejoinTries = 0; });
// Outside the hub's own notification (connecting notifies again), one attempt at a time, a few tries at most.
function rejoin() {
  if (rejoinTimer || rejoining) return;
  rejoinTimer = setTimeout(async () => {
    rejoinTimer = null;
    const s = hub.snapshot();
    if (s.current || !walletUuid || Date.now() > rejoinUntil || rejoinTries >= 5) { if (!s.current) showWallet(null); return; }
    if (s.busy) { rejoin(); return; }
    rejoining = true; rejoinTries++;
    try { await hub.connect(walletUuid); } catch {} finally { rejoining = false; }
    if (!hub.snapshot().current) rejoin();
  }, 400);
}
function showWallet(c) { const key = c ? c.owner.toLowerCase() + '@' + c.chainId : ''; if (key !== walletKey) { walletKey = key; setConnection(c?.owner, c?.chainId); } }
hub.subscribe(s => {
  const c = s.current;
  if (c) { walletUuid = c.entry.uuid; showWallet(c); return; }
  if (rejoining) return;
  if (walletUuid && Date.now() < rejoinUntil && rejoinTries < 5) { rejoin(); return; }
  showWallet(null);
});
$('qxt-connect').addEventListener('click', () => {
  const menu = $('qxt-wallets');
  if (!menu.hidden) { menu.hidden = true; return; }
  if (!state.me) { hub.open(); return; }
  menu.replaceChildren(h('button', { type: 'button', onclick: () => { menu.hidden = true; hub.open(); } }, 'Wallet details'),
    h('button', { type: 'button', onclick: () => { menu.hidden = true; hub.disconnect(); } }, 'Disconnect'));
  menu.hidden = false;
});
window.__qxtReady = true; // wallet-early.js stops handling Connect taps from here

// ---- Feed ----
function feedRows() {
  const q = $('qxt-search').value.trim().toLowerCase(), t = now();
  let rows = state.markets.filter(m => m.live && (state.chain==='all'||String(m.chainId)===state.chain) && (!q || [m.name, m.symbol, m.token, m.controller].some(v => (v || '').toLowerCase().includes(q))));
  if (state.feed === 'opening') rows = rows.filter(m => (m.auctionEndsAt || 0) > t || (m.opensAt || 0) > t || t - m.launchedAt < 3600).sort((a, b) => (a.auctionEndsAt || a.opensAt || a.launchedAt) - (b.auctionEndsAt || b.opensAt || b.launchedAt));
  else if (state.feed === 'trending') rows = rows.filter(m => m.summary?.trades24).sort((a, b) => b.summary.volume24 - a.summary.volume24);
  else if (state.feed === 'watch') rows = rows.filter(m => state.watch.has(keyOf(m))).sort((a, b) => b.launchedAt - a.launchedAt);
  else rows.sort((a, b) => b.launchedAt - a.launchedAt);
  // Launches that copy an earlier verified launch's ticker or name stay listed, labelled, below the rest.
  if (state.feed !== 'watch') rows = [...rows.filter(m => !state.trust[keyOf(m)]?.copyOf), ...rows.filter(m => state.trust[keyOf(m)]?.copyOf)];
  return pinOfficial(rows, q);
}
function badges(m) {
  const t = now(), out = [], tr = state.trust[keyOf(m)], om = rowMark(m.chainId, m.token, m.name, m.symbol);
  if (om) out.push(om);
  if (tr?.copyOf) out.push(copyLabel(tr.copyOf, { compact: true }));
  else if (tr?.verified) out.push(badge(tr.verified, { compact: true }));
  if ((m.auctionEndsAt || 0) > t) out.push(h('span', { class: 'qxt-badge warm' }, 'Auction ' + clock(m.auctionEndsAt - t)));
  else if ((m.opensAt || 0) > t) out.push(h('span', { class: 'qxt-badge warm' }, 'Opens ' + clock(m.opensAt - t)));
  const bits = BITS.filter((_, i) => (m.mask >> i) & 1 && i !== 0 && i !== 5);
  if (bits.length) out.push(h('span', { class: 'qxt-badge', title: bits.join(', ') }, bits.length <= 2 ? bits.join(' · ') : bits.slice(0, 2).join(' · ') + ' +' + (bits.length - 2)));
  if (m.pools.includes('eth')) out.push(h('span', { class: 'qxt-badge' }, 'ETH pool'));
  return out;
}
function xRows() {
  const q = $('qxt-search').value.trim();
  if(q.length<2||state.xq!==q||state.xchain!==state.chain)return [];
  const identity=(chain,address)=>chain+':'+(chain==='solana'?address:String(address||'').toLowerCase());
  const mine=new Set(state.markets.map(m=>identity(m.chainId,m.token)));
  return state.xhits.filter(x=>(state.chain==='all'||x.chainId===state.chain)&&!mine.has(identity(x.chainId,x.address)));
}
function xItem(x,i) {
  const sel = state.sel?.ext && state.sel.chainId === x.chainId && state.sel.ext === x.address;
  const row = h('button', { type: 'button', class: 'qxt-row', onclick: () => selectExternal(x.chainId, x.address) },
    avatar({ token: x.address, symbol: x.symbol, chainId: x.chainId }),
    h('span', { class: 'qxt-r1' }, h('b', {}, x.symbol || '?'), h('span', { class: 'qxt-muted qxt-trunc' }, x.name || ''), rowMark(x.chainId, x.address, x.name, x.symbol)),
    h('span',{class:'qxt-r3 qxt-rail-contract'},h('b',{},CHAIN_NAME[x.chainId]||x.chainId),h('code',{title:x.address},short(x.address))),
    h('span', { class: 'qxt-r2' }, h('span', {}, h('i', {}, 'Liq '), x.liquidityUsd != null ? '$' + compact(x.liquidityUsd) : '—'), h('span', {}, h('i', {}, 'V '), x.volume24Usd != null ? '$' + compact(x.volume24Usd) : '—'),
      h('span', { class: x.change24 > 0 ? 'up' : x.change24 < 0 ? 'down' : '' }, x.change24 != null ? pct(x.change24) : '')));
  return h('li',{class:'qxt-x'+(sel?' sel':'')+(i===state.cursor?' cur':'')},row);
}
function renderWorkspaceRail() {
 const selected=selectedContext(),asset=workspaceAsset(selected),current=$('qxt-rail-selected');current.hidden=!asset;
 if(asset)current.replaceChildren(h('span',{class:'qxt-rail-kicker'},'In view'),h('div',{class:'qxt-current-market'},h('b',{},asset.symbol||'Reading token…'),h('span',{},CHAIN_NAME[asset.chainId]||asset.chainId)),h('code',{title:asset.token||asset.controller},asset.token||asset.controller));
 $('qxt-rail-note').textContent=workspaceMemory.snapshot().persistent?'Recent markets and watchlist are saved on this device.':'Kept in this tab. Browser storage is unavailable.';
 const launchMode=['new','opening','trending'].includes(state.feed);$('qxt-launch-view').hidden=!launchMode;if(launchMode)$('qxt-launch-sort').value=state.feed;
}
function memoryRow(row,i) {
 const selected=workspaceAsset(selectedContext()),active=selected?.key===row.key;
 const open=()=>row.kind==='launch'?select(row.chainId,row.controller):selectExternal(row.chainId,row.token);
 const label=CHAIN_NAME[row.chainId]||row.chainId,address=row.token||row.controller;
 const value=row.priceUsd!==null?'$'+price(row.priceUsd):row.priceQuote!==null?price(row.priceQuote)+' '+row.quoteSymbol:'Refreshing price…';
 return h('li',{class:'qxt-memory-row'+(active?' sel':'')+(i===state.cursor?' cur':''),'data-key':row.key},h('button',{type:'button',class:'qxt-row',ariaLabel:'Open '+(row.symbol||row.name||address)+' on '+label+' '+address,onclick:open},
  avatar({token:address,symbol:row.symbol,chainId:row.chainId}),h('span',{class:'qxt-r1'},h('b',{},row.symbol||short(address)),h('span',{class:'qxt-rail-chain'},label),rowMark(row.chainId,row.token,row.name,row.symbol),active?h('span',{class:'qxt-current-tag'},'Current'):null),
  h('span',{class:'qxt-r2'},h('span',{},value),row.change24!==null?h('span',{class:row.change24>0?'up':row.change24<0?'down':''},pct(row.change24)):null),
  h('span',{class:'qxt-r3 qxt-rail-contract'},h('code',{title:address},short(address)),h('span',{},row.kind==='launch'?'QHooks launch':'Outside token')),h('span',{class:'qxt-memory-time'},(row.origin==='listed'?'Listed launch':row.openedAt?'Viewed '+age(row.openedAt/1000)+' ago':'Watched market')+' · '+freshnessState(row,Date.now(),{fresh:'Live · '}).label)));
}
function workspaceRows(){return workspaceSearchRows({query:$('qxt-search').value.trim(),chain:state.chain,launches:state.markets,external:xRows(),saved:workspaceMemory.rows({mode:state.feed})});}
function keyboardRows(){
 if(state.feed==='wallets')return [];
 const xs=xRows().map(x=>({...x,kind:'external',token:x.address}));
 if(state.feed==='recent'||state.feed==='watch')return workspaceRows().rows;
 return [...feedRows(),...xs];
}
function searchNotice(){
 const active=state.xq===$('qxt-search').value.trim()&&state.xchain===state.chain;
 if(!active||state.xstatus==='loading')return h('li',{class:'qxt-empty',role:'status'},'Searching tokens…');
 if(state.xstatus==='error')return h('li',{class:'qxt-workspace-empty',role:'status'},h('b',{},'Token search unavailable'),h('p',{},state.xerror||'Search could not finish.'),h('button',{type:'button',class:'qxt-context-action',onclick:()=>workspaceSearch.retry()},'Retry search'));
 return h('li',{class:'qxt-empty'},'No matching tokens on the selected chain. Try the contract address.');
}
function renderFeed() {
 renderWorkspaceRail();
 if(state.feed==='wallets')return renderWallets();
 const list=$('qxt-list'),xs=xRows(),q=$('qxt-search').value.trim();
 if(state.feed==='recent'||state.feed==='watch'){
  const model=workspaceRows(),rows=model.saved,items=[];
  if(q.length>=2){
   if(model.matches.length)items.push(h('li',{class:'qxt-sect'},'Search results'),...model.matches.map((row,i)=>row.origin==='search'?xItem(row,i):memoryRow(row,i)));
   if(state.xstatus==='loading'||state.xstatus==='error'||!model.matches.length&&!rows.length)items.push(searchNotice());
  }
  if(rows.length)items.push(h('li',{class:'qxt-sect'},state.feed==='watch'?'Your watchlist':'Recently viewed'),...rows.map((row,i)=>memoryRow(row,model.matches.length+i)));
  if(!items.length)items.push(h('li',{class:'qxt-workspace-empty'},h('b',{},state.feed==='watch'?'Keep a market close':'Your workspace starts with a token'),h('p',{},state.feed==='watch'?'Use Watch beside any token to keep its chain and contract here.':'Open a token from the Tokens feed or search by name, symbol or contract.'),h('button',{type:'button',class:'qxt-context-action',onclick:()=>document.dispatchEvent(new CustomEvent('qxt:discover'))},'Browse tokens')));
  list.replaceChildren(...items);return;
 }
 const rows=feedRows(),xPart=xs.length?[h('li',{class:'qxt-sect'},'Outside tokens'),...xs.map((x,i)=>xItem(x,rows.length+i))]:q.length>=2?[searchNotice()]:[];
 if(!rows.length){list.replaceChildren(h('li',{class:'qxt-workspace-empty'},h('b',{},'No matching QHooks launches'),h('p',{},'Outside tokens remain available in Tokens, Recent and Watchlist.'),h('button',{type:'button',class:'qxt-context-action',onclick:()=>document.dispatchEvent(new CustomEvent('qxt:discover'))},'Browse tokens')),...xPart);return;}
 list.replaceChildren(...rows.map((m,i)=>{
  const s=m.summary,u=unitOf(m),sel=state.sel&&keyOf(state.sel)===keyOf(m);
  return h('li',{class:(sel?'sel ':'')+(i===state.cursor?'cur':''),'data-key':keyOf(m)},h('button',{type:'button',class:'qxt-row',onclick:()=>select(m.chainId,m.controller)},avatar(m),
   h('span',{class:'qxt-r1'},h('b',{},m.symbol),h('span',{class:'qxt-rail-chain'},CHAIN_NAME[m.chainId]||m.chainId),h('span',{class:'qxt-age'},age(m.launchedAt))),
   s?h('span',{class:'qxt-r2'},h('span',{},h('i',{},'MC '),money(s.mcap,m.quoteSymbol)),h('span',{},h('i',{},'V '),money(s.volume24,m.quoteSymbol)),h('span',{class:s.change24>0?'up':s.change24<0?'down':''},pct(s.change24))):h('span',{class:'qxt-r2 qxt-quiet'},'Refreshing…'),
   h('span',{class:'qxt-r3 qxt-rail-contract'},h('code',{title:m.token||m.controller},short(m.token||m.controller)),...badges(m))),h('button',{type:'button',class:'qxt-qb',title:'Buy '+m.symbol+' with '+state.quick[u]+' '+QUNIT[u],onclick:()=>quickBuy(m)},'⚡ '+state.quick[u]));
 }),...xPart);
}
let feedRevision=0;
async function loadFeed() {
  const chain=state.chain,revision=++feedRevision;
  try {
    const r = await fetch('/api/terminal/feed?chain=' + chain, { cache: 'no-store' });
    const [j, trust] = await Promise.all([r.ok ? r.json() : null, trustList()]);
    if(revision!==feedRevision||chain!==state.chain)return;state.trust=trust;
    if (j) { state.markets = j.markets || [];for(const m of state.markets)if(state.watch.has(keyOf(m))&&!workspaceMemory.has({kind:'launch',chainId:m.chainId,controller:m.controller}))workspaceMemory.watch({kind:'launch',chainId:m.chainId,token:m.token,controller:m.controller,symbol:m.symbol,name:m.name},true);renderFeed(); for (const fn of marketListeners) { try { fn(state.markets); } catch {} } }
  } catch {}
}

// ---- Chart ----
let chart, candles, volume,chartTools;
const providerChart=createProviderChartRenderer({nativeElement:$('qxt-chart')}),chartUnits=document.querySelector('[aria-label="Chart units"]');
function css(name) { return getComputedStyle(document.body).getPropertyValue(name).trim(); }
function ensureChart() {
  if (chart) return;
  const el = $('qxt-chart'), line = css('--qxt-grid'), up = css('--qxt-up'), down = css('--qxt-down');
  chart = createChart(el, { autoSize: true, layout: { background: { color: 'transparent' }, textColor: css('--qx-muted'), fontFamily: css('--qx-sans'), fontSize: 11 },
    grid: { vertLines: { color: line }, horzLines: { color: line } }, rightPriceScale: { borderColor: line, scaleMargins: { top: 0.12, bottom: 0.24 } },
    timeScale: { borderColor: line, timeVisible: true, secondsVisible: false, rightOffset: 6 }, crosshair: { mode: CrosshairMode.Normal } });
  candles = chart.addCandlestickSeries({ upColor: up, downColor: down, borderVisible: false, wickUpColor: up, wickDownColor: down, priceFormat: { type: 'custom', formatter: price, minMove: 1e-12 } });
  volume = chart.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
  chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
  chartTools=mountChartTools({h,chart,candles,volume,element:el,storage:memoryStorage});
}
// Day/night (2026-11-10): the chart reads its colours from the theme's CSS variables; re-read them when the theme flips,
// then re-render (volume bars and the provider embed take theme colours/params per render).
function applyChartTheme() {
  if (!chart) return;
  const line = css('--qxt-grid'), up = css('--qxt-up'), down = css('--qxt-down');
  chart.applyOptions({ layout: { textColor: css('--qx-muted') }, grid: { vertLines: { color: line }, horzLines: { color: line } }, rightPriceScale: { borderColor: line }, timeScale: { borderColor: line } });
  candles.applyOptions({ upColor: up, downColor: down, wickUpColor: up, wickDownColor: down });
}
new MutationObserver(() => { try { applyChartTheme(); if (state.data) renderChart(); } catch {} }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
let lastChartKey = '';
function marketDisplay() {
 const raw=state.data;if(!raw)return null;const view=nativeMarketView(raw);
 return view?{...raw,...view}:raw;
}
function nativeEmpty(d,part) {
 if(d.ext)return d.tradeCoverage?.scope==='received_confirmed_swaps'?'No indexed trades received for this pool.':'No trades returned for this pool.';
 if(d.status!=='ready')return d.note;
 if(part==='holders')return 'No holder balances returned for this snapshot.';
 return d.hasTraded?'No trades in this window yet.':part==='chart'?'The chart starts with the first trade. Buys and sells will appear automatically.':'Waiting for the first trade. Buys and sells will appear automatically.';
}
function renderChart() {
  const d = marketDisplay(); if (!d) return;
  const ownChart=ownChartView(d);
  for(const b of $('qxt-tf').querySelectorAll('button')){b.disabled=!!d.ext&&Number(b.dataset.tf)<60;if(b.disabled)b.title='Outside-token candles start at one minute';}
  const embedSelection=d.ext?{chainId:d.meta.chainId,token:d.meta.token,pool:d.token?.pools?.[0]?.address,quote:d.token?.pools?.[0]?.quoteAddress,asset:d.meta.symbol,tf:d.tf}:null;
  // Outside tokens: when our candles are missing or behind, show the live provider chart instead of a stale one.
  const candlesBehind=!!d.ext&&!!d.candles?.length&&historyState('candles',d.historyFreshness?.candles).stale;
  // Our candles first: no provider embed while the history read is still running (2026-11-10, chart switch).
  if((!d.candles?.length||candlesBehind)&&d.marketCoverage?.candles!=='loading'&&providerChart.render(d.chartSurface||directProviderChart(embedSelection),embedSelection)){chartUnits.hidden=true;const status=$('qxt-candles-freshness');if(status)status.hidden=true;return;}
  providerChart.clear();chartUnits.hidden=false;
  renderHistoryStatus('candles',d);
  ensureChart();
  const history=renderChartHistory({element:$('qxt-chart'),message:$('qxt-chart-empty'),data:{...d,candles:ownChart.bars},formatPrice:value=>(ownChart.unit&&ownChart.unit!=='USD'?'':'$')+price(value)+(ownChart.unit&&ownChart.unit!=='USD'?' '+ownChart.unit:'')});
  const capMissing=state.unit==='mcap'&&!(d.summary?.supply>0),bars=capMissing?[]:history.bars;
  const k = state.unit === 'mcap' ? d.summary?.supply || 1 : 1, up = css('--qxt-up-a'), down = css('--qxt-down-a');
  $('qxt-chart-empty').hidden = bars.length > 0;
  if(!history.stale)$('qxt-chart-empty').textContent=capMissing?'Market cap chart needs indexed supply. Price chart and activity remain available.':d.ext&&d.marketCoverage?.candles==='loading'?'Loading chart…':d.ext&&d.marketCoverage?.candles!=='available'?'Refreshing chart…':nativeEmpty(d,'chart');
  candles.setData(bars.map(c => ({ time: c.time, open: c.open * k, high: c.high * k, low: c.low * k, close: c.close * k })));
  candles.applyOptions({priceFormat:{type:'custom',formatter:d.nativeQuote?value=>(ownChart.unit==='USD'?'$':'')+price(value):price,minMove:1e-12}});
  $('qxt-chart').title=d.nativeQuote?.usd?ownChart.unit+' chart uses '+d.nativeQuote.symbol+'/USD observed '+new Date(d.nativeQuote.observedAt).toISOString()+'. Volume is in '+d.nativeQuote.symbol+'.':'';
  volume.setData(bars.map(c => ({ time: c.time, value: c.volume, color: c.close >= c.open ? up : down })));
  chartTools.update({key:d.meta.chainId+':'+d.meta.token+':'+state.unit,label:(d.meta.symbol||'Token')+' · '+(d.meta.chainId==='solana'?'Solana':CHAIN_NAME[d.meta.chainId]||d.meta.chainId)+' · '+(TFS.find(([tf])=>tf===d.tf)?.[1]||d.tf+'s')+' · '+(state.unit==='mcap'?'MCap':'Price')+(ownChart.unit?' '+ownChart.unit:''),data:bars.map(c=>({...c,open:c.open*k,high:c.high*k,low:c.low*k,close:c.close*k,volumeKind:'quote',quoteVolume:c.volume}))});
  // Your trades, the creator's and tracked wallets', marked on their bars.
  const tag = t => t.trader === state.me ? '' : t.trader === d.meta.owner ? 'Dev ' : state.tracked[t.trader] + ' ';
  const marks = d.trades.filter(t => t.pool < 2 && (t.trader === state.me || t.trader === d.meta.owner || state.tracked[t.trader])).map(t => ({ time: t.ts - t.ts % d.tf, position: t.buy ? 'belowBar' : 'aboveBar',
    color: t.trader === state.me ? css('--qx-brass') : t.trader === d.meta.owner ? css('--qx-ink') : css('--qx-sage'), shape: t.buy ? 'arrowUp' : 'arrowDown', size: 0.6, text: tag(t).trim() }))
    .filter(m => bars.some(c => c.time === m.time))
    // One marker per bar, side and wallet kind: a burst of trades in one bar reads as one arrow, not a stack.
    .filter((m, i, all) => all.findIndex(o => o.time === m.time && o.position === m.position && o.color === m.color) === i).sort((a, b) => a.time - b.time);
  candles.setMarkers(marks);
  chart.applyOptions({ timeScale: { secondsVisible: d.tf < 60 } });
  const key = keyOf(state.sel) + d.tf + state.unit;
  // A new market or timeframe opens on the latest ~90 bars, so a young launch sits at the right edge.
  // Show the last 90 bars; a young launch with few bars gets a 60-bar window from its first bar instead of a sliver at the right edge.
  if (key !== lastChartKey) { lastChartKey = key; const n = bars.length, from = n > 90 ? n - 90 : -Math.max(3, Math.round((60 - n) / 3)); chart.timeScale().setVisibleLogicalRange({ from, to: Math.max(n + 4, from + 60) }); }
}

// ---- Header ----
/// Verified creator or copy warning next to the launch's name (qx-trust.mjs).
function headTrust() {
  let el = $('qxt-trust');
  if (!el) { el = h('span', { id: 'qxt-trust', class: 'qxt-trust' }); $('qxt-name').after(el); }
  const sel = state.sel; if (!sel || sel.ext) { el.replaceChildren(); return; }
  const k = keyOf(sel); el.dataset.key = k;
  trustOf(sel.chainId, sel.controller).then(t => { if (el.dataset.key === k) el.replaceChildren(...[t?.copyOf ? copyLabel(t.copyOf) : null, t?.verified ? badge(t.verified) : null].filter(Boolean)); });
}
/// Official badge or impostor mark next to the name, and the impostor banner under the header and above the trade ticket (qx-official.mjs).
function syncOfficial(m) {
  mountRecapturePanel($('qxt-stats'),m&&!state.sel?.ext?m:null);
  mountArbGapPanel($('qxt-stats'),m);
  mountRelaunchBadge($('qxt-stats'),m);
  let mark = $('qxt-official'); if (!mark) { mark = h('span', { id: 'qxt-official', class: 'qxt-trust' }); $('qxt-name').after(mark); }
  const o = m && officialFor(m.chainId, m.token), f = m && !o ? impostorOf(m.chainId, m.token, m.name, m.symbol) : null;
  mark.replaceChildren(...[o ? officialBadge(o) : f ? notOfficialBadge(f) : null].filter(Boolean));
  const k = f ? m.chainId + ':' + String(m.token).toLowerCase() : '';
  for (const [id, anchor] of [['qxt-impostor-head', 'qxt-market-identity'], ['qxt-impostor', 'qxt-ticket']]) {
    let ban = $(id); if (ban && ban.dataset.key === k) continue; ban?.remove(); if (!f || !$(anchor)) continue;
    ban = impostorBanner(f); ban.id = id; ban.dataset.key = k; $(anchor).before(ban);
  }  // Official QHOOKS: live buybacks & burns under the stats, with a Run buyback button when one is allowed.
  const bk = o ? m.chainId + ':' + String(m.token).toLowerCase() : '';
  let bb = $('qxt-buybacks');
  if (bb && bb.dataset.key !== bk) { bb._unmount?.(); bb.remove(); bb = null; }
  if (o && !bb && $('qxt-stats')) { bb = h('section', { id: 'qxt-buybacks', 'aria-label': 'Buybacks and burns' }); bb.dataset.key = bk; $('qxt-stats').after(bb);
    import('/qx-buybacks.mjs').then(x => { if (bb.isConnected) bb._unmount = x.mountBuybacks(bb, { compact: true, runButton: true }); }).catch(() => {}); }
    // Every QHooks launch: warn about third-party look-alike pools (shown only when some exist).
    const pk = m && /^\d+$/.test(String(m.chainId)) && /^0x[0-9a-fA-F]{40}$/.test(String(m.token || '')) ? m.chainId + ':' + String(m.token).toLowerCase() : '';
    let pw = $('qxt-pool-warning'); if (pw && pw.dataset.key !== pk) { pw.remove(); pw = null; }
    if (pk && !pw && $('qxt-market-identity')) { pw = h('div', { id: 'qxt-pool-warning', hidden: true }); pw.dataset.key = pk; $('qxt-market-identity').after(pw); import('/qx-official-pools.mjs').then(x => { if (pw.isConnected) x.mountPoolWarning(pw, { chainId: String(m.chainId), token: String(m.token).toLowerCase(), tradeHref: null }); }).catch(() => {}); }
    // Simple launches: "Started at $X · Bonded at $Y" under the identity line.
    const ck = m && m.kind === 'simple' ? m.chainId + ':' + String(m.token).toLowerCase() : '';
    let lc = $('qxt-launch-caps'); if (lc && lc.dataset.key !== ck) { lc.remove(); lc = null; }
    if (ck && !lc && $('qxt-market-identity')) { lc = h('p', { id: 'qxt-launch-caps', class: 'qxt-launch-caps', hidden: true }); lc.dataset.key = ck; $('qxt-market-identity').after(lc); import('/qx-launch-caps.mjs').then(x => { if (lc.isConnected) x.mountLaunchCaps(lc, { chainId: String(m.chainId), token: String(m.token).toLowerCase() }); }).catch(() => {}); }
    // Burn ticker in the official token's header: "N QHOOKS burned · next buyback in m:ss".
    let bt = $('qxt-burn-ticker'); if (bt && bt.dataset.key !== bk) { bt._unmount?.(); bt.remove(); bt = null; }
    if (o && !bt && $('qxt-market-identity')) { bt = h('p', { id: 'qxt-burn-ticker' }); bt.dataset.key = bk; $('qxt-market-identity').after(bt); import('/qx-burn-ticker.mjs').then(x => { if (bt.isConnected) bt._unmount = x.mountBurnTicker(bt, { href: null }); }).catch(() => {}); }
}
// Tab title (2026-11-10, holder report "the Tab price is not showing correctly"): people read tab prices as USD. USD with
// 4 significant digits written out (no subscript); the quote-token price only when it can't become USD (a non-native
// quote); otherwise just the symbol until a USD price lands, so a stale native-quote price never flashes in the tab.
export function plainPrice(p) {
  if (!(p > 0) || !Number.isFinite(p)) return '';
  if (p >= 1) return Number(p.toPrecision(6)).toLocaleString('en-US', {maximumFractionDigits: p >= 1000 ? 2 : 4});
  return p.toFixed(Math.min(20, 3 - Math.floor(Math.log10(p)))).replace(/(\.\d*?[1-9])0+$/, '$1');
}
export function tabTitle(symbol, {priceUsd = null, priceQuote = null, quoteSymbol = ''} = {}) {
  const sym = symbol || 'Token', native = /^W?(ETH|BNB|HYPE)$/i.test(quoteSymbol || '');
  const shown = priceUsd > 0 ? '$' + plainPrice(priceUsd) : !native && priceQuote > 0 ? plainPrice(priceQuote) + (quoteSymbol ? ' ' + quoteSymbol : '') : '';
  return sym + (shown ? ' ' + shown : '') + ' | QHooks Terminal';
}
function renderHead() {
  const d = marketDisplay(), m = d.meta, s = d.summary || {};
  $('qxt-symbol').textContent = m.symbol; $('qxt-symbol').title=m.symbol; $('qxt-name').textContent = m.name; $('qxt-name').title=m.name;
  syncOfficial(m);
  document.title = tabTitle(m.symbol, {priceUsd: s.priceUsd ?? (d.ext ? s.price : null), priceQuote: s.price, quoteSymbol: d.ext ? 'USD' : m.quoteSymbol});
  const ci = $('qxt-chain-icon'); ci.src = '/chain-symbol-icons/' + ICON[m.chainId] + '.svg'; ci.alt = CHAIN_NAME[m.chainId]; ci.hidden = false;
  const av = $('qxt-av'); if (av) { av.hidden = false; av.style.setProperty('--h', hue(m.token || state.sel?.controller)); av.firstChild.textContent = (m.symbol || '?').replace(/^\$/, '').slice(0, 1).toUpperCase(); av.querySelector('.qxt-av-logo')?.remove(); const lg = avLogo(m.chainId ?? state.sel?.chainId, m.token); if (lg) av.firstChild.after(lg); }
  const copy = $('qxt-copy'); copy.hidden = false; copy.textContent = short(m.token); copy.title = 'Copy ' + m.token;
  $('qxt-share').hidden = false; $('qxt-share').textContent = 'Share';
  const star=$('qxt-star');star.hidden=false;const watching=workspaceMemory.has(selectedContext());star.textContent=watching?'★ Watching':'☆ Watch';star.setAttribute('aria-pressed',String(watching));star.setAttribute('aria-label',(watching?'Remove from':'Add to')+' watchlist: '+m.symbol+' on '+(CHAIN_NAME[m.chainId]||m.chainId));
  const q = m.quoteSymbol, cell = (k, v, cls) => [h('div', {}, h('dt', {}, k), h('dd', { class: cls || '' }, v))];
  if (d.ext) {
    headTrust();
    const checks=marketWorkspace?.snapshot().checks,verdict={limited:['Limited checks',''],caution:['Caution','warn'],danger:['High risk','down'],unknown:['Refreshing…',''],unavailable:['Refreshing…',''],stale:['Refreshing…',''],pending:['Pending','']}[checks?.status]||['Pending',''];
    $('qxt-stats').replaceChildren(
      ...cell('Price', s.price!=null?'$'+price(s.price):'—'), ...cell('24h', pct(s.change24), s.change24 > 0 ? 'up' : s.change24 < 0 ? 'down' : ''),
      ...cell('MCap', money(s.mcap, 'USD')), ...cell('Liquidity', money(s.liquidity, 'USD')), ...cell('Vol 24h', money(s.volume24, 'USD')),
      ...cell('Buys / sells · 24h', Number.isFinite(s.buys24)&&Number.isFinite(s.sells24)?s.buys24+' / '+s.sells24:'—'), ...cell('Checks', verdict[0], verdict[1]));
    $('qxt-sync').textContent = 'Chart pool '+short(d.token?.pools?.[0]?.address)+' · execution via '+(m.chainId==='solana'?'Jupiter':hasDirectRoute(m.chainId)?'the pool · QHooks router':'0x');
    return;
  }
  headTrust();
  $('qxt-stats').dataset.source='index';
  $('qxt-stats').replaceChildren(
    ...cell('Price', s.priceUsd!=null?'$'+price(s.priceUsd)+' · '+price(s.price)+' '+q:s.price!=null?price(s.price)+' '+q:'—'), ...cell('24h', pct(s.change24), s.change24 > 0 ? 'up' : s.change24 < 0 ? 'down' : ''),
    ...cell('MCap', s.mcapUsd!=null?money(s.mcapUsd,'USD'):money(s.mcap, q)), ...cell('Vol 24h', money(s.volume24, q)), ...cell('Buys / sells · 24h', Number.isFinite(s.buys24)&&Number.isFinite(s.sells24)?s.buys24+' / '+s.sells24:'—'),
    ...cell('Holder wallets', s.holders ?? '—'), ...cell('Top 10', pct(s.top10, false)), ...cell('Burned', s.supply!=null&&s.burned!=null&&s.supply+s.burned>0 ? pct(s.burned / (s.supply + s.burned), false) : '—'),
    ...cell('Team locked', s.supply!=null&&s.burned!=null&&s.locked!=null&&s.supply+s.burned>0 ? pct(s.locked / (s.supply + s.burned), false) : '—'));
  $('qxt-sync').textContent = d.status==='ready'?'Live':{pending:'Loading price history…',syncing:'Loading price history…',partial:'Refreshing…',stale:'Refreshing…'}[d.status];
}

// ---- Bottom panes ----
function labelFor(addr) { return ownHolderLabel(state.data,addr)||tradeAddressLabel(addr,{meta:state.data?.meta,owner:state.me,tracked:state.tracked}); }

const link = (chainId, path, text) => h('a', { href: EXPLORER[chainId] + (chainId === 'solana' ? path.replace(/^\/address\//, '/account/') : path), target: '_blank', rel: 'noopener' }, text);
// ---- Tracked wallets ----
function saveTracked() { store('tracked', JSON.stringify(state.tracked)); loadActivity(true); renderPane(); if (state.feed === 'wallets') renderFeed(); if (state.data) renderChart(); window.dispatchEvent(new CustomEvent('qhooks:tracked-change', { detail: { tracked: { ...state.tracked } } })); }
// Wallets page / card sync (pro terminal W1): replace the tracked list (names) without echoing a change event back.
window.addEventListener('qhooks:tracked-set', e => { const t = e.detail?.tracked; if (!t || typeof t !== 'object') return; state.tracked = Object.fromEntries(Object.entries(t).filter(([a]) => /^0x[0-9a-f]{40}$/.test(a)).map(([a, l]) => [a, String(l || '').slice(0, 24) || 'Wallet ' + a.slice(2, 6)])); store('tracked', JSON.stringify(state.tracked)); loadActivity(true); renderPane(); if (state.feed === 'wallets') renderWallets(); if (state.data) renderChart(); });
const openWallet = (chainId, wallet) => window.dispatchEvent(new CustomEvent('qhooks:wallet-open', { detail: { chainId, wallet } }));
function track(addr, label) { state.tracked[addr] = (label || '').trim().slice(0, 24) || 'Wallet ' + addr.slice(2, 6); saveTracked(); toast('Tracking ' + state.tracked[addr] + '.'); }
function untrack(addr) { delete state.tracked[addr]; saveTracked(); }
/// An address cell: explorer link, its label, and a one-click Track for addresses nobody named yet.
function who(chainId, addr, extra = null, systemLabel = null) {
  if (!addr) return h('td', {}, '—');
  const label = systemLabel||labelFor(addr), tracked = !!state.tracked[addr], person = !label || tracked;
  return h('td', {}, link(chainId, '/address/' + addr, short(addr)), label ? (tracked ? h('button', { type: 'button', class: 'qxt-tag tracked qxt-tag-open', title: 'Open wallet card', onclick: () => openWallet(chainId, addr) }, label) : h('span', { class: 'qxt-tag' }, label)) : null, extra,
    person && !tracked && addr !== state.me ? h('button', { type: 'button', class: 'qxt-track', title: 'Track this wallet', onclick: () => track(addr) }, '+ Track') : null);
}
const tradeTape=createTradeTape();
const tapeControls=mountTapeControls({h,container:$('qxt-pane'),onChange:()=>renderPane(),onPause:()=>{if(tradeTape.status().paused)tradeTape.resume();else tradeTape.pause();renderPane();}});
paneReady=true;
const holderPanel=createExternalHolderPanel({h,who,link,short,pct});
const onchainEvm=createOnchainEvmFallback();
const priceAlerts=mountPriceAlerts({h,after:$('qxt-ticket'),storage:memoryStorage,onError:e=>{$('qxt-sync').textContent=e.message;},onReached:(target,alert)=>toast((alert.state==='target'?'Target':'Stop')+' reached for '+(target.symbol||'this token')+'.', ['Review sell',async()=>{if(!state.sel?.ext||state.sel.chainId!==target.chainId||state.sel.ext!==target.token)await selectExternal(target.chainId,target.token);const owner=target.chainId==='solana'?solAddress():state.me;if(owner)await ticket.prefillSell({percent:100,owner,chainId:target.chainId,token:target.token});else $('qxt-sync').textContent='Connect the holding wallet to prepare a sell.';}])});

function renderHistoryStatus(kind,d){
 const id='qxt-'+kind+'-freshness';let node=$(id);
 if(!node){node=h('p',{id,class:'qxt-panel-freshness',role:'status'});if(kind==='candles')$('qxt-chart').prepend(node);else $('qxt-pane').before(node);}
 node.hidden=!d?.ext||(kind==='trades'&&!['trades','traders'].includes(state.pane));
 if(node.hidden)return;
 // Providers are credited at the bottom of the page; near the chart only say when it is behind.
 const details=d.historyFreshness?.[kind],status=historyState(kind,details);
 if(kind==='candles'){node.hidden=!status.stale;node.textContent=status.stale?'Chart refreshing · '+status.label:'';}else node.textContent=status.label;
 node.dataset.stale=String(status.stale);
}

function renderPane() {
  if(!paneReady)return; // a remembered wallet's subscribe callback can run before the pane controls below exist
  const pane = $('qxt-pane'), d = marketDisplay();pane.dataset.mode=state.pane;
  renderHistoryStatus('trades',d);
  $('qxt-trade-filters').hidden = state.pane !== 'trades';tapeControls.element.hidden=state.pane!=='trades';
  if (state.pane === 'positions') return renderPositions();
  if (!d) { pane.replaceChildren(h('p', { class: 'qxt-empty' }, state.loading?'Loading this token’s trades…':state.loadError||'Choose a token to see its trades. Holder coverage is available for QHooks launches.')); return; }
  const m = d.meta, q = m.quoteSymbol;
  const traderTab=$('qxt-data-tabs').querySelector('[data-pane="traders"]');if(traderTab)traderTab.textContent=d.ext?'Recent traders':'Top traders';
  priceAlerts.update({selection:selectedContext(),price:d.summary?.price,at:Number.isFinite(d.token?.observedAt)?d.token.observedAt:d.synced?.at||null});
  tradeTape.ingest(m.chainId+':'+m.token+':'+(d.token?.pools?.[0]?.address||m.controller||''),d.trades.map(t=>({...t,valueUsd:t.valueUsd??(d.ext||stable(q)&&t.pool!==2?t.quote:null)})));tapeControls.status(tradeTape.status());
  tapeControls.element.dataset.historyStale=String(tapeHistoryState(tradeTape.receivedRows()).collapsed);
  const creatorFilter=$('qxt-trade-filters').querySelector('[data-filter="creator"]');if(creatorFilter){creatorFilter.disabled=!m.owner;creatorFilter.title=m.owner?'Trades by the token creator':'Creator identity is not indexed for this token';}
  if(state.filter==='creator'&&!m.owner){state.filter='all';pressGroup($('qxt-trade-filters'),'filter','all');}
  if(d.ext&&state.pane==='holders'&&m.chainId==='solana'){holderPanel.show(pane,m.chainId,m.token,d);return;}
  if(d.ext&&state.pane==='holders'&&!d.holders.length&&d.holderSample){const token=m.token,selection={chainId:m.chainId,token,pool:d.token?.pools?.[0]?.address,quote:d.token?.pools?.[0]?.quoteAddress};
    const onMore=()=>onchainEvm.more({selection,getData:()=>state.data,isCurrent:()=>state.data?.meta?.token===token&&state.data?.token?.pools?.[0]?.address===selection.pool,onData:updated=>{state.data=updated;paintMarket();}}).then(ok=>{if(!ok)paintMarket();});
    pane.replaceChildren(...renderOnchainHolderSample({h,who,link,short,chainId:m.chainId,market:d,sample:d.holderSample,freshness:freshnessState(d.holderSample),onMore}));return;}
  if(d.ext&&state.pane==='traders'){const rows=recentTraders(tradeTape.receivedRows());pane.replaceChildren(h('p',{class:'qxt-data-scope'},'Recent traders · '+tradeTape.status().received+' received trades. Values cover this tape; balances, cost basis and all-time PnL are not inferred.'),h('table',{class:'qxt-table'},h('thead',{},h('tr',{},...['Wallet','Buys / sells','Bought, $','Sold, $','Last',''].map(x=>h('th',{},x)))),h('tbody',{},...rows.map(r=>h('tr',{},who(m.chainId,r.trader),h('td',{},r.buys+' / '+r.sells),h('td',{},r.unknownValues?'—':money(r.buyUsd,'USD')),h('td',{},r.unknownValues?'—':money(r.sellUsd,'USD')),h('td',{},age(r.last)),h('td',{},h('button',{type:'button',class:'qxt-track',onclick:()=>{state.pane='trades';for(const b of $('qxt-data-tabs').querySelectorAll('[data-pane]'))b.setAttribute('aria-selected',String(b.dataset.pane==='trades'));tapeControls.setWallet(r.trader);renderPane();}},'Filter tape')))))));return;}
  if (d.ext && state.pane === 'traders') {
    const explorer=EXPLORER[m.chainId],label=state.pane==='holders'?'Holder balances':'Top-trader rankings';
    pane.replaceChildren(h('div',{class:'qxt-workspace-empty'},h('b',{},label+' are not indexed here for this token.'),
      h('p',{},'Open its token page on the explorer to inspect on-chain activity.'),
      ...(explorer?[h('a',{class:'qxt-context-action',href:explorer+'/token/'+m.token,target:'_blank',rel:'noopener'},m.chainId==='solana'?'View token on Solscan ↗':'View token on explorer ↗')]:[])));
    return;
  }
  if (state.pane === 'holders') {
    pane.replaceChildren(...renderMarketHolders({h,who,link,short,chainId:m.chainId,market:d,sample:d.ext?{rows:d.holders||[],observedAt:d.token?.observedAt,source:d.token?.source}:null}),...(d.ext&&EXPLORER[m.chainId]?[link(m.chainId,'/token/'+m.token,'View token on explorer ↗')]:[]));
    return;
  }
  if (state.pane === 'traders') {
    const rows = (d.traders || []).map(r => { const avg = r.bought ? r.spent / r.bought : 0, costed = Math.max(0, Math.min(r.balance, r.bought - r.sold));
      return { ...r, pnl: d.summary?.price==null?null:r.received - r.sold * avg + costed * (d.summary.price - avg) }; });
    if (!rows.length) { pane.replaceChildren(h('p', { class: 'qxt-empty' }, nativeEmpty(d,'trades'))); return; }
    pane.replaceChildren(h('table', { class: 'qxt-table' }, h('thead', {}, h('tr', {}, ...['Trader', 'Bought', 'Sold', 'Holds', 'PnL', 'Trades', 'Last'].map(t => h('th', {}, t)))),
      h('tbody', {}, ...rows.map(r => h('tr', {}, who(m.chainId, r.trader), h('td', {}, money(r.spent, q)), h('td', {}, money(r.received, q)), h('td', {}, compact(r.balance)),
        h('td', { class: r.pnl > 0 ? 'up' : r.pnl < 0 ? 'down' : '' }, (r.pnl > 0 ? '+' : '') + money(r.pnl, q)), h('td', {}, String(r.n)), h('td', {}, age(r.last)))))));
    return;
  }
  if(d.ext&&d.marketCoverage?.trades==='loading'){pane.replaceChildren(h('p',{class:'qxt-empty'},'Loading trades…'));return;}
  if(d.ext&&d.marketCoverage?.trades&&d.marketCoverage.trades!=='available'){pane.replaceChildren(h('div',{class:'qxt-workspace-empty'},h('b',{},'Refreshing trades…'),h('p',{},'They\u2019ll appear here in a moment.'),h('button',{type:'button',class:'qxt-context-action',onclick:()=>marketWorkspace.retry()},'Retry data')));return;}
  const rows = ownTapeRows(tradeTape.filter(tapeControls.filters(),{chainId:m.chainId,owner:m.chainId==='solana'?solAddress():state.me,creator:m.owner,tracked:state.tracked,side:state.filter}),d);
  const showTape=content=>renderTapeHistory({h,pane,content,rows:tradeTape.receivedRows(),key:m.chainId+':'+m.token+':'+(d.token?.pools?.[0]?.address||m.controller||'')});
  if (!rows.length) { showTape(h('p', { class: 'qxt-empty' }, d.trades.length ? 'No trades match this filter.' : nativeEmpty(d,'trades'))); return; }
  showTape(h('table', { class: 'qxt-table' }, h('thead', {}, h('tr', {}, ...['Age', 'Side', 'Price', 'Amount', 'Value', 'Trader', ''].map(t => h('th', {}, t)))),
    h('tbody', {}, ...rows.map(t => { const eth = t.pool === 2;
      return h('tr', { class: t.buy ? 'b' : 's' }, h('td', { title: new Date(t.ts * 1000).toLocaleString() }, age(t.ts)), h('td', { class: t.buy ? 'up' : 'down' }, t.buy ? 'Buy' : 'Sell',t.source==='QHooks data'?h('span',{class:'qxt-tag',title:'Trade source'},'Public RPC'):null),
        (()=>{const tp=ownTapePrice(t,{ext:!!d.ext,quoteSymbol:eth?'ETH':q},price);return h('td',tp.title?{title:tp.title}:{},tp.text);})(), h('td', {}, compact(t.token)), h('td', {title:t.usdObservedAt?'USD quote observed '+new Date(t.usdObservedAt).toISOString():undefined}, ownTapeValue(t,money)??(eth ? compact(t.quote) + ' ETH' : money(t.quote, q))),
        t.via === 'auction' ? h('td', {}, link(m.chainId, '/address/' + t.trader, short(t.trader)), h('span', { class: 'qxt-tag' }, 'Auction batch')) : who(m.chainId, t.trader, eth ? h('span', { class: 'qxt-tag' }, 'ETH pool') : null),
        h('td', {}, link(m.chainId, '/tx/' + t.tx, '↗'))); }))));
}
// ---- Toasts and alerts ----
function toast(text, ...actions) {
  const el = h('div', { class: 'qxt-toast' }, h('span', {}, text), ...actions.map(([label, fn]) => h('button', { type: 'button', onclick: () => { el.remove(); fn(); } }, label)),
    h('button', { type: 'button', class: 'qxt-x', ariaLabel: 'Dismiss', onclick: () => el.remove() }, '×'));
  $('qxt-toasts').append(el);
  setTimeout(() => el.remove(), actions.length ? 15000 : 6000);
  if (state.alerts && document.hidden && 'Notification' in window && Notification.permission === 'granted') { try { new Notification('QHooks', { body: text, icon: '/qhooks-logo.jpg' }); } catch {} }
}

// ---- Tracked wallets: activity across every listed launch ----
const seen = new Set();
let activityTimer = null, primed = false; // primed: the first load only records what is already there
async function loadActivity(quiet = false) {
  const list = Object.keys(state.tracked);
  clearTimeout(activityTimer);
  if (!list.length) { state.activity = []; if (state.feed === 'wallets') renderWallets(); return; }
  try {
    const r = await fetch('/api/terminal/activity?w=' + list.slice(0, 50).join(','), { cache: 'no-store' });
    if (r.ok) {
      const trades = (await r.json()).trades || [], first = !primed;
      for (const t of trades.slice().reverse()) {
        const id = t.tx + t.trader + t.token;
        if (seen.has(id)) continue;
        seen.add(id);
        // New trades by tracked wallets: a toast with Open and, for buys, Copy.
        if (!first && !quiet && t.ts > now() - 600) toast((state.tracked[t.trader] || short(t.trader)) + (t.buy ? ' bought ' : ' sold ') + compact(t.token) + ' ' + t.symbol + ' for ' + money(t.quote, t.quoteSymbol),
          ['Open', () => select(t.chainId, t.controller)], ...(t.buy ? [['Copy', () => copyTrade(t)]] : []));
      }
      state.activity = trades; primed = true;
      if (state.feed === 'wallets') renderWallets();
    }
  } catch {}
  activityTimer = setTimeout(() => { if (!document.hidden) loadActivity(); else activityTimer = setTimeout(loadActivity, 10000); }, 10000);
}
/// Copy a tracked wallet's buy: open that launch and buy your own quick-buy amount.
async function copyTrade(t) {
  const m = state.markets.find(x => x.chainId === t.chainId && x.controller === t.controller) || { chainId: t.chainId, controller: t.controller, quoteSymbol: t.quoteSymbol };
  return quickBuy(m);
}
const walletStats = new Map();
async function loadWalletStats(addr) {
  const hit = walletStats.get(addr);
  if (hit && Date.now() - hit.at < 60000) return hit;
  try {
    const r = await fetch('/api/terminal/wallet/' + addr, { cache: 'no-store' }); if (!r.ok) return null;
    const ps = (await r.json()).positions || [];
    let pnl = 0, spent = 0, sym = null;
    for (const p of ps) { const avg = p.bought ? p.spent / p.bought : 0, costed = Math.max(0, Math.min(p.balance, p.bought - p.sold)); pnl += p.received - p.sold * avg + costed * (p.price - avg); spent += p.spent; sym ??= p.quoteSymbol; }
    const v = { at: Date.now(), pnl, spent, open: ps.filter(p => p.balance > 0).length, sym };
    walletStats.set(addr, v); return v;
  } catch { return null; }
}
function renderWallets() {
  const list = $('qxt-list'), addrs = Object.keys(state.tracked);
  const addr = h('input', { type: 'text', placeholder: '0x… wallet to track', autocomplete: 'off', spellcheck: false, ariaLabel: 'Wallet address' });
  const name = h('input', { type: 'text', placeholder: 'Name', maxLength: 24, ariaLabel: 'Wallet name' });
  const add = h('button', { type: 'button', class: 'qxt-mini' }, 'Track');
  add.addEventListener('click', () => { const a = addr.value.trim().toLowerCase(); if (!/^0x[0-9a-f]{40}$/.test(a)) { addr.focus(); return; } track(a, name.value); });
  const alerts = h('label', { class: 'qxt-alerts' }, h('input', { type: 'checkbox', checked: state.alerts, onchange: async e => {
    state.alerts = e.target.checked; store('alerts', state.alerts ? '1' : '0');
    if (state.alerts && 'Notification' in window && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch {} }
  } }), h('span', {}, 'Desktop alerts while this tab is in the background'));
  const items = [h('li', { class: 'qxt-addw' }, h('div', { class: 'qxt-addrow' }, addr, name, add), alerts)];
  for (const a of addrs) {
    const stats = h('span', { class: 'qxt-r2' }, 'Loading…');
    loadWalletStats(a).then(v => { stats.replaceChildren(...(v ? [h('span', { class: v.pnl > 0 ? 'up' : v.pnl < 0 ? 'down' : '' }, h('i', {}, 'PnL '), (v.pnl > 0 ? '+' : '') + money(v.pnl, v.sym || 'USDC')), h('span', {}, h('i', {}, 'Spent '), money(v.spent, v.sym || 'USDC')), h('span', {}, h('i', {}, 'Open '), String(v.open))] : ['—'])); });
    items.push(h('li', { class: 'qxt-wallet-row' }, h('div', { class: 'qxt-row' }, h('span', { class: 'qxt-r1' }, h('button', { type: 'button', class: 'qxt-wallet-name', title: 'Open wallet card', onclick: () => openWallet(null, a) }, state.tracked[a]), h('span', { class: 'qxt-muted qxt-trunc' }, short(a))), stats),
      h('button', { type: 'button', class: 'qxt-x', title: 'Stop tracking', ariaLabel: 'Stop tracking ' + state.tracked[a], onclick: () => untrack(a) }, '×')));
  }
  if (!addrs.length) items.push(h('li', { class: 'qxt-empty' }, 'Track wallets from any trades, holders or top-traders list (+ Track), or paste an address above. Their trades across every chain show here, with alerts.'));
  else if (!state.activity.length) items.push(h('li', { class: 'qxt-empty' }, 'No trades by tracked wallets in listed launches yet.'));
  for (const t of state.activity.slice(0, 40)) items.push(h('li', { class: 'qxt-act' }, h('button', { type: 'button', class: 'qxt-row', onclick: () => select(t.chainId, t.controller) },
    h('span', { class: 'qxt-r1' }, icon(t.chainId), h('b', {}, state.tracked[t.trader] || short(t.trader)), h('span', { class: t.buy ? 'up' : 'down' }, t.buy ? 'bought' : 'sold'), h('b', {}, t.symbol), h('span', { class: 'qxt-age' }, age(t.ts))),
    h('span', { class: 'qxt-r2' }, h('span', {}, compact(t.token) + ' ' + t.symbol), h('span', {}, money(t.quote, t.quoteSymbol)), h('span', {}, h('i', {}, '@ '), price(t.price)))),
    t.buy ? h('button', { type: 'button', class: 'qxt-qb', title: 'Buy your quick-buy amount of ' + t.symbol, onclick: () => copyTrade(t) }, 'Copy') : null));
  list.replaceChildren(...items);
}

function loadPositions(){return positionsPanel?.refresh();}
function renderPositions(){positionsPanel?.render();}

// ---- Selecting a market ----
let ticket, selectionFlow, poll = null, mseq = 0;
const canonicalHash=()=>state.sel?(state.sel.ext?'#t='+state.sel.chainId+':'+state.sel.ext:'#m='+state.sel.chainId+':'+state.sel.controller):'';
function restoreSelectionURL(){history.replaceState(null,'',location.pathname+location.search+canonicalHash());}
function clearMarketView(message='Choose a token') {
  providerChart.clear();chartUnits.hidden=false;
  for(const kind of ['candles','trades'])if($('qxt-'+kind+'-freshness'))$('qxt-'+kind+'-freshness').hidden=true;
  chartTools?.clear();priceAlerts.clear();holderPanel.clear();tradeTape.ingest(null,[]);tapeControls.status(tradeTape.status());
  tapeControls.element.dataset.historyStale='false';$('qxt-chart').dataset.historyStale='false';$('qxt-chart-empty').dataset.stale='false';
  $('qxt-symbol').textContent=message;$('qxt-name').textContent=state.sel?(CHAIN_NAME[state.sel.chainId]||state.sel.chainId)+' · '+short(state.sel.ext||state.sel.controller):'';
  document.title='Terminal | QHooks';$('qxt-stats').replaceChildren();
  for(const id of ['qxt-av','qxt-chain-icon','qxt-copy','qxt-share','qxt-star','qxt-board'])if($(id))$(id).hidden=true;
  const trust=$('qxt-trust');if(trust){trust.dataset.key='';trust.replaceChildren();}
  syncOfficial(null);
  document.querySelector('.qxt-tools').hidden=true;
  // A launch that is loading keeps the chart area visible so its "Loading price history…" message shows.
  $('qxt-chart').hidden=!(state.loading&&state.sel&&!state.sel.ext);
  try{candles?.setData([]);volume?.setData([]);candles?.setMarkers([]);}catch{}
  $('qxt-chart-empty').hidden=false;$('qxt-chart-empty').textContent=state.loading?(state.sel&&!state.sel.ext?COLD_CHART_MESSAGE:'Loading this token’s chart…'):'Choose a token to see its chart.';
  renderPane();renderWorkspace();
}
function paintMarket() {
  const selected=selectedContext();marketWorkspace?.receiveMarket(selected,state.data,state.data.marketCoverage||{});
  workspaceMemory.remember({...selected,receivedAt:Date.now(),observedAt:state.data.token?.observedAt??state.data.synced?.at??null,stale:!!state.data.token?.stale,openedAt:state.openedAt});renderFeed();syncConversation();positionsPanel?.render();
  renderHead();renderLaunchActions();if(state.pane!=='positions')renderPane();
  // A chart failure must not strand the correct trades or actionable token view.
  try{$('qxt-chart').hidden=false;renderChart();}catch{providerChart.clear();chartUnits.hidden=false;$('qxt-chart').hidden=true;$('qxt-chart-empty').hidden=false;$('qxt-chart-empty').textContent='Refreshing chart…';}
}
async function loadMarket({signal,strict=false}={}) {
  if(!state.sel)return false;
  if(state.sel.ext)return loadExternal({signal,strict});
  const mine=mseq,{chainId,controller}=state.sel;
  try {
    const r=await fetch(`/api/terminal/market/${chainId}/${controller}?tf=${state.tf}`,{cache:'no-store',signal});
    if(mine!==mseq)return false;
    if(!r.ok)throw Error(r.status===404?'This launch is not listed yet.':'Refreshing market data…');
    const data=await fillNativeUsd(await r.json());if(mine!==mseq)return false;applyCachedPoolPrice(data);
    const selected=selectedContext();if(String(data?.meta?.chainId)!==chainId||data.meta?.controller?.toLowerCase()!==controller||(selected?.token&&data.meta?.token?.toLowerCase()!==selected.token.toLowerCase()))throw Error('Market data does not match the selected launch. Refresh to retry.');
    state.data=data;state.loading=false;state.loadError=null;
    ticket.setPriceUsd(data.summary?.priceUsd??(data.meta?.quoteSymbol==='USD'||/^(USDC|USDT)$/i.test(data.meta?.quoteSymbol||'')?data.summary?.price:null),selectionFlow.current()?.intent);
    paintMarket();void fillPoolPrice(data,mine);
    if(!state.markets.find(m=>keyOf(m)===keyOf(state.sel))?.summary)loadFeed();return true;
  }catch(error){if(mine!==mseq)return false;if(strict)throw error;marketWorkspace?.failMarket(selectedContext(),error);$('qxt-sync').textContent=error.message||'Refreshing market data…';return false;}
}
// A launch with no trades yet still has a price: read it from the pool (StateView.getSlot0) so the header isn't "—".
const poolSpots=new Map();
async function poolSpotPrice(data){
 const pool=data?.meta?.pools?.find(p=>p.label==='launch')||data?.meta?.pools?.[0],view=chainById(data?.meta?.chainId)?.contracts?.stateView;
 if(!pool?.id||!/^0x[0-9a-f]{64}$/i.test(pool.id)||!view)return null;
 const id=pool.id.toLowerCase(),hit=poolSpots.get(id);if(hit&&Date.now()-hit.at<30000)return hit.price;
 const raw=await rpc(data.meta.chainId,'eth_call',[{to:view,data:GET_SLOT0+id.slice(2)},'latest']);
 const p=spotFromSlot0(raw,{tokenIs0:!!pool.tokenIs0,decimals:Number(data.meta.decimals??18),quoteDecimals:Number(data.meta.quoteDecimals??18)});
 if(!p)return null;poolSpots.set(id,{price:p,at:Date.now()});return p;
}
// ETH/USD for the dollar figure, read in the browser from DexScreener's deepest WETH pair on that chain (cached 60 s).
let ethUsdCache=null;
async function ethUsd(chainId,weth){
 if(ethUsdCache&&ethUsdCache.key===chainId&&Date.now()-ethUsdCache.at<60000)return ethUsdCache.usd;
 let usd=Number(pickPair(await fetchDexPairs(chainId,[weth]),chainId,weth,null)?.priceUsd);
 // Fallback: WETH on Base (deepest WETH market DexScreener lists).
 if(!(usd>0)){const base='0x4200000000000000000000000000000000000006';usd=Number(pickPair(await fetchDexPairs('8453',[base]),'8453',base,null)?.priceUsd);}
 if(!(usd>0))return null;ethUsdCache={key:chainId,usd,at:Date.now()};return usd;
}
// The index has no price until the first trade: use the pool's spot price instead (dollars first when ETH/USD is known).
const needsPoolPrice=s=>!!s&&!s.lastTradeAt&&!(Number(s.price)>0);
const launchPoolId=data=>(data?.meta?.pools?.find(p=>p.label==='launch')||data?.meta?.pools?.[0])?.id?.toLowerCase();
function applyPoolPrice(data,p,usd){
 const s=data.summary;s.price=p;s.mcap=p*Number(s.supply||data.meta.supply||0);s.priceFromPool=true;
 if(usd>0){s.priceUsd=p*usd;s.mcapUsd=s.mcap*usd;}else{s.priceUsd=null;s.mcapUsd=null;}
}
// Synchronous: a pool price this page already read (the cold read, or an earlier poll) fills the header in the same
// paint as the index, so an untraded launch never shows "—" between the pool read and the index.
function applyCachedPoolPrice(data){
 if(!needsPoolPrice(data?.summary))return;const hit=poolSpots.get(launchPoolId(data));if(!hit)return;
 applyPoolPrice(data,hit.price,/^W?ETH$/i.test(data.meta.quoteSymbol||'')?Number(data.nativeQuote?.usd)||null:/^(USD|USDC|USDT)$/i.test(data.meta.quoteSymbol||'')?1:null);
}
async function fillPoolPrice(data,mine){
 const s=data?.summary;if(!s||s.lastTradeAt||(Number(s.price)>0&&!s.priceFromPool))return;
 try{const p=await poolSpotPrice(data);if(!p||mine!==mseq||state.data!==data)return;
  let usd=null;
  if(/^W?ETH$/i.test(data.meta.quoteSymbol||'')&&data.meta.quote)usd=Number(data.nativeQuote?.usd)>0?Number(data.nativeQuote.usd):(await browserEthUsd().catch(()=>null))?.usd||await ethUsd(String(data.meta.chainId),data.meta.quote).catch(()=>null);
  if(mine!==mseq||state.data!==data)return;
  if(s.priceFromPool&&s.price===p&&(usd?s.priceUsd===p*usd:true))return;
  applyPoolPrice(data,p,usd);paintMarket();}catch{}
}
// Cold load: the header shows the pool's own spot price (dollars first when ETH/USD is known, then WETH) while the
// launch index loads. It paints only until the index has painted this selection; after that the index owns the header.
async function paintColdPrice(record,chainId,mine){
 const spec=coldPoolSpec(record,chainById(chainId));if(!spec)return;
 let cold;try{cold=await readColdPrice(spec,{rpc,ethUsd:()=>browserEthUsd()});}catch{return;}
 if(!cold)return;poolSpots.set(spec.poolId,{price:cold.price,at:cold.observedAt});
 if(!coldMayPaint({revision:mine,current:mseq,hasIndexData:!!state.data}))return;
 const q=cold.quoteSymbol||'WETH',cell=(k,v)=>[h('div',{},h('dt',{},k),h('dd',{},v))];
 if(spec.symbol){$('qxt-symbol').textContent=spec.symbol;$('qxt-symbol').title=spec.symbol;}
 if(spec.name){$('qxt-name').textContent=spec.name;$('qxt-name').title=spec.name;}
 document.title=tabTitle(spec.symbol,{priceUsd:cold.priceUsd,priceQuote:cold.price,quoteSymbol:cold.quoteSymbol||'WETH'});
 $('qxt-stats').replaceChildren(
  ...cell('Price',cold.priceUsd!=null?'$'+price(cold.priceUsd)+' · '+price(cold.price)+' '+q:price(cold.price)+' '+q),...cell('24h','—'),
  ...cell('MCap',cold.mcapUsd!=null?money(cold.mcapUsd,'USD'):money(cold.mcap,q)),...cell('Vol 24h','—'),...cell('Buys / sells · 24h','—'),
  ...cell('Holder wallets','—'),...cell('Top 10','—'),...cell('Burned','—'),...cell('Team locked','—'));
 $('qxt-stats').dataset.source='pool';
 $('qxt-chart').hidden=false;$('qxt-chart-empty').hidden=false;$('qxt-chart-empty').textContent=COLD_CHART_MESSAGE;
 $('qxt-sync').textContent='Price from the pool · Loading…';
}
async function select(chainId,controller,{quiet=false}={}) {
  chainId=String(chainId);controller=String(controller).toLowerCase();
  return selectionFlow.open({kind:'launch',chainId,controller,quiet},async run=>{
    const r=await fetch(`/api/markets/${chainId}/${controller}`,{cache:'no-store',signal:run.controller.signal});
    if(!run.active())return false;if(!r.ok)throw Error('This launch is not listed.');
    const record=await r.json(),pool=record.pool;if(!run.active())return false;
    if(String(pool?.chainId)!==chainId||pool?.controller?.toLowerCase()!==controller)throw Error('Launch metadata does not match this selection. Choose the launch again.');
    state.pool=pool;window.__qhooksPool=pool;document.dispatchEvent(new CustomEvent('qhooks:pool',{detail:pool}));
    void paintColdPrice(record,chainId,mseq);
    await loadMarket({signal:run.controller.signal,strict:true});if(!run.active())return false;
    // Market reads are independent of wallet/RPC trade preparation.
    void prepareNativeTicket({ticket,pool,run});
    refreshSelectedChecks();renderTools();if(!quiet)$('qxt-main').classList.add('has-market');
    poll=setInterval(()=>{if(!document.hidden)loadMarket();},5000);return true;
  });
}
// Outside-token metadata, chart and trades are owned by the admitted selection.
let externalRead=0;
async function loadExternal({signal,strict=false}={}) {
  if(!state.sel?.ext)return false;
  const mine=mseq,read=++externalRead,{chainId,ext}=state.sel;
  try {
    if(state.tf<60){state.tf=60;store('tf',60);for(const b of $('qxt-tf').querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.tf==='60'));}
    let tf=state.tf;const data=await loadExternalHeader({chainId,address:ext,tf,signal});
    // Quiet tokens open on 5m (Randall, 2026-11-10: "looks good to me - go ahead"): under one trade per 5 minutes in 24 h,
    // 1m candles are mostly empty. Only when the visitor hasn't picked a timeframe in this visit.
    const trades24=(Number(data?.summary?.buys24)||0)+(Number(data?.summary?.sells24)||0);
    if(!tfPicked&&tf===60&&data?.summary&&trades24<288){tf=300;state.tf=300;data.tf=300;pressGroup($('qxt-tf'),'tf',300);}
    if(mine!==mseq||read!==externalRead)return false;
    const prior=state.data,pool=data.token.pools?.[0]?.address;
    if(prior?.ext&&prior.meta.token===ext&&prior.meta.chainId===chainId){
      data.safety=prior.safety;
      if(prior.tf===tf&&prior.token.pools?.[0]?.address===pool){
        for(const key of ['candles','trades','tradeCoverage','marketCoverage','historyFreshness','holders','holderSample','chartSurface'])data[key]=prior[key];
      }
    }
    if(liveHeader&&liveHeader.key===chainId+':'+ext&&Date.now()-liveHeader.patch.observedAt<LIVE_WINS_MS)applyLiveHeader(data,liveHeader.patch);
    state.data=data;state.loading=false;state.loadError=null;
    ticket.setPriceUsd(data.summary.price,selectionFlow.current()?.intent);paintMarket();
    const selection={chainId,token:ext,pool,quote:data.token.pools?.[0]?.quoteAddress,asset:data.meta.symbol,tf,revision:mine};
    const isCurrent=()=>mine===mseq&&read===externalRead&&state.tf===tf&&!signal?.aborted&&state.data?.token?.pools?.[0]?.address===pool;
    const fillOnchain=panels=>onchainEvm.fill({selection,panels,signal,isCurrent,getData:()=>state.data,onData:updated=>{state.data=updated;paintMarket();}}).catch(()=>{});
    void fillOnchain(['holders']);
    // History is independent: a delayed chart/tape cannot hold up ticket setup.
    void loadExternalHistory({chainId,pool,tf,signal,token:ext,quote:selection.quote}).then(history=>{
      if(!isCurrent())return;
      state.data={...state.data,...history,...(history.candles?.length?{chartSurface:null}:{})};paintMarket();
      void fillOnchain(['candles','trades']);
    }).catch(()=>{});
    return true;
  }catch(error){if(mine!==mseq||read!==externalRead)return false;if(strict)throw error;marketWorkspace?.failMarket(selectedContext(),error);$('qxt-sync').textContent=error.message||'Refreshing market data…';return false;}
}
// Live header for outside tokens: the browser reads DexScreener itself every 20 s while the page is visible.
// While the browser's own read is under a minute old it is the only source for these numbers (no flip-backs from a
// server copy whose timestamp is newer than its numbers); past that the server copy takes over again.
const LIVE_WINS_MS=60000;let liveHeader=null,liveBusy=false;
function applyLiveHeader(data,patch){
 Object.assign(data.token,patch);
 Object.assign(data.summary,{price:patch.priceUsd,change24:patch.change24??data.summary.change24,mcap:patch.mcapUsd??data.summary.mcap,fdv:patch.fdvUsd??data.summary.fdv,liquidity:patch.liquidityUsd??data.summary.liquidity,volume24:patch.volume24Usd??data.summary.volume24,buys24:patch.buys24??data.summary.buys24,sells24:patch.sells24??data.summary.sells24,trades24:patch.buys24!=null&&patch.sells24!=null?patch.buys24+patch.sells24:data.summary.trades24});
}
async function refreshLiveHeader(){
 if(liveBusy||document.hidden||!state.sel?.ext||!state.data?.ext)return;
 const {chainId,ext}=state.sel,key=chainId+':'+ext,pool=state.data.token?.pools?.[0]?.address;liveBusy=true;
 try{
  const pairs=await fetchDexPairs(chainId,[ext]);if(!pairs||state.sel?.ext!==ext||state.sel?.chainId!==chainId||!state.data?.ext)return;
  const patch=headerPatch(pickPair(pairs,chainId,ext,pool));if(!patch)return;
  liveHeader={key,patch};applyLiveHeader(state.data,patch);
  ticket.setPriceUsd(state.data.summary.price,selectionFlow.current()?.intent);paintMarket();
 }finally{liveBusy=false;}
}
setInterval(()=>{void refreshLiveHeader();},20000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshLiveHeader();});
async function selectExternal(chainId,address,{quiet=false}={}) {
  chainId=String(chainId);address=chainId==='solana'?String(address):String(address).toLowerCase();
  return selectionFlow.open({kind:'external',chainId,address,quiet},async run=>{
    await loadExternal({signal:run.controller.signal,strict:true});if(!run.active()||!state.data)return false;
    const t=state.data.token;
    if(!await ticket.setExternal({chainId,address,symbol:t.symbol,decimals:t.decimals,pools:t.pools||[]},run.intent)||!run.active())return false;
    ticket.setPriceUsd(state.data.summary.price,run.intent);
    refreshSelectedChecks();
    poll=setInterval(()=>{if(!document.hidden)loadExternal();},15000);liveHeader=null;void refreshLiveHeader();
    if(!quiet)$('qxt-main').classList.add('has-market');return true;
  });
}
const tradeOwner=target=>String(target.chainId)==='solana'?solAddress():connectedAddress();
function explicitTrade(run,target,owner,action){
 const pending='Preparing this token’s trade ticket…';
 return withTerminalTradeReady({run,ticket,target,owner,getOwner:()=>tradeOwner(target),getSelection:selectedContext,
  onPending:()=>{$('qxt-sync').textContent=pending;},
  onUnavailable:reason=>{$('qxt-sync').textContent=reason==='context_changed'?'The wallet or token changed. Choose the trade again.':'Trade setup is not ready. Retry it in the trade ticket.';},
  action:()=>{if($('qxt-sync').textContent===pending)$('qxt-sync').textContent='';return action();}});
}
async function quickBuy(m) {
  const u = unitOf(m);
  if (!state.me) { $('qxt-connect').click(); return; }
  const target={kind:'launch',chainId:String(m.chainId),controller:m.controller,token:m.token||null},owner=tradeOwner(target),value=state.quick[u];
  const opening=select(m.chainId,m.controller),run=selectionFlow.current();if(!await opening)return;
  return explicitTrade(run,target,owner,()=>ticket.quickBuy(u==='usd'?'usd':u,value));
}
async function quickBuyExternal(chainId, address) {
  chainId = String(chainId);
  const plan = externalQuick(chainId, address, state.quick);
  if (plan.stock) return;
  if (!state.me) { $('qxt-connect').click(); return; }
  const launch = state.markets.find(m => m.live && String(m.chainId) === chainId && (chainId === 'solana' ? m.token === address : m.token?.toLowerCase() === address.toLowerCase()));
  if (launch) return quickBuy(launch);
  const target={kind:'external',chainId,address},owner=tradeOwner(target),ready=selectExternal(chainId,address),run=selectionFlow.current(),mine=mseq;
  if(!await ready)return;
  if (mine !== mseq || !state.data || !ticket.unitClass) return;
  if (!plan.supported) { $('qxt-sync').textContent = 'Use the trade ticket for this token; quick buy is unavailable.'; return; }
  return explicitTrade(run,target,owner,()=>ticket.quickBuy(plan.cls,plan.value));
}
/// A Trade link (#pool=…) lists the market if needed, then opens it.
async function openPoolLink(text) {
  const pool = JSON.parse(text);
  const got = await fetch(`/api/markets/${pool.chainId}/${pool.controller}`, { cache: 'no-store' });
  if (got.status === 404) {
    $('qxt-sync').textContent = 'Listing this launch…';
    await fetch('/api/markets', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: text });
    loadFeed();
  }
  return select(pool.chainId, pool.controller);
}

// ---- Controls ----
function pressGroup(group, attr, value) { for (const b of group.querySelectorAll('button')) b.setAttribute(b.getAttribute('role') === 'tab' ? 'aria-selected' : 'aria-pressed', String(b.dataset[attr] === String(value))); }
$('qxt-chains').replaceChildren(...CHAINS.map(([id, name]) => h('button', { type: 'button', 'data-chain': id, ariaPressed: String(id === state.chain), title:id==='all'?'All chains':CHAIN_NAME[id]||name,ariaLabel:id==='all'?'All chains':CHAIN_NAME[id]||name },
  id === 'all' ? null : icon(id), h('span', {}, name))));
$('qxt-chains').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;state.chain=b.dataset.chain;store('chain',state.chain);state.cursor=-1;pressGroup($('qxt-chains'),'chain',state.chain);workspaceSearch.search($('qxt-search').value,state.chain);renderFeed();loadFeed();});
$('qxt-feed-tabs').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;state.feed=b.dataset.feed;store('feed',state.feed);pressGroup($('qxt-feed-tabs'),'feed',['opening','trending'].includes(state.feed)?'new':state.feed);state.cursor=-1;renderFeed();});
pressGroup($('qxt-feed-tabs'),'feed',['opening','trending'].includes(state.feed)?'new':state.feed);
$('qxt-launch-sort').addEventListener('change',event=>{state.feed=event.target.value;state.cursor=-1;store('feed',state.feed);renderFeed();});
$('qxt-tf').replaceChildren(...TFS.map(([t, label]) => h('button', { type: 'button', 'data-tf': String(t), ariaPressed: String(t === state.tf) }, label)));
let tfPicked=false;
const setTf = t => { if(!state.sel||state.loading)return;tfPicked=true;if(state.sel.ext&&t<60){$('qxt-sync').textContent='Outside-token candles start at one minute.';return;} state.tf = t; store('tf', String(t)); pressGroup($('qxt-tf'), 'tf', t); mseq++; providerChart.clear();chartUnits.hidden=false;loadMarket(); };
$('qxt-tf').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setTf(Number(b.dataset.tf)); });
document.querySelector('[aria-label="Chart units"]').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; state.unit = b.dataset.unit; pressGroup(b.parentElement, 'unit', state.unit); renderChart(); });
$('qxt-data-tabs').addEventListener('click', e => { const b = e.target.closest('button[role="tab"]'); if (!b) return; state.pane = b.dataset.pane; pressGroup($('qxt-data-tabs'), 'pane', state.pane); if (state.pane === 'positions') loadPositions(); renderPane(); });
$('qxt-trade-filters').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; state.filter = b.dataset.filter; pressGroup($('qxt-trade-filters'), 'filter', state.filter); renderPane(); });
const workspaceSearch=createWorkspaceSearch({onChange:result=>{state.xhits=result.results;state.xq=result.query;state.xchain=result.chain;state.xstatus=result.status;state.xerror=result.error;renderFeed();
 if(result.status==='received'&&/^0x[0-9a-fA-F]{40}$/.test(result.query)){const q=result.query.toLowerCase(),chains=[...new Set(result.results.filter(r=>String(r.address).toLowerCase()===q).map(r=>String(r.chainId)))];
  if(chains.length===1&&$('qxt-search').value.trim().toLowerCase()===q){$('qxt-search').value='';workspaceSearch.search('',state.chain);location.hash='#t='+chains[0]+':'+q;}}}});
// A complete pasted contract opens the token (2026-11-10): at once when one chain is chosen, otherwise when the search
// finds it on exactly one chain (see the workspace search onChange below).
$('qxt-search').addEventListener('input',()=>{state.cursor=-1;const v=$('qxt-search').value.trim();
 if(/^0x[0-9a-fA-F]{40}$/.test(v)&&state.chain!=='all'&&state.chain!=='solana'){$('qxt-search').value='';workspaceSearch.search('',state.chain);location.hash='#t='+state.chain+':'+v.toLowerCase();return;}
 workspaceSearch.search(v,state.chain);});
$('qxt-star').addEventListener('click',()=>{const selected=selectedContext();if(!selected||!state.data)return;const watched=workspaceMemory.toggle(selected);if(selected.kind==='launch'){const key=keyOf(state.sel);watched?state.watch.add(key):state.watch.delete(key);store('watch',JSON.stringify([...state.watch]));}renderHead();renderFeed();});
// Share: a qhooks.com/l/<chain>/<controller> link that shows a preview card on X and in chats.
$('qxt-share').addEventListener('click', async () => {
  const me = connectedAddress() || '', refq = /^0x[0-9a-fA-F]{40}$/.test(me) ? '?ref=' + me.toLowerCase() : '';
  if (state.sel?.ext) { const l = 'https://qhooks.com/terminal' + refq + '#t=' + state.sel.chainId + ':' + state.sel.ext; try { await navigator.clipboard.writeText(l); $('qxt-share').textContent = 'Link copied'; setTimeout(() => { $('qxt-share').textContent = 'Share'; }, 1500); } catch {} return; }
  const p = state.pool; if (!p) return;
  // Sharing while connected makes the sharer the referrer of whoever trades through the link.
  const link = 'https://qhooks.com/l/' + p.chainId + '/' + p.controller + (/^0x[0-9a-fA-F]{40}$/.test(me) ? '?ref=' + me.toLowerCase() : '');
  try { if (navigator.share && matchMedia('(pointer:coarse)').matches) await navigator.share({ url: link }); else { await navigator.clipboard.writeText(link); $('qxt-share').textContent = 'Link copied'; setTimeout(() => { $('qxt-share').textContent = 'Share'; }, 1500); } } catch {}
});
$('qxt-copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(state.data.meta.token); $('qxt-copy').textContent = 'Copied'; setTimeout(() => renderHead(), 1200); } catch {} });
// Quick-buy amounts, one per unit (USDC, ETH, BNB).
const quickRow = document.querySelector('.qxt-quick');
quickRow.replaceChildren(h('span', {}, '⚡ Quick buy'), ...Object.keys(QUICK).map(u => h('label', {}, h('input', { type: 'text', inputMode: 'decimal', value: state.quick[u], ariaLabel: 'Quick buy amount in ' + QUNIT[u],
  oninput: e => { if (/^\d*\.?\d*$/.test(e.target.value) && e.target.value) { state.quick[u] = e.target.value; store('quick', JSON.stringify(state.quick)); renderFeed(); } } }), h('span', {}, QUNIT[u]))));

// Launch tools: one tab per shared panel that has something to show for this launch.
const TOOLS = [['qta', 'Auction'], ['qts', 'TP/SL'], ['qtb', 'Rules'], ['qtt', 'Terms'], ['qto', 'Limit'], ['qtp', 'ETH pool'], ['qtz', 'Staking'], ['qtm', 'Modules'], ['qtv', 'Vesting'], ['qtl', 'Team'], ['qtk', 'Keys']];
let tool = null, chosen = false;
// A link can open a tab: #t=<chain>:<token>&tab=staking (any TOOLS label, lowercased, spaces as dashes). Read before the
// terminal rewrites the hash to its canonical #m= form; applied once the panel has something to show.
const toolFromLink = h => { const want = new URLSearchParams(String(h || "").replace(/^#/, "")).get("tab"); return TOOLS.find(([, label]) => label.toLowerCase().replace(/\s+/g, "-") === String(want || "").toLowerCase())?.[0] || null; };
let linkTool = toolFromLink(location.hash);
function renderTools() {
  const shown = state.sel&&!state.sel.ext&&!state.loading?TOOLS.filter(([id]) => !$(id).hidden):[];
  if (linkTool && shown.some(([id]) => id === linkTool)) { tool = linkTool; chosen = true; linkTool = null; requestAnimationFrame(() => document.querySelector(".qxt-tools")?.scrollIntoView({ block: "start", behavior: "auto" })); }
  // Until someone picks a tab, the first panel in TOOLS order wins (auction, then rules), whichever loads first.
  if (!chosen || !shown.some(([id]) => id === tool)) tool = shown[0]?.[0] || null;
  $('qxt-tool-tabs').replaceChildren(...shown.map(([id, label]) => h('button', { role: 'tab', type: 'button', 'data-tool': id, ariaSelected: String(id === tool), onclick: () => { tool = id; chosen = true; renderTools(); } }, label)));
  for (const [id] of TOOLS) $(id).toggleAttribute('data-off', id !== tool);
  document.querySelector('.qxt-tools').hidden = !shown.length;
}
const toolWatch = new MutationObserver(renderTools);
for (const [id] of TOOLS) toolWatch.observe($(id), { attributes: true, attributeFilter: ['hidden'] });

// Global trading shortcuts yield to native controls, editing and dialogs.
document.addEventListener('keydown',createTerminalShortcutHandler({document,isDisabled:()=>document.body.classList.contains('qxt-discover-mode')||!!document.fullscreenElement,onShortcut:e=>{
  const k=e.key.toLowerCase(),rows=keyboardRows();
  if (k === '/') { e.preventDefault(); $('qxt-search').focus(); }
  else if (k === '?') $('qxt-keys').showModal();
  else if (k === 'w') $('qxt-feed-tabs').querySelector('[data-feed="wallets"]').click();
  else if (k === 'b' || k === 's') { ticket.setSide(k === 'b' ? 'buy' : 'sell'); $('qxt-amount').focus(); e.preventDefault(); }
  else if (/^[1-4]$/.test(k)) ticket.preset(Number(k) - 1);
  else if (k === 'enter') { e.preventDefault(); if (!e.repeat) ticket.submit(); }
  else if (k === 'j' || k === 'k') { if (!rows.length) return; state.cursor = Math.max(0, Math.min(rows.length - 1, state.cursor + (k === 'j' ? 1 : -1))); renderFeed(); document.querySelector('.qxt-list li.cur')?.scrollIntoView({ block: 'nearest' }); }
  else if(k==='o'&&rows[state.cursor]){const row=rows[state.cursor];row.kind==='external'?selectExternal(row.chainId,row.token):select(row.chainId,row.controller);}
  else if (k === '[' || k === ']') { const i = TFS.findIndex(([t]) => t === state.tf), n = TFS[Math.max(0, Math.min(TFS.length - 1, i + (k === ']' ? 1 : -1)))][0]; if (n !== state.tf) setTf(n); }
}}));

// ---- Start ----
ticket = mountTicket($('qxt-ticket'), { onTraded: async ({ side, moved, status,ext,chainId,token,owner }) => {
  setTimeout(loadMarket, 1500); setTimeout(loadPositions, 3000);
  // Auto TP/SL: a buy can set the saved take-profit and stop on exactly what it bought.
  if (!ext&&side === 'buy') try { if (await afterBuy(moved, status,{chainId,token,owner})) { status('TP/SL set on the ' + compact(Number(moved) / 1e18) + ' bought.'); toast('TP/SL placed on your buy.'); } } catch (e) { toast('TP/SL was not placed: ' + (e.message || 'error')); }
} });
marketWorkspace=createMarketWorkspace({getSelection:selectedContext,isBusy:()=>!ticket.canSelect(),onChange:renderWorkspace,onRetry:refreshSelectedMarket,onBlocked:()=>{$('qxt-sync').textContent='Current trade retained. Finish it or resolve the funded recovery before refreshing.';}});
positionsPanel=createPositionsPanel({h,pane:$('qxt-pane'),getOwner:()=>state.me,getSolOwner:solAddress,getSelection:selectedContext,isVisible:()=>state.pane==='positions',
 onConnect:family=>{if(family!=='solana'){hub.open();return;}$('qxt-trade').scrollIntoView({block:'start'});$('qxt-ticket').querySelector('.qxt-solw')?.focus({preventScroll:true});$('qxt-sync').textContent='Connect a Solana wallet in the trade ticket to read this holding.';},
 onOpen:target=>target.kind==='launch'?select(target.chainId,target.controller):selectExternal(target.chainId,target.token||target.address),
 onSell:async({target,owner,percent})=>{const run=selectionFlow.current();return explicitTrade(run,target,owner,async()=>{const prepared=await ticket.prefillSell({percent,owner,chainId:target.chainId,token:target.token,controller:target.controller});if(prepared){$('qxt-trade').scrollIntoView({block:'start'});$('qxt-amount')?.focus({preventScroll:true});}return prepared;});}});
onSolChange(()=>positionsPanel.refresh());positionsPanel.refresh();
onReached(text => toast(text, ['Open TP/SL', () => document.querySelector('#qxt-tool-tabs [data-tool="qts"]')?.click()]));
selectedProof=mountSelectedRepoProof($('qxt-repoproof'),{getSelection:selectedContext});
selectionFlow=createTerminalSelection({ticket,
 onBegin(target){
  mseq++;onchainEvm.clear();clearInterval(poll);poll=null;clearConversation();state.openedAt=Date.now();state.data=null;state.pool=null;window.__qhooksPool=null;document.dispatchEvent(new CustomEvent('qhooks:pool',{detail:null}));state.loading=true;state.loadError=null;lastChartKey='';chosen=false;renderLaunchActions();
  state.sel=target.kind==='launch'?{chainId:target.chainId,controller:target.controller}:{chainId:target.chainId,controller:null,ext:target.address};selectedProof.sync();
  if(target.kind==='external'&&!['watch','wallets'].includes(state.feed)){state.feed='recent';store('feed',state.feed);pressGroup($('qxt-feed-tabs'),'feed','recent');}
  marketWorkspace.start(selectedContext());restoreSelectionURL();clearMarketView(target.kind==='launch'?'Loading launch…':'Loading token…');$('qxt-sync').textContent='Loading the selected token…';renderFeed();
  document.dispatchEvent(new CustomEvent('qxt:token'));
  if(!target.quiet&&matchMedia('(max-width:760px)').matches)$('qxt-head').scrollIntoView({block:'start'});
 },
 onClear(){if(matchMedia('(max-width:760px)').matches)requestAnimationFrame(()=>scrollTo({top:0,behavior:'auto'}));mseq++;onchainEvm.clear();clearInterval(poll);poll=null;selectedProof.clear();clearConversation();marketWorkspace.clear();state.sel=null;state.data=null;state.pool=null;window.__qhooksPool=null;document.dispatchEvent(new CustomEvent('qhooks:pool',{detail:null}));state.loading=false;state.loadError=null;clearMarketView();$('qxt-sync').textContent='';restoreSelectionURL();},
 onFailure(error){mseq++;onchainEvm.clear();clearInterval(poll);poll=null;state.pool=null;window.__qhooksPool=null;document.dispatchEvent(new CustomEvent('qhooks:pool',{detail:null}));state.loading=false;state.loadError=error.message||'Could not load this token. Choose it again to retry.';state.data=null;marketWorkspace.failMarket(selectedContext(),error);marketWorkspace.failRisk(selectedContext(),Error('Market metadata is unavailable; checks were not loaded.'));clearMarketView('Token unavailable');$('qxt-sync').textContent=state.loadError;},
 onBlocked(){restoreSelectionURL();$('qxt-sync').textContent='Finish the current trade or resolve its funded recovery before changing tokens.';},
});
function backToTokens(){return selectionFlow.clear();}
// Capture before the feed's UI handlers so busy/recovery views cannot be hidden.
for(const type of ['click','keydown'])document.addEventListener(type,event=>{
 if(type==='keydown'&&closeTerminalOverlayOnEscape(event,document))return;
 const back=type==='click'?event.target.closest?.('.qxfd-back'):event.key==='Escape'&&!document.body.classList.contains('qxt-discover-mode')&&!document.querySelector('dialog[open]');
 if(!back)return;if(!backToTokens()){event.preventDefault();event.stopImmediatePropagation();}
},true);
document.addEventListener('qxt:discover',event=>{if(!backToTokens()){event.preventDefault();event.stopImmediatePropagation();}},true);
window.qxTerminal = { selectExternal, select, quickBuyExternal, backToTokens, get state() { return state; }, onMarkets(fn) { marketListeners.add(fn); fn(state.markets); return () => marketListeners.delete(fn); } };
document.dispatchEvent(new CustomEvent('qxt:ready'));
loadActivity(true);
renderTools(); renderPane();
let linkRevision = 0;
// A pasted contract link (#t=) for a token launched on QHooks opens its own market (#m=),
// which reads price and trades from the pool instead of outside data providers.
export async function qhooksMarketFor(chain,token,fetcher=fetch){
  if(chain==='solana')return null;
  // The market directory rejects Elysium (400): find Elysium launches in the launch feed instead (2026-11-10).
  if(chain==='99901'){try{const r=await fetcher('/api/terminal/feed?chain=99901',{headers:{accept:'application/json'},signal:AbortSignal.timeout(4000)});if(!r.ok)return null;
   const m=((await r.json()).markets||[]).find(x=>String(x.chainId)==='99901'&&String(x.token||'').toLowerCase()===token&&/^0x[0-9a-f]{40}$/.test(String(x.controller||'').toLowerCase()));return m?String(m.controller).toLowerCase():null;}catch{return null;}}
  try{const r=await fetcher('/api/markets?chain='+encodeURIComponent(chain)+'&q='+encodeURIComponent(token)+'&limit=5',{headers:{accept:'application/json'},signal:AbortSignal.timeout(4000)});if(!r.ok)return null;
   const j=await r.json();const row=(j.rows||[]).find(x=>String(x.chainId)===String(chain)&&String(x.token||'').toLowerCase()===token&&/^0x[0-9a-f]{40}$/.test(String(x.controller||'').toLowerCase()));
   return row?String(row.controller).toLowerCase():null;}catch{return null;}
}
async function openTerminalHash(hash) {
  const route = parseTerminalHash(hash), revision = ++linkRevision;
  if (!route) return false;
  let { kind, chain, address, trade } = route;
  if (kind === 't') {
    const controller = await qhooksMarketFor(chain, address);
    if (revision !== linkRevision) return true;
    if (controller) {
      const params = new URLSearchParams(String(hash || '').replace(/^#/, ''));params.delete('t');
      const rest = params.toString();
      history.replaceState(history.state, '', location.pathname + location.search + '#m=' + chain + ':' + controller + (rest ? '&' + rest : ''));
      kind = 'm'; address = controller;
    }
  }
  const opened=await(kind==='m'?select(chain,address):selectExternal(chain,address));
  if(!opened)return true;
  const active = () => revision === linkRevision && state.sel?.chainId === chain && (kind === 'm' ? state.sel.controller === address : state.sel.ext === address);
  if (active() && state.data && trade) {
    if(kind==='m'){const run=selectionFlow.current();if(!await run?.ticketReady||!run.active())return true;}
    if(!active())return true;
    const token = kind === 'm' ? state.data.meta.token : address;
    await applyTradePrefill($('qxt-ticket'), trade, { active, balanceOf: () => readTokenBalance({ chain, address: token, wallet: trade.wallet }) });
  }
  return true;
}
// A link opened while the terminal is already open switches the token and fills its ticket.
addEventListener('hashchange', event => {
 if(!ticket.canSelect()){selectionFlow.clear();event.stopImmediatePropagation();return;}
 if(!parseTerminalHash(location.hash)){backToTokens();return;}
 linkTool = toolFromLink(location.hash);
 openTerminalHash(location.hash).catch(e=>{$('qxt-sync').textContent=e.message||'Could not open that token';});
},true);

const hash = location.hash.slice(1);
try {
  if (hash.startsWith('pool=')) await openPoolLink(decodeURIComponent(hash.slice(5)));
  else if (!await openTerminalHash(hash)) document.dispatchEvent(new CustomEvent('qxt:discover'));
} catch (e) { $('qxt-sync').textContent = e.message || 'Could not open that launch'; }

await loadFeed();
function refreshHistoryClocks(){
 if(document.hidden)return;
 refreshHistoryPresentation({data:marketDisplay(),chartElement:$('qxt-chart'),message:$('qxt-chart-empty'),tapeElement:tapeControls.element,pane:state.pane==='trades'?$('qxt-pane'):null,rows:tradeTape.receivedRows(),renderChart,renderTape:renderPane,formatPrice:value=>'$'+price(value)});
}
setInterval(() => { if (!document.hidden){loadFeed();renderWorkspace();refreshHistoryClocks();} }, 15000);
document.addEventListener('visibilitychange',refreshHistoryClocks);
setInterval(() => { if (!document.hidden && state.markets.some(m => (m.auctionEndsAt || m.opensAt || 0) > now())) renderFeed(); }, 1000);

openTerminalView(new URLSearchParams(location.search).get('view'), document);

// Phones: a bottom bar to jump between the launch list, the chart and the trade ticket.
for (const b of document.querySelectorAll('.qxt-mnav button')) b.addEventListener('click', () => document.querySelector(b.dataset.to)?.scrollIntoView({ block: 'start', behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth' }));
$('qxt-stats').tabIndex=0;$('qxt-stats').setAttribute('aria-label','Market statistics; scroll for more');
matchMedia('(max-width:760px)').addEventListener?.('change',()=>renderWorkspace());
