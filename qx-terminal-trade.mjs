import{quickBuyPaymentOptions,resolveQuickBuyPayment,sameQuickPayment}from'./qx-quick-buy-plan.mjs';
import {costContext,tradeCosts} from './qx-ticket-cost-core.mjs';
import {createTicketCostReader,ticketCostEnvelope} from './qx-ticket-cost-read.mjs';
import {mountTicketCosts} from './qx-ticket-cost-view.mjs';
import {waitTransactionReceipt} from './qx-transaction-receipt.mjs';
import {walletTradingStorage} from './qx-trade-settings-context.mjs';
import {readQProofPresentation,qproofAgeLabel} from './qproof-view.mjs';
import {COPY_RISK} from '/qx-copy-review-core.mjs';
import {createCopyTicketReview} from './qx-copy-ticket-review.mjs';
import {EXIT_CHAINS} from './qx-profile-exit.mjs';
import {amountPreview,cachedTokenHolding} from './qx-ticket-amount.mjs';
import {matchingEvmBuy} from './qx-buy-receipt.mjs';
import {mountBuyCallout} from './qx-buy-callout.mjs';
import {mountTokenFeed} from './qx-token-feed.mjs';
import {solOrderFeeCopy} from './qx-sol-referral-payout-core.mjs';
import {sellPortion} from './qx-position-core.mjs';
import {poolQuoteInfo} from './qx-best-pool.mjs';
import {chainById} from './chains.mjs';
import {feeRoutersOf} from './qx-fee-routers.mjs';
import {createGasGate} from './qx-gas-preflight.mjs';
import {externalTradingNote} from './qx-external-trading.mjs';
import {quoteUsd as readQuoteUsd} from '/qx-native-usd.mjs';
import {homePicker, homeConfig, loadHomePref, instantHomeEnabled, withHomeRails} from './qx-home-currency.mjs';
import {loadLocalHome, homeTicketDefault, homeName, homeToken, homeSlippage, homeReturnNeeded} from './qx-home-core.mjs';
import {encodeBuyFor} from './qx-pro-xbuy.mjs';
import { tradeError, asTradeError } from './qx-chain-guard.mjs';
import {createRouteQuoteReads} from './qx-route-quote-read.mjs';
import {curveBuyQuote, curveNoRoute, curveFeeText, curveQuoteProblem} from './qx-curve-market.mjs';
import { executeTicketSwap } from './qx-ticket-execution.mjs';
import {pendingHomeBuy, pendingHomeBuyMatches, pendingHomeBuyAge, dismissHomeBuy, homeBuyRecoveryView, finishHomeBuy} from './qx-home-buy-step.mjs';
import {prepareTradeThesis,recordTerminalTrade} from './qx-trade-record.mjs';
import {renderSolanaRewards,enrollSolanaReferrer,recordSolanaRewards} from './qx-solana-rewards.mjs';
import {mountTradingSettings} from './qx-trading-settings.mjs';
import {mountAvailable, availableText, SIGNED_OUT_TEXT} from './qx-ticket-funds.mjs';
import {resolveTradingTolerance} from './qx-trading-preferences.mjs';
// Terminal trade ticket: market buys and sells through the launch's live pool and its blocks, amount
// presets, price tolerance, price impact, and buys paid in the native coin where the chain allows.
// Every quote runs through the real pool and hook, so charges are in the number shown. Trades go through the
// platform fee router: 1% per trade, 30% of it back to the trader as cashback they claim here (40% for QHOOKS holders on Robinhood Chain).
import { rpc, livePoolKey, parseUnits, formatUnits, erc20, send, ensureAllowance, connectedAddress, onWalletChange, NATIVE, CHAIN_NAME, h } from '/qx-chain.mjs';
import { quotePoolRoutes, quoteSingle, nativeRoute, quoteNative, quotePayAsset, nativeHops, hookData, hookReferralFor,assertHookReferralsCurrent,selectedHookReferralPartner,FEE_BPS, feeSwapCall, viaSwapCall, feeSwapPermit2Call, viaSwapPermit2Call, sellThroughRouter, cashbackOf, referralLink, claimCall, savedReferrer } from '/qx-swap.mjs';
import { extraAddress, isLive, setUp } from '/qx-extras.mjs';
import { hasDirectRoute, resolveDirectPool, refusalText } from '/qx-elysium-direct.mjs';
import { holderMinTokens, shortText } from '/qx-holder-min.mjs';
import { solAddress, solWallets, connectSol, signSol, onSolChange } from '/qx-solana.mjs';
import { renderRisk as trustRisk } from '/qx-trust.mjs';
import { oneClickPlan, withOneClick, pressGate, silentActive } from '/qx-instant-bridge.mjs';
import { impactFromQuotes, impactLines, formatPriceImpact, impactGate, confirmCopy } from '/qx-trade-impact.mjs';
import { getWalletHub } from '/wallet-hub.mjs';
import { relayWallet } from './qx-relay-wallet.mjs';
import { createFundingRow, fundingAsset, destinationCosts, runCrossChainBuy, retryLanded, recoveryView,
  cashAsset, cashHome, cashSettings, moveProceeds, offerMoveBack, chainName, readAssetBalance, loadFundingStyle, xchainEnabled } from './qx-xchain-gate.mjs';

// Holder cashback (live since the Safe set the flywheel on 2026-11-08): on Robinhood Chain the fee router pays 40%
// instead of 30% to QHOOKS holders. Read on chain, cached per wallet: isHolder on the CURRENT Robinhood Chain fee router
// (QFeeRouterV2 since fr2switch, 2026-11-26: counts wallet + staked + locked), the flywheel's isHolder if that read fails.
const FLYWHEEL_RH = "0xb85E67cf7728572033A9d36aEe3218DadF85bAA2", holderReads = new Map();
const readIsHolder = (to, k) => rpc("4663", "eth_call", [{ to, data: "0xd4d7b19a" + k.slice(2).padStart(64, "0") }, "latest"])
  .then(r => { if (!/^0x[0-9a-f]{64}$/i.test(r || "")) throw Error("isHolder unread"); return BigInt(r) === 1n; });
function holderRate(who) {
  if (!who) return Promise.resolve(false);
  const k = who.toLowerCase();
  if (!holderReads.has(k)) holderReads.set(k, extraAddress("feeRouter", "4663").then(router => readIsHolder(router, k))
    .catch(() => readIsHolder(FLYWHEEL_RH, k)).catch(() => { holderReads.delete(k); return false; }));
  return holderReads.get(k);
}
function feeLine(chainId, extra = "", onRate = () => {}) {
  const s = h("span", { class: "qxt-fee" }, "30% cashback from the 1% QHooks fee" + extra);
  if (String(chainId) === "4663") Promise.all([holderRate(connectedAddress()), holderMinTokens()]).then(([on, min]) => {
    if (!min) return; // holderMin 0 (holder cashback off) or unread: the plain 30% line stays
    onRate(on?40:30);
    s.textContent = on ? "40% cashback from the 1% QHooks fee · QHOOKS holder" + extra : "30% cashback from the 1% QHooks fee · 40% when you hold " + shortText(min) + "+ QHOOKS" + extra;
  });
  return s;
}

const TOL = [['50', '0.5%'], ['100', '1%'], ['300', '3%'], ['1000', '10%']];
/// Amount with at least three significant digits, so small WETH or WBNB cashback never reads as 0.
const small = (v, d) => { let max = 4; while (max < d && v > 0n && formatUnits(v, d, max) === '0') max++; return formatUnits(v, d, Math.min(d, max + 2)); };
const unitClass = sym => /^W?ETH$/.test(sym) ? 'eth' : /^W?BNB$/.test(sym) ? 'bnb' : /^W?SOL$/.test(sym) ? 'sol' : /^W?HYPE$/.test(sym) ? 'hype' : 'usd';
const SOL_MINT = 'So11111111111111111111111111111111111111112', SOL_USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
// Outside tokens (any token, routed by 0x): the chain's coin and its main dollar token as payment.
const XNATIVE = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', ZERO = '0x0000000000000000000000000000000000000000';
const STABLE = { '8453': ['0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', 'USDC', 6], '1': ['0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', 'USDC', 6],
  '42161': ['0xaf88d065e77c8cc2239327c5edb3a432268e5831', 'USDC', 6], '56': ['0x55d398326f99059ff775485246999027b3197955', 'USDT', 18],
  '4663': ['0x5fc5360d0400a0fd4f2af552add042d716f1d168', 'USDG', 6] };
const store = (k, v) => { try { if (v === undefined) return localStorage.getItem('qhooks:terminal:' + k); localStorage.setItem('qhooks:terminal:' + k, v); } catch {} return null; };
// A hub teardown publishes during navigation; it must not start a Home read.
let pageLeaving = false;
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { pageLeaving = true; }, {capture: true});
  window.addEventListener('pageshow', () => { pageLeaving = false; }, {capture: true});
}
export const validTradeTolerance = value => /^\d{1,5}$/.test(String(value ?? '')) && Number(value) > 0 && Number(value) <= 10000;

