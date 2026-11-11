import {prepareTradeThesis,recordTerminalTrade} from './qx-trade-record.mjs';
import {renderSolanaRewards,enrollSolanaReferrer,recordSolanaRewards} from './qx-solana-rewards.mjs';
import {mountTradingSettings} from './qx-trading-settings.mjs';
import {resolveTradingTolerance} from './qx-trading-preferences.mjs';
// Terminal trade ticket: market buys and sells through the launch's live pool and its blocks, amount
// presets, price tolerance, price impact, and buys paid in the native coin where the chain allows.
// Every quote runs through the real pool and hook, so charges are in the number shown. Trades go through the
// platform fee router: 1% per trade, 30% of it back to the trader as cashback they claim here (40% for QHOOKS holders on Robinhood Chain).
import { rpc, livePoolKey, parseUnits, formatUnits, erc20, send, ensureAllowance, connectedAddress, onWalletChange, NATIVE, CHAIN_NAME, h } from '/qx-chain.mjs';
import { quoteSingle, nativeRoute, quoteNative, FEE_BPS, feeSwapCall, viaSwapCall, nativeHops, cashbackOf, referralLink, claimCall, savedReferrer } from '/qx-swap.mjs';
import { extraAddress, isLive, setUp } from '/qx-extras.mjs';
import { hasDirectRoute, resolveDirectPool, refusalText } from '/qx-elysium-direct.mjs';
import { holderMinTokens, shortText } from '/qx-holder-min.mjs';
import { solAddress, solWallets, connectSol, signSol, onSolChange } from '/qx-solana.mjs';
import { renderRisk as trustRisk } from '/qx-trust.mjs';
import { oneClickPlan, withOneClick, pressGate, silentActive } from '/qx-instant-bridge.mjs';
import { impactFromQuotes, impactLines, impactGate, confirmCopy } from '/qx-trade-impact.mjs';
import { getWalletHub } from '/wallet-hub.mjs';
import { relayWallet } from './qx-relay-wallet.mjs';
import { createFundingRow, fundingAsset, destinationCosts, runCrossChainBuy, retryLanded, recoveryView,
  cashAsset, cashHome, cashSettings, moveProceeds, chainName, readAssetBalance, loadFundingStyle, xchainEnabled } from './qx-xchain-gate.mjs';

// Holder cashback (live since the Safe set the flywheel on 2026-11-08): on Robinhood Chain the fee router pays 40%
// instead of 30% to wallets the flywheel counts as QHOOKS holders (1,000,000+). Read on chain, cached per wallet.
const FLYWHEEL_RH = "0xb85E67cf7728572033A9d36aEe3218DadF85bAA2", holderReads = new Map();
function holderRate(who) {
  if (!who) return Promise.resolve(false);
  const k = who.toLowerCase();
  if (!holderReads.has(k)) holderReads.set(k, rpc("4663", "eth_call", [{ to: FLYWHEEL_RH, data: "0xd4d7b19a" + k.slice(2).padStart(64, "0") }, "latest"])
    .then(r => BigInt(r || "0x0") === 1n).catch(() => { holderReads.delete(k); return false; }));
  return holderReads.get(k);
}
function feeLine(chainId, extra = "") {
  const s = h("span", { class: "qxt-fee" }, "30% cashback from the 1% QHooks fee" + extra);
  if (String(chainId) === "4663") Promise.all([holderRate(connectedAddress()), holderMinTokens()]).then(([on, min]) => {
    if (!min) return; // holderMin 0 (holder cashback off) or unread: the plain 30% line stays
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
export const validTradeTolerance = value => /^\d{1,5}$/.test(String(value ?? '')) && Number(value) > 0 && Number(value) <= 10000;

export function mountTicket(card, { onTraded = () => {}, now = Date.now } = {}) {
  const savedTolerance = store('tol');
  let st = null, side = 'buy', pay = 'quote', tol = validTradeTolerance(savedTolerance) ? String(Number(savedTolerance)) : '100', current = null, qseq = 0, timer = null, busy = false;
  let priceUsd = null, armedAt = null, armTimer = null, sellCash = false, recovery = null, impactArmedAt = null;
  let sellPrefillOwner = null, pendingSellPrefill = false;
  let selection=null, selectionRevision=0, layoutRevision=0;
  let quoteLoading = false, quoteAgeTimer = null;
  let marketPrices=[];
  const hub = getWalletHub(window);
  loadFundingStyle();
  const status = h('p', { class: 'qtx-status', role: 'status', ariaLive: 'polite' });
  const amount = h('input', { type: 'text', inputMode: 'decimal', placeholder: '0.0', autocomplete: 'off', ariaLabel: 'Amount', id: 'qxt-amount' });
  const thesis = h('input', {type:'text',maxLength:280,placeholder:'Buy thesis · optional, 140 characters',ariaLabel:'Public buy thesis',autocomplete:'off'});
  const thesisRow = h('label',{class:'qxt-trader-thesis'},h('span',{},'Public buy thesis'),thesis,h('small',{},'Shown with this buy when your public trading profile is on. ',h('a',{href:'/community#trading-feed'},'Trading profile')));
  const unit = h('span', { class: 'qxt-unit' });
  const balance = h('button', { type: 'button', class: 'qxt-bal', title: 'Use the whole balance' });
  const presets = h('div', { class: 'qxt-presets', role: 'group', ariaLabel: 'Amount presets' });
  const out = h('div', { class: 'qxt-out' }, 'Choose a launch to trade.');
  const quoteTime = h('time', { class: 'qxt-fee' });
  const refreshQuote = h('button', { type: 'button', class: 'qxt-context-action', disabled: true }, 'Refresh quote');
  const quoteTools = h('div', { class:'qxt-quote-tools', hidden: true }, h('small', {}, quoteTime), refreshQuote);
  const go = h('button', { type: 'button', class: 'qxt-go', disabled: true }, 'Buy');
  // Signed out (EVM): a live button that opens the same wallet sheet as the header's Connect wallet.
  const signIn = h('button', { type: 'button', class: 'qxt-go qxt-signin', hidden: true }, 'Sign in to buy');
  signIn.addEventListener('click', () => { (document.getElementById('qxt-connect')||document.getElementById('qhc-trigger'))?.click(); });
  // Empty wallet on this chain: say how to fund it, with the address to copy.
  const addFunds = h('div', { class: 'qxt-add-funds', hidden: true });
  const FUND_CHAINS = [['8453','Base'],['1','Ethereum'],['42161','Arbitrum'],['56','BNB'],['4663','Robinhood Chain']];
  function showAddFunds(b) {
    const me = connectedAddress();
    if (!b || !me || !st || st.sol || side !== 'buy' || b.native !== 0n || b.quote !== 0n) { addFunds.hidden = true; return; }
    const native = NATIVE[st.chainId] || 'ETH', others = FUND_CHAINS.filter(([id]) => id !== String(st.chainId)).map(([, n]) => n);
    const copy = h('button', { type: 'button', class: 'qxt-mini' }, 'Copy');
    copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(me); copy.textContent = 'Copied'; } catch { copy.textContent = 'Copy failed'; } });
    addFunds.replaceChildren(h('strong', {}, 'Add ' + native + ' to buy.'), ' Send ' + native + ' on ' + (CHAIN_NAME[st.chainId] || 'this network') + ' to your QHooks wallet: ', h('code', { title: me }, me.slice(0, 6) + '…' + me.slice(-4)), ' ', copy, ' — or pay from ' + others.slice(0, -1).join(', ') + ' or ' + others.at(-1) + ' if you hold ' + native + ' there.');
    addFunds.hidden = false;
  }
  // After an EVM buy through the QHooks router: the cashback line and the referral link, where they are earned.
  function afterBuy() {
    const me = connectedAddress(); if (!me) return;
    const link = h('button', { type: 'button', class: 'qxt-mini' }, 'Copy your link — earn 20% from traders you bring');
    link.addEventListener('click', async () => { try { await navigator.clipboard.writeText(referralLink(me)); link.textContent = 'Link copied'; } catch { link.textContent = referralLink(me); } });
    status.append(' 30% of the fee comes back to you; claim it in ', h('a', { href: '/me#qa-rewards' }, 'My QHooks'), '. ', link);
  }
  const showSignIn = () => { const out = !st?.sol && !connectedAddress(); if (out) addFunds.hidden = true; signIn.hidden = !out; go.hidden = out; signIn.textContent = side === 'sell' ? 'Sign in to sell' : 'Sign in to buy'; };
  const sideBtns = ['buy', 'sell'].map(s => h('button', { type: 'button', 'data-side': s, ariaPressed: String(s === side) }, s === 'buy' ? 'Buy' : 'Sell'));
  const sellToCash = h('button', { type: 'button', 'data-side': 'cash', hidden: !xchainEnabled }, 'Sell to cash');
  const paySel = h('select', { ariaLabel: 'Pay with' });
  const tolSel = h('select', { ariaLabel: 'Price tolerance' }, ...TOL.map(([v, t]) => h('option', { value: v, selected: v === tol }, t)));
  if (!TOL.some(([value]) => value === tol)) tolSel.append(h('option', { value: tol, selected: true }, Number(tol) / 100 + '%'));
  tolSel.value = tol;
  let settingsStorage;try{settingsStorage=globalThis.localStorage;}catch{}
  const tradingSettings=mountTradingSettings({h,storage:settingsStorage,legacyTolerance:savedTolerance,onChange:profileChanged,onError:error=>{status.textContent=error.message;}});
  function syncProfile(){
    if(st)tradingSettings.setChain(st.chainId,Array.from(paySel.options,option=>unitClass(option.textContent)));
    const profile=tradingSettings.profile(),settings=profile[side],resolved=resolveTradingTolerance(settings,marketPrices,now());tol=String(resolved.bps);
    tolSel.replaceChildren(h('option',{value:'auto'},'Auto · max '+settings.maxBps/100+'%'),...TOL.map(([v,t])=>h('option',{value:v},t)));
    if(settings.mode==='manual'&&!TOL.some(([v])=>v===String(settings.manualBps)))tolSel.append(h('option',{value:String(settings.manualBps)},settings.manualBps/100+'%'));
    tolSel.value=settings.mode==='auto'?'auto':String(settings.manualBps);
  }
  function profileChanged(){if(busy||recovery)return;status.textContent='';syncProfile();clearArmed();refresh();if(st)layout();}
  syncProfile();
  const payRow = h('label', { class: 'qxt-pay' }, h('span', {}, 'Pay with'), paySel);

  const cash = h('div', { class: 'qxt-cash' });
  const risk = h('div', { class: 'qxt-risk', hidden: true });
  const followup = h('div');
  const funding = createFundingRow({ h, getPlan: q => tradePlan(current, q), onChange: ({ quote, ready }) => {
    clearArmed(); if (current) current.funding = quote;
    go.disabled = busy || !quoteMatches(current) || !ready || (st?.safety?.verdict === 'danger' && !risk.querySelector('input')?.checked);
  } });
  card.replaceChildren(
    tradingSettings.element,
    h('div', { class: 'qxt-side-toggle', role: 'group', ariaLabel: 'Trade side' }, ...sideBtns, sellToCash),
    h('div', { class: 'qxt-row2' }, payRow, h('label', { class: 'qxt-pay' }, h('span', {}, 'Tolerance'), tolSel)),
    risk, h('div', { class: 'qxt-amount' }, amount, unit), h('div', { class: 'qxt-meta' }, balance), addFunds, presets, thesisRow, out, quoteTools, funding.element, go, signIn, status, followup, cashSettings(h), cash);
  import('/qx-oneclick.mjs').then(m => m.mountOneClickToggle(card)).catch(() => {}); // One-click trading toggle (hidden unless an email/Google wallet is connected)

  const targetKey=t=>!t?'none':t.kind==='launch'?'m:'+String(t.chainId)+':'+String(t.controller).toLowerCase():'t:'+String(t.chainId)+':'+(String(t.chainId)==='solana'?String(t.address):String(t.address).toLowerCase());
  const isSelection=intent=>!!intent&&intent===selection;
  function beginSelection(target) {
    if(busy||recovery){status.textContent=busy?'Finish the current trade before opening another token.':'Resolve the funded trade below before opening another token.';return false;}
    selection=Object.freeze({revision:++selectionRevision,key:targetKey(target)});thesis.value='';
    clearTimeout(timer);qseq++;current=null;st=null;priceUsd=null;marketPrices=[];sellCash=false;sellPrefillOwner=null;pendingSellPrefill=false;
    funding.clear();followup.replaceChildren();cash.replaceChildren();risk.replaceChildren();risk.hidden=true;
    amount.value='';unit.textContent='';balance.textContent='';balance.disabled=true;paySel.replaceChildren();
    clearArmed();go.disabled=true;status.textContent='';out.textContent=target?(target.kind==='launch'?'Loading the launch…':'Loading the token…'):'Choose a token to trade.';
    quoteLoading=false;renderQuoteFreshness();
    return selection;
  }
  function failSelection(intent,message,{retry}={}){if(!isSelection(intent)||busy||recovery)return false;clearTimeout(timer);qseq++;st=null;current=null;funding.clear();go.disabled=true;out.textContent=message;
    quoteLoading=false;renderQuoteFreshness();
    if(retry){const again=h('button',{type:'button',class:'qxt-context-action'},'Retry trade setup');again.addEventListener('click',async()=>{if(!isSelection(intent)||busy||recovery)return;again.disabled=true;out.textContent='Preparing trade…';await retry();});out.append(again);}
    return true;}
  const quoteMatches=c=>!!c&&!!st&&isSelection(c.selection)&&c.revision===qseq&&c.chainId===st.chainId&&c.token===st.token&&c.side===side&&c.pay===pay;
  const bindQuote=(fields,revision,owner,tolerance=tol)=>({...fields,selection,revision,chainId:st.chainId,token:st.token,owner,readAt:now(),toleranceBps:Number(tolerance)});
  const quoteOwner = () => st?.sol ? solAddress() : connectedAddress();
  const sameOwner = (a,b,sol) => sol ? a===b : a?.toLowerCase()===b?.toLowerCase();
  function hasQuoteAmount() { try { return !!st&&parseUnits(amount.value,payDecimals())>0n; } catch { return false; } }
  function renderQuoteFreshness() {
    clearTimeout(quoteAgeTimer);
    const hasAmount=hasQuoteAmount();
    quoteTools.hidden=!hasAmount;
    refreshQuote.disabled=!hasAmount||quoteLoading||busy||!!recovery;
    const c=current,valid=!quoteLoading&&quoteMatches(c)&&sameOwner(c.owner,quoteOwner(),st.sol)&&Number.isFinite(c.readAt);
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
    current=null;go.disabled=true;out.textContent='Wallet changed. Refresh the quote.';
    return false;
  }
  refreshQuote.addEventListener('click',()=>{if(!busy&&!recovery&&!quoteLoading&&hasQuoteAmount())refresh();});
  function assertSelection(c){if(!quoteMatches(c))throw new Error('This token selection changed. Review a fresh quote before trading.');}
  const payUnit = () => side === 'sell' ? st.symbol : pay === 'native' ? (st.sol ? 'SOL' : NATIVE[st.chainId]) : st.quoteSymbol;
  const payDecimals = () => side === 'sell' ? st.decimals : pay === 'native' ? (st.sol ? 9 : 18) : st.quoteDecimals;
  async function balances() {
    if (st?.sol) {
      const me = solAddress(); if (!me) return null;
      const [t, q] = await Promise.all([fetch(`/api/terminal/sol/balance/${me}?mint=${st.token}`).then(r => r.json()), fetch(`/api/terminal/sol/balance/${me}?mint=${SOL_USDC}`).then(r => r.json())]);
      return { token: BigInt(t.token || 0), quote: BigInt(q.token || 0), native: BigInt(t.sol || 0) };
    }
    const me = connectedAddress(); if (!me || !st) return null;
    const [t, q, n] = await Promise.all([erc20(st.chainId, st.token, me), st.quote && !st.nativePool ? erc20(st.chainId, st.quote, me) : { balance: 0n }, rpc(st.chainId, 'eth_getBalance', [me, 'latest'])]);
    return { token: t.balance, quote: q.balance, native: BigInt(n) };
  }
  const spendable = b => side === 'sell' ? b.token : pay === 'native' ? b.native : b.quote;
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
    return impactLines({ impactPct, liquidityUsd: poolLiquidityUsd() }).map(l => h('span', { class: 'qxt-impact' + (l.level === 'warn' ? ' warn' : '') }, l.text));
  }
  function tradeUsd(c) {
    const dollars = sym => unitClass(sym) === 'usd' && /^(USDC|USDT|USDG)$/i.test(sym || '');
    const units = (v, d) => Number(formatUnits(v, d, d).replace(/,/g, ''));
    if (c.side === 'buy' && dollars(payUnit())) return units(c.a, payDecimals());
    const sym = st.ext ? xTokens().outSym : st.quoteSymbol, dec = st.ext ? xTokens().outDec : st.quoteDecimals;
    if (c.side === 'sell' && dollars(sym)) return units(c.got, dec);
    return priceUsd ? units(c.side === 'buy' ? c.got : c.a, st.decimals) * priceUsd : null;
  }
  function tradePlan(c, fundingQuote = c?.funding) {
    const me = connectedAddress(), wallet = hub.snapshot().current;
    const inputUsd = Number(fundingQuote?.details?.currencyIn?.amountUsd);
    const usd = fundingQuote && inputUsd > 0 ? inputUsd : c ? tradeUsd(c) : null;
    return oneClickPlan(me, wallet?.owner?.toLowerCase() === me?.toLowerCase() ? wallet.entry : null, usd);
  }
  function ticketPlan(c) {
    const inputUsd = Number(c.funding?.details?.currencyIn?.amountUsd), usd = inputUsd > 0 ? inputUsd : tradeUsd(c), plan = tradePlan(c);
    if (pressGate({ plan, armedAt, now: Date.now() }) === 'arm') {
      clearArmed(); armedAt = Date.now();
      go.textContent = Number.isFinite(usd) && usd > 0 ? 'Confirm $' + Math.round(usd) : 'Confirm ' + c.side;
      if (recovery) go.disabled = false;
      armTimer = setTimeout(clearArmed, 15000);
      return null;
    }
    clearArmed(); return plan;
  }
  let lastWallet = hub.snapshot().current;
  hub.subscribe(({ current: wallet }) => { if (wallet !== lastWallet) { clearArmed(); lastWallet = wallet; } showSignIn(); });
  window.addEventListener('qhooks:trade-prefs', clearArmed);

  async function layout() {
    if (!st||busy||recovery) return;
    const activeState=st,intent=selection,mine=++layoutRevision;
    syncProfile();
    sideBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.side === side)));
    card.dataset.side = side;
    thesisRow.hidden = side !== 'buy';
    sellToCash.setAttribute('aria-pressed', String(sellCash));
    payRow.hidden = side === 'sell' || paySel.options.length < 2;
    unit.textContent = payUnit();
    go.textContent = buttonText();showSignIn();
    const profile=tradingSettings.profile(),list = side === 'sell' ? profile.sellPercentages.map(p => [p + '%', p]) : profile.amounts[unitClass(payUnit())].map(v => [v, v]);
    presets.replaceChildren(...list.map(([label, v], i) => h('button', { type: 'button', title: 'Key ' + (i + 1), onclick: () => preset(i) }, label)));
    const b = await balances().catch(() => null);
    if(st!==activeState||!isSelection(intent)||mine!==layoutRevision||busy||recovery)return;
    balance.textContent = b ? 'Balance ' + formatUnits(spendable(b), payDecimals(), 4) + ' ' + payUnit() : st?.sol ? (solAddress() ? '' : 'Connect a Solana wallet to trade') : '';
    balance.disabled = !b;showAddFunds(b);
    refresh();
    showCashback().catch(() => cash.replaceChildren());
  }

  // ---- Outside tokens: 0x routes, 1% platform fee taken by 0x on the coin/dollar side ----
  const xTokens = () => {
    const quoteSide = pay === 'native' || !st.quote ? XNATIVE : st.quote;
    return side === 'buy' ? { sell: quoteSide, buy: st.token, outDec: st.decimals, outSym: st.symbol } : { sell: st.token, buy: quoteSide, outDec: quoteSide === XNATIVE ? 18 : st.quoteDecimals, outSym: quoteSide === XNATIVE ? NATIVE[st.chainId] : st.quoteSymbol };
  };
  // Outside tokens go through our fee router too (swapVia), so they pay the same 30% cashback and 20% referral: the
  // router takes 1% (from the input on a buy, so 0x is quoted for the other 99%) and hands the rest to 0x.
  const xSpend = a => side === 'buy' ? a - a * FEE_BPS / 10000n : a;
  async function fetchXQuote(a,tolerance=tol) {
    const me = connectedAddress(), { sell, buy } = xTokens();
    const q = new URLSearchParams({ chain: st.chainId, sell, buy, amount: xSpend(a).toString(), taker: me, side, slippageBps: String(tolerance), via: 'router' });
    const r = await fetch('/api/terminal/x/quote?' + q, { cache: 'no-store' });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error === 'official_pool' ? (body.detail || 'Trade this token through its official QHooks pool.') + ' Open it from the terminal search.' : body.error === 'trading_off' ? 'Trading outside tokens is not switched on yet.' : body.error === 'no_route' ? 'No route for this trade right now.' : body.detail || 'No quote right now.');
    return body;
  }
  async function extQuote(mine, a, read) {
    if (!connectedAddress()) { out.textContent = 'Connect a wallet to get a quote.'; return; }
    try {
      const small = a / 100n > 0n ? a / 100n : null;
      // Impact: the same route for a hundredth of the amount (fees are proportional, so they cancel out of the ratio).
      const [q, rq] = await Promise.all([fetchXQuote(a,read.toleranceBps), small ? fetchXQuote(small,read.toleranceBps).catch(() => null) : null]);
      if (!quoteReadIsCurrent(read)) return;
      const { outDec, outSym } = xTokens(), cut = v => side === 'sell' ? v - v * FEE_BPS / 10000n : v;
      const got = cut(BigInt(q.buyAmount)), minOut = cut(BigInt(q.minBuyAmount));
      const impactPct = rq?.buyAmount ? impactFromQuotes(BigInt(q.buyAmount), a, BigInt(rq.buyAmount), small) : null;
      current = bindQuote({ side, pay, a, got, minOut, x: true },mine,read.owner,read.toleranceBps);
      out.replaceChildren(h('b', {}, '≈ ' + formatUnits(got, outDec, 4) + ' ' + outSym),
        h('span', {}, 'at least ' + formatUnits(minOut, outDec, 4) + (q.sources?.length ? ' · via ' + q.sources.map(s => s.replace(/_/g, ' ')).join(', ') : '')),
        ...impactNodes(impactPct),
        feeLine(st.chainId, ' · routed by 0x'));
      await offerFunding(mine);
    } catch (e) { if (mine === qseq) {current=null;go.disabled=true;out.textContent = e.message;} }
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
      if (tin !== ZERO) await ensureAllowance(chainId, tin, router, c.a, s, assertContext);
      const now = BigInt((await rpc(chainId, 'eth_getBlockByNumber', ['latest', false])).timestamp);
      assertTradeOwner(c);
      await sendRecorded(c, { to: router, data: viaSwapCall(q.tx.to, q.tx.data, tin, tout, c.a, minOut, c.side === 'buy', now + 600n), value: tin === ZERO ? c.a : 0n }, s, assertContext);
      }
      const after = await erc20(chainId, token, me).catch(() => null), moved = after ? (after.balance > b.token ? after.balance - b.token : b.token - after.balance) : null;
      s(moved === null ? 'Trade confirmed. Refresh balances.' : (c.side === 'buy' ? 'Bought ' : 'Sold ') + formatUnits(moved, st.decimals, 4) + ' ' + st.symbol + '.');if (c.side === 'buy' && moved !== null) afterBuy();
      amount.value = ''; thesis.value=''; document.dispatchEvent(new CustomEvent('qhooks:traded')); try { await onTraded({ side: c.side, moved, chainId:c.chainId,token:c.token,owner:c.owner,status: s, ext: true }); } catch {}
  }
  // ---- Solana: Jupiter orders signed in the trader's Solana wallet; 1% referral fee in SOL or USDC ----
  const solMints = () => {
    const quoteSide = pay === 'native' ? SOL_MINT : SOL_USDC;
    return side === 'buy' ? { input: quoteSide, output: st.token, outDec: st.decimals, outSym: st.symbol } : { input: st.token, output: quoteSide, outDec: quoteSide === SOL_MINT ? 9 : 6, outSym: quoteSide === SOL_MINT ? 'SOL' : 'USDC' };
  };
  function solConnectPrompt() {
    const list = solWallets();
    out.replaceChildren(h('span', {}, list.length ? 'Connect a Solana wallet to trade.' : 'No Solana wallet found. Install Phantom, Solflare or Backpack.'),
      ...list.map(w => h('button', { type: 'button', class: 'qxt-mini qxt-solw', onclick: async () => { try { await connectSol(w.name); refresh(); layout(); } catch (e) { status.textContent = e.message; } } },
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
      out.replaceChildren(h('b', {}, '≈ ' + formatUnits(got, outDec, 4) + ' ' + outSym),
        h('span', {}, 'at least ' + formatUnits(minOut, outDec, 4)),
        ...impactNodes(o.priceImpact != null && Number.isFinite(Number(o.priceImpact)) ? Math.abs(Number(o.priceImpact)) : null),
        h('span', { class: 'qxt-fee' }, o.route==='dbc'?'Direct Meteora DBC · fee includes the launch anti-snipe schedule · 30% of the QHooks share as cashback':'Jupiter route · 1% integrator fee plus pool fees'));
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
      if(o.route==='dbc'){const x=await (await import('/qx-sol-launch-trade.mjs')).executeDirectDbc(o);status.textContent='Trade finalized · '+x.signature;amount.value='';document.dispatchEvent(new CustomEvent('qhooks:traded'));await onTraded({side:c.side,chainId:c.chainId,token:c.token,owner:c.owner,ext:true});lock(false);layout();return;}
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
      amount.value = ''; thesis.value=''; document.dispatchEvent(new CustomEvent('qhooks:traded')); await onTraded({ side: c.side, moved, chainId:c.chainId,token:c.token,owner:c.owner,status: s, ext: true });
    } catch (e) { s(e.message || 'The trade did not go through'); }
    lock(false); layout();
  }
  onSolChange(() => { if (st?.sol&&!busy&&!recovery) { if(sellPrefillOwner&&sellPrefillOwner!==solAddress()){amount.value='';sellPrefillOwner=null;} refresh(); layout(); } });

  function renderRisk() {
    const v = st?.ext || st?.direct ? st.safety : null;
    // Elysium direct-route tokens whose launchpad hook has an owner (qx-elysium-direct.mjs REVIEWED_HOOKS).
    const note = st?.hookOwner ? h('p', { class: 'qxt-risk-note' }, 'This token’s launchpad can change its tax.') : null;
    risk.dataset.key = '';
    if (!v) { risk.hidden = !note; if (note) { risk.className = 'qxt-risk caution'; risk.replaceChildren(note); } return; }
    risk.hidden = false;
    const flags = (v.flags || []).slice(0, 4);
    risk.className = 'qxt-risk ' + (v.verdict === 'ok' ? 'unknown' : v.verdict);
    const title = { ok: 'No flags returned by available checks', caution: 'Trade with care', danger: 'High risk: this token may not be sellable', unknown: 'No safety scan for this token' }[v.verdict] || (v.unsupported ? 'No automated checks on this chain yet' : 'Safety unknown');
    const report=[...(note ? [note] : []), h('b', {}, title), ...(flags.length ? [h('ul', {}, ...flags.map(f => h('li', {}, f)))] : []),
      h('p', { class: 'qxt-muted' }, 'Source: ' + (typeof v.source === 'string' ? v.source.slice(0, 48) : 'not reported') + '.'),
      ...(v.verdict === 'danger' ? [h('label', {}, h('input', { type: 'checkbox', onchange: () => { if (current) go.disabled = busy || !risk.querySelector('input').checked || (funding.required && !funding.quote); } }), ' I understand and still want to trade')] : []),
      h('a', { href: 'https://repoproof.online/proof?q=' + encodeURIComponent(st.token), target: '_blank', rel: 'noopener' }, 'Full check on RepoProof ↗')];
    if(!flags.length&&(v.verdict==='ok'||v.verdict==='unknown')){
      risk.classList.add('qxt-risk-compact');
      risk.replaceChildren(...(note ? [note] : []), h('details',{},h('summary',{},v.verdict==='ok'?'Limited checks · no flags returned':'No safety scan returned'),h('div',{class:'qxt-risk-report'},...report.filter(x => x !== note))));
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
    if (!(await isLive(activeState.chainId, 'feeRouter'))) { if(!alive())return;cash.replaceChildren(h('p', {}, link)); return; }
    const router = await extraAddress('feeRouter', activeState.chainId), Z = '0x0000000000000000000000000000000000000000';
    const [q, n] = await Promise.all([cashbackOf(activeState.chainId, router, me, activeState.quote), cashbackOf(activeState.chainId, router, me, Z)]);
    if(!alive())return;
    const items = [[activeState.quote, q, activeState.quoteDecimals, activeState.quoteSymbol], [Z, n, 18, NATIVE[activeState.chainId]]].filter(x => x[1] > 0n);
    cash.replaceChildren(...items.map(([cur, v, d, sym]) => {
      const b = h('button', { type: 'button', class: 'qxt-mini' }, 'Claim');
      b.addEventListener('click', async () => { if (busy||!alive()||connectedAddress()!==me) return; b.disabled = true; try { await send(activeState.chainId, { to: router, data: claimCall(cur) }, t => { status.textContent = t; }); status.textContent = 'Rewards claimed.'; await showCashback(); document.dispatchEvent(new CustomEvent('qhooks:rewards-claimed')); } catch (e) { status.textContent = e.message; b.disabled = false; } });
      return h('p', {}, h('em', {}, 'Rewards'), h('span', {}, small(v, d) + ' ' + sym), b);
    }), h('p', {}, link));
    } catch {
      if(alive())cash.replaceChildren(h('p', {class:'qxt-muted',role:'status'}, 'Reward balances are unavailable. Your referral link is ready.'),h('p',{},link));
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
      amount.value = formatUnits(b.token * BigInt(tradingSettings.profile().sellPercentages[i]) / 100n, st.decimals, st.decimals).replace(/,/g, '');
    } else amount.value = tradingSettings.profile().amounts[unitClass(payUnit())][i];
    refresh();
  }

  function refresh() {
    if (busy||recovery) return;
    pendingSellPrefill=false;
    clearArmed();
    clearTimeout(timer); current = null; go.disabled = true; qseq++;
    funding.clear(); recovery = null; followup.replaceChildren();
    quoteLoading=hasQuoteAmount();renderQuoteFreshness();
    out.textContent = amount.value ? (st?.ext ? 'Finding the best route…' : 'Quoting through the pool…') : 'Enter an amount or pick a preset.';
    timer = setTimeout(quote, 300);
  }
  async function quote() {
    if (!st) return;
    syncProfile();
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
      if (st.nativePool) { const z = BigInt(key.currency0) === BigInt(side === 'buy' ? qt : token); [got, refGot] = await Promise.all([quoteSingle(chainId, key, z, spend), quoteSingle(chainId, key, z, small).catch(() => null)]); route = { label: side === 'buy' ? NATIVE[chainId] + ' → ' + st.symbol : st.symbol + ' → ' + NATIVE[chainId] }; }
      else if (side === 'buy' && pay === 'native') { const [r, rr] = await Promise.all([quoteNative(chainId, key, token, qt, spend, st.symbol), quoteNative(chainId, key, token, qt, small, st.symbol).catch(() => null)]); route = r; got = r.out; refGot = rr?.out ?? null; }
      else {
        const zeroForOne = key.currency0 === (side === 'buy' ? qt : token);
        [got, refGot] = await Promise.all([quoteSingle(chainId, key, zeroForOne, spend), quoteSingle(chainId, key, zeroForOne, small).catch(() => null)]);
      }
      const impactPct = refGot != null ? impactFromQuotes(got, spend, refGot, small) : null;
      if (side === 'sell') got -= got * FEE_BPS / 10000n;
      if (!quoteReadIsCurrent(read)) return;
      const minOut = got * (10000n - BigInt(read.toleranceBps)) / 10000n;
      const outDec = side === 'buy' ? st.decimals : st.quoteDecimals, outSym = side === 'buy' ? st.symbol : st.quoteSymbol;
      current = bindQuote({ side, pay, a, got, minOut, route },mine,read.owner,read.toleranceBps);
      out.replaceChildren(h('b', {}, '≈ ' + formatUnits(got, outDec, 4) + ' ' + outSym),
        h('span', {}, 'at least ' + formatUnits(minOut, outDec, 4) + ' · block charges included'),
        ...impactNodes(impactPct),
        feeLine(chainId),
        ...(route ? [h('span', {}, route.label)] : []));
      go.disabled = !connectedAddress() || busy;
      if (!connectedAddress()) status.textContent = 'Connect a wallet to trade.';
      await offerFunding(mine);
    } catch (e) { if (mine === qseq) {current=null;go.disabled=true;out.textContent = /revert|execution/i.test(e.message || '') ? 'The pool refuses this trade right now (its rules may be closed to it).' : e.message || 'No quote for this amount';} }
    finally {if(mine===qseq){quoteLoading=false;renderQuoteFreshness();}}
  }

  // One-click (qx-oneclick.mjs): when on, the server sends this trade (same router routes) with no wallet popup.
  async function tryOneClick(c, s) {
    const oc = await import('/qx-oneclick.mjs').catch(() => null);
    if (!oc || !(await oc.oneClickOn().catch(() => false))) return false;
    assertTradeOwner(c); s('Placing your trade…');
    const done = await oc.oneClickTrade({ chainId: st.chainId, token: st.token, side: c.side, amountWei: c.a, slippageBps: c.toleranceBps || 300, referrer: savedReferrer() });
    if (!done) return false;
    const last = done.hashes[done.hashes.length - 1];
    for (let i = 0; i < 90; i++) { const r = await rpc(st.chainId, 'eth_getTransactionReceipt', [last]).catch(() => null); if (r) { if (r.status !== '0x1') throw new Error('The trade reverted'); queueRecord(c,r); return true; } await new Promise(res => setTimeout(res, 1000)); }
    return true;
  }
  async function poolSubmit(c) {
        const { chainId, key, token, quote: qt } = st, router = await extraAddress('feeRouter', chainId);
        const me = connectedAddress(), b = await balances();
        if (spendable(b) < c.a) throw new Error('Not enough ' + payUnit());
        const now = BigInt((await rpc(chainId, 'eth_getBlockByNumber', ['latest', false])).timestamp), deadline = now + 1200n;
        const s = t => { status.textContent = t; };
        const assertContext = () => assertTradeOwner(c);
        assertTradeOwner(c);
        const live = await isLive(chainId, 'feeRouter');
        assertContext();
        if (!live) { s('One-time setup of trading on ' + CHAIN_NAME[chainId] + '…'); await setUp(chainId, 'feeRouter', s, assertContext); }
        // One-click (qx-oneclick.mjs): QHooks markets, ETH/BNB in or token out, no wallet popup. Off or not eligible: wallet signs below.
        const oneClickDone = (c.side === 'sell' || c.pay === 'native' || st.nativePool) && await tryOneClick(c, s);
        if (oneClickDone) { /* sent by one-click */ }
        else if (c.side === 'buy' && st.nativePool) {
          // Native-HYPE pool: HYPE goes straight in (router checks currency0 is native); no wrap.
          assertTradeOwner(c);
          await sendRecorded(c, { to: router, data: feeSwapCall(chainId, [{ key, zeroForOne: BigInt(key.currency0) === 0n }], c.a, c.minOut, null, true, deadline), value: c.a }, s, assertContext);
        } else if (c.side === 'buy' && c.pay === 'native') {
          const { hops, wrap } = nativeHops(chainId, key, qt, c.route);
          assertTradeOwner(c);
          await sendRecorded(c, { to: router, data: feeSwapCall(chainId, hops, c.a, c.minOut, wrap, true, deadline), value: c.a }, s, assertContext);
        } else {
          const tin = c.side === 'buy' ? qt : token;
          await ensureAllowance(chainId, tin, router, c.a, s, assertContext);
          assertTradeOwner(c);
          await sendRecorded(c, { to: router, data: feeSwapCall(chainId, [{ key, zeroForOne: key.currency0 === tin }], c.a, c.minOut, null, c.side === 'buy', deadline) }, s, assertContext);
        }
        const after = await erc20(chainId, token, me).catch(() => null), moved = after ? (after.balance > b.token ? after.balance - b.token : b.token - after.balance) : null;
        status.textContent = moved === null ? 'Trade confirmed. Refresh balances.' : (c.side === 'buy' ? 'Bought ' : 'Sold ') + formatUnits(moved, st.decimals, 4) + ' ' + st.symbol + '.';if (c.side === 'buy' && moved !== null) afterBuy();
        amount.value = ''; thesis.value=''; document.dispatchEvent(new CustomEvent('qhooks:traded')); try { await onTraded({ side: c.side, moved, chainId:c.chainId,token:c.token,owner:c.owner,status: s }); } catch {}
  }

  const payAsset = () => fundingAsset(st.chainId, pay === 'native' ? 'native' : { address: st.quote, decimals: st.quoteDecimals });
  function assertTradeOwner(c) { assertSelection(c); if(st.sol){if(c.owner!==solAddress())throw new Error('Reconnect the Solana wallet that reviewed this trade.');return;} if (c.owner && connectedAddress()?.toLowerCase() !== c.owner.toLowerCase()) throw new Error('Reconnect the wallet that reviewed this trade.'); }
  async function offerFunding(mine) {
    if (!quoteMatches(current) || mine !== qseq) return;
    current.owner = connectedAddress();
    if (st.sol || side !== 'buy' || !current.owner) { funding.clear(); go.disabled = busy || !current.owner || (st.safety?.verdict === 'danger' && !risk.querySelector('input')?.checked); return; }
    try {
      const b = await balances();
      if (mine !== qseq||!quoteMatches(current)) return;
      if (b && spendable(b) >= current.a) { funding.clear(); return; }
      const asset = payAsset(), owner = current.owner, chainId = st.chainId, amountNeeded = current.a;
      await funding.update({ owner, chainId, asset, amountNeeded, balance: b ? spendable(b) : undefined, review: async () => destinationCosts({ owner, chainId, asset, amountNeeded,
        spender: await extraAddress('feeRouter', chainId), setup: await isLive(chainId, 'feeRouter') ? 0 : 1 }) });
    } catch (e) { status.textContent = e.message; go.disabled = true; }
  }
  async function arrivedTrade(c, a) {
    if (connectedAddress()?.toLowerCase() !== c.owner?.toLowerCase()) throw new Error('Reconnect the wallet that funded this trade.');
    if (st.ext) return extSubmit({ ...c, a, minOut: c.minOut * a / c.a });
    const spend = a - a * FEE_BPS / 10000n;
    const route = c.pay === 'native' ? await quoteNative(st.chainId, st.key, st.token, st.quote, spend, st.symbol) : null;
    const got = route ? route.out : await quoteSingle(st.chainId, st.key, st.key.currency0 === st.quote, spend);
    const floor = c.minOut * a / c.a, minOut = got * (10000n - BigInt(c.toleranceBps)) / 10000n;
    return poolSubmit({ ...c, a, got, route, minOut: minOut > floor ? minOut : floor });
  }
  function queueRecord(c,receipt,extra={}) {
    const tx=receipt?.transactionHash||receipt?.signature;
    if(tx)void recordTerminalTrade({chainId:c.chainId,token:c.token,side:c.side,owner:c.owner,thesis:c.thesis||'',tx,...extra}).catch(()=>{});
  }
  async function sendRecorded(c,tx,onStatus,assertContext) {
    const receipt=await send(c.chainId,tx,onStatus,assertContext);queueRecord(c,receipt);return receipt;
  }
  function lock(value) {
    busy = value; funding.setBusy(value);
    tradingSettings.lock(value||!!recovery);
    for (const el of [amount, thesis, paySel, tolSel, balance, sellToCash, ...sideBtns, ...presets.querySelectorAll('button'), ...cash.querySelectorAll('button')]) el.disabled = value||!!recovery;
    for(const el of followup.querySelectorAll('button'))el.disabled=value;
    go.disabled = value||!!recovery;
    renderQuoteFreshness();
  }
  async function submit() {
    if (!current || busy || !st || go.disabled && !recovery) return;
    const c = {...current};
    if(!quoteMatches(c)){go.disabled=true;status.textContent='This token selection changed. Review a fresh quote before trading.';return;}
    if (!st.sol && c.owner && connectedAddress()?.toLowerCase() !== c.owner.toLowerCase()) { refresh(); return; }
    if (c.funding && !recovery && !funding.fresh()) { status.textContent = 'Refresh funding to review the current fees.'; go.disabled = true; return; }
    // Above 15% impact: one extra tap ("Buy anyway"), for every wallet including one-click. That tap also counts as the
    // one-click "Confirm $X" press, so the trade needs exactly one extra tap. Nothing is blocked: minOut stays on chain.
    if (impactGate({ impactPct: c.impactPct, armedAt: impactArmedAt, now: Date.now() }) === 'arm') {
      const copy = confirmCopy(c.side, c.impactPct);
      clearArmed(); impactArmedAt = Date.now(); go.textContent = copy.button; status.textContent = copy.status;
      armTimer = setTimeout(() => { clearArmed(); if (status.textContent === copy.status) status.textContent = ''; }, 15000);
      return;
    }
    if (impactArmedAt) { armedAt = Date.now(); impactArmedAt = null; }
    const plan = st.sol ? null : ticketPlan(c);
    if (!st.sol && !plan) return;
    lock(true);
    try {c.thesis=await prepareTradeThesis({chainId:c.chainId,owner:c.owner,token:c.token,side:c.side,thesis:c.side==='buy'?thesis.value:''});assertTradeOwner(c);}catch(error){status.textContent=error.message;lock(false);return;}
    if (st.sol) { lock(true); return solSubmit(c); }
    lock(true); status.textContent = '';
    const swapArrived = a => { if (plan.silent && !silentActive()) throw new Error('This one-click press expired. Retry the swap from the funds in your wallet.'); return arrivedTrade(c, a); };
    let landed = false, proceeds = null;
    try {
      await withOneClick(plan, async () => {
        if (recovery) { await retryLanded(recovery, { owner: connectedAddress(), swap: swapArrived }); recovery = null; return; }
        if (c.funding) {
          const wallet = await relayWallet();
          try {
            const result = await runCrossChainBuy({ quote: c.funding, wallet, swap: swapArrived,
              onStep: s => { if (s.message) status.textContent = s.message; } });
            if (!result.completed) { recovery = result; landed = true; followup.replaceChildren(recoveryView(h, result, () => submit())); }
          } finally { wallet.dispose(); }
          return;
        }
        const asset = sellCash ? (st.ext ? payAsset() : { address: st.quote, decimals: st.quoteDecimals, symbol: st.quoteSymbol }) : null;
        const before = asset ? await readAssetBalance(c.owner, { chainId: st.chainId, asset }) : 0n;
        await (st.ext ? extSubmit(c) : poolSubmit(c));
        if (asset) { const after = await readAssetBalance(c.owner, { chainId: st.chainId, asset }); if (after > before) proceeds = { chainId: st.chainId, asset, amount: after - before }; }
      });
    } catch (e) { status.textContent = e.message || 'The trade did not go through'; landed = !!recovery; }
    finally { lock(false); if (landed) { go.disabled = true; if (recovery?.retryable === false) for (const el of followup.querySelectorAll('button')) el.disabled = true; } else await layout(); }
    if (xchainEnabled && proceeds && (cashHome() && cashHome() !== Number(proceeds.chainId) || proceeds.asset.symbol !== cashAsset(proceeds.chainId).symbol)) {
      const home = cashHome(), button = h('button', { type: 'button', class: 'qxt-mini' }, home ? 'Move to ' + chainName(home) : 'Move proceeds to cash');
      button.addEventListener('click', () => { void moveProceeds({ ...proceeds, home }).catch(e => { status.textContent = e.message; }); });
      followup.replaceChildren(button);
    }
  }

  document.addEventListener('qhooks:rewards-claimed', () => showCashback().catch(() => cash.replaceChildren()));
  sideBtns.forEach(b => b.addEventListener('click', () => setSide(b.dataset.side)));
  paySel.addEventListener('change', () => { if (busy||recovery) return; clearArmed(); pay = paySel.value; amount.value = '';sellPrefillOwner=null; refresh(); layout(); });
  tolSel.addEventListener('change', () => {if(busy||recovery)return;try{if(!tradingSettings.setTolerance(side,tolSel.value)){syncProfile();status.textContent='Choose Auto or a valid manual tolerance (maximum 50% on Solana, 100% on EVM).';return;}if(tolSel.value!=='auto')store('tol',tolSel.value);}catch(error){syncProfile();status.textContent=error.message;}});
  amount.addEventListener('input', () => { sellPrefillOwner=null;refresh(); });
  amount.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); if (!e.repeat) submit(); } });
  balance.addEventListener('click', async () => { if(busy||recovery||!st)return;const intent=selection,activeState=st,mine=++qseq;clearTimeout(timer);current=null;go.disabled=true;sellPrefillOwner=null;clearArmed();quoteLoading=false;renderQuoteFreshness(); const b = await balances(); if(!isSelection(intent)||st!==activeState||mine!==qseq)return;if (b) { amount.value = formatUnits(spendable(b), payDecimals(), payDecimals()).replace(/,/g, ''); refresh(); } });
  go.addEventListener('click', submit);
  onWalletChange(() => { clearArmed(); if (!busy&&!recovery&&!st?.sol) {if(sellPrefillOwner&&sellPrefillOwner.toLowerCase()!==connectedAddress()?.toLowerCase()){amount.value='';sellPrefillOwner=null;}refresh();layout();} });

  sellToCash.addEventListener('click', async () => {
    if (!st || busy||recovery) return;
    clearArmed(); sellCash = true; side = 'sell'; pay = st.quote ? 'quote' : 'native'; paySel.value = pay;
    await layout(); await preset(3);
    const symbol = st.sol ? 'USDC' : st.quoteSymbol || NATIVE[st.chainId];
    status.textContent = st.sol || !['1', '8453', '42161', '56', '4663'].includes(String(st.chainId)) || symbol === cashAsset(st.chainId).symbol ? 'Sell your whole position for ' + symbol + '.' :
      'This pool sells to ' + symbol + '. Cash conversion is available in Move funds after the sale.';
  });

  function setSide(s) { if (busy||recovery || !['buy','sell'].includes(s) || side === s && !sellCash&&!pendingSellPrefill) return; clearArmed(); sellCash = false; side = s; amount.value = '';sellPrefillOwner=null;pendingSellPrefill=false; refresh(); layout(); }

  return {
    beginSelection,isSelection,failSelection,canSelect:()=>!busy&&!recovery,
    async setPool(pool, meta, intent) {
      if(busy||recovery)return false;
      intent??=beginSelection({kind:'launch',chainId:pool.chainId,controller:pool.controller});
      if(!isSelection(intent)||intent.key!==targetKey({kind:'launch',chainId:pool.chainId,controller:pool.controller}))return false;
      const c = pool.constructor, quoteToken = c.quote, token = c.currency0 === quoteToken ? c.currency1 : c.currency0;
      // Simple launches carry their pool key; Studio launches read it from their controller.
      const [key, t, q] = await Promise.all([pool.kind === 'qhooks-simple-launch' && pool.key ? pool.key : livePoolKey(pool.chainId, pool.controller), erc20(pool.chainId, token), erc20(pool.chainId, quoteToken)]);
      if(!isSelection(intent))return false;
      st = { chainId: String(pool.chainId), key, token, quote: quoteToken, symbol: t.symbol || meta?.symbol || 'token', decimals: t.decimals, quoteSymbol: q.symbol, quoteDecimals: q.decimals };
      const native = nativeRoute(pool.chainId, quoteToken);
      paySel.replaceChildren(h('option', { value: 'quote' }, q.symbol), ...(native ? [h('option', { value: 'native' }, NATIVE[pool.chainId])] : []));
      // Wrapped-native launches default to paying in the coin people actually hold.
      pay = native?.wrap || native?.stock || native?.usdg ? 'native' : 'quote'; paySel.value = pay;
      // QHooks launches: verified creator, copy warning, RepoProof verdict and on-chain facts (qx-trust.mjs).
      renderRisk(); const view=h('div');trustRisk(view,pool).then(()=>{if(isSelection(intent)){risk.replaceChildren(view);risk.hidden=view.hidden;}}).catch(()=>{}); await layout();return isSelection(intent);
    },
    /// Any token, traded through 0x: { chainId, address, symbol, decimals, safety }.
    async setExternal(t,intent) {
      if(busy||recovery)return false;
      intent??=beginSelection({kind:'external',chainId:t.chainId,address:t.address});
      if(!isSelection(intent)||intent.key!==targetKey({kind:'external',chainId:t.chainId,address:t.address}))return false;
      if (t.chainId === 'solana') {
        st = { ext: true, sol: true, chainId: 'solana', token: t.address, symbol: t.symbol || 'token', decimals: Number(t.decimals ?? 6), quote: SOL_USDC, quoteSymbol: 'USDC', quoteDecimals: 6, safety: t.safety || null };
        paySel.replaceChildren(h('option', { value: 'native' }, 'SOL'), h('option', { value: 'quote' }, 'USDC'));
        pay = 'native'; paySel.value = pay;
        renderRisk(); await layout(); return isSelection(intent);
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
        renderRisk(); await layout(); if (st.noRoute) { out.textContent = st.noRoute; go.disabled = true; } return isSelection(intent);
      }
      const [qa, qs, qd] = STABLE[t.chainId] || [null, null, null];
      st = { ext: true, chainId: String(t.chainId), token: t.address, symbol: t.symbol || 'token', decimals: Number(meta.decimals ?? 18), quote: qa, quoteSymbol: qs, quoteDecimals: qd, safety: t.safety || null };
      paySel.replaceChildren(h('option', { value: 'native' }, NATIVE[t.chainId]), ...(qa ? [h('option', { value: 'quote' }, qs)] : []));
      pay = 'native'; paySel.value = pay;
      renderRisk(); await layout();return isSelection(intent);
    },
    setSafety(v,intent=selection) { if (isSelection(intent)&&(st?.ext||st?.direct)) { st.safety = v; renderRisk(); } },
    // The market poll updates this every few seconds; a price tick must not disarm a pending "Confirm $X".
    setPriceUsd(p,intent=selection) { if(!isSelection(intent))return; const v = Number(p); priceUsd = Number.isFinite(v) && v > 0 ? v : null;if(priceUsd){marketPrices.push({price:priceUsd,at:now()});marketPrices=marketPrices.slice(-12);} },
    setSide, preset, submit,
    // Positions actions only prepare a sell. Balance, precision, selection and owner are rechecked;
    // neither a cached portfolio amount nor this percentage is ever sent as a transaction here.
    async prefillSell({percent,owner,chainId,token,controller}={}) {
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
        if(st.sol){const response=await fetch('/api/terminal/sol/balance/'+me+'?mint='+st.token,{cache:'no-store'});if(!response.ok)throw Error('Token balance is unavailable. Refresh holdings and try again.');const body=await response.json();if(!/^\d{1,78}$/.test(body.token||''))throw Error('Token balance is unavailable.');held=BigInt(body.token);precision=body.decimals;}
        else{const body=await erc20(st.chainId,st.token,me);held=body.balance;precision=body.decimals;}
        if(!alive())return false;
        if(typeof held!=='bigint'||held<0n||held>=1n<<256n||!Number.isInteger(precision)||precision<0||precision>36||precision!==st.decimals)throw Error('Token precision is unavailable or changed. Reopen this token before selling.');
        const value=held*BigInt(percent)/100n;
        if(!value)throw Error(held===0n?'This wallet has no available tokens to sell.':'This balance is too small for that percentage.');
        pendingSellPrefill=false;side='sell';sellCash=false;paySel.value=pay;sellPrefillOwner=me;
        amount.value=formatUnits(value,precision,precision).replace(/,/g,'');
        void layout();refresh();status.textContent='Sell '+percent+'% prepared. Review the current quote, fees and minimum received before selling.';
        return true;
      }catch(error){if(alive())status.textContent=error?.message||'Could not read this holding. Refresh and try again.';return false;}
      finally{if(mine===qseq)pendingSellPrefill=false;}
    },
    /// Instant buy from the feed: sets the amount in the given unit class and sends once quoted.
    async quickBuy(cls, value) {
      if (!st || busy||recovery) return;
      const intent=selection;
      clearArmed();clearTimeout(timer);qseq++;current=null;go.disabled=true;sellPrefillOwner=null;
      quoteLoading=false;renderQuoteFreshness();
      side = 'buy'; sellCash = false;
      const native = nativeRoute(st.chainId, st.quote);
      // Any-token tickets with no stable quote (Robinhood Chain) pay in the native coin, their only option.
      // HYPE (Elysium): pay in the coin people hold (native HYPE, wrapped by the router), as the ticket defaults to.
      pay = st.ext && !st.quote ? 'native' : st.nativePool ? 'native' : cls === 'hype' && native?.wrap && unitClass(NATIVE[st.chainId]) === 'hype' ? 'native' : unitClass(st.quoteSymbol) === cls ? 'quote' : native && unitClass(NATIVE[st.chainId]) === cls ? 'native' : 'quote';
      paySel.value = pay; amount.value = value;
      await layout();if(!isSelection(intent))return; clearTimeout(timer); await quote();
      if (isSelection(intent)&&quoteMatches(current)) await submit();
    },
    get unitClass() { return st ? unitClass(pay === 'native' ? NATIVE[st.chainId] : st.quoteSymbol) : null; }
  };
}
export { unitClass };