export function mountTicket(card, { onTraded = () => {}, now = Date.now, rowMode=false,readProof=null, copyReview=createCopyTicketReview({now,...(rowMode?{search:''}:{})}) } = {}) {
  if(copyReview.active&&!document.querySelector('link[href="/qx-copy-review.css"]'))document.head.append(h('link',{rel:'stylesheet',href:'/qx-copy-review.css'}));
  const savedTolerance = store('tol');
  let copyPrepared=null,copyPreparing=false;
  let st = null, side = 'buy', pay = 'quote', tol = validTradeTolerance(savedTolerance) ? String(Number(savedTolerance)) : '100', current = null, qseq = 0, timer = null, busy = false;
  let homeSelected = false, homeEnabled = false, homePref = loadLocalHome(connectedAddress());
  let priceUsd = null, armedAt = null, armTimer = null, sellCash = false, recovery = null, impactArmedAt = null;
  let sellPrefillOwner = null, pendingSellPrefill = false;
  let selection=null, selectionRevision=0, layoutRevision=0;
  const savedRecoveries=new Map();
  let quoteLoading = false, quoteAgeTimer = null;
  const routeReads=createRouteQuoteReads({setTimeout,clearTimeout});
  let marketPrices=[], rowReview=null, lastReceipt=null, lastSubmitError=null;
  const hub = getWalletHub(window);
  const costs=mountTicketCosts({h,now}),costReader=createTicketCostReader({rpc});
  let shownCost=null;const costRates=new WeakMap();
  function costRebate(c,share){costRates.set(c,share);if(shownCost?.trade===c)costs.cashback(share,shownCost.record);}
  function clearCosts(){shownCost=null;costReader.cancel();costs.clear();}
  function changedCostPath(){if(shownCost){costReader.cancel();costs.context(null);}}
  window.addEventListener('qhooks:trade-prefs',changedCostPath);
  const costParent=card.parentNode;
  if(costParent&&typeof MutationObserver!=='undefined'){
    const observer=new MutationObserver(()=>{if(!card.isConnected||!costs.element.isConnected){clearCosts();window.removeEventListener('qhooks:trade-prefs',changedCostPath);observer.disconnect();}});
    observer.observe(costParent,{childList:true});observer.observe(card,{childList:true});
  }
  function costAssets(c){
    const family=st.sol?'solana':'evm',chainId=st.chainId;
    const asset=(id,symbol,decimals)=>Object.freeze({family,chainId,id:st.sol?id:String(id).toLowerCase(),symbol,decimals});
    const native=()=>asset(st.sol?SOL_MINT:ZERO,st.sol?'SOL':NATIVE[chainId],st.sol?9:18);
    const chosen=st.multi?c.route.pool:selectedQuote();
    const input=c.side==='sell'?asset(st.token,st.symbol,st.decimals):c.pay==='native'?native():st.sol?asset(SOL_USDC,'USDC',6):c.payAsset?asset(c.payAsset.address,c.payAsset.symbol,c.payAsset.decimals):asset(st.ext?xTokens().sell:st.nativePool?ZERO:chosen.quote,payUnit(),payDecimals());
    const output=c.side==='buy'?asset(st.token,st.symbol,st.decimals):st.sol?(pay==='native'?native():asset(SOL_USDC,'USDC',6)):st.ext?(xTokens().buy===XNATIVE?native():asset(xTokens().buy,xTokens().outSym,xTokens().outDec)):asset(chosen.quote,chosen.quoteSymbol,chosen.quoteDecimals);
    return {input,output,native:native()};
  }
  function presentCosts(c,{grossOutput=null,impactPct=null,provider=null}={}){
    const state=st,assets=costAssets(c),context=costContext(c,assets,state.sol?'solana':'evm');
    const route=state.sol?(provider?.route==='dbc'?'Meteora DBC':provider?.router?'Jupiter · '+provider.router:'Jupiter'):state.ext?(provider?.direct?'Direct curve':provider?.sources?.join(' → ')||'0x'):c.route?.label||'QHooks pool';
    const record=Object.freeze({...tradeCosts({context,received:c.got,minimum:c.minOut,grossOutput,impactPct,route,solOrder:provider}),...(!state.sol&&!state.ext?{hookReferral:hookReferralFor(c.route?.pool?.key||state.key,state.chainId)}:{})});
    shownCost={record,trade:c};costs.set(record);if(costRates.has(c))costs.cashback(costRates.get(c),record);
    const alive=()=>shownCost?.record===record&&card.isConnected!==false&&st===state&&quoteMatches(c)&&sameOwner(c.owner,quoteOwner(),!!state.sol)&&now()-c.readAt<=30000;
    if(state.sol)return;
    if(!c.owner){costs.network({state:'unknown',reason:'Connect for a wallet-specific network estimate'},record);return;}
    // Use only already-known wallet/session state. Never fetch auth/session state for a display estimate.
    const embedded=hub.snapshot().current?.entry?.rdns==='io.qhooks.privy'||globalThis.qhooksPrivySignerControls?.wallet?.address?.toLowerCase()===c.owner.toLowerCase();
    const ordinary=!embedded&&!tradePlan(c).silent&&!silentActive()&&!c.homeRequired&&!c.funding&&!homeReturnNeeded(c.chainId,homePref,homeEnabled);
    void (async()=>{
      try{
        const router=await extraAddress('feeRouter',c.chainId);if(!alive())return;
        if(!router)throw Error('router unavailable');
        const external=state.ext?{...xTokens(),q:provider}:null;
        const build=timestamp=>ticketCostEnvelope({state,trade:c,router,deadline:timestamp+(state.ext?600n:1200n),external,encoders:{feeSwapCall,nativeHops,viaSwapCall}});
        const tokenIn=build(0n).tokenIn;
        const result=await costReader.read({chainId:c.chainId,owner:c.owner,amount:c.a,router,nativeAsset:assets.native,ordinary,isCurrent:alive,envelope:{tokenIn,build:timestamp=>build(timestamp).tx}});
        if(result&&alive())costs.network(c.homeRequired||c.funding?{...result,fullSpend:false,reason:'Destination-chain estimate · Move costs shown separately'}:result,record);
      }catch{if(alive())costs.network({state:'unknown',reason:'Network estimate unavailable · check your wallet before signing'},record);}
    })();
  }
  loadFundingStyle();
  const homeSettings = homePicker({getOwner: () => connectedAddress()});
  if (!document.getElementById('qhome-style')) { const style = document.createElement('link'); style.id = 'qhome-style'; style.rel = 'stylesheet'; style.href = '/qx-home-currency.css'; document.head.append(style); }
  const homeMarketPay = () => st?.multi ? (st.pools.some(p => nativeRoute(st.chainId, p.quote)) ? 'native' : st.pools[0].quote) : [...paySel.options].some(o => o.value === 'native') ? 'native' : 'quote';
  async function syncHome(defaultSelection = false) {
    if (pageLeaving || document.visibilityState === 'hidden' || !st) return;
    if(rowMode){homeSelected=false;homeEnabled=false;return;}
    const intent = selection, state = st, owner = connectedAddress();
    const config = await homeConfig().catch(() => ({enabled: false}));
    const pref = await loadHomePref(owner).catch(() => loadLocalHome(owner));
    if (intent !== selection || state !== st || busy || recovery || owner !== connectedAddress()) return;
    homeEnabled = config.enabled; homePref = pref; homeRow.hidden = !homeEnabled; homeRowName.textContent = homeName(pref);
    paySel.querySelector('option[value="home"]')?.remove();
    if (!st?.sol && homeTicketDefault(st?.chainId, pref, homeEnabled) === 'home') {
      paySel.prepend(h('option', {value: 'home'}, 'Home (' + homeName(pref) + ')'));
      // 2026-11-12: Home stays a choice in the pay chip, never the default. Buys start from the token's own chain; when
      // that is short, the ticket uses the wrapped coin there, then moves funds from another chain (offerFunding).
      if (defaultSelection && side === 'buy') { homeSelected = false; pay = homeMarketPay(); }
    } else {
      homeSelected = false;
      if (homeEnabled && defaultSelection && side === 'buy' && st && !st.sol && Number(st.chainId) === pref.chainId) {
        if (homeToken(pref).native && [...paySel.options].some(o => o.value === 'native')) pay = 'native';
        if (pref.asset === 'USDC') {
          let asset; try {asset = homeToken(pref);} catch (error) {status.textContent = tradeError(error); void homeSettings.refresh(); return;}
          if (st.multi && st.pools.some(p => p.quote.toLowerCase() === asset.address)) pay = st.pools.find(p => p.quote.toLowerCase() === asset.address).quote;
          else if (!st.multi && st.quote?.toLowerCase() === asset.address) pay = 'quote';
          else {paySel.querySelector('option[value="homeAsset"]')?.remove(); paySel.prepend(h('option', {value: 'homeAsset'}, asset.symbol)); pay = 'homeAsset';}
        }
      }
    }
    paySel.value = homeSelected ? 'home' : pay;
    void homeSettings.refresh();
  }
  window.addEventListener('qhooks:home', () => { if (!busy && !recovery) void syncHome(true).then(layout); });
  const status = h('p', { class: 'qtx-status', role: 'status', ariaLive: 'polite' });
  const amount = h('input', {type:'hidden', id:'qxt-amount-exact'});
  const amountDisplay = h('input', {type:'text', inputMode:'decimal', placeholder:'0.0', autocomplete:'off', ariaLabel:'Amount', id:'qxt-amount'});
  const amountView = amountPreview(amountDisplay, amount, {onInput: () => {sellPrefillOwner=null;refresh();}});
  const setAmount = value => amountView.set(value);
  const thesis = h('input', {type:'text',maxLength:280,placeholder:'Buy thesis · optional, 140 characters',ariaLabel:'Public buy thesis',autocomplete:'off'});
  const thesisRow = h('label',{class:'qxt-trader-thesis'},h('span',{},'Public buy thesis'),thesis,h('small',{},'Shown with this buy when your public trading profile is on. ',h('a',{href:'/community#trading-feed'},'Trading profile')));
  const unit = h('span', { class: 'qxt-unit' });
  const balance = h('button', { type: 'button', class: 'qxt-bal', title: 'Use the whole balance' }, 'Max');
  // 2026-11-12: one money line above the amount (what can be spent here, with chain); tap for every chain.
  const avail = mountAvailable({h, getOwner: () => connectedAddress(), getChain: () => st?.chainId, onSignIn: () => (document.getElementById('qxt-connect')||document.getElementById('qhc-trigger'))?.click()});
  let autoNote = '', unitUsd = null, usdMode = false;
  // $/token toggle on the amount (default token). In $ mode the visible box takes dollars and writes the token amount
  // into the real amount field, which every quote and send path already reads.
  const usdInput = h('input', {type:'hidden'});
  const usdDisplay = h('input', {type:'text', inputMode:'decimal', placeholder:'$0', autocomplete:'off', ariaLabel:'Amount in US dollars', hidden:true, class:'qxt-usd-input'});
  const usdView = amountPreview(usdDisplay, usdInput, {onInput:() => usdInput.dispatchEvent(new Event('input'))});
  const unitToggle = h('button', {type: 'button', class: 'qxt-unit-toggle', ariaLabel: 'Enter the amount in dollars', disabled: true}, '$');
  const usdEcho = h('small', {class: 'qxt-usd-echo'});
  const presets = h('div', { class: 'qxt-presets', role: 'group', ariaLabel: 'Amount presets' });
  const out = h('div', { class: 'qxt-out' }, 'Choose a launch to trade.');
  const quoteTime = h('time', { class: 'qxt-fee' });
  const refreshQuote = h('button', { type: 'button', class: 'qxt-context-action', disabled: true }, 'Refresh quote');
  const quoteTools = h('div', { class:'qxt-quote-tools', hidden: true }, h('small', {}, quoteTime), refreshQuote);
  const go = h('button', { type: 'button', class: 'qxt-go', disabled: true }, 'Buy');
  // Signed out (EVM): a live button that opens the same wallet sheet as the header's Connect wallet.
  const signIn = h('button', { type: 'button', class: 'qxt-go qxt-signin', hidden: true }, 'Connect to buy');
  signIn.addEventListener('click', () => { (document.getElementById('qxt-connect')||document.getElementById('qhc-trigger'))?.click(); });
  // Empty wallet on this chain: say how to fund it, with the address to copy.
  const addFunds = h('div', { class: 'qxt-add-funds', hidden: true });
  const FUND_CHAINS = [['8453','Base'],['1','Ethereum'],['42161','Arbitrum'],['56','BNB'],['4663','Robinhood Chain']];
  function showAddFunds(b) {
    const me = connectedAddress();
    // Shown when this chain is empty, and when the amount is short here and no other chain can cover it (funding.noSource).
    if (!b || !me || !st || st.sol || side !== 'buy' || !(b.native === 0n && b.quote === 0n || funding.noSource)) { addFunds.hidden = true; return; }
    const native = NATIVE[st.chainId] || 'ETH', others = FUND_CHAINS.filter(([id]) => id !== String(st.chainId)).map(([, n]) => n);
    const copy = h('button', { type: 'button', class: 'qxt-mini' }, 'Copy');
    copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(me); copy.textContent = 'Copied'; } catch { copy.textContent = 'Copy failed'; } });
    addFunds.replaceChildren(h('strong', {}, 'Top up ' + native + ' on ' + (CHAIN_NAME[st.chainId] || 'this network').replace(/ Chain$/, '') + '.'), ' Send it to your QHooks wallet: ', h('code', { title: me }, me.slice(0, 6) + '…' + me.slice(-4)), ' ', copy, funding.noSource ? '' : ' — or pay from ' + others.slice(0, -1).join(', ') + ' or ' + others.at(-1) + ' if you hold ' + native + ' there.');
    addFunds.hidden = false;
  }
  // After an EVM buy through the QHooks router: the cashback line and the referral link, where they are earned.
  function afterBuy() {
    const me = connectedAddress(); if (!me) return;
    const link = h('button', { type: 'button', class: 'qxt-mini' }, 'Copy your link — earn 20% from traders you bring');
    link.addEventListener('click', async () => { try { await navigator.clipboard.writeText(referralLink(me)); link.textContent = 'Link copied'; } catch { link.textContent = referralLink(me); } });
    cash.append(h('p',{},h('a',{href:'/me#qa-rewards'},'Claim cashback'), ' · ',link));
  }
  const showSignIn = () => { const out = !st?.noRoute && !st?.sol && !connectedAddress(); if (out) addFunds.hidden = true; signIn.hidden = !out; go.hidden = out; signIn.textContent = side === 'sell' ? 'Connect to sell' : 'Connect to buy'; };
  const sideBtns = ['buy', 'sell'].map(s => h('button', { type: 'button', 'data-side': s, ariaPressed: String(s === side) }, s === 'buy' ? 'Buy' : 'Sell'));
  const sellToCash = h('button', { type: 'button', 'data-side': 'cash', hidden: !xchainEnabled }, 'Sell to cash');
  const paySel = h('select', { ariaLabel: 'Pay with' });
  const tolSel = h('select', { ariaLabel: 'Price tolerance' }, ...TOL.map(([v, t]) => h('option', { value: v, selected: v === tol }, t)));
  if (!TOL.some(([value]) => value === tol)) tolSel.append(h('option', { value: tol, selected: true }, Number(tol) / 100 + '%'));
  tolSel.value = tol;
  let settingsStorage;try{settingsStorage=globalThis.localStorage;}catch{}
  const tradingSettings=mountTradingSettings({h,storage:walletTradingStorage(settingsStorage,()=>st?.chainId),legacyTolerance:savedTolerance,onChange:profileChanged,onError:error=>{status.textContent=tradeError(error);}});
  function syncProfile(){
    if(st)tradingSettings.setChain(st.chainId,Array.from(paySel.options,option=>unitClass(option.textContent)));
    const profile=tradingSettings.profile(),settings=profile[side],resolved=resolveTradingTolerance(settings,marketPrices,now());tol=String(copyReview.active&&copyReview.context?copyReview.context.slippageBps:resolved.bps);
    tolSel.replaceChildren(h('option',{value:'auto'},'Auto · max '+settings.maxBps/100+'%'),...TOL.map(([v,t])=>h('option',{value:v},t)));
    if(settings.mode==='manual'&&!TOL.some(([v])=>v===String(settings.manualBps)))tolSel.append(h('option',{value:String(settings.manualBps)},settings.manualBps/100+'%'));
    if(copyReview.active&&copyReview.context){const value=String(copyReview.context.slippageBps);if(!Array.from(tolSel.options).some(o=>o.value===value))tolSel.append(h('option',{value},Number(value)/100+'%'));tolSel.value=value;tolSel.disabled=true;}else{tolSel.value=settings.mode==='auto'?'auto':String(settings.manualBps);tolSel.disabled=false;}
  }
  function profileChanged(){if(busy||recovery)return;status.textContent='';syncProfile();clearArmed();refresh();if(st)layout();}
  syncProfile();tradingSettings.element.hidden=true;
  const payLabel = h('span', {}, 'Pay with'), payRow = h('label', { class: 'qxt-pay qxt-pay-chip' }, payLabel, paySel);
  // Home currency is a setting, not part of the buy: one collapsed row inside Settings.
  const homeRowName = h('span', {class: 'qxt-home-name'});
  const homeRow = h('details', {class: 'qxt-home-row'}, h('summary', {}, h('span', {}, 'Home currency'), homeRowName), homeSettings.element);

  const cash = h('div', { class: 'qxt-cash' });
  const risk = h('div', { class: 'qxt-risk', hidden: true });
  const proofBanner=h('section',{class:'qxt-qproof-summary',hidden:true,'aria-label':'QProof verdict'});
  function repaintProof(){const snapshot=typeof readProof==='function'?readProof():null;if(!snapshot){proofBanner.hidden=true;proofBanner.replaceChildren();return;}const p=readQProofPresentation(snapshot);proofBanner.hidden=false;proofBanner.className='qxt-qproof-summary is-'+p.verdict.level;proofBanner.replaceChildren(h('b',{},p.verdict.label),h('p',{},p.verdict.reason),h('small',{},qproofAgeLabel(p.freshness)));}
  const followup = h('div', {class: 'qxt-followup'});
  const funding = createFundingRow({ h, getPlan: q => tradePlan(current, q), onChange: ({ quote, ready }) => {
    changedCostPath();clearArmed(); if (current) current.funding = quote;
    go.disabled = busy || !!(current?.homeRequired && !current.home) || !quoteMatches(current) || !ready || (st?.safety?.verdict === 'danger' && !risk.querySelector('input')?.checked);
    // The primary button names the whole path when it moves money first (Relay), so one tap reads as one action.
    if (funding.noSource) void balances().then(showAddFunds).catch(() => {});
    const from = funding.from; if (!busy && from && quote) go.textContent = 'Move from ' + (CHAIN_NAME[from.chainId] || 'other chain').replace(/ Chain$/, '') + ' & buy ' + (st?.symbol || '');
  } });
  const quoteDetails=h('div',{class:'qxt-quote-details'});
  tradingSettings.element.append(h('label',{class:'qxt-pay qxt-live-slippage'},h('span',{},'Slippage'),tolSel));
  const settingsSummary=h('summary',{},'Settings');
  const settings=h('details',{class:'qxt-ticket-settings'},settingsSummary,homeRow,thesisRow,quoteDetails,cashSettings(h),cash);
  settings.addEventListener('keydown',event=>{if(event.key==='Escape'&&settings.open){event.preventDefault();event.stopPropagation();settings.open=false;settingsSummary.focus();}});
  function presentQuote(...nodes){const main=nodes.filter((n,i)=>i===0||String(n.getAttribute?.('class')||n.className||'').split(' ').includes('qxt-impact'));out.replaceChildren(...main);quoteDetails.replaceChildren(...nodes.filter(n=>!main.includes(n)));}
  card.replaceChildren(
    h('div', { class: 'qxt-side-toggle', role: 'group', ariaLabel: 'Trade side' }, ...sideBtns, sellToCash),
    payRow,
    proofBanner,risk, ...avail.elements, h('div', { class: 'qxt-amount qxt-amount-fit' }, amount, amountDisplay, usdInput, usdDisplay, unit), h('div', {class: 'qxt-usd-row'}, usdEcho, unitToggle), addFunds, funding.element, presets, out, costs.element, quoteTools, go, signIn, tradingSettings.element, status, followup, settings, h('a', {href:'/trust',class:'qxt-muted',style:'display:block;font-size:11px;padding:12px 0;text-underline-offset:3px'}, 'Trust Hub · checks, fees & contracts'));
  const recoveryShelf=h('div',{class:'qxt-saved-recovery',hidden:true,role:'status'});card.append(recoveryShelf);
  if(!rowMode)import('/qx-oneclick.mjs').then(m => m.mountOneClickToggle(settings)).catch(() => {}); // One-click trading toggle (hidden unless an email/Google wallet is connected)

  const calloutContext=()=>st?{chainId:String(st.chainId),token:String(st.token).toLowerCase(),owner:connectedAddress()?.toLowerCase()}:null;
  const currentCalloutContext=()=>{if(!st)return null;if(st.sol)return {chainId:'solana',token:st.token,owner:solAddress()};return calloutContext();};
  const copyNote=h('div',{class:'qxt-copy-review',role:'status'}),copyText=h('p',{}),leaveCopy=h('button',{type:'button',class:'qxt-context-action'},'Leave copy review');copyNote.append(copyText,h('p',{class:'qxt-muted'},COPY_RISK),leaveCopy);copyNote.hidden=!copyReview.active;card.prepend(copyNote);
  leaveCopy.addEventListener('click',()=>{if(busy||recovery)return;copyReview.clear();copyPrepared=null;copyNote.hidden=true;const u=new URL(location.href);u.searchParams.delete('copy');history.replaceState(null,'',u);setAmount('');refresh();void layout();});
  async function prepareCopyReview(){
    if(!copyReview.active||!st||busy||recovery||copyPreparing)return;const intent=selection,owner=quoteOwner(),key=st.chainId+':'+st.token+':'+owner;if(copyPrepared===key)return;copyPreparing=true;go.disabled=true;copyText.textContent='Refreshing copy review';
    try{const c=await copyReview.load({chainId:st.chainId,token:st.token,owner});if(!isSelection(intent)||owner!==quoteOwner())return;
      if((c.tpPct||c.slPct)&&(st.ext||!EXIT_CHAINS.includes(st.chainId)||!window.__qhooksPool?.controller))throw Error('TP/SL is unavailable for this route. Set both levels to 0 for future copy reviews.');
      if(!Array.from(paySel.options).some(o=>o.value==='native'))throw Error('This route cannot use the copy profile’s native coin.');
      side='buy';pay='native';homeSelected=false;sellCash=false;paySel.value=pay;setUsdMode(false);setAmount(c.amount);copyPrepared=key;copyText.textContent='Copy review · '+c.amount+' '+c.unit.symbol+' maximum · '+c.slippageBps/100+'% slippage. You sign each trade.';syncProfile();refresh();
    }catch(error){if(isSelection(intent)){copyPrepared=null;copyReview.invalidate();copyText.textContent=error.message;current=null;go.disabled=true;}}finally{copyPreparing=false;}
  }
  const buyCallout=rowMode?{refresh(){},offer(){},openHolding(){}}:mountBuyCallout(card,{h,getContext:currentCalloutContext,storage:settingsStorage});
  const tokenFeed=rowMode?{setMarket(){}}:mountTokenFeed(document.getElementById('traders')||card,{h,onCompose:()=>buyCallout.openHolding()});
  let calloutMarket='';
  function syncCallout(){const c=currentCalloutContext(),key=c?c.chainId+':'+c.token:'';if(key!==calloutMarket){calloutMarket=key;tokenFeed.setMarket(c);}buyCallout.refresh();}
  const targetKey=t=>!t?'none':t.kind==='launch'?'m:'+String(t.chainId)+':'+String(t.controller).toLowerCase():'t:'+String(t.chainId)+':'+(String(t.chainId)==='solana'?String(t.address):String(t.address).toLowerCase());
  const isSelection=intent=>!!intent&&intent===selection;
  function beginSelection(target) {
    if(busy){status.textContent='Finish the current wallet action before opening another token.';return false;}
    // Navigation releases the active ticket, never its funded recovery receipt.
    if(recovery&&st){if(!recovery.pendingBuy)savedRecoveries.set(recoveryKey(st),{recovery,state:st,quote:current,side,pay,homeSelected,owner:quoteOwner()});recovery=null;lock(false);}
    gasGate.reset();lastSubmitError=null;
    clearCosts();routeReads.cancel();
    copyPrepared=null;copyReview.invalidate();
    selection=Object.freeze({revision:++selectionRevision,key:targetKey(target)});thesis.value='';tokenFeed.setMarket(null);calloutMarket='';
    clearTimeout(timer);qseq++;current=null;st=null;priceUsd=null;marketPrices=[];sellCash=false;homeSelected=false;sellPrefillOwner=null;pendingSellPrefill=false;
    funding.clear();quoteDetails.replaceChildren();followup.replaceChildren();cash.replaceChildren();risk.replaceChildren();risk.hidden=true;
    setAmount('');unit.textContent='';balance.disabled=true;avail.set('');autoNote='';paySel.replaceChildren();
    clearArmed();go.disabled=true;status.textContent='';out.textContent=target?(target.kind==='launch'?'Loading the launch…':'Loading the token…'):'Choose a token to trade.';
    quoteLoading=false;renderQuoteFreshness();offerSavedRecovery();
    return selection;
  }
  function failSelection(intent,message,{retry}={}){if(!isSelection(intent)||busy||recovery)return false;routeReads.cancel();clearTimeout(timer);qseq++;st=null;current=null;funding.clear();go.disabled=true;out.textContent=message;
    quoteLoading=false;renderQuoteFreshness();
    if(retry){const again=h('button',{type:'button',class:'qxt-context-action'},'Retry trade setup');again.addEventListener('click',async()=>{if(!isSelection(intent)||busy||recovery)return;again.disabled=true;out.textContent='Preparing trade…';await retry();});out.append(again);}
    return true;}
  const quoteMatches=c=>!!c&&!!st&&isSelection(c.selection)&&c.revision===qseq&&c.chainId===st.chainId&&c.token===st.token&&c.side===side&&c.pay===pay;
  const bindQuote=(fields,revision,owner,tolerance=tol)=>({...fields,payAsset: !st.sol && side==='buy' && pay==='homeAsset' ? homeToken(homePref) : null,homeRequired:homeSelected&&side==='buy',copyReviewId:copyReview.active?copyReview.context?.id:null,selection,revision,chainId:st.chainId,token:st.token,owner,readAt:now(),toleranceBps:Number(tolerance)});
  const quoteOwner = () => st?.sol ? solAddress() : connectedAddress();
  // G4: gas preflight. Before any EVM buy/sell the wallet's native balance must cover gas (≈ units × gas price × 1.5);
  // when short, the trade button stays disabled with "Not enough ETH on <chain> for gas" and one-tap Add gas, and no wallet
  // prompt opens. Read-only; amounts, quotes and the signer are unchanged.
  const gasBox=h('div',{class:'qxt-gas',hidden:true});if(go.parentNode)go.before(gasBox);
  const gasGate=createGasGate({h,button:go,box:gasBox,rpc,onOk:()=>{if(!busy)refresh();},context:()=>{if(!st||st.sol||busy||recovery)return null;const owner=connectedAddress();if(!owner)return null;const c=current;return {chainId:String(st.chainId),token:st.token,owner,action:side==='sell'?'sell':'buy',extraWei:side==='buy'&&c?.pay==='native'&&typeof c?.a==='bigint'?c.a:0n};}});
  for(const ev of ['qhooks:traded','focus'])(ev==='focus'?window:document).addEventListener(ev,()=>{void gasGate.recheck();});
  const sameOwner = (a,b,sol) => sol ? a===b : a?.toLowerCase()===b?.toLowerCase();
  function hasQuoteAmount() { try { return !!st&&parseUnits(amount.value,payDecimals())>0n; } catch { return false; } }
  function renderQuoteFreshness() {
    clearTimeout(quoteAgeTimer);
    if(shownCost){const c=shownCost.trade;if(!quoteMatches(c)||!sameOwner(c.owner,quoteOwner(),!!st?.sol)){clearCosts();}else{if(now()-c.readAt>30000)costReader.cancel();costs.tick();}}
    const hasAmount=hasQuoteAmount();
    quoteTools.hidden=!hasAmount;
    refreshQuote.disabled=!hasAmount||busy||!!recovery;
    const c=current;if(copyReview.active&&c){try{copyReview.assert(c,{owner:quoteOwner(),silent:silentActive()});}catch{go.disabled=true;}}
    const valid=!quoteLoading&&quoteMatches(c)&&sameOwner(c.owner,quoteOwner(),st.sol)&&Number.isFinite(c.readAt);
    quoteTime.textContent='';quoteTime.setAttribute('datetime','');quoteTime.title='';
    if(!valid)return;
    const date=new Date(c.readAt),seconds=Math.max(0,Math.floor((now()-c.readAt)/1000));
    const age=seconds===0?'just now':seconds<60?seconds+'s ago':seconds<3600?Math.floor(seconds/60)+'m ago':Math.floor(seconds/3600)+'h ago';
    quoteTime.setAttribute('datetime',date.toISOString());
    quoteTime.title='Quote read by this browser on '+date.toLocaleString();
    quoteTime.textContent='Quote read '+date.toLocaleTimeString()+' · '+age;
    // This updates only the age label. Quotes are fetched only by the existing ticket actions.
    quoteAgeTimer=setTimeout(()=>{if(card.isConnected!==false)renderQuoteFreshness();},1000);
  }
  function quoteReadIsCurrent(read) {
    if(read.revision!==qseq||read.state!==st||!isSelection(read.selection))return false;
    if(sameOwner(read.owner,quoteOwner(),read.sol))return true;
    clearCosts();current=null;go.disabled=true;out.textContent='Wallet changed. Refresh the quote.';
    return false;
  }
  refreshQuote.addEventListener('click',()=>{if(!busy&&!recovery&&hasQuoteAmount())refresh();});
  function assertSelection(c){if(!quoteMatches(c))throw new Error('This token selection changed. Review a fresh quote before trading.');}
  const selectedPool = () => st?.multi ? st.pools.find(p=>p.quote===pay) || st.pools[0] : null;
  const selectedQuote = () => selectedPool() || st;
  const payUnit = () => side === 'sell' ? st.symbol : pay === 'homeAsset' ? homeToken(homePref).symbol : pay === 'native' ? (st.sol ? 'SOL' : NATIVE[st.chainId]) : selectedQuote().quoteSymbol;
  const payDecimals = () => side === 'sell' ? st.decimals : pay === 'homeAsset' ? homeToken(homePref).decimals : pay === 'native' ? (st.sol ? 9 : 18) : selectedQuote().quoteDecimals;
  // Identity and decimals are already established by setup. Display metadata may
  // be cooling down after a 429; it must not block a fresh transaction balance.
  async function tokenBalance(chainId,token,owner) {
    const data='0x70a08231'+owner.slice(2).padStart(64,'0');
    return BigInt(await rpc(chainId,'eth_call',[{to:token,data},'latest'],{purpose:'transaction'}));
  }
  async function balances() {
    if (st?.sol) {
      const me = solAddress(); if (!me) return null;
      const [t, q] = await Promise.all([fetch(`/api/terminal/sol/balance/${me}?mint=${st.token}`).then(r => r.json()), fetch(`/api/terminal/sol/balance/${me}?mint=${SOL_USDC}`).then(r => r.json())]);
      return { token: BigInt(t.token || 0), quote: BigInt(q.token || 0), native: BigInt(t.sol || 0) };
    }
    const me = connectedAddress(),state=st; if (!me || !state) return null;
    const quote=state.quote&&!state.nativePool?selectedQuote().quote:null,home=pay==='homeAsset'?homeToken(homePref).address:null;
    const [token,quoteBalance,native,homeBalance]=await Promise.all([
      tokenBalance(state.chainId,state.token,me),quote?tokenBalance(state.chainId,quote,me):0n,
      rpc(state.chainId,'eth_getBalance',[me,'latest'],{purpose:'transaction'}),home?tokenBalance(state.chainId,home,me):0n
    ]);
    return {token,quote:quoteBalance,native:BigInt(native),home:homeBalance};
  }
  const spendable = b => side === 'sell' ? b.token : pay === 'homeAsset' ? b.home : pay === 'native' ? b.native : b.quote;
  const wrappedQuote = () => !!st && !st.sol && !st.multi && !!st.quote && !st.nativePool && String(selectedQuote().quote || '').toLowerCase() === String(chainById(st.chainId)?.wrappedNative || '').toLowerCase();
  const asNum = (v, d) => Number(formatUnits(v, d, 8).replace(/,/g, ''));
  // The money line: the amount, symbol and chain this ticket will spend from; the wrapped coin on the same chain is named
  // with it, because the ticket uses it automatically when the native coin is short (see offerFunding).
  function moneyLine(b) {
    if (side === 'sell') return availableText({side, usdPrice: unitUsd, main: {amount: asNum(b.token, st.decimals), symbol: st.symbol, chain: CHAIN_NAME[st.chainId]}});
    if (homeSelected) return 'Paying from your home balance · ' + homeName(homePref);
    const extras = [];
    if (wrappedQuote() && pay === 'native' && b.quote > 0n) extras.push({amount: asNum(b.quote, 18), symbol: st.quoteSymbol});
    if (wrappedQuote() && pay === 'quote' && b.native > 0n) extras.push({amount: asNum(b.native, 18), symbol: NATIVE[st.chainId]});
    const text = availableText({side, usdPrice: unitUsd, main: {amount: asNum(spendable(b), payDecimals()), symbol: payUnit(), chain: st.sol ? 'Solana' : CHAIN_NAME[st.chainId]}, extras});
    return autoNote ? text + ' · ' + autoNote : text;
  }
  function syncUsd() {
    const a = Number(amount.value), ok = unitUsd > 0 && amount.value !== '' && Number.isFinite(a);
    if (usdMode && document.activeElement !== usdDisplay) usdView.set(ok ? (Math.round(a * unitUsd * 100) / 100).toString() : '');
    usdEcho.textContent = !ok ? '' : usdMode ? '≈ ' + amount.value + ' ' + (st ? payUnit() : '') : '≈ $' + (a * unitUsd).toLocaleString('en-US', {maximumFractionDigits: a * unitUsd >= 100 ? 0 : 2});
  }
  function setUsdMode(on) {
    usdMode = !!on && unitUsd > 0; amountDisplay.hidden = usdMode; usdDisplay.hidden = !usdMode;
    unitToggle.textContent = usdMode ? (st ? payUnit() : 'Token') : '$'; unitToggle.setAttribute('aria-label', usdMode ? 'Enter the amount in ' + (st ? payUnit() : 'tokens') : 'Enter the amount in dollars');
    unit.textContent = usdMode ? 'USD' : st ? payUnit() : ''; syncUsd(); amountView.fit(); usdView.fit(); (usdMode ? usdDisplay : amountDisplay).focus?.({preventScroll: true});
  }
  // The pay chip lists each source with its chain and balance; option text stays the bare symbol (presets key off it).
  function labelPayOptions(b) {
    for (const o of paySel.options) {
      const chain = st.sol ? 'Solana' : (CHAIN_NAME[st.chainId] || '').replace(/ Chain$/, '');
      const bal = !b ? '' : o.value === 'native' ? ' · ' + formatUnits(b.native, st.sol ? 9 : 18, 4) : o.value === 'quote' && side === 'buy' ? ' · ' + formatUnits(b.quote, selectedQuote().quoteDecimals || 18, 4) : '';
      o.label = o.value === 'home' ? o.textContent + ' · other chain' : o.textContent + ' on ' + chain + bal;
    }
  }
  const buttonText = () => sellCash ? 'Sell all to cash' : (side === 'buy' ? 'Buy ' : 'Sell ') + (st?.symbol || '');
  function clearArmed() { clearTimeout(armTimer); armedAt = null; impactArmedAt = null; go.textContent = buttonText(); }
  // Pool depth in USD for the low-liquidity line: the direct route's pool, else the open market's header (same token only).
  function poolLiquidityUsd() {
    if (Number.isFinite(st?.liquidityUsd) && st.liquidityUsd > 0) return st.liquidityUsd;
    const d = globalThis.qxTerminal?.state?.data, token = String(d?.meta?.token || '').toLowerCase();
    if (!d || !st || token !== String(st.token || '').toLowerCase()) return null;
    const v = Number(d.summary?.liquidityUsd ?? (d.ext ? d.summary?.liquidity : null));
    return Number.isFinite(v) && v > 0 ? v : null;
  }
  // Impact %, the low-liquidity line and the amber warning, under the quote. Never blocks: minOut is enforced on chain.
  function impactNodes(impactPct) {
    if (current) current.impactPct = impactPct;
    const line=formatPriceImpact(impactPct);
    return [...(line?[h('span',{class:'qxt-impact'+(line.level==='warn'?' warn':'')},line.text)]:[]),...impactLines({liquidityUsd:poolLiquidityUsd()}).map(l=>h('span',{class:'qxt-liquidity-detail'},l.text))];
  }
  function tradeUsd(c) {
    const dollars = sym => unitClass(sym) === 'usd' && /^(USDC|USDT|USDG)$/i.test(sym || '');
    const units = (v, d) => Number(formatUnits(v, d, d).replace(/,/g, ''));
    if (c.side === 'buy' && dollars(payUnit())) return units(c.a, payDecimals());
    const selected=st.multi&&c.side==='sell'?c.route.pool:selectedQuote(),sym = st.ext ? xTokens().outSym : selected.quoteSymbol, dec = st.ext ? xTokens().outDec : selected.quoteDecimals;
    if(st.multi&&c.side==='sell'&&c.route.quoteUsd>0)return units(c.got,dec)*c.route.quoteUsd;
    if (c.side === 'sell' && dollars(sym)) return units(c.got, dec);
    return priceUsd ? units(c.side === 'buy' ? c.got : c.a, st.decimals) * priceUsd : null;
  }
  function tradePlan(c, fundingQuote = c?.funding) {
    if(copyReview.active)return {silent:false,ticketConfirm:false,capUsd:null};
    const me = connectedAddress(), wallet = hub.snapshot().current;
    const inputUsd = Number(fundingQuote?.details?.currencyIn?.amountUsd);
    const usd = fundingQuote && inputUsd > 0 ? inputUsd : c ? tradeUsd(c) : null;
    return oneClickPlan(me, wallet?.owner?.toLowerCase() === me?.toLowerCase() ? wallet.entry : null, usd);
  }
  function ticketPlan(c) {
    const inputUsd = Number(c.funding?.details?.currencyIn?.amountUsd), usd = inputUsd > 0 ? inputUsd : tradeUsd(c), plan = tradePlan(c);
    if (!homeEnabled && pressGate({ plan, armedAt, now: Date.now() }) === 'arm') {
      clearArmed(); armedAt = Date.now();
      go.textContent = Number.isFinite(usd) && usd > 0 ? 'Confirm $' + Math.round(usd) : 'Confirm ' + c.side;
      if (recovery) go.disabled = false;
      armTimer = setTimeout(clearArmed, 15000);
      return null;
    }
    clearArmed(); return plan;
  }
  let lastWallet = hub.snapshot().current;
  hub.subscribe(({ current: wallet }) => { if (wallet !== lastWallet) { clearCosts();clearArmed(); lastWallet = wallet; } showSignIn();queueMicrotask(()=>buyCallout.refresh()); });
  window.addEventListener('qhooks:trade-prefs', clearArmed);

  function paintCachedHolding() {
    if (!st || side !== 'sell') return '';
    const owner = st.sol ? solAddress() : connectedAddress();
    const kept = cachedTokenHolding({owner, chainId: st.chainId, token: st.token, decimals: st.decimals, storage: settingsStorage});
    const text = kept ? availableText({side:'sell', main:{amount:asNum(kept.raw,st.decimals), symbol:st.symbol, chain:st.sol?'Solana':CHAIN_NAME[st.chainId]}}) + ' · Refreshing' : '';
    avail.set(text || (owner ? 'Your holdings are refreshing…' : SIGNED_OUT_TEXT));
    return text;
  }

  async function layout() {
    tradingSettings.element.hidden=!st;syncCallout();offerSavedRecovery();
    if (!st||busy||recovery) return;
    if (st.noRoute) { out.textContent=st.noRoute; go.disabled=true; go.hidden=false; signIn.hidden=true; addFunds.hidden=true; cash.replaceChildren(); return; }
    const activeState=st,intent=selection,mine=++layoutRevision,layoutOwner=st.sol?solAddress():connectedAddress();
    const cachedHolding = paintCachedHolding();
    syncProfile();
    sideBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.side === side)));
    card.dataset.side = side; paySel.value = homeSelected ? 'home' : pay;
    thesisRow.hidden = side !== 'buy';
    sellToCash.setAttribute('aria-pressed', String(sellCash));
    if (st.multi) {
      const automatic = side === 'sell' || st.pools.some(p => nativeRoute(st.chainId, p.quote)), first = side === 'sell' ? 'auto' : 'native';
      const options = [...(automatic ? [h('option', {value: first}, side === 'sell' ? 'Best USD value' : NATIVE[st.chainId])] : []), ...st.pools.map(p => h('option', {value: p.quote}, p.quoteSymbol || p.quote))];
      if (side === 'buy' && pay === 'homeAsset') options.push(h('option', {value: 'homeAsset'}, homeToken(homePref).symbol));
      if (!options.some(o => o.value === pay)) pay = automatic ? first : st.pools[0].quote;
      if (side === 'buy' && homeTicketDefault(st.chainId, homePref, homeEnabled) === 'home') options.unshift(h('option', {value: 'home'}, 'Home (' + homeName(homePref) + ')'));
      paySel.replaceChildren(...options); paySel.value = side === 'buy' && homeSelected ? 'home' : pay;
    }
    payRow.hidden = side === 'sell' && !st.multi || paySel.options.length < 2;
    payLabel.textContent = st.multi && side === 'sell' ? 'Receive' : 'Pay from';
    unit.textContent = usdMode ? 'USD' : payUnit(); if (usdMode) unitToggle.textContent = payUnit();
    go.textContent = buttonText();showSignIn();amountView.fit();
    const profile=tradingSettings.profile(),list = side === 'sell' ? profile.sellPercentages.map(p => [p + '%', p]) : profile.amounts[unitClass(payUnit())].map(v => [v, v]);
    presets.replaceChildren(...list.map(([label, v], i) => h('button', { type: 'button', title: 'Key ' + (i + 1), onclick: () => preset(i) }, label)), balance);
    const b = await balances().catch(() => null);
    if(st!==activeState||!isSelection(intent)||mine!==layoutRevision||layoutOwner!==(st.sol?solAddress():connectedAddress())||busy||recovery)return;
    if (side === 'sell' && b) avail.set(availableText({side:'sell', main:{amount:asNum(b.token,st.decimals),symbol:st.symbol,chain:st.sol?'Solana':CHAIN_NAME[st.chainId]}}));
    unitUsd = side === 'sell' ? priceUsd : await readQuoteUsd(payUnit()).catch(() => null);
    if(st!==activeState||!isSelection(intent)||mine!==layoutRevision||layoutOwner!==(st.sol?solAddress():connectedAddress())||busy||recovery)return;
    unitToggle.disabled = !(unitUsd > 0); if (!(unitUsd > 0) && usdMode) setUsdMode(false); syncUsd();
    avail.set(b ? moneyLine(b) : st?.sol ? (solAddress() ? '' : 'Connect a Solana wallet to trade') : !st?.noRoute && !connectedAddress() ? SIGNED_OUT_TEXT : cachedHolding || (side==='sell'?'Your holdings are refreshing…':''));labelPayOptions(b);
    homeRowName.textContent = homeName(homePref);
    balance.disabled = !b;showAddFunds(b);
    refresh();
    if(!rowMode)showCashback().catch(() => cash.replaceChildren());
    void prepareCopyReview();
  }

  // ---- Outside tokens: 0x routes, 1% platform fee taken by 0x on the coin/dollar side ----
  const xTokens = () => {
    const quoteSide = pay === 'homeAsset' ? homeToken(homePref).address : pay === 'native' || !st.quote ? XNATIVE : st.quote;
    return side === 'buy' ? { sell: quoteSide, buy: st.token, outDec: st.decimals, outSym: st.symbol } : { sell: st.token, buy: quoteSide, outDec: quoteSide === XNATIVE ? 18 : st.quoteDecimals, outSym: quoteSide === XNATIVE ? NATIVE[st.chainId] : st.quoteSymbol };
  };
  // Outside tokens go through our fee router too (swapVia), so they pay the same 30% cashback and 20% referral: the
  // router takes 1% (from the input on a buy, so 0x is quoted for the other 99%) and hands the rest to 0x.
  const xSpend = a => side === 'buy' ? a - a * FEE_BPS / 10000n : a;
  // curves (2026-11-12): a token still on its launchpad curve (Pons V2) buys straight from the curve through the same fee
  // router (QFeeRouter.swapVia → 0x AllowanceHolder.exec → curve.buy, recipient = the router), quoted from a fresh on-chain
  // read; its sells and any non-native buy go through 0x, which must route them through the curve itself (never a
  // third-party pool such as AEON's 56%-fee one).
  const onCurve = () => st?.curve?.phase === 'curve';
  const quoteReason=value=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,240):'';
  function routeFailure(error) {
    if(error?.routeQuote)return error;
    return Object.assign(new Error(quoteReason(error?.message)||'Could not read the route. Retry the quote.'),{routeQuote:true});
  }
  function routeErrorText(error) {
    const mapped=asTradeError(error); // Preserve the standard debug/error path.
    return error?.routeQuote?quoteReason(error.message)||mapped.message:mapped.message;
  }
  function showRouteFailure(error) {
    out.textContent=routeErrorText(error);
    if(error?.routeQuote){const retry=h('button',{type:'button',class:'qxt-context-action'},'Retry quote');retry.addEventListener('click',()=>{if(!busy&&!recovery&&hasQuoteAmount())refresh();});out.append(retry);}
  }
  async function fetchXQuote(a,tolerance=tol,timeoutMs=15000) {
    const state=st,tradeSide=side,tradePay=pay,me=connectedAddress(),{sell,buy}=xTokens();
    const direct=onCurve()&&state.curve.venue?.buy==='direct'&&tradeSide==='buy'&&tradePay==='native'&&state.curve.quote?.native;
    const q=new URLSearchParams({chain:state.chainId,sell,buy,amount:xSpend(a).toString(),taker:me,side:tradeSide,slippageBps:String(tolerance),via:'router'});
    try{return await routeReads.run(async signal=>{
      if(direct){
        const router=await extraAddress('feeRouter',state.chainId);
        return curveBuyQuote({c:state.curve,amountIn:a,slippageBps:tolerance,router,feeBps:FEE_BPS,rpc,formatUnits});
      }
      const r=await fetch('/api/terminal/x/quote?'+q,{cache:'no-store',signal});
      const body=await r.json().catch(()=>null);
      if(!r.ok){
        const detail=quoteReason(body?.detail)||quoteReason(body?.message);
        const message=body?.error==='official_pool'?(detail||'Trade this token through its official QHooks pool.')+' Open it from the terminal search.':body?.error==='trading_off'?'Trading outside tokens is not switched on yet.':detail||(body?.error==='no_route'?'No route for this trade right now.':'No quote right now.');
        const status=Number.isInteger(r.status)&&r.status>=100&&r.status<=599?r.status:null;
        throw Object.assign(new Error(quoteReason(message).slice(0,220)+(status?' (HTTP '+status+')':'')),{routeQuote:true,status});
      }
      if(!body||typeof body!=='object'||Array.isArray(body)||typeof body.buyAmount!=='string'||typeof body.minBuyAmount!=='string'||!/^\d{1,78}$/.test(body.buyAmount)||!/^\d{1,78}$/.test(body.minBuyAmount))throw new Error('The route response was incomplete. Retry the quote.');
      const problem=curveQuoteProblem(state.curve,body,tradeSide);if(problem)throw new Error(problem);
      return body;
    },{timeoutMs});}catch(error){throw routeFailure(error);}
  }
  async function extQuote(mine, a, read) {
    if (!connectedAddress()) { out.textContent = 'Connect a wallet to get a quote.'; return; }
    try {
      const small = a / 100n > 0n ? a / 100n : null;
      // Impact: the same route for a hundredth of the amount (fees are proportional, so they cancel out of the ratio).
      const [q, rq] = await Promise.all([fetchXQuote(a,read.toleranceBps), small ? fetchXQuote(small,read.toleranceBps,4000).catch(() => null) : null]);
      if (!quoteReadIsCurrent(read)) return;
      const { outDec, outSym } = xTokens(), cut = v => side === 'sell' ? v - v * FEE_BPS / 10000n : v;
      const got = cut(BigInt(q.buyAmount)), minOut = cut(BigInt(q.minBuyAmount));
      const impactPct = rq?.buyAmount ? impactFromQuotes(BigInt(q.buyAmount), a, BigInt(rq.buyAmount), small) : null;
      current = bindQuote({ side, pay, a, got, minOut, x: true },mine,read.owner,read.toleranceBps);const costQuote=current;
      presentQuote(h('b', {}, '≈ ' + formatUnits(got, outDec, 4) + ' ' + outSym),
        h('span', {}, 'at least ' + formatUnits(minOut, outDec, 4) + (q.sources?.length ? ' · via ' + q.sources.map(s => s.replace(/_/g, ' ')).join(', ') : '')),
        ...impactNodes(impactPct),
        feeLine(st.chainId, q.direct ? ' · straight to the curve' : ' · routed by 0x',rate=>costRebate(costQuote,rate)), ...(st.curve ? [h('span', {class: 'qxt-fee qxt-curve-fee'}, curveFeeText(st.curve))] : []));
      await offerFunding(mine);
      if(quoteMatches(current))presentCosts(current,{grossOutput:BigInt(q.buyAmount),impactPct,provider:q});
    } catch (e) { if (mine === qseq) {current=null;go.disabled=true;showRouteFailure(e);} }
  }
  async function extSubmit(c) {
    const { chainId, token } = st, s = t => { status.textContent = t; };
    const assertContext = () => assertTradeOwner(c);
      const me = connectedAddress(), b = await balances();
      if (spendable(b) < c.a) throw new Error('Not enough ' + payUnit());
      s('Refreshing the route…');
      const q = await fetchXQuote(c.a,c.toleranceBps); // Keep the reviewed tolerance while refreshing the route.
      const { sell, buy } = xTokens(), router = await extraAddress('feeRouter', chainId);
      assertTradeOwner(c);
      const cut = v => c.side === 'sell' ? v - v * FEE_BPS / 10000n : v, quotedMin = cut(BigInt(q.minBuyAmount));
      const minOut = c.minOut > quotedMin ? c.minOut : quotedMin;
      if(cut(BigInt(q.buyAmount))<minOut)throw new Error('Price moved below the reviewed minimum. Refresh the quote.');
      const live = await isLive(chainId, 'feeRouter');
      assertContext();
      if (!live) { s('One-time setup of trading on ' + CHAIN_NAME[chainId] + '…'); await setUp(chainId, 'feeRouter', s, assertContext); }
      const tin = sell === XNATIVE ? ZERO : sell, tout = buy === XNATIVE ? ZERO : buy;
      assertTradeOwner(c);
      if (!((tin === ZERO || tout === ZERO) && await tryOneClick(c, s))) {
      if (c.side === 'sell' && tin !== ZERO) {
        // Sells: one confirm or a Permit2 signature instead of a separate approve where the wallet allows (sellThroughRouter).
        const deadline = async () => { const now = BigInt((await rpc(chainId, 'eth_getBlockByNumber', ['latest', false])).timestamp); assertTradeOwner(c); return now + 600n; };
        const { receipt } = await sellThroughRouter({ chainId, token: tin, router, owner: me, amountIn: c.a, deadline, onStatus: s, assertContext,
          swapTx: async when => ({ to: router, data: viaSwapCall(q.tx.to, q.tx.data, tin, tout, c.a, minOut, false, when) }),
          permitSwapTx: async (when, p) => ({ to: router, data: viaSwapPermit2Call(q.tx.to, q.tx.data, tin, tout, c.a, minOut, false, when, p.nonce, p.signature) }) });
        queueRecord(c, receipt);
      } else {
      if (tin !== ZERO) await ensureAllowance(chainId, tin, router, c.a, s, assertContext);
      const now = BigInt((await rpc(chainId, 'eth_getBlockByNumber', ['latest', false])).timestamp);
      assertTradeOwner(c);
      await sendRecorded(c, { to: router, data: viaSwapCall(q.tx.to, q.tx.data, tin, tout, c.a, minOut, c.side === 'buy', now + 600n), value: tin === ZERO ? c.a : 0n }, s, assertContext);
      }
      }
      const after = await erc20(chainId, token, me).catch(() => null), moved = after ? (after.balance > b.token ? after.balance - b.token : b.token - after.balance) : null;
      s(moved === null ? 'Trade confirmed. Refresh balances.' : (c.side === 'buy' ? 'Bought ' : 'Sold ') + formatUnits(moved, st.decimals, 4) + ' ' + st.symbol + '.');if (c.side === 'buy' && moved !== null) afterBuy();
      setAmount( ''); thesis.value=''; document.dispatchEvent(new CustomEvent('qhooks:traded')); try { await onTraded({copyExit:c.copyExit, side: c.side, moved, chainId:c.chainId,token:c.token,owner:c.owner,status: s, ext: true }); } catch {}
  }
  // ---- Solana: server-priced Jupiter orders signed in the trader’s wallet ----
  const solMints = () => {
    const quoteSide = pay === 'native' ? SOL_MINT : SOL_USDC;
    return side === 'buy' ? { input: quoteSide, output: st.token, outDec: st.decimals, outSym: st.symbol } : { input: st.token, output: quoteSide, outDec: quoteSide === SOL_MINT ? 9 : 6, outSym: quoteSide === SOL_MINT ? 'SOL' : 'USDC' };
  };
  function solConnectPrompt() {
    const list = solWallets();
    out.replaceChildren(h('span', {}, list.length ? 'Connect a Solana wallet to trade.' : 'No Solana wallet found. Install Phantom, Solflare or Backpack.'),
      ...list.map(w => h('button', { type: 'button', class: 'qxt-mini qxt-solw', onclick: async () => { try { await connectSol(w.name); refresh(); layout(); } catch (e) { status.textContent = tradeError(e); } } },
        ...(w.icon ? [h('img', { src: w.icon, alt: '', width: 16, height: 16 })] : []), w.name)));
  }
  async function fetchSolOrder(a,tolerance=tol) {
    const { input, output } = solMints();
    const r = await fetch('/api/terminal/sol/order?' + new URLSearchParams({ input, output, amount: a.toString(), taker: solAddress(), slippageBps: String(tolerance) }), { cache: 'no-store' });
    const body = await r.json().catch(() => ({}));
    if(!r.ok&&['no_route','trading_off','unavailable'].includes(body.error)&&(input===SOL_MINT||output===SOL_MINT)){try{return await (await import('/qx-sol-launch-trade.mjs')).directDbcOrder({input,output,amount:a.toString(),taker:solAddress(),slippageBps:Number(tolerance)});}catch{/* The original Jupiter answer remains authoritative for tokens without a verified direct curve. */}}
    if (!r.ok) throw new Error(body.error === 'trading_off' ? 'Solana trading is not switched on yet.' : body.error === 'no_route' ? (body.detail ? body.detail.replace(/\.?$/, '.') : 'No route for this trade right now.') : body.detail || 'No quote right now.');
    return body;
  }
  async function solQuote(mine, a, read) {
    if (!solAddress()) { solConnectPrompt(); return; }
    try {
      const o = await fetchSolOrder(a,read.toleranceBps);
      if (!quoteReadIsCurrent(read)) return;
      const { outDec, outSym } = solMints(), got = BigInt(o.outAmount), minOut = BigInt(o.minOut);
      current = bindQuote({ side, pay, a, got, minOut, sol: true },mine,read.owner,read.toleranceBps);
      presentQuote(h('b', {}, '≈ ' + formatUnits(got, outDec, 4) + ' ' + outSym),
        h('span', {}, 'at least ' + formatUnits(minOut, outDec, 4)),
        ...impactNodes(o.priceImpact != null && Number.isFinite(Number(o.priceImpact)) ? Math.abs(Number(o.priceImpact)) : null),
        h('span', { class: 'qxt-fee' }, o.route==='dbc'?'Direct Meteora DBC · fee includes the launch anti-snipe schedule · 30% of the QHooks share as cashback':solOrderFeeCopy(o)));
      presentCosts(current,{impactPct:o.priceImpact != null && Number.isFinite(Number(o.priceImpact))?Math.abs(Number(o.priceImpact)):null,provider:o});
      go.disabled = busy || (st.safety?.verdict === 'danger' && !risk.querySelector('input')?.checked);
    } catch (e) { if (mine === qseq) {current=null;go.disabled=true;out.textContent = e.message;} }
  }
  async function solSubmit(c) {
    const s = t => { status.textContent = t; };
    try {
      const b = await balances();
      if (!b) throw new Error('Connect a Solana wallet first');
      if (spendable(b) < c.a) throw new Error('Not enough ' + payUnit());
      s('Refreshing the route…');
      assertTradeOwner(c);
      const o = await fetchSolOrder(c.a,c.toleranceBps);
      if(BigInt(o.minOut)<c.minOut)throw new Error('Price moved below the reviewed minimum. Refresh the quote.');
      s('Linking any referral for your rewards…'); await enrollSolanaReferrer();
      s('Confirm in your wallet…');
      assertTradeOwner(c);
      if(o.route==='dbc'){const x=await (await import('/qx-sol-launch-trade.mjs')).executeDirectDbc(o);queueRecord(c,x);status.textContent='Trade finalized · '+x.signature;setAmount('');document.dispatchEvent(new CustomEvent('qhooks:traded'));await onTraded({copyExit:c.copyExit,side:c.side,chainId:c.chainId,token:c.token,owner:c.owner,ext:true});lock(false);layout();return;}
      const signed = await signSol(o.transaction);
      assertTradeOwner(c);
      s('Sending…');
      const r = await fetch('/api/terminal/sol/execute', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ signedTransaction: signed, requestId: o.requestId, lastValidBlockHeight: o.lastValidBlockHeight }) });
      const x = await r.json().catch(() => ({}));
      if (!r.ok || x.status !== 'Success') throw new Error('The swap did not land' + (x.error ? ': ' + x.error : ''));
      recordSolanaRewards(o.requestId,x);
      queueRecord(c,x,{requestId:o.requestId});
      const after = await balances(), moved = after.token > b.token ? after.token - b.token : b.token - after.token;
      status.replaceChildren((c.side === 'buy' ? 'Bought ' : 'Sold ') + formatUnits(moved, st.decimals, 4) + ' ' + st.symbol + '. ', h('a', { href: 'https://solscan.io/tx/' + x.signature, target: '_blank', rel: 'noopener' }, 'View ↗'));
      setAmount( ''); thesis.value=''; document.dispatchEvent(new CustomEvent('qhooks:traded')); await onTraded({copyExit:c.copyExit, side: c.side, moved, chainId:c.chainId,token:c.token,owner:c.owner,status: s, ext: true });
    } catch (e) { s(e.message || 'The trade did not go through'); }
    lock(false); layout();
  }
  onSolChange(() => { clearCosts();buyCallout.refresh(); if (st?.sol&&!busy&&!recovery) { if(sellPrefillOwner&&sellPrefillOwner!==solAddress()){setAmount('');sellPrefillOwner=null;} refresh(); layout(); } });

  function renderRisk() {
    repaintProof();
    const v = st?.ext || st?.direct ? st.safety : null;
    // Elysium direct-route tokens whose launchpad hook has an owner (qx-elysium-direct.mjs REVIEWED_HOOKS).
    const note = st?.hookOwner ? h('p', { class: 'qxt-risk-note' }, 'This token’s launchpad can change its tax.') : null;
    risk.dataset.key = '';
    if (!v) { risk.hidden = !note; if (note) { risk.className = 'qxt-risk caution'; risk.replaceChildren(note); } return; }
    risk.hidden = false;
    const flags = (v.flags || []).slice(0, 4);
    risk.className = 'qxt-risk ' + (v.verdict === 'ok' ? 'unknown' : v.verdict);
    const title = 'Additional trade checks';
    const report=[...(note ? [note] : []), h('b', {}, title), ...(flags.length ? [h('ul', {}, ...flags.map(f => h('li', {}, f)))] : []),
      h('p', { class: 'qxt-muted' }, 'Source: ' + (typeof v.source === 'string' ? v.source.slice(0, 48) : 'not reported') + '.'),
      ...(v.verdict === 'danger' ? [h('label', {}, h('input', { type: 'checkbox', onchange: () => { if (current) go.disabled = busy || !risk.querySelector('input').checked || (funding.required && !funding.quote); } }), ' I understand and still want to trade')] : []),
      h('a', { href: '/qproof?q=' + encodeURIComponent(st.token) }, 'Full check on QProof')];
    if(!flags.length&&(v.verdict==='ok'||v.verdict==='unknown')){
      risk.classList.add('qxt-risk-compact');
      risk.replaceChildren(...(note ? [note] : []), h('details',{},h('summary',{},v.verdict==='ok'?'Additional trade checks · no flags returned':'Additional trade checks unavailable'),h('div',{class:'qxt-risk-report'},...report.filter(x => x !== note))));
    }else risk.replaceChildren(...report);
  }

  /// Claimable cashback and referral rewards on this chain, in the quote token and in the native coin, plus the
  /// trader's own referral link (20% of the fee on every trade by people who arrive through it).
  async function showCashback() {
    const activeState=st,intent=selection,me=connectedAddress();
    const alive=()=>st===activeState&&isSelection(intent)&&connectedAddress()===me;
    if (!st) { cash.replaceChildren(); return; }
    if (st.sol) { const view=h('div');cash.replaceChildren(view);renderSolanaRewards(view);return; }
    if (!me) { cash.replaceChildren(); return; }
    const link = h('button', { type: 'button', class: 'qxt-mini qxt-reflink' }, 'Copy referral link · earn 20% of QHooks fees');
    link.addEventListener('click', async () => { if(!alive())return;try { await navigator.clipboard.writeText(referralLink(me)); if(alive())link.textContent = 'Copied · 20% of eligible QHooks fees'; } catch { if(alive())link.textContent = referralLink(me); } });
    // Sharing does not depend on a balance RPC being available.
    cash.replaceChildren(h('p', {}, link));
    try {
    // FR2SWITCH: every router generation of the chain with code (Robinhood: QFeeRouterV2, then the shared router, which
    // still holds what was earned before the switch). Each balance claims on its own router.
    const Z = '0x0000000000000000000000000000000000000000', current = await extraAddress('feeRouter', activeState.chainId);
    const routers = [...new Set([current, ...feeRoutersOf(activeState.chainId).slice(1)])];
    const live = await Promise.all(routers.map(r => rpc(activeState.chainId, 'eth_getCode', [r, 'latest']).then(c => !!c && c !== '0x')));
    const routed = routers.filter((r, i) => live[i]);
    if (!routed.length) { if(!alive())return;cash.replaceChildren(h('p', {}, link)); return; }
    const reads = await Promise.all(routed.map(router => Promise.all([cashbackOf(activeState.chainId, router, me, activeState.quote), cashbackOf(activeState.chainId, router, me, Z)]).then(([q, n]) => [router, q, n])));
    if(!alive())return;
    const items = reads.flatMap(([router, q, n]) => [[activeState.quote, q, activeState.quoteDecimals, activeState.quoteSymbol, router], [Z, n, 18, NATIVE[activeState.chainId], router]]).filter(x => x[1] > 0n);
    cash.replaceChildren(...items.map(([cur, v, d, sym, router]) => {
      const b = h('button', { type: 'button', class: 'qxt-mini' }, 'Claim');
      b.addEventListener('click', async () => { if (busy||!alive()||connectedAddress()!==me) return; b.disabled = true; try { await send(activeState.chainId, { to: router, data: claimCall(cur) }, t => { status.textContent = t; }); status.textContent = 'Rewards claimed.'; await showCashback(); document.dispatchEvent(new CustomEvent('qhooks:rewards-claimed')); } catch (e) { status.textContent = tradeError(e); b.disabled = false; } });
      return h('p', {}, h('span', {}, 'Rewards'), h('span', {}, small(v, d) + ' ' + sym), b);
    }), h('p', {}, link));
    } catch {
      if(alive())cash.replaceChildren(h('p', {class:'qxt-muted',role:'status'}, 'Reward balances are refreshing. Your referral link is ready.'),h('p',{},link));
    }
  }

  async function preset(i) {
    if (!st || busy||recovery) return;
    const intent=selection,activeState=st,revision=++qseq;
    clearTimeout(timer);current=null;go.disabled=true;sellPrefillOwner=null;
    quoteLoading=false;renderQuoteFreshness();
    clearArmed();
    if (side === 'sell') {
      const b = await balances(); if(!isSelection(intent)||st!==activeState||revision!==qseq)return; if (!b) { status.textContent = 'Connect a wallet first.'; return; }
      setAmount( formatUnits(sellPortion(b.token, tradingSettings.profile().sellPercentages[i]), st.decimals, st.decimals).replace(/,/g, ''));
    } else setAmount( tradingSettings.profile().amounts[unitClass(payUnit())][i]);
    refresh();
  }

  function refresh() {
    clearCosts();
    syncUsd();
    if (busy||recovery) return;
    routeReads.cancel();
    pendingSellPrefill=false;
    clearArmed();
    clearTimeout(timer); current = null; go.disabled = true; qseq++;
    funding.clear(); quoteDetails.replaceChildren(); recovery = null; followup.replaceChildren();
    if (st?.noRoute) { quoteLoading=false; renderQuoteFreshness(); quoteTools.hidden=true; out.textContent=st.noRoute; return; }
    quoteLoading=hasQuoteAmount();renderQuoteFreshness();
    out.textContent = amount.value ? (st?.ext ? 'Finding the best route…' : 'Quoting through the pool…') : 'Enter an amount or pick a preset.';
    timer = setTimeout(quote, 300);
  }
  async function quote() {
    if (!st) return;
    if(copyReview.active&&(!copyReview.context||!copyPrepared)){current=null;go.disabled=true;out.textContent='Open Copy settings to prepare this review.';return;}
    if (st.noRoute) { out.textContent=st.noRoute; current=null; go.disabled=true; return; }
    routeReads.cancel();syncProfile();
    if (!copyReview.active&&!st.sol && (homeSelected || homeReturnNeeded(st.chainId, homePref, homeEnabled))) tol = String(homeSlippage(tol));
    clearCosts();
    const mine = ++qseq,read={revision:mine,state:st,selection,owner:quoteOwner(),sol:!!st.sol,toleranceBps:Number(tol)}; let a;
    quoteLoading=true;renderQuoteFreshness();
    try {
      if(st.sol&&!solAddress()){solConnectPrompt();return;}
      try { a = parseUnits(amount.value, payDecimals()); if (a <= 0n) throw 0; } catch { out.textContent = 'Enter an amount or pick a preset.'; return; }
      out.textContent = st.ext ? 'Finding the best route…' : 'Quoting through the pool…';
      if (st.noRoute) { out.textContent = st.noRoute; current = null; go.disabled = true; return; }
      if (st.sol) return await solQuote(mine, a,read);
      if (st.ext) return await extQuote(mine, a,read);
      const { chainId, key, token, quote: qt } = st;
      let got, route = null, refGot = null;
      // Buys pay the fee out of the input, sells out of the output.
      const spend = side === 'buy' ? a - a * FEE_BPS / 10000n : a;
      // Impact on every pool route: the same path for a thousandth of the amount (flat charges cancel out of the ratio).
      const small = spend / 1000n > 0n ? spend / 1000n : 1n;
      if (side === 'buy' && pay === 'homeAsset') {
        if (st.multi) {
          const candidates = await Promise.all(st.pools.map(async pool => {try {return {...await quotePayAsset(chainId, pool.key, token, pool.quote, homeToken(homePref).address, spend), pool};} catch {return null;}}));
          route = candidates.filter(Boolean).sort((a,b) => a.out > b.out ? -1 : 1)[0];
          if (!route) throw Error('No route for this home asset');
        } else route = await quotePayAsset(chainId, key, token, qt, homeToken(homePref).address, spend);
        got = route.out;
      }
      else if (st.multi) {
        const tradeSide=side,tradePay=pay,pools=st.pools,receiveQuote=selectedQuote().quote,nativeUsd=tradeSide==='sell'?await readQuoteUsd(NATIVE[chainId]).catch(()=>null):null;
        route=await quotePoolRoutes(chainId,pools,token,spend,tradeSide,tradeSide==='sell'?tradePay==='auto':tradePay==='native',receiveQuote,nativeUsd);got=route.out;
        const rr=await quotePoolRoutes(chainId,[route.pool],token,small,tradeSide,tradeSide==='buy'&&tradePay==='native',route.pool.quote,nativeUsd).catch(()=>null);refGot=rr?.out??null;
      }
      else if (st.nativePool) { const z = BigInt(key.currency0) === BigInt(side === 'buy' ? qt : token); [got, refGot] = await Promise.all([quoteSingle(chainId, key, z, spend), quoteSingle(chainId, key, z, small).catch(() => null)]); route = { label: side === 'buy' ? NATIVE[chainId] + ' → ' + st.symbol : st.symbol + ' → ' + NATIVE[chainId] }; }
      else if (side === 'buy' && pay === 'native') { const [r, rr] = await Promise.all([quoteNative(chainId, key, token, qt, spend, st.symbol), quoteNative(chainId, key, token, qt, small, st.symbol).catch(() => null)]); route = r; got = r.out; refGot = rr?.out ?? null; }
      else {
        const zeroForOne = key.currency0 === (side === 'buy' ? qt : token);
        [got, refGot] = await Promise.all([quoteSingle(chainId, key, zeroForOne, spend), quoteSingle(chainId, key, zeroForOne, small).catch(() => null)]);
      }
      const impactPct = refGot != null ? impactFromQuotes(got, spend, refGot, small) : null;
      const costGrossOutput=got;
      if (side === 'sell') got -= got * FEE_BPS / 10000n;
      if (!quoteReadIsCurrent(read)) return;
      const minOut = got * (10000n - BigInt(read.toleranceBps)) / 10000n;
      const outDec = side === 'buy' ? st.decimals : st.multi?route.pool.quoteDecimals:selectedQuote().quoteDecimals, outSym = side === 'buy' ? st.symbol : st.multi?route.pool.quoteSymbol:selectedQuote().quoteSymbol;
      current = bindQuote({ side, pay, a, got, minOut, route },mine,read.owner,read.toleranceBps);const costQuote=current;
      presentQuote(h('b', {}, '≈ ' + formatUnits(got, outDec, 4) + ' ' + outSym),
        h('span', {}, 'at least ' + formatUnits(minOut, outDec, 4) + ' · block charges included'),
        ...impactNodes(impactPct),
        feeLine(chainId,'',rate=>costRebate(costQuote,rate)),
        ...(route ? [h('span', {}, route.label)] : []));
      go.disabled = !connectedAddress() || busy || homeSelected;
      if (!connectedAddress()) status.textContent = 'Connect a wallet to trade.';
      await offerFunding(mine);
      if(quoteMatches(current))presentCosts(current,{grossOutput:costGrossOutput,impactPct});
    } catch (e) { if (mine === qseq) {current=null;go.disabled=true;out.textContent = /revert|execution/i.test(e.message || '') ? 'The pool refuses this trade right now (its rules may be closed to it).' : tradeError(e);} }
    finally {if(mine===qseq){quoteLoading=false;renderQuoteFreshness();}}
  }

  // One-click (qx-oneclick.mjs): when on, the server sends this trade (same router routes) with no wallet popup.
  async function tryOneClick(c, s) {
    // The legacy server signer does not yet verify optional hook referral data.
    // Registered hook-referral sessions use the reviewed wallet path below.
    if(selectedHookReferralPartner())return false;
    if(copyReview.active||c.copyReviewId)return false;
    const oc = await import('/qx-oneclick.mjs').catch(() => null);
    if (!oc || !(await oc.oneClickOn().catch(() => false))) return false;
    assertTradeOwner(c); s('Placing your trade…');
    const done = await oc.oneClickTrade({ chainId: st.chainId, token: st.token, side: c.side, amountWei: c.a, ...(st.multi&&c.side==='sell'?{quoteToken:c.route.pool.quote}:{}), slippageBps: c.toleranceBps || 300, referrer: savedReferrer() });
    if (!done) return false;
    const last = done.hashes[done.hashes.length - 1];
    const receipt=await waitTransactionReceipt(st.chainId,last,{rpc,onStatus:s,assert:()=>assertTradeOwner(c)});
    queueRecord(c,receipt);return true;
  }
  // Pool sells through the fee router: the hook referral context is rechecked before an allowance can open and again
  // before the swap is built, as executeTicketSwap does.
  async function poolSell(c, chainId, token, router, hops, wrap, deadline, s, assertContext) {
    const fresh = async () => { await assertHookReferralsCurrent(chainId, hops); assertTradeOwner(c); };
    const { receipt } = await sellThroughRouter({ chainId, token, router, owner: connectedAddress(), amountIn: c.a, deadline: async () => deadline, onStatus: s, assertContext,
      swapTx: async when => { await fresh(); return { to: router, data: feeSwapCall(chainId, hops, c.a, c.minOut, wrap, false, when) }; },
      ...(wrap && BigInt(wrap) !== 0n ? {} : { permitSwapTx: async (when, p) => { await fresh(); return { to: router, data: feeSwapPermit2Call(chainId, hops, c.a, c.minOut, when, p.nonce, p.signature) }; } }) });
    return receipt;
  }
  async function poolSubmit(c) {
        const { chainId, key, token, quote: qt } = st, router = await extraAddress('feeRouter', chainId);
        const me = connectedAddress(), b = await balances();
        if (spendable(b) < c.a) throw new Error('Not enough ' + payUnit());
        const now = BigInt((await rpc(chainId, 'eth_getBlockByNumber', ['latest', false])).timestamp), deadline = now + 1200n;
        const s = t => { status.textContent = t; };
        const assertContext = () => assertTradeOwner(c);
        assertTradeOwner(c);
        await assertHookReferralsCurrent(chainId,c.route?.hops||[{key}]);assertContext();
        const live = await isLive(chainId, 'feeRouter');
        assertContext();
        if (!live) { s('One-time setup of trading on ' + CHAIN_NAME[chainId] + '…'); await setUp(chainId, 'feeRouter', s, assertContext); }
        // One-click (qx-oneclick.mjs): QHooks markets, ETH/BNB in or token out, no wallet popup. Off or not eligible: wallet signs below.
        const oneClickDone = !c.payAsset && (!st.multi&&(c.side === 'sell' || c.pay === 'native' || st.nativePool)||st.multi&&(c.side==='sell'&&c.route.quoteUsd>0||c.side==='buy'&&c.pay==='native')) && await tryOneClick(c, s);
        if (!oneClickDone) {
          let receipt;
          if (c.side === 'sell') {
            // Sells (one pool or the chosen pool's hops): no separate approve where the wallet allows (sellThroughRouter).
            const hops = st.multi ? c.route.hops : [{ key, zeroForOne: key.currency0 === token }], wrap = st.multi ? c.route.wrap : null;
            if (st.multi) { await assertHookReferralsCurrent(chainId,hops);assertContext(); }
            receipt = await poolSell(c, chainId, token, router, hops, wrap, deadline, s, assertContext);
          } else if (st.multi) {
            // Several pools: the chosen pool's own hops through the fee router (qx-best-pool picked the route).
            await assertHookReferralsCurrent(chainId,c.route.hops);assertContext();
            if(c.side==='sell'||c.pay!=='native')await ensureAllowance(chainId,c.side==='sell'?token:c.payAsset?.address || c.route.pool.quote,router,c.a,s,assertContext);
            await assertHookReferralsCurrent(chainId,c.route.hops);assertTradeOwner(c);
            receipt=await send(chainId,{to:router,data:feeSwapCall(chainId,c.route.hops,c.a,c.minOut,c.route.wrap,c.side==='buy',deadline),value:c.side==='buy'&&c.pay==='native'?c.a:0n},s,assertContext);
          } else receipt = await executeTicketSwap({chainId,key,token,quote:qt,nativePool:st.nativePool,router,trade:c,deadline,onStatus:s,assertContext});
          queueRecord(c,receipt);
        }
        const after = await erc20(chainId, token, me).catch(() => null), moved = after ? (after.balance > b.token ? after.balance - b.token : b.token - after.balance) : null;
        status.textContent = moved === null ? 'Trade confirmed. Refresh balances.' : (c.side === 'buy' ? 'Bought ' : 'Sold ') + formatUnits(moved, st.decimals, 4) + ' ' + st.symbol + '.';if (c.side === 'buy' && moved !== null) afterBuy();
        setAmount( ''); thesis.value=''; document.dispatchEvent(new CustomEvent('qhooks:traded')); try { await onTraded({copyExit:c.copyExit, side: c.side, moved, chainId:c.chainId,token:c.token,owner:c.owner,status: s }); } catch {}
  }

  const payAsset = () => pay === 'homeAsset' ? homeToken(homePref) : fundingAsset(st.chainId, pay === 'native' ? 'native' : { address: selectedQuote().quote, decimals: selectedQuote().quoteDecimals });
  function assertTradeOwner(c) { assertSelection(c);if(copyReview.active)copyReview.assert(c,{owner:quoteOwner(),silent:silentActive()}); if(st.sol){if(c.owner!==solAddress())throw new Error('Reconnect the Solana wallet that reviewed this trade.');return;} if (c.owner && connectedAddress()?.toLowerCase() !== c.owner.toLowerCase()) throw new Error('Reconnect the wallet that reviewed this trade.'); }
  async function offerFunding(mine) {
    if (!quoteMatches(current) || mine !== qseq) return;
    current.owner = connectedAddress();
    if (st.sol || side !== 'buy' || !current.owner) { funding.clear(); go.disabled = busy || !current.owner || (st.safety?.verdict === 'danger' && !risk.querySelector('input')?.checked); return; }
    try {
      const b = await balances();
      if (mine !== qseq||!quoteMatches(current)) return;
      // Short on the native coin but holding the wrapped coin on this chain (Randall: 0.0019 ETH + 1.552 WETH on
      // Robinhood): pay with the wrapped coin directly, no unwrap and no other chain. Same value, one less step.
      if (b && wrappedQuote() && (pay === 'native' || homeSelected) && b.native < current.a && b.quote >= current.a && [...paySel.options].some(o => o.value === 'quote')) {
        homeSelected = false; pay = 'quote'; paySel.value = 'quote'; autoNote = 'using your ' + st.quoteSymbol; void layout(); return;
      }
      if (homeSelected) {
        funding.clear(); go.disabled = true;
        const reviewed = current;
        const engine = await import('./qx-home-engine.mjs');
        // Partner hook bytes must be checked again after funds arrive.
        // The opt-in relay path cannot perform that destination check.
        const instant = instantHomeEnabled() && !selectedHookReferralPartner();
        let data = null;
        if (!st.ext && (pay === 'native' || st.nativePool) && instant) {
          const path = st.multi ? reviewed.route : st.nativePool ? {hops: [{key: st.key, zeroForOne: BigInt(st.key.currency0) === 0n}], wrap: null} : nativeHops(st.chainId, st.key, st.quote, reviewed.route);
          data = encodeBuyFor({user: reviewed.owner, hops: path.hops.map(hop => ({...hop, hookData: hookData(hop.key)})), wrapNative: path.wrap, minOut: reviewed.minOut, referrer: savedReferrer(), deadline: Math.floor(Date.now() / 1000) + 900});
        }
        const asset = payAsset();
        const costs = await destinationCosts({owner: reviewed.owner, chainId: st.chainId, asset, amountNeeded: reviewed.a, spender: await extraAddress('feeRouter', st.chainId), setup: await isLive(st.chainId, 'feeRouter') ? 0 : 1});
        const q = await engine.quoteHomeBuy({owner: reviewed.owner, pref: homePref, chainId: st.chainId, asset, amountNeeded: reviewed.a, estimatedGasCost: costs.estimatedGasCost, slippageBps: reviewed.toleranceBps, instant, data});
        if (mine !== qseq || current !== reviewed) return;
        current.home = q;
        out.append(h('span', {class: 'qhome-cost'}, engine.homeCostLine(q, {lpBps: (reviewed.route?.pool?.key || st.key)?.fee / 100 || null})));
        go.disabled = busy;
        return;
      }
      if (pay === 'homeAsset' || b && spendable(b) >= current.a) { funding.clear(); return; }
      const asset = payAsset(), owner = current.owner, chainId = st.chainId, amountNeeded = current.a;
      await funding.update({ owner, chainId, asset, amountNeeded, balance: b ? spendable(b) : undefined, review: async () => destinationCosts({ owner, chainId, asset, amountNeeded,
        spender: await extraAddress('feeRouter', chainId), setup: await isLive(chainId, 'feeRouter') ? 0 : 1 }) });
    } catch (e) { status.textContent = tradeError(e); go.disabled = true; }
  }
  async function arrivedTrade(c, a) {
    if (connectedAddress()?.toLowerCase() !== c.owner?.toLowerCase()) throw new Error('Reconnect the wallet that funded this trade.');
    if (st.ext) return extSubmit({ ...c, a, minOut: c.minOut * a / c.a });
    const spend = a - a * FEE_BPS / 10000n;
    if(st.multi){const route=await quotePoolRoutes(st.chainId,st.pools,st.token,spend,'buy',c.pay==='native',c.route.pool.quote),got=route.out,floor=c.minOut*a/c.a,minOut=got*(10000n-BigInt(c.toleranceBps))/10000n;if(got<floor)throw Error('Price moved below the reviewed minimum. Refresh the quote.');return poolSubmit({...c,a,got,route,minOut:minOut>floor?minOut:floor});}
    const route = c.pay === 'native' ? await quoteNative(st.chainId, st.key, st.token, st.quote, spend, st.symbol) : null;
    const got = route ? route.out : await quoteSingle(st.chainId, st.key, st.key.currency0 === st.quote, spend);
    const floor = c.minOut * a / c.a, minOut = got * (10000n - BigInt(c.toleranceBps)) / 10000n;
    return poolSubmit({ ...c, a, got, route, minOut: minOut > floor ? minOut : floor });
  }
  function showHomeRecovery(pending) {
    recovery = {pendingBuy: pending, retryable: pending.retryable};
    status.textContent = '';
    followup.replaceChildren(homeBuyRecoveryView(h, pending, {
      finish: () => submit(),
      dismiss: () => {if (busy) return; dismissHomeBuy(pending.owner); recovery = null; followup.replaceChildren(); lock(false); void layout();},
      moveBack: () => {if (busy || pending.retryable === false) return; void offerMoveBack({...pending, amount: BigInt(pending.amount)}).catch(e => {status.textContent = tradeError(e);});},
    }));
  }
  const recoveryKey=state=>state?String(state.chainId)+':'+String(state.token).toLowerCase():'';
  function offerSavedRecovery() {
    if(rowMode||busy||recovery){recoveryShelf.hidden=true;return;}
    const owner=connectedAddress(),pending=owner&&pendingHomeBuy(owner);
    const saved=[...savedRecoveries.values()].find(item=>sameOwner(item.owner,owner,!!item.state.sol));
    const state=pending?.market?.state||saved?.state;
    if(!state?.token||state.sol||!/^0x[0-9a-f]{40}$/i.test(state.token)||String(state.chainId)!==String(pending?.chainId||state.chainId)){recoveryShelf.hidden=true;recoveryShelf.replaceChildren();return;}
    const matching=pending?pendingHomeBuyMatches(pending,{owner,chainId:st?.chainId,token:st?.token}):recoveryKey(st)===recoveryKey(state);
    const label='Saved buy of '+String(state.symbol||'token')+' on '+(CHAIN_NAME[String(state.chainId)]||String(state.chainId))+'.';
    const age=pending&&pendingHomeBuyAge(pending,{now:now()});
    const message=h('p',{},label+(age?.aged||age?.legacy?' Review a fresh route before continuing.':''));
    const action=matching?h('button',{type:'button',class:'qxt-context-action'},'Review saved buy'):h('a',{class:'qxt-context-action',href:'#t='+String(state.chainId)+':'+state.token},'Open saved buy');
    if(matching)action.addEventListener('click',()=>{
      if(busy||recovery)return;
      if(pending){restorePendingBuy();return;}
      if(!saved||recoveryKey(st)!==recoveryKey(saved.state)||!sameOwner(saved.owner,quoteOwner(),!!st?.sol))return;
      side=saved.side;pay=saved.pay;homeSelected=saved.homeSelected;
      current=bindQuote({...saved.quote},qseq,quoteOwner());recovery=saved.recovery;savedRecoveries.delete(recoveryKey(saved.state));
      followup.replaceChildren(recoveryView(h,recovery,()=>submit()));recoveryShelf.hidden=true;lock(false);
    });
    recoveryShelf.replaceChildren(message,action);recoveryShelf.hidden=false;
  }
  function restorePendingBuy() {
    if (busy || recovery || !st || st.sol) return false;
    const owner=connectedAddress(),pending=owner&&pendingHomeBuy(owner),market=pending?.market;
    // Only an explicit press on this exact, freshly selected asset can resume.
    if(!pendingHomeBuyMatches(pending,{owner,chainId:st.chainId,token:st.token}))return false;
    side='buy';pay=market.pay;homeSelected=true;homeEnabled=true;
    homePref=loadLocalHome(owner);
    paySel.replaceChildren(h('option',{value:'home'},'Home ('+homeName(homePref)+')'));paySel.value='home';
    setAmount(formatUnits(BigInt(pending.amountNeeded),payDecimals(),payDecimals()).replace(/,/g,''));unit.textContent=pending.asset.symbol;
    current=bindQuote({side,pay,a:BigInt(pending.amountNeeded),minOut:BigInt(market.minOut||0),route:{pool:{quote:market.quoteToken}},homeRequired:false},qseq,owner,market.slippageBps);
    current.homeRequired=false;out.textContent='Review your saved buy of '+st.symbol+'.';
    showHomeRecovery(pending);recoveryShelf.hidden=true;lock(false);return true;
  }
  function queueRecord(c,receipt,extra={}) {
    if(rowMode&&c.side==='sell')lastReceipt=receipt;
    const tx=receipt?.transactionHash||receipt?.signature;
    if(tx&&((String(c.chainId)==='solana'&&receipt.status==='Success')||(String(c.chainId)!=='solana'&&matchingEvmBuy(receipt,c))))buyCallout.offer({...c,tx,...extra,status:'confirmed'});
    if(tx)void recordTerminalTrade({chainId:c.chainId,token:c.token,side:c.side,owner:c.owner,thesis:c.thesis||'',tx,...extra}).catch(()=>{});
  }
  async function sendRecorded(c,tx,onStatus,assertContext) {
    const receipt=await send(c.chainId,tx,onStatus,assertContext);queueRecord(c,receipt);return receipt;
  }
  function lock(value) {
    busy = value; funding.setBusy(value);
    tradingSettings.lock(value||!!recovery);
    for (const el of [amountDisplay, usdDisplay, thesis, paySel, tolSel, balance, sellToCash, ...sideBtns, ...presets.querySelectorAll('button'), ...cash.querySelectorAll('button')]) el.disabled = value||!!recovery;
    for(const el of followup.querySelectorAll('button'))el.disabled=value || recovery?.retryable === false && el.textContent !== 'Dismiss';
    go.disabled = value||!!recovery;
    renderQuoteFreshness();
  }
  async function submit() {
    if (!current || busy || !st || go.disabled && !recovery) return;
    const c = {...current};lastSubmitError=null;
    if(copyReview.active){try{copyReview.assert(c,{owner:quoteOwner(),silent:silentActive()});}catch(error){status.textContent=error.message;go.disabled=true;return;}}
    if(c.homeRequired && !c.home){go.disabled=true;status.textContent='Refreshing home quote.';return;}
    if(!quoteMatches(c)){go.disabled=true;status.textContent='This token selection changed. Review a fresh quote before trading.';return;}
    if (!st.sol && c.owner && connectedAddress()?.toLowerCase() !== c.owner.toLowerCase()) { refresh(); return; }
    if (c.funding && !recovery && !funding.fresh()) { status.textContent = 'Refresh funding to review the current fees.'; go.disabled = true; return; }
    // Above 15% impact: one extra tap ("Buy anyway"), for every wallet including one-click. That tap also counts as the
    // one-click "Confirm $X" press, so the trade needs exactly one extra tap. Nothing is blocked: minOut stays on chain.
    if (!homeEnabled && impactGate({ impactPct: c.impactPct, armedAt: impactArmedAt, now: Date.now() }) === 'arm') {
      const copy = confirmCopy(c.side, c.impactPct);
      clearArmed(); impactArmedAt = Date.now(); go.textContent = copy.button; status.textContent = copy.status;
      armTimer = setTimeout(() => { clearArmed(); if (status.textContent === copy.status) status.textContent = ''; }, 15000);
      return;
    }
    if (impactArmedAt) { armedAt = Date.now(); impactArmedAt = null; }
    const gasOk=st.sol?true:await gasGate.check();
    // A gas read may finish after navigation, amount edits or a wallet change.
    if(!quoteMatches(c)||!sameOwner(c.owner,quoteOwner(),!!st?.sol))return;
    if(!gasOk){const g=gasGate.short();status.textContent=g?.message||'Gas could not be checked for this trade. Retry.';lastSubmitError=Object.assign(Error(status.textContent),{gas:true});go.disabled=true;return;}
    const plan = st.sol ? null : ticketPlan(c);
    if (!st.sol && !plan) return;
    lock(true);
    if(copyReview.active){try{const copied=await copyReview.claim(c,{owner:quoteOwner(),silent:silentActive()});c.copyExit={tpPct:copied.tpPct,slPct:copied.slPct};assertTradeOwner(c);}catch(error){status.textContent=error.message;lock(false);go.disabled=true;return;}}
    try {c.thesis=await prepareTradeThesis({chainId:c.chainId,owner:c.owner,token:c.token,side:c.side,thesis:c.side==='buy'?thesis.value:''});assertTradeOwner(c);}catch(error){status.textContent=tradeError(error);lock(false);return;}
    if (st.sol) { lock(true); return solSubmit(c); }
    lock(true); status.textContent = '';
    const swapArrived = a => { if (plan.silent && !silentActive()) throw new Error('This one-click press expired. Retry the swap from the funds in your wallet.'); return arrivedTrade(c, a); };
    let landed = false, proceeds = null;
    try {
      await withOneClick(plan, async () => {
        if (recovery?.pendingBuy) {
          const wallet = await relayWallet();
          try {await finishHomeBuy({pending: recovery.pendingBuy, wallet, swap: swapArrived, currentOwner: connectedAddress}, {readBalance: readAssetBalance, estimateCosts: destinationCosts}); recovery = null; followup.replaceChildren();}
          finally {wallet.dispose();}
          return;
        }
        if (recovery) { await retryLanded(recovery, { owner: connectedAddress(), swap: swapArrived }); recovery = null; followup.replaceChildren(); return; }
        if (c.home) {
          const wallet = await relayWallet();
          try {
            const {executeHomeBuy} = await import('./qx-home-engine.mjs');
            const result = await executeHomeBuy({quote: c.home, wallet, swap: swapArrived, currentOwner: connectedAddress,
              market: {state: st, pay: c.pay, quoteToken: c.route?.pool?.quote, minOut: String(c.minOut), slippageBps: c.toleranceBps, spender: await extraAddress('feeRouter', st.chainId), setup: await isLive(st.chainId, 'feeRouter') ? 0 : 1},
              onStep: step => {if (step.message) status.textContent = step.message;}});
            if (result.landed && !result.completed) {landed = true; if (result.pendingBuy) showHomeRecovery(result.pendingBuy); else {recovery = result; followup.replaceChildren(recoveryView(h, {...result, error: {message: tradeError(result.error)}}, () => submit()));}}
            else if (c.home.home.path === 'instant') {for(const hash of (result.outTxHashes||[]).slice(-5)){const receipt=await rpc(c.chainId,'eth_getTransactionReceipt',[hash]).catch(()=>null);if(matchingEvmBuy(receipt,c)){queueRecord(c,receipt);break;}}status.textContent = 'Bought into your wallet.'; setAmount( ''); document.dispatchEvent(new CustomEvent('qhooks:traded'));}
          } finally {wallet.dispose();}
          return;
        }
        if (c.funding) {
          const wallet = await relayWallet();
          try {
            const result = await runCrossChainBuy({ quote: c.funding, wallet, swap: swapArrived,
              onStep: s => { if (s.message) status.textContent = s.message; } });
            if (!result.completed) { recovery = result; landed = true; followup.replaceChildren(recoveryView(h, {...result, error: {message: tradeError(result.error)}}, () => submit())); }
          } finally { wallet.dispose(); }
          return;
        }
        const autoHome = !rowMode && c.side === 'sell' && homeReturnNeeded(st.chainId, homePref, homeEnabled);
        const asset = (sellCash || autoHome) ? (st.ext ? payAsset() : st.multi?{address:c.route.pool.quote,decimals:c.route.pool.quoteDecimals,symbol:c.route.pool.quoteSymbol}:{ address: selectedQuote().quote, decimals: selectedQuote().quoteDecimals, symbol: selectedQuote().quoteSymbol }) : null;
        const before = asset ? await readAssetBalance(c.owner, { chainId: st.chainId, asset }) : 0n;
        await (autoHome || c.payAsset ? withHomeRails(c.owner, () => st.ext ? extSubmit(c) : poolSubmit(c)) : st.ext ? extSubmit(c) : poolSubmit(c));
        if (asset) { const after = await readAssetBalance(c.owner, { chainId: st.chainId, asset }); if (after > before) {
          proceeds = { chainId: st.chainId, asset, amount: after - before };
          if (autoHome) {
            const wallet = await relayWallet();
            try {const {settleHome} = await import('./qx-home-engine.mjs'); status.textContent = 'Sending proceeds home…'; await settleHome({...proceeds, owner: c.owner, pref: homePref, slippageBps: c.toleranceBps, wallet}); status.textContent = 'Sold and settled home.'; proceeds = null;}
            finally {wallet.dispose();}
          }
        } }
      });
    } catch (e) { lastSubmitError=e;if (recovery?.pendingBuy) showHomeRecovery(pendingHomeBuy(c.owner) || recovery.pendingBuy); status.textContent = e?.routeQuote?routeErrorText(e):tradeError(e); landed = !!recovery; }
    finally { lock(false); if (landed) { go.disabled = true; if (recovery?.retryable === false) for (const el of followup.querySelectorAll('button')) if (!recovery.pendingBuy || el.textContent !== 'Dismiss') el.disabled = true; } else await layout(); }
    if (xchainEnabled && proceeds && (cashHome() && cashHome() !== Number(proceeds.chainId) || proceeds.asset.symbol !== cashAsset(proceeds.chainId).symbol)) {
      const home = cashHome(), button = h('button', { type: 'button', class: 'qxt-mini' }, home ? 'Move to ' + chainName(home) : 'Move proceeds to cash');
      button.addEventListener('click', () => { void moveProceeds({ ...proceeds, home }).catch(e => { status.textContent = tradeError(e); }); });
      followup.replaceChildren(button);
    }
  }

  document.addEventListener('qhooks:rewards-claimed', () => showCashback().catch(() => cash.replaceChildren()));
  sideBtns.forEach(b => b.addEventListener('click', () => setSide(b.dataset.side)));
  paySel.addEventListener('change', () => { if (busy||recovery) return; clearArmed(); autoNote = ''; homeSelected = paySel.value === 'home'; pay = homeSelected ? homeMarketPay() : paySel.value; setAmount( '');sellPrefillOwner=null; refresh(); layout(); });
  tolSel.addEventListener('change', () => {if(busy||recovery)return;try{if(!tradingSettings.setTolerance(side,tolSel.value)){syncProfile();status.textContent='Choose Auto or a valid manual tolerance (maximum 50% on Solana, 100% on EVM).';return;}if(tolSel.value!=='auto')store('tol',tolSel.value);}catch(error){syncProfile();status.textContent=tradeError(error);}});
  usdInput.addEventListener('input', () => { if (!st || !(unitUsd > 0)) return; const v = Number(usdInput.value.replace(/[$,\s]/g, ''));
    setAmount( Number.isFinite(v) && v > 0 ? String(Number((v / unitUsd).toFixed(Math.min(8, payDecimals())))) : ''); sellPrefillOwner = null; refresh(); });
  usdDisplay.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); if (!e.repeat) submit(); } });
  unitToggle.addEventListener('click', () => { if (!busy && !recovery) setUsdMode(!usdMode); });
  amountDisplay.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); if (!e.repeat) submit(); } });
  balance.addEventListener('click', async () => { if(busy||recovery||!st)return;const intent=selection,activeState=st,mine=++qseq;clearTimeout(timer);current=null;go.disabled=true;sellPrefillOwner=null;clearArmed();quoteLoading=false;renderQuoteFreshness(); const b = await balances(); if(!isSelection(intent)||st!==activeState||mine!==qseq)return;if (b) { setAmount( formatUnits(spendable(b), payDecimals(), payDecimals()).replace(/,/g, '')); refresh(); } });
  go.addEventListener('click', submit);
  onWalletChange(() => { void gasGate.recheck(); clearCosts();clearArmed(); if (pageLeaving) return; if (!busy && recovery?.pendingBuy && recovery.pendingBuy.owner.toLowerCase() !== connectedAddress()?.toLowerCase()) {recovery = null; current = null; followup.replaceChildren(); lock(false);} if (!busy&&!recovery&&!st?.sol) {paintCachedHolding();if (!rowMode)offerSavedRecovery(); if(sellPrefillOwner&&sellPrefillOwner.toLowerCase()!==connectedAddress()?.toLowerCase()){setAmount('');sellPrefillOwner=null;}void syncHome(true).then(() => {refresh();layout();});} });

  sellToCash.addEventListener('click', async () => {
    if (!st || busy||recovery) return;
    clearArmed(); sellCash = true; side = 'sell'; homeSelected = false; pay = st.multi?st.pools.find(p=>/USD/.test(p.quoteSymbol))?.quote||st.pools[0].quote:st.quote ? 'quote' : 'native'; paySel.value = pay;
    await layout(); await preset(3);
    const symbol = st.sol ? 'USDC' : selectedQuote().quoteSymbol || NATIVE[st.chainId];
    status.textContent = st.sol || !['1', '8453', '42161', '56', '4663'].includes(String(st.chainId)) || symbol === cashAsset(st.chainId).symbol ? 'Sell your whole position for ' + symbol + '.' :
      'This pool sells to ' + symbol + '. Cash conversion is available in Move funds after the sale.';
  });

  function setSide(s) { if (busy||recovery || !['buy','sell'].includes(s) || side === s && !sellCash&&!pendingSellPrefill) return; clearArmed(); sellCash = false; side = s;homeSelected = false;autoNote = ''; // Home is chosen in the pay chip, never by switching side (2026-11-12)
if(st?.multi){pay=s==='sell'?'auto':'native';paySel.value=pay;} setAmount( '');sellPrefillOwner=null;pendingSellPrefill=false; refresh(); layout(); }

  if(!rowMode)offerSavedRecovery();
  return {
    prepareCopyReview,beginSelection,isSelection,failSelection,repaintProof,canSelect:()=>!busy,
    async setPool(pool, meta, intent) {
      if(busy||recovery)return false;
      intent??=beginSelection({kind:'launch',chainId:pool.chainId,controller:pool.controller});
      if(!isSelection(intent)||intent.key!==targetKey({kind:'launch',chainId:pool.chainId,controller:pool.controller}))return false;
      const c = pool.constructor, quoteToken = c.quote, token = c.currency0 === quoteToken ? c.currency1 : c.currency0;
      // Simple launches carry their pool key; Studio launches read it from their controller.
      const [key, t, q] = await Promise.all([pool.kind === 'qhooks-simple-launch' && pool.key ? pool.key : livePoolKey(pool.chainId, pool.controller), erc20(pool.chainId, token), erc20(pool.chainId, quoteToken)]);
      if(!isSelection(intent))return false;
      st = { chainId: String(pool.chainId), key, token, quote: quoteToken, symbol: t.symbol || meta?.symbol || 'token', decimals: t.decimals, quoteSymbol: q.symbol, quoteDecimals: q.decimals };
      let pools=meta?.pools||pool.pools||[];
      const registry=chainById(pool.chainId);pools=await Promise.all(pools.map(async p=>{if(poolQuoteInfo(registry,p).kind!=='custom')return p;try{const r=await fetch('/api/launch/quote-check?'+new URLSearchParams({chain:pool.chainId,token:p.quote}),{cache:'no-store'}),q=r.ok?await r.json():null;return {...p,quoteSymbol:q?.symbol||p.quoteSymbol,quoteDecimals:q?.decimals??p.quoteDecimals,quoteUsd:q?.ok?q.usd:null};}catch{return {...p,quoteUsd:null};}}));if(!isSelection(intent))return false;
      if((pools.length>1||pools.some(p=>poolQuoteInfo(registry,p).kind==='custom'))&&pools.every(p=>p.key&&p.quote)){
        st.multi=true;st.pools=pools.slice().sort((a,b)=>Number(!!b.main)-Number(!!a.main));
        paySel.replaceChildren(h('option',{value:'native'},NATIVE[st.chainId]),...st.pools.map(p=>h('option',{value:p.quote},p.quoteSymbol)));
        pay=st.pools.some(p=>nativeRoute(st.chainId,p.quote))?'native':st.pools[0].quote;paySel.value=pay;await syncHome(true);renderRisk();const view=h('div');trustRisk(view,pool).then(()=>{if(isSelection(intent)){risk.replaceChildren(view);risk.hidden=view.hidden;}}).catch(()=>{});await layout();return isSelection(intent);
      }
      const native = nativeRoute(pool.chainId, quoteToken);
      paySel.replaceChildren(h('option', { value: 'quote' }, q.symbol), ...(native ? [h('option', { value: 'native' }, NATIVE[pool.chainId])] : []));
      // Wrapped-native launches default to paying in the coin people actually hold.
      pay = native?.wrap || native?.stock || native?.usdg ? 'native' : 'quote'; paySel.value = pay;
      // QHooks launches: verified creator, copy warning, RepoProof verdict and on-chain facts (qx-trust.mjs).
      paintCachedHolding(); await syncHome(true);
      renderRisk(); const view=h('div');trustRisk(view,pool).then(()=>{if(isSelection(intent)){risk.replaceChildren(view);risk.hidden=view.hidden;}}).catch(()=>{}); await layout();return isSelection(intent);
    },
    /// Any token, traded through 0x: { chainId, address, symbol, decimals, safety }.
    async setExternal(t,intent) {
      if(busy||recovery)return false;
      intent??=beginSelection({kind:'external',chainId:t.chainId,address:t.address});
      if(!isSelection(intent)||intent.key!==targetKey({kind:'external',chainId:t.chainId,address:t.address}))return false;
      if (t.chainId === 'solana') {
        st = { ext: true, sol: true, chainId: 'solana', token: t.address, symbol: t.symbol || 'token', decimals: Number(t.decimals ?? 6), quote: SOL_USDC, quoteSymbol: 'USDC', quoteDecimals: 6, safety: t.safety || null, curve: t.curve || null };
        if (curveNoRoute(t.curve)) st.noRoute = curveNoRoute(t.curve);
        paySel.replaceChildren(h('option', { value: 'native' }, 'SOL'), h('option', { value: 'quote' }, 'USDC'));
        pay = 'native'; paySel.value = pay;
        paintCachedHolding(); await syncHome(true); renderRisk(); await layout(); return isSelection(intent);
      }
      const noRoute=externalTradingNote(t.chainId);
      if (noRoute) {
        st={ext:true,noRoute,chainId:String(t.chainId),token:t.address,symbol:t.symbol||'token',decimals:Number(t.decimals??18),quote:null,quoteSymbol:null,quoteDecimals:18,safety:t.safety||null};
        pay='native';paySel.replaceChildren(h('option',{value:'native'},NATIVE[t.chainId]));paySel.value=pay;
        await layout();return isSelection(intent);
      }
      const meta = t.decimals == null ? await erc20(t.chainId, t.address).catch(() => ({ decimals: 18 })) : { decimals: t.decimals };
      if(!isSelection(intent))return false;
      // Elysium (no 0x): trade the token's deepest canonical v4 pool directly through the chain's QFee router.
      if (hasDirectRoute(t.chainId)) {
        const d = await resolveDirectPool(t.chainId, t.address, t.pools || []).catch(() => ({ refused: 'read' }));
        if(!isSelection(intent))return false;
        const native = !d.refused && BigInt(d.quote) === 0n;
        st = d.refused ? { ext: true, direct: true, noRoute: refusalText(d), chainId: String(t.chainId), token: t.address, symbol: t.symbol || 'token', decimals: Number(meta.decimals ?? 18), quote: null, quoteSymbol: null, quoteDecimals: 18, safety: t.safety || null }
          : { direct: true, nativePool: native, chainId: String(t.chainId), key: d.key, token: t.address, quote: d.quote, symbol: t.symbol || 'token', decimals: Number(meta.decimals ?? 18),
            quoteSymbol: native ? NATIVE[t.chainId] : 'W' + NATIVE[t.chainId], quoteDecimals: 18, safety: t.safety || null, hookNote: d.hookNote, hookOwner: d.hookOwner, liquidityUsd: Number(d.liquidityUsd) || null };
        const wrapRoute = !native && !d.refused && nativeRoute(t.chainId, d.quote);
        paySel.replaceChildren(h('option', { value: 'native' }, NATIVE[t.chainId]), ...(wrapRoute ? [h('option', { value: 'quote' }, st.quoteSymbol)] : []));
        pay = 'native'; paySel.value = pay;
        paintCachedHolding(); await syncHome(true); renderRisk(); await layout(); if (st.noRoute) { out.textContent = st.noRoute; go.disabled = true; } return isSelection(intent);
      }
      const [qa, qs, qd] = STABLE[t.chainId] || [null, null, null];
      st = { ext: true, chainId: String(t.chainId), token: t.address, symbol: t.symbol || 'token', decimals: Number(meta.decimals ?? 18), quote: qa, quoteSymbol: qs, quoteDecimals: qd, safety: t.safety || null, curve: t.curve || null };
      if (curveNoRoute(t.curve)) st.noRoute = curveNoRoute(t.curve);
      paySel.replaceChildren(h('option', { value: 'native' }, NATIVE[t.chainId]), ...(qa ? [h('option', { value: 'quote' }, qs)] : []));
      pay = 'native'; paySel.value = pay;
      paintCachedHolding(); await syncHome(true); renderRisk(); await layout();if (st.noRoute) { out.textContent = st.noRoute; go.disabled = true; } return isSelection(intent);
    },
    setSafety(v,intent=selection) { if (isSelection(intent)&&(st?.ext||st?.direct)) { st.safety = v; renderRisk(); } },
    setCurve(curve,intent=selection) {
      if (!isSelection(intent) || !st?.ext || busy || recovery) return false;
      if (curve && (String(curve.chainId) !== st.chainId || curve.token !== st.token)) return false;
      const prior = st.curve, priorNote = curveNoRoute(prior);
      const changed = (prior?.phase || '') !== (curve?.phase || '') || (prior?.pool?.address || prior?.pool?.id || '') !== (curve?.pool?.address || curve?.pool?.id || '');
      st.curve = curve;
      if (priorNote && st.noRoute === priorNote) delete st.noRoute;
      const nextNote = curveNoRoute(curve); if (nextNote) st.noRoute = nextNote;
      if (changed) { refresh(); void layout(); }
      return true;
    },
    // The market poll updates this every few seconds; a price tick must not disarm a pending "Confirm $X".
    setPriceUsd(p,intent=selection) { if(!isSelection(intent))return; const v = Number(p); priceUsd = Number.isFinite(v) && v > 0 ? v : null;if(priceUsd){marketPrices.push({price:priceUsd,at:now()});marketPrices=marketPrices.slice(-12);} },
    setSide, preset, submit,
    // Position actions reread the live balance. run=true continues through the
    // normal quoted submit flow, with the same owner, router and confirmation checks.
    async prefillSell({percent,owner,chainId,token,controller,run=false,quoteNow=false}={}) {
      if(!st||busy||recovery){status.textContent=busy?'Finish the current trade before preparing a sell.':recovery?'Resolve the funded trade below before preparing a sell.':'Open a token first.';return false;}
      if(![25,50,100].includes(percent))return false;
      const activeState=st,intent=selection,me=st.sol?solAddress():connectedAddress();
      const ownerMatches=()=>st?.sol?owner===solAddress():typeof owner==='string'&&owner.toLowerCase()===connectedAddress()?.toLowerCase();
      if(!me||!ownerMatches()||String(chainId)!==st.chainId||(st.sol?token!==st.token:String(token).toLowerCase()!==st.token.toLowerCase())||
        controller&&intent.key!==targetKey({kind:'launch',chainId,controller}))return false;
      clearArmed();clearTimeout(timer);current=null;go.disabled=true;funding.clear();layoutRevision++;const mine=++qseq;
      quoteLoading=false;renderQuoteFreshness();
      pendingSellPrefill=true;
      status.textContent='Reading your available token balance…';
      const alive=()=>isSelection(intent)&&st===activeState&&mine===qseq&&!busy&&!recovery&&ownerMatches();
      try{
        let held,precision;
        if(st.sol){const response=await fetch('/api/terminal/sol/balance/'+me+'?mint='+st.token,{cache:'no-store'});if(!response.ok)throw Error('Couldn’t read your token balance. Refresh holdings and try again.');const body=await response.json();if(!/^\d{1,78}$/.test(body.token||''))throw Error('Couldn’t read your token balance. Try again in a moment.');held=BigInt(body.token);precision=body.decimals;}
        else{const body=await erc20(st.chainId,st.token,me);held=body.balance;precision=body.decimals;}
        if(!alive())return false;
        if(typeof held!=='bigint'||held<0n||held>=1n<<256n||!Number.isInteger(precision)||precision<0||precision>36||precision!==st.decimals)throw Error('Couldn’t confirm this token’s decimals. Reopen this token before selling.');
        const value=sellPortion(held,percent);
        if(!value)throw Error(held===0n?'This wallet has no available tokens to sell.':'This balance is too small for that percentage.');
        pendingSellPrefill=false;side='sell';sellCash=false;homeSelected=false;if(st.multi)pay='auto';paySel.value=pay;sellPrefillOwner=me;
        const filled=formatUnits(value,precision,precision).replace(/,/g,'');
        setAmount(filled);
        await layout();
        if(!isSelection(intent)||st!==activeState||!ownerMatches()||side!=='sell'||sellPrefillOwner!==me||amount.value!==filled)return false;
        status.textContent='Sell '+percent+'% prepared.';
        if(run||quoteNow){clearTimeout(timer);await quote();if(!quoteMatches(current)||!ownerMatches()||current.a!==value||amount.value!==filled)return false;if(run)await submit();}
        return true;
      }catch(error){if(alive())status.textContent=tradeError(error);if(rowMode)throw error;return false;}
      finally{if(mine===qseq)pendingSellPrefill=false;}
    },
    // Row review retains this exact quote/owner/minimum. Explicit inline confirmation
    // satisfies the existing cap/impact confirmation, never a risk acknowledgement.
    sellReview() {
      if(!rowMode||!current||!quoteMatches(current)||side!=='sell'||busy)throw Error(status.textContent||out.textContent||'Refresh the sell quote.');
      assertTradeOwner(current);
      const plan=tradePlan(current),highImpact=impactGate({impactPct:current.impactPct,armedAt:null,now:now()})==='arm';
      rowReview={quote:current,at:now(),used:false};
      const receive=st.ext?xTokens():{outSym:(st.multi?current.route.pool:selectedQuote()).quoteSymbol,outDec:(st.multi?current.route.pool:selectedQuote()).quoteDecimals};
      return {id:rowReview,amount:formatUnits(current.a,st.decimals,st.decimals),preview:'Receive ≈ '+formatUnits(current.got,receive.outDec,6)+' '+receive.outSym+' · min '+formatUnits(current.minOut,receive.outDec,6),usd:tradeUsd(current),silent:!st.sol&&plan.silent,confirmRequired:!!plan.ticketConfirm||highImpact||['caution','danger'].includes(st.safety?.verdict)||!!st.hookOwner,warning:highImpact?confirmCopy('sell',current.impactPct).status:'',slippageBps:current.toleranceBps};
    },
    gasShort:()=>gasGate.short(),recheckGas:()=>gasGate.recheck(),
    async submitSell(review,{confirmed=false}={}) {
      if(!rowMode||!rowReview||review.id!==rowReview||rowReview.used||rowReview.quote!==current||!quoteMatches(current)||side!=='sell'||now()-rowReview.at>30000)throw Error('This sell quote expired. Tap a percentage for a fresh quote.');
      assertTradeOwner(current);
      if(tradePlan(current).silent!==review.silent)throw Error('One-click settings changed. Review a fresh sell quote.');
      if(go.disabled)throw Error(status.textContent||'Review the token risk and confirm this sell.');
      if((!review.silent||review.confirmRequired)&&!confirmed)throw Error('Confirm this sell first.');
      if(confirmed){armedAt=Date.now();impactArmedAt=Date.now();}
      rowReview.used=true;lastReceipt=null;lastSubmitError=null;
      await submit();
      if(lastReceipt)return {receipt:lastReceipt};
      if(lastSubmitError)throw lastSubmitError;
      throw Error(status.textContent||'The sell was not submitted. Refresh the quote.');
    },
    rowElements:()=>({risk,status,ready:go}),
    /// Instant buy from the feed: sets the amount in the given unit class and sends once quoted.
    async quickBuy(cls, value, payment = null) {
      if (!st || busy||recovery) return;
      const intent=selection;
      const choices=()=>quickBuyPaymentOptions(st,paySel.options,NATIVE[st.chainId]);
      const request={cls,value,payment},details={chainId:st.chainId,noRoute:st.noRoute,symbol:st.symbol};
      const chosen=resolveQuickBuyPayment(request,choices(),details);
      const stop=reason=>{status.textContent=reason;throw Error(reason);};
      if(!chosen.ok)stop(chosen.reason);
      if(homeSelected)stop('Choose the payment currency in the trade ticket before using quick buy.');
      clearArmed();clearTimeout(timer);qseq++;current=null;go.disabled=true;sellPrefillOwner=null;
      quoteLoading=false;renderQuoteFreshness();
      side = 'buy'; sellCash = false;
      pay=chosen.pay;paySel.value=pay;setAmount(chosen.value);
      await layout();if(!isSelection(intent))return;clearTimeout(timer);
      const matches=()=>{const check=resolveQuickBuyPayment({...request,payment:chosen.payment},choices(),details);return check.ok&&pay===check.pay&&!homeSelected&&sameQuickPayment(check.payment,chosen.payment);};
      if(!matches())stop('The quick-buy payment changed. Choose a payment currency in the trade ticket.');
      await quote();if(!isSelection(intent))return;
      if(!matches())stop('The quick-buy payment changed. Review the trade ticket.');
      if(quoteMatches(current))await submit();
    },

    get unitClass() { return st ? unitClass(pay === 'native' ? NATIVE[st.chainId] : st.quoteSymbol) : null; }
  };
}
export { unitClass };
