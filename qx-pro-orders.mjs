import {readOwnedOrders as myOrders} from './qx-orders-read.mjs';
import {EXECUTOR,PERMIT2,ORDER_FIELDS} from './qx-order-policy.mjs';
export {EXECUTOR,PERMIT2};
import {ensureOrderAllowance,prepareOrderWallet} from './qx-order-approval.mjs';
import {orderApprovalControl} from './qx-order-approval-ui.mjs';
import {readOrderIntent,orderReviewNote} from './qx-order-intent.mjs';
import {asOrderError,orderErrorText} from './qx-order-errors.mjs';
// Limit orders (pro terminal phase C, 2026-11-10). You sign one order; the QHooks keeper fills it when the price is met,
// through QFeeRouter (1% fee, 30% cashback back to you, referral to your referrer). Your tokens stay in your wallet until
// the fill: Permit2 lets the order executor take exactly the signed amount, once, at no worse than your price.
// Opens as /orders?m=<chain>:<controller>, or on 'qhooks:order-open' {chainId, controller} from any page.
import '/qx-confirm-top.mjs'; // Privy confirms stay on top of these sheets
import { connectedAddress, onWalletChange, signTypedData, send, ensureAllowance, calldata, ethCall, parseUnits, formatUnits, erc20, h, rpc } from '/qx-chain.mjs';
import { execute as relayExecute } from '/qx-relay.mjs';
import { encodeBuyFor } from '/qx-pro-xbuy.mjs';
import { createFundingRow, fundingAsset, destinationCosts, runFundedOrder, retryLanded, recoveryView, orderOrigin, offerMoveBack, moveProceeds, cashHome,
  chainName, loadFundingStyle, xchainEnabled } from '/qx-xchain-gate.mjs';
import { relayWallet } from '/qx-relay-wallet.mjs';
import { oneClick,tradePrefs } from './qx-trade-prefs.mjs';
import { oneClickPlan, withOneClick, silentActive } from '/qx-instant-bridge.mjs';
import { getWalletHub } from '/wallet-hub.mjs';
import { authHeaders, signIn, boardSession } from '/qx-board-session.mjs';
import { savedReferrer } from '/qx-swap.mjs';
import { chainById } from '/chains.mjs';
import { triggerFor, poolKeyEncoded, priceFromSqrt } from '/qx-pro-trigger.mjs';
import { keccak_256 } from '/full-launch/prototypes/qpools/client/vendor/hashes/sha3.js';

const ZERO = '0x' + '0'.repeat(40), ZERO32 = '0x' + '0'.repeat(64), SCALE = 10n ** 36n, KEEPER_BPS = 30;

/// The EIP-712 payload the wallet signs: Permit2 PermitWitnessTransferFrom with the order as witness.
export function typedOrder(chainId, o) {
  return {
    domain: { name: 'Permit2', chainId: Number(chainId), verifyingContract: PERMIT2 },
    primaryType: 'PermitWitnessTransferFrom',
    types: {
      EIP712Domain: [{ name: 'name', type: 'string' }, { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' }],
      PermitWitnessTransferFrom: [{ name: 'permitted', type: 'TokenPermissions' }, { name: 'spender', type: 'address' }, { name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint256' }, { name: 'witness', type: 'Order' }],
      TokenPermissions: [{ name: 'token', type: 'address' }, { name: 'amount', type: 'uint256' }],
      Order: ORDER_FIELDS.map(([name, type]) => ({ name, type }))
    },
    message: { permitted: { token: o.tokenIn, amount: o.amountIn }, spender: EXECUTOR, nonce: o.nonce, deadline: o.deadline, witness: o }
  };
}
/// Net minimum out per unit in (×1e36) for a target price `price` (quote per whole token, a decimal string).
/// Buy: spend quote, get ≥ amount / price tokens. Sell: spend tokens, get ≥ amount × price quote.
export function rateFor(side, price, tdec, qdec) {
  const P = parseUnits(price, 18); if (P === 0n) throw new TypeError('Enter a price');
  return side === 'buy' ? SCALE * 10n ** 18n * 10n ** BigInt(tdec) / (P * 10n ** BigInt(qdec)) : SCALE * P * 10n ** BigInt(qdec) / (10n ** 18n * 10n ** BigInt(tdec));
}
const randomNonce = () => { const b = crypto.getRandomValues(new Uint8Array(31)); return BigInt('0x' + Array.from(b, x => x.toString(16).padStart(2, '0')).join('')).toString(); };
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (v == null || v === false) continue; if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v); }
  for (const k of kids.flat()) if (k != null && k !== false) n.append(k.nodeType ? k : String(k));
  return n;
};
const priceText = v => !Number.isFinite(v) ? '—' : v >= 1 ? v.toLocaleString('en-US', { maximumFractionDigits: 4 }) : v <= 0 ? '0' : v.toFixed(Math.min(20, 3 - Math.floor(Math.log10(v)))).replace(/0+$/, '');
const plain = v => { if (!Number.isFinite(v) || v <= 0) return ''; const s = v.toPrecision(6); return s.includes('e') ? v.toFixed(18).replace(/0+$/, '') : String(Number(s)); };
const orderReadNotes={order_amount_required:'Enter an amount greater than zero.',order_amount_format:'Enter a valid amount using the token’s decimal places.',order_price_required:'Enter a limit price or choose a percentage below.',order_price_format:'Enter a valid limit price greater than zero.',order_expiry:'Choose how long the order stays open.',order_balance_refresh:'Your token balance could not refresh. Try again before approving.',order_reservations_refresh:'Your open orders could not refresh. Try again before signing this order.'};
const say = orderErrorText;

// Instant (X2) stays behind a flag until Randall's small live test passes: ?instant=1 or localStorage qhooks:pro:instant=1.
const INSTANT = (() => { try { return new URLSearchParams(location.search).has('instant') || localStorage.getItem('qhooks:pro:instant') === '1'; } catch { return false; } })();
const PAGE_INTENT = typeof location === 'object' ? readOrderIntent(location.search) : null;
let st = null, root = null, statusEl = null, ordersBox = null, goBtn = null;
export async function loadMarket(chainId, controller) {
  const r = await fetch('/api/terminal/market/' + chainId + '/' + controller + '?tf=60', { cache: 'no-store' });
  if (!r.ok) throw Error('That market is refreshing. Try again in a moment.');
  const j = await r.json(), m = j.meta || {}, pool = (m.pools || []).find(p => p.label === 'launch') || (m.pools || [])[0];
  if (!pool?.key || !m.token || !m.quote) throw Error('Orders are not available for this market yet.');
  return { chainId: String(chainId), controller, token: m.token.toLowerCase(), quote: m.quote.toLowerCase(), symbol: m.symbol || 'token', quoteSymbol: m.quoteSymbol || 'quote',
    tdec: Number(m.decimals ?? 18), qdec: Number(m.quoteDecimals ?? 18), key: pool.key, price: Number(j.summary?.price) || null };
}
const orderReadFailure=(code,cause)=>Object.assign(Error(code,{cause}),{code});

async function orderBalance(chainId,token,owner){
  try {
    // Market decimals/symbol are already known. Only money state is needed here;
    // unavailable optional metadata must not prevent the allowance prompt.
    const value=await ethCall(chainId,token,calldata('0x70a08231',['address'],[owner]),undefined,{purpose:'transaction',signal:AbortSignal.timeout(8000)});
    if(!/^0x[0-9a-f]{1,64}$/i.test(value||''))throw Error('Balance is incomplete');
    return BigInt(value);
  }catch(e){throw orderReadFailure('order_balance_refresh',e);}
}
async function post(path, body, method = 'POST') {
  const r = await fetch(path, { method, headers: { 'content-type': 'application/json', ...authHeaders() }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(Error(j.error || 'request_failed'),{status:r.status}); return j;
}

/// What your open orders in `tokenIn` can take at most: each Permit2 nonce once (both legs of a TP/SL pair share one).
export function openAmount(orders, chainId, tokenIn) {
  const byNonce = new Map();
  for (const x of orders) if (x.status === 'open' && x.chainId === chainId && x.order.tokenIn === tokenIn) byNonce.set(x.order.nonce, BigInt(x.order.amountIn) > (byNonce.get(x.order.nonce) ?? 0n) ? BigInt(x.order.amountIn) : byNonce.get(x.order.nonce));
  return [...byNonce.values()].reduce((a, b) => a + b, 0n);
}
const poolIdOf = key => '0x' + Array.from(keccak_256(Uint8Array.from(poolKeyEncoded(key).slice(2).match(/../g).map(x => parseInt(x, 16)))), b => b.toString(16).padStart(2, '0')).join('');
/// The legs of a take-profit / stop bracket (phase D): one sell order per leg, both on ONE Permit2 nonce, so whichever
/// fills first makes the other unfillable on chain (OCO; no double sell). Each leg fills only past its trigger (checked on
/// the pool by the executor) and at no less than its floor. Pure: same math the TP / SL tab has used since phase D.
export function buildBracket({ market: m, owner, amountIn, tp, sl, floorPct, days, ref = '', nonce, nowSec }) {
  if (!(typeof amountIn === 'bigint') || amountIn <= 0n) throw new TypeError('Enter an amount');
  if (!tp && !sl) throw new TypeError('Set a take-profit price, a stop price, or both');
  const now = m.price;
  if (tp && now && Number(tp) <= now) throw new TypeError('Take profit must be above the current price');
  if (sl && now && Number(sl) >= now) throw new TypeError('The stop must be below the current price');
  const mk = { tokenIs0: m.token === m.key.currency0.toLowerCase(), tdec: m.tdec, qdec: m.qdec }, poolId = poolIdOf(m.key);
  const blocksPool = (BigInt(m.key.hooks) & 16383n) === 10956n;
  const hops = [{ key: m.key, zeroForOne: m.token === m.key.currency0.toLowerCase(), hookData: ref && blocksPool ? '0x' + ref.slice(2).padStart(64, '0') : '0x' }];
  const deadline = String(nowSec + days * 86400);
  const legs = [...(tp ? [['take_profit', tp, plain(Number(tp) * 0.97)]] : []), ...(sl ? [['stop', sl, plain(Number(sl) * (1 - floorPct / 100))]] : [])];
  return legs.map(([kind, trigger, floor]) => {
    const t = triggerFor(kind, trigger, mk);
    return { kind, hops, order: { trader: owner, tokenIn: m.token, tokenOut: m.quote, amountIn: amountIn.toString(), minOutPerIn: rateFor('sell', floor, m.tdec, m.qdec).toString(), triggerPool: poolId,
      triggerSqrtPriceX96: t.triggerSqrtPriceX96, triggerBelow: t.triggerBelow, feeOnInput: false, keeperFeeBps: KEEPER_BPS, referrer: ref || ZERO, nonce, deadline } };
  });
}
/// What a new exit may still take: the wallet balance minus what open orders already reserve in that token (each Permit2
/// nonce once). Refuses an exit that would only be fillable by taking tokens another open order is waiting to sell.
export function freeToReserve(balance, orders, chainId, token) { const r = openAmount(orders, chainId, token); return balance > r ? balance - r : 0n; }
const defaultDeps = () => ({ connectedAddress, erc20, myOrders, ensureAllowance:ensureOrderAllowance, signTypedData, post, savedReferrer, randomNonce, nowSec: () => Math.floor(Date.now() / 1000) });
/// Places a bracket for `owner` on `market`. Every wallet step re-checks that the same wallet is still connected (a stale
/// context never signs for another wallet). If the second leg is refused after the first was placed, the first stands alone
/// (it is a complete order) and the error says so.
export async function placeBracket(input,deps){try{if(input.allowOneClick===false||deps&&!getWalletHub(window).snapshot().current)return await placeBracketRequest(input,deps);return await orderPress(input.owner,input.market,'sell',input.amountIn,input.ticketConfirmed,assertPress=>placeBracketRequest({...input,assertContext:()=>{input.assertContext?.();assertPress();}},deps),{ticket:orderTicket({...input,kind:'bracket'}),assert:input.assertContext});}catch(error){throw asOrderError(error);}}
async function placeBracketRequest({ market: m, owner, amountIn, tp, sl, floorPct, days, onStatus = () => {}, assertContext=()=>{} }, deps = {}) {
  const d = { ...defaultDeps(), ...deps },initial=getWalletHub(window).snapshot().current,provider=initial?.owner?.toLowerCase()===owner?initial.entry?.provider:null;
  const same = () => { assertContext(); if (!owner || d.connectedAddress() !== owner || provider&&getWalletHub(window).snapshot().current?.entry?.provider!==provider) throw Error('Reconnect the wallet that started this order.'); };
  same();
  const legs = buildBracket({ market: m, owner, amountIn, tp, sl, floorPct, days, ref: d.savedReferrer() || '', nonce: d.randomNonce(), nowSec: d.nowSec() });
  const bal = deps?.erc20 ? (await d.erc20(m.chainId,m.token,owner)).balance : await orderBalance(m.chainId,m.token,owner), orders = await d.myOrders(owner,{required:true});
  if (bal < amountIn) throw Error('Your wallet has ' + formatUnits(bal, m.tdec) + ' ' + m.symbol + ' on ' + (chainById(m.chainId)?.name || 'this chain') + '.');
  const free = freeToReserve(bal, orders, m.chainId, m.token);
  if (free < amountIn) throw Error('Your open orders already reserve ' + formatUnits(bal - free, m.tdec, 4) + ' ' + m.symbol + '. Withdraw one first, or set this on ' + formatUnits(free, m.tdec, 4) + ' or less.');
  same();
  await d.ensureAllowance(m.chainId, m.token, PERMIT2, openAmount(orders, m.chainId, m.token) + amountIn, onStatus,same);
  const placed = [];
  for (const leg of legs) {
    try {
    same();
    onStatus((silentActive()?'Signing the ':'Sign the ') + (leg.kind === 'stop' ? 'stop' : 'take-profit') + (legs.length > 1 ? ' (' + (placed.length + 1) + ' of 2)' : '') + (silentActive()?'…':' in your wallet. It costs nothing and moves nothing until it fills.'));
      const signature = await d.signTypedData(m.chainId, typedOrder(m.chainId, leg.order));
      same();
      placed.push(await d.post('/api/orders', { chainId: m.chainId, kind: leg.kind, order: leg.order, signature, hops: leg.hops }));
    } catch (e) {
      if (!placed.length) throw e;
      throw Object.assign(Error((placed[0].kind === 'stop' ? 'The stop' : 'The take-profit') + ' is set; the ' + (leg.kind === 'stop' ? 'stop' : 'take-profit') + ' was not (' + say(e) + ').'), { placed });
    }
  }
  return placed;
}
/// The TP / SL tab's submit: a bracket on the open market for the connected wallet.
export async function placeExit({ amount, tp, sl, floorPct, days, ticketConfirmed=false,assertContext=()=>{} }) {
  const me = connectedAddress(); if (!me) throw Error('Connect your wallet first');
  const m = st.market, amountIn = parseUnits(amount, m.tdec); if (amountIn === 0n) throw new TypeError('Enter an amount');
  return placeBracket({ market: m, owner: me, amountIn, tp, sl, floorPct, days, ticketConfirmed, assertContext:()=>{assertContext();if(st?.market!==m||st?.side!=='tpsl')throw Error('Your order ticket changed. Review it again.');}, onStatus: s => { statusEl.textContent = s; } });
}

function limitDraft({side,amount,price,days},m){
  const fail=code=>{throw Object.assign(Error(code),{code});};
  if(!['buy','sell'].includes(side))fail('order_amount_format');
  if(!String(amount??'').trim())fail('order_amount_required');
  const inDec=side==='buy'?m.qdec:m.tdec;let amountIn,rate;
  try{amountIn=parseUnits(amount,inDec);}catch{fail('order_amount_format');}
  if(amountIn<=0n)fail('order_amount_required');
  if(!String(price??'').trim())fail('order_price_required');
  try{rate=rateFor(side,price,m.tdec,m.qdec).toString();}catch{fail('order_price_format');}
  if(!Number.isInteger(days)||days<1||days>30)fail('order_expiry');
  return {amountIn,rate};
}
/// Places a limit order. With `funding` (a Relay quote from the funding row), the pay asset is first delivered to your own
/// wallet on this chain (pro terminal X1: bridge at placement), then the order is signed for exactly what arrived.
export async function placeOrder(input,options){try{const market=options?.market||st?.market,amount=market?limitDraft(input,market).amountIn:0n;return await orderPress(connectedAddress(),market,input.side,amount,options?.ticketConfirmed,assertPress=>placeOrderRequest(input,{...options,assertContext:()=>{options?.assertContext?.();assertPress();}}),{ticket:orderTicket(input),assert:options?.assertContext});}catch(error){throw asOrderError(error);}}
async function placeOrderRequest({ side, amount, price, days, funding = null }, { market = st?.market, onStatus = s => { statusEl.textContent = s; }, assertContext=()=>{} } = {}) {
  const me = connectedAddress(); if (!me) throw Error('Connect your wallet first');
  const hub=getWalletHub(window),start=hub.snapshot().current,provider=start?.owner?.toLowerCase()===me?start.entry?.provider:null;
  const assertOwner=()=>{assertContext();const current=hub.snapshot().current;if(connectedAddress()!==me||provider&&current?.entry?.provider!==provider)throw Error('Your wallet changed. Review this order again.');};
  if(!market)throw Error('The order market is refreshing. Reopen this token and try again.');
  const m = market, tokenIn = side === 'buy' ? m.quote : m.token, tokenOut = side === 'buy' ? m.token : m.quote, inDec = side === 'buy' ? m.qdec : m.tdec;
  const draft=limitDraft({side,amount,price,days},m),rate=draft.rate; // explicit inputs, same rate math before any wallet request
  const ref = savedReferrer(), blocksPool = (BigInt(m.key.hooks) & 16383n) === 10956n;
  const hops = [{ key: m.key, zeroForOne: tokenIn === m.key.currency0.toLowerCase(), hookData: ref && blocksPool ? '0x' + ref.slice(2).padStart(64, '0') : '0x' }];
  const deadline = String(Math.floor(Date.now() / 1000) + days * 86400);
  const submit = async amountIn => {
    assertOwner();
    const o = { trader: me, tokenIn, tokenOut, amountIn: amountIn.toString(), minOutPerIn: rate, triggerPool: ZERO32, triggerSqrtPriceX96: '0',
      triggerBelow: false, feeOnInput: side === 'buy', keeperFeeBps: KEEPER_BPS, referrer: ref || ZERO, nonce: randomNonce(), deadline };
    // Bounded mode reserves this order plus current open orders. Once mode requires the explicit token enable.
    onStatus('Checking your open orders…');
    const open = openAmount(await myOrders(me,{required:true}), m.chainId, tokenIn); assertOwner();
    await ensureOrderAllowance(m.chainId, tokenIn, PERMIT2, open + amountIn, onStatus,assertOwner);
    assertOwner();
    onStatus(silentActive()?'Signing order…':'Sign the order in your wallet. It costs nothing and moves nothing until it fills.');
    const signature = await signTypedData(m.chainId, typedOrder(m.chainId, o));
    assertOwner();
    onStatus('Checking the order…');
    return post('/api/orders', { chainId: m.chainId, order: o, signature, hops });
  };
  if (side === 'buy' && funding?.quote) {
    if (!funding.fresh()) throw Error('Refresh funding to review the current moving cost.');
    const q = funding.quote, wallet = await relayWallet();
    let res;
    try { res = await runFundedOrder({ quote: q, wallet, setup: async () => {}, place: async arrived => { const r = await submit(arrived); orderOrigin(me, m.chainId, r.hash, q.funding.from); return r; },
      onStep: e => { if (e.message) statusEl.textContent = say(e); } }); }
    finally { wallet.dispose?.(); }
    if (!res.completed) { st.recovery = { result: res, submit, origin: q.funding.from }; throw Object.assign(Error(res.error?.message || 'Your funds arrived, but the order was not placed yet.'), { recovery: true }); }
    return res.result;
  }
  const amountIn = draft.amountIn;
  if(provider&&String(start.chainId)!==String(m.chainId)&&typeof hub.switchChain==='function'){
    onStatus('Switching your wallet to '+(chainById(m.chainId)?.name||'the order network')+'…');
    await hub.switchChain(String(m.chainId));assertOwner();
  }
  onStatus('Checking your '+(side==='buy'?m.quoteSymbol:m.symbol)+' balance on '+(chainById(m.chainId)?.name||'this chain')+'…');
  const bal = await orderBalance(m.chainId,tokenIn,me); assertOwner();
  if (bal < amountIn) throw Error('Your wallet has ' + formatUnits(bal, inDec) + ' ' + (side === 'buy' ? m.quoteSymbol : m.symbol) + ' on ' + (chainById(m.chainId)?.name || 'this chain') + '.' + (side === 'buy' && xchainEnabled ? ' Fund it from another chain above.' : ' Orders take only what you hold when they fill.'));
  return submit(amountIn);
}

function render() {
  if (!root || !st) return;
  st.approval?.dispose();st.approval=null;st.disarmOrderReview=null;
  const m = st.market, me = connectedAddress();
  if (!m) { root.replaceChildren(el('p', { class: 'qpo-note' }, st.error || 'Pick a token to set a limit.')); return; }
  const side = st.side;
  const head = el('div', { class: 'qpo-head' }, el('h2', {}, m.symbol, el('small', {}, ' on ' + (chainById(m.chainId)?.name || m.chainId))), el('p', { class: 'qpo-price' }, 'Now ' + priceText(m.price) + ' ' + m.quoteSymbol));
  const header = [head], review = orderReviewNote(PAGE_INTENT,m,side);
  if (review) header.push(el('p', {class:'qpo-note qpo-review-budget'},review));
  const tabs = el('div', { class: 'qpo-tabs', role: 'tablist' }, ...[['buy', 'Limit buy'], ['sell', 'Limit sell'], ['tpsl', 'TP / SL'], ...(INSTANT && xchainEnabled ? [['instant', 'Instant']] : [])].map(([k, l]) => el('button', { type: 'button', role: 'tab', class: 'qpo-tab', 'aria-selected': String(side === k), onclick: () => { st.side = k; st.price = ''; render(); } }, l)));
  if (side === 'tpsl') { ordersBox = ordersView(); root.replaceChildren(...header, exitForm(m, tabs), ordersBox); return; }
  if (side === 'instant') { ordersBox = ordersView(); root.replaceChildren(...header, instantForm(m, tabs), ordersBox); return; }
  const amount = el('input', { class: 'qpo-in', inputmode: 'decimal', autocomplete: 'off', placeholder: '0.0', required:true, 'aria-label': side === 'buy' ? 'Spend (' + m.quoteSymbol + ')' : 'Sell (' + m.symbol + ')', value: st.amount || '' });
  const price = el('input', { class: 'qpo-in', inputmode: 'decimal', autocomplete: 'off', placeholder: 'Enter limit price', required:true, 'aria-label': 'Price (' + m.quoteSymbol + ' per ' + m.symbol + ')', value: st.price || '' });
  const chips = el('div', { class: 'qpo-chips' }, ...(side === 'buy' ? [-10, -25, -50] : [25, 100, 300]).map(p => el('button', { type: 'button', class: 'qpo-chip', onclick: () => { if (m.price) { st.price = plain(m.price * (1 + p / 100)); price.value = st.price; preview(); } } }, (p > 0 ? '+' : '') + p + '%')));
  const days = el('select', { class: 'qpo-in', 'aria-label': 'Open for' }, ...[[1, '1 day'], [7, '7 days'], [30, '30 days']].map(([d, l]) => el('option', { value: String(d), selected: st.days === d }, l)));
  const out = el('p', { class: 'qpo-out', 'aria-live': 'polite' }), small = el('p', { class: 'qpo-small', 'aria-live': 'polite' });
  let smallTimer = null;
  const preview = () => {
    armedReview=null;if(go)go.textContent=goLabel();
    st.amount = amount.value; st.price = price.value; st.days = Number(days.value);
    if(['order_amount_required','order_amount_format','order_price_required','order_price_format','order_expiry'].some(k=>statusEl.textContent===orderReadNotes[k])){try{limitDraft({side,amount:amount.value,price:price.value,days:Number(days.value)},m);statusEl.textContent='';}catch{}}
    clearTimeout(smallTimer); smallTimer = setTimeout(() => { const a = Number(amount.value), p = Number(price.value); void smallNote(small, m, side === 'buy' ? a : a * (p || m.price || 0), false); }, 300);
    try { const a = Number(amount.value), p = Number(price.value); if (!(a > 0 && p > 0)) { out.textContent = ''; return; }
      out.textContent = side === 'buy' ? 'Fills when you get at least ' + priceText(a / p) + ' ' + m.symbol + ' for ' + a + ' ' + m.quoteSymbol + ', after fees.' : 'Fills when you get at least ' + priceText(a * p) + ' ' + m.quoteSymbol + ' for ' + a + ' ' + m.symbol + ', after fees.';
    } catch { out.textContent = ''; }
  };
  amount.addEventListener('input', preview); price.addEventListener('input', preview); days.addEventListener('change', preview);
  amount.addEventListener('invalid',()=>{statusEl.textContent=orderReadNotes.order_amount_required;});
  price.addEventListener('invalid',()=>{statusEl.textContent=orderReadNotes.order_price_required;});
  const go = goBtn = el('button', { type: 'submit', class: 'qpo-btn qpo-primary' }, goLabel());
  // X1: fund a buy from another chain when this chain's balance is short (Relay to your own wallet here, then the order).
  let armedReview=null,placing=false;st.disarmOrderReview=()=>{armedReview=null;go.textContent=goLabel();};
  const hub = getWalletHub(window), usdOf = q => Number(q?.details?.currencyIn?.amountUsd) || null;
  const planFor = q => { const who = connectedAddress(), c = hub.snapshot().current; return oneClickPlan(who, c?.owner?.toLowerCase() === who ? c.entry : null, usdOf(q)); };
  // Built even before a wallet connects (phones connect after opening the sheet); the owner is read when it is used.
  const funding = side === 'buy' && xchainEnabled ? createFundingRow({ h, action: 'order', getPlan: planFor, onChange: ({ ready }) => { go.disabled = placing||!ready||!st.approval?.ready; } }) : null;
  st.funding = funding;
  if (funding) loadFundingStyle();
  let fundingTimer = null, fundingRev = 0;
  const refreshFunding = async () => {
    const mine = ++fundingRev, owner = connectedAddress(); if (!funding) return; funding.clear(); go.disabled = placing||!st.approval?.ready; if (!owner) return;
    let amt; try { amt = parseUnits(amount.value, m.qdec); } catch { return; } if (!(amt > 0n)) return;
    try {
      const asset = fundingAsset(m.chainId, { address: m.quote, decimals: m.qdec }), balance = (await erc20(m.chainId, m.quote, owner)).balance;
      if (mine !== fundingRev || balance >= amt) return;
      go.disabled = true;
      await funding.update({ owner, chainId: Number(m.chainId), asset, amountNeeded: amt, balance,
        review: () => destinationCosts({ owner, chainId: Number(m.chainId), asset, amountNeeded: amt, spender: PERMIT2, gasUnits: 150000n }) });
    } catch (e) { if (mine === fundingRev) statusEl.textContent = say(e); }
  };
  if (funding) amount.addEventListener('input', () => { clearTimeout(fundingTimer); fundingTimer = setTimeout(refreshFunding, 350); });
  st.refreshFunding = funding ? refreshFunding : null;
  const approval=st.approval=orderApprovalControl({chainId:m.chainId,token:side==='buy'?m.quote:m.token,symbol:side==='buy'?m.quoteSymbol:m.symbol,onStatus:t=>statusEl.textContent=t,onChange:state=>{st.disarmOrderReview?.();go.disabled=placing||!state.ready||(funding?.required&&!funding?.quote);}});
  const form = el('form', { class: 'qpo-form' }, tabs,
    el('label', {}, el('span', {}, side === 'buy' ? 'Spend' : 'Sell'), el('div', { class: 'qpo-row' }, amount, el('b', {}, side === 'buy' ? m.quoteSymbol : m.symbol))),
    el('label', {}, el('span', {}, 'At price'), el('div', { class: 'qpo-row' }, price, el('b', {}, m.quoteSymbol))), chips,
    el('label', {}, el('span', {}, 'Open for'), days), out, small, funding?.element, approval.element, go, el('div', { class: 'qpo-recovery' }),
    el('p', { class: 'qpo-note' }, 'Your tokens stay in your wallet until the order fills. Fills go through QHooks with the 1% fee: 30% of it comes back to you as cashback. The keeper that fills it earns up to 0.3%.'));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!connectedAddress()) { document.querySelector('[data-qa-connect],.qhc-open,#qhc-trigger')?.click(); return; }
    if(placing)return;placing=true;go.disabled = true; funding?.setBusy(true);for(const field of form.querySelectorAll('input,select,button'))field.disabled=true;
    try { const who=connectedAddress(),amountIn=parseUnits(amount.value,side==='buy'?m.qdec:m.tdec),input={side,amount:amount.value,price:price.value,days:Number(days.value),funding},value=Math.max(usdOf(funding?.quote)||0,await orderValue(m,side,amountIn)||0)||null,review=orderReview(who,m,side,amountIn,value,orderTicket(input)),plan=oneClickPlan(who,hub.snapshot().current?.entry,value);if(plan.ticketConfirm&&!orderReviewAdmitted(armedReview,review)){armedReview=review;go.textContent=value?'Confirm $'+value.toFixed(2):'Confirm order';return;}const confirmed=armedReview;armedReview=null;const r=await placeOrder(input,{market:m,ticketConfirmed:confirmed,assertContext:()=>assertOrderForm(form,m,side)});
      statusEl.textContent = r.dryRun === 'ready' ? 'Order placed. The price is already there: it fills within a minute or two.' : 'Order placed. It fills when the price gets there.';
      st.amount = ''; st.price = ''; await refreshOrders(); render();
    } catch (err) {
      statusEl.textContent = say(err);
      if (err?.recovery && st.recovery) {
        const rec = st.recovery, box = form.querySelector('.qpo-recovery');
        box.replaceChildren(recoveryView(h, rec.result, async () => {
          try { const r = await retryLanded(rec.result, { owner: connectedAddress(), swap: async a => { const x = await rec.submit(a); orderOrigin(connectedAddress(), m.chainId, x.hash, rec.origin); return x; } });
            st.recovery = null; box.replaceChildren(); statusEl.textContent = 'Order placed.'; await refreshOrders(); render(); }
          catch (e2) { statusEl.textContent = say(e2); }
        }));
      }
    } finally { placing=false;for(const field of form.querySelectorAll('input,select,button'))field.disabled=false;go.disabled = !approval.ready; funding?.setBusy(false); }
  });
  ordersBox = ordersView();
  root.replaceChildren(...header, form, ordersBox);
  preview();
}

const goLabel = () => !connectedAddress() ? 'Connect wallet' : st?.side === 'tpsl' ? 'Set TP / SL' : st?.side === 'sell' ? 'Place limit sell' : 'Place limit buy';
/// A wallet change refreshes the order list and the button only, never the form being typed into.
async function onWallet() {
  if (!st) return; st.disarmOrderReview?.(); await refreshOrders();
  if (!st.market || !ordersBox?.isConnected) { render(); return; }
  const next = ordersView(); ordersBox.replaceWith(next); ordersBox = next; if (goBtn) goBtn.textContent = goLabel();
  st.refreshFunding?.();
}
function exitForm(m, tabs) {
  const amount = el('input', { class: 'qpo-in', inputmode: 'decimal', autocomplete: 'off', placeholder: '0.0', 'aria-label': 'Sell (' + m.symbol + ')', value: st.exitAmount || '' });
  const max = el('button', { type: 'button', class: 'qpo-chip' }, 'Max');
  max.addEventListener('click', async () => { const me = connectedAddress(); if (!me) return; try { const b = (await erc20(m.chainId, m.token, me)).balance; amount.value = formatUnits(b, m.tdec, m.tdec).replace(/,/g, ''); preview(); } catch {} });
  const tp = el('input', { class: 'qpo-in', inputmode: 'decimal', autocomplete: 'off', placeholder: 'Optional', 'aria-label': 'Take profit (' + m.quoteSymbol + ' per ' + m.symbol + ')', value: st.tp || '' });
  const sl = el('input', { class: 'qpo-in', inputmode: 'decimal', autocomplete: 'off', placeholder: 'Optional', 'aria-label': 'Stop (' + m.quoteSymbol + ' per ' + m.symbol + ')', value: st.sl || '' });
  const chipRow = (input, list) => el('div', { class: 'qpo-chips' }, ...list.map(p => el('button', { type: 'button', class: 'qpo-chip', onclick: () => { if (m.price) { input.value = plain(m.price * (1 + p / 100)); preview(); } } }, (p > 0 ? '+' : '') + p + '%')));
  const floor = el('select', { class: 'qpo-in', 'aria-label': 'Stop sells at no less than' }, ...[[5, '5% under the stop'], [10, '10% under the stop'], [20, '20% under the stop']].map(([v, l]) => el('option', { value: String(v), selected: (st.floorPct || 10) === v }, l)));
  const days = el('select', { class: 'qpo-in', 'aria-label': 'Open for' }, ...[[1, '1 day'], [7, '7 days'], [30, '30 days']].map(([d, l]) => el('option', { value: String(d), selected: (st.days || 7) === d }, l)));
  const out = el('p', { class: 'qpo-out', 'aria-live': 'polite' }), small = el('p', { class: 'qpo-small', 'aria-live': 'polite' });
  let smallTimer = null;
  const preview = () => {
    armedReview=null;if(go)go.textContent=goLabel();
    clearTimeout(smallTimer); smallTimer = setTimeout(() => { const a = Number(amount.value), x = Number(sl.value), t = Number(tp.value); void smallNote(small, m, a * (x || t || m.price || 0), x > 0); }, 300);
    st.exitAmount = amount.value; st.tp = tp.value; st.sl = sl.value; st.floorPct = Number(floor.value); st.days = Number(days.value);
    const a = Number(amount.value), t = Number(tp.value), x = Number(sl.value);
    if (!(a > 0) || !(t > 0 || x > 0)) { out.textContent = ''; return; }
    const parts = [t > 0 ? 'rises to ' + priceText(t) + ' ' + m.quoteSymbol : null, x > 0 ? 'falls to ' + priceText(x) + ' ' + m.quoteSymbol : null].filter(Boolean);
    out.textContent = 'Sells ' + a + ' ' + m.symbol + ' if the price ' + parts.join(' or ') + '.' + (t > 0 && x > 0 ? ' Whichever happens first cancels the other.' : '') + (x > 0 ? ' The stop sells for no less than ' + priceText(x * (1 - Number(floor.value) / 100)) + ' ' + m.quoteSymbol + ' each.' : '');
  };
  for (const i of [amount, tp, sl]) i.addEventListener('input', preview);
  floor.addEventListener('change', preview); days.addEventListener('change', preview);
  const go = goBtn = el('button', { type: 'submit', class: 'qpo-btn qpo-primary' }, goLabel());
  let armedReview=null,placing=false;st.disarmOrderReview=()=>{armedReview=null;go.textContent=goLabel();};const approval=st.approval=orderApprovalControl({chainId:m.chainId,token:m.token,symbol:m.symbol,onStatus:t=>statusEl.textContent=t,onChange:state=>{st.disarmOrderReview?.();go.disabled=placing||!state.ready;}});
  const form = el('form', { class: 'qpo-form' }, tabs,
    el('label', {}, el('span', {}, 'Sell'), el('div', { class: 'qpo-row' }, amount, el('b', {}, m.symbol))), el('div', { class: 'qpo-chips' }, max),
    el('label', {}, el('span', {}, 'Take profit at'), el('div', { class: 'qpo-row' }, tp, el('b', {}, m.quoteSymbol))), chipRow(tp, [25, 50, 100]),
    el('label', {}, el('span', {}, 'Stop at'), el('div', { class: 'qpo-row' }, sl, el('b', {}, m.quoteSymbol))), chipRow(sl, [-10, -20, -30]),
    el('label', {}, el('span', {}, 'Stop sells at no less than'), floor),
    el('label', {}, el('span', {}, 'Open for'), days), out, small, approval.element, go,
    el('p', { class: 'qpo-note' }, 'Your tokens stay in your wallet until a leg fills. Each leg goes through QHooks with the 1% fee: 30% of it comes back to you as cashback. The keeper that fills it earns up to 0.3%.'));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!connectedAddress()) { document.querySelector('[data-qa-connect],.qhc-open,#qhc-trigger,#qxt-connect')?.click(); return; }
    if(placing)return;placing=true;go.disabled = true;for(const field of form.querySelectorAll('input,select,button'))field.disabled=true;
    try {
      const who=connectedAddress(),amountIn=parseUnits(amount.value,m.tdec),input={amount:amount.value,tp:tp.value.trim(),sl:sl.value.trim(),floorPct:Number(floor.value),days:Number(days.value)},value=await orderValue(m,'sell',amountIn),review=orderReview(who,m,'sell',amountIn,value,orderTicket({...input,kind:'bracket',amountIn})),plan=oneClickPlan(who,getWalletHub(window).snapshot().current?.entry,value);if(plan.ticketConfirm&&!orderReviewAdmitted(armedReview,review)){armedReview=review;go.textContent=value?'Confirm $'+value.toFixed(2):'Confirm TP / SL';return;}const confirmed=armedReview;armedReview=null;
      const placed = await placeExit({...input,ticketConfirmed:confirmed,assertContext:()=>assertOrderForm(form,m,'tpsl')});
      statusEl.textContent = placed.length > 1 ? 'Take profit and stop set. Whichever fills first cancels the other.' : 'Set. It sells when the price gets there.';
      st.exitAmount = ''; st.tp = ''; st.sl = ''; await refreshOrders(); render();
    } catch (err) { statusEl.textContent = say(err); } finally { placing=false;for(const field of form.querySelectorAll('input,select,button'))field.disabled=false;go.disabled = !approval.ready; }
  });
  preview();
  return form;
}


// ---- Small orders (main thread, 2026-11-10): the keeper fills only when its fee (≤ 0.3%) covers gas. The minimum is worked
// out from live gas on the order's chain, never a fixed table: ~0.9M gas × (2 × base fee + tip) × 1.1 ÷ 0.3%, in dollars.
const NATIVE_OF = { ETH: 'ETH', WETH: 'ETH', BNB: 'BNB', WBNB: 'BNB', HYPE: 'HYPE', WHYPE: 'HYPE' };
let pricesAt = 0, prices = null;
async function nativeUsd(symbol) {
  if (/^(USDC|USDG|USDT)$/.test(symbol)) return 1;
  const n = NATIVE_OF[symbol]; if (!n) return null;
  if (!prices || Date.now() - pricesAt > 60000) { try { const r = await fetch('/api/funding/native-prices?symbols=ETH,BNB,HYPE', { cache: 'no-store' }); prices = r.ok ? (await r.json()).prices || {} : {}; pricesAt = Date.now(); } catch { prices = {}; } }
  return Number(prices[n]) || null;
}
export async function orderValue(m,side,amount){if(!m||amount<=0n)return null;const dec=side==='buy'?m.qdec:m.tdec,quote=Number(amount)/10**dec*(side==='buy'?1:Number(m.price)||0),usd=await nativeUsd(m.quoteSymbol);return quote>0&&usd>0?quote*usd:null;}
const REVIEW=Symbol('order-ticket-review');
const reviewError=()=>Object.assign(Error('This order changed. Review it again in the ticket.'),{code:'order_ticket_confirm'});
export function orderTicket(input){return JSON.stringify(input.kind==='bracket'?['bracket',String(input.amountIn),String(input.tp||'').trim(),String(input.sl||'').trim(),Number(input.floorPct),Number(input.days)]:['limit',input.side,String(input.amount),String(input.price),Number(input.days),String(input.funding?.quote?.requestId||input.funding?.quote?.id||'')]);}
const marketReviewKey=m=>JSON.stringify([String(m.chainId),m.controller,m.token,m.quote,m.tdec,m.qdec,m.price,m.key,NATIVE_OF[m.quoteSymbol]?Number(prices?.[NATIVE_OF[m.quoteSymbol]])||null:/^(USDC|USDG|USDT)$/.test(m.quoteSymbol)?1:null]);
export function orderReview(owner,market,side,amount,value,ticket=''){
 const current=getWalletHub(window).snapshot().current,pref=tradePrefs(owner);
 return Object.freeze({[REVIEW]:true,at:Date.now(),owner,provider:current?.entry?.provider,chain:String(current?.chainId),rdns:current?.entry?.rdns,uuid:current?.entry?.uuid,market,marketKey:marketReviewKey(market),side,amount:String(amount),ticket,value:Number.isFinite(value)&&value>0?value:null,mode:pref.mode,cap:pref.capUsd,approval:pref.orderApproval});
}
function sameOrderReview(a,b,prepared=false){return !!a?.[REVIEW]&&!!b?.[REVIEW]&&a.owner===b.owner&&a.rdns===b.rdns&&a.uuid===b.uuid&&(prepared||a.provider===b.provider&&a.chain===b.chain)&&a.market===b.market&&a.marketKey===b.marketKey&&a.side===b.side&&a.amount===b.amount&&a.ticket===b.ticket&&a.mode===b.mode&&a.cap===b.cap&&a.approval===b.approval;}
export function orderReviewAdmitted(review,current,{prepared=false,now=Date.now()}={}){return sameOrderReview(review,current,prepared)&&Number.isFinite(review.at)&&now>=review.at&&now-review.at<15000&&(review.value===null?current.value===null:current.value!==null&&current.value<=review.value);}
function assertOrderForm(form,m,side){const dialog=form.closest?.('dialog');if(st?.market!==m||st?.side!==side||form.isConnected===false||dialog&&!dialog.open)throw reviewError();}
export async function orderPress(owner,m,side,amount,ticketConfirmed,fn,{ticket='',assert=()=>{}}={}){
 assert();const hub=getWalletHub(window),start=hub.snapshot().current;
 const initialValue=await orderValue(m,side,amount);assert();const initial=orderReview(owner,m,side,amount,initialValue,ticket);
 if(start?.owner?.toLowerCase()!==owner||start?.entry?.provider!==initial.provider)throw reviewError();
 const plan=oneClickPlan(owner,start.entry,initialValue),inherited=ticketConfirmed===true&&silentActive();
 if(ticketConfirmed&&ticketConfirmed!==true&&!orderReviewAdmitted(ticketConfirmed,initial)||plan.ticketConfirm&&!inherited&&!orderReviewAdmitted(ticketConfirmed,initial))throw reviewError();
 const switched=String(start.chainId)!==String(m.chainId),ready=await prepareOrderWallet(owner,m.chainId,()=>{},assert);assert();
 const readyProvider=ready?.entry?.provider,finalValue=await orderValue(m,side,amount);assert();const final=orderReview(owner,m,side,amount,finalValue,ticket),activePlan=oneClickPlan(owner,hub.snapshot().current?.entry,finalValue);
 if(final.provider!==readyProvider||final.chain!==String(m.chainId)||hub.snapshot().current?.owner?.toLowerCase()!==owner||!sameOrderReview(initial,final,switched))throw reviewError();
 if(activePlan.ticketConfirm&&!inherited&&!orderReviewAdmitted(ticketConfirmed,final,{prepared:switched}))throw reviewError();
 return withOneClick(activePlan,()=>fn(()=>{assert();const current=orderReview(owner,m,side,amount,finalValue,ticket);if(hub.snapshot().current?.owner?.toLowerCase()!==owner||!sameOrderReview(final,current)||activePlan.silent&&(!silentActive()||!oneClick(owner,hub.snapshot().current?.entry)))throw reviewError();}));
}

const minCache = new Map();
let gasHelpCache=null;
async function availableGasHelp(chainId){if(String(chainId)!=='4663')return null;if(gasHelpCache&&Date.now()-gasHelpCache.at<15000)return gasHelpCache.value;let value=null;try{const r=await fetch('/api/orders/keeper',{cache:'no-store'});const help=r.ok?(await r.json()).gasHelp:null;if(help?.enabled&&/^[0-9]+$/.test(help.perFillWei)&&/^[0-9]+$/.test(help.availableWei))value=help;}catch{}gasHelpCache={at:Date.now(),value};return value;}
export async function keeperMinimumUsd(chainId) {
  const hit = minCache.get(chainId); if (hit && Date.now() - hit.at < 60000) return hit.usd;
  const c = chainById(chainId), usdPerNative = await nativeUsd(c?.native === 'BNB' ? 'BNB' : c?.native === 'HYPE' ? 'HYPE' : 'ETH');
  let usd = null;
  try {
    const [block, tip] = await Promise.all([rpc(chainId, 'eth_getBlockByNumber', ['latest', false]), rpc(chainId, 'eth_maxPriorityFeePerGas', []).catch(() => '0x0')]);
    const maxFee = 2n * BigInt(block?.baseFeePerGas || '0x0') + BigInt(tip || '0x0'), costWei = 900000n * maxFee * 11n / 10n;
    // The keeper helps with gas on these chains (server/order-keeper.mjs GAS_HELP): no minimum while one fill costs less than that help.
    const help=await availableGasHelp(chainId);
    if (help && costWei <= BigInt(help.perFillWei) && costWei <= BigInt(help.availableWei)) usd = 0;
    else if (usdPerNative) usd = Number(costWei) / 1e18 / 0.003 * usdPerNative;
  } catch {}
  minCache.set(chainId, { at: Date.now(), usd }); return usd;
}
/// Fills `node` with the plain small-order warning when the order's dollar value is under this chain's keeper minimum.
async function smallNote(node, m, valueInQuote, stop) {
  node.textContent = ''; if (!(valueInQuote > 0)) return;
  const [min, q] = await Promise.all([keeperMinimumUsd(m.chainId), nativeUsd(m.quoteSymbol)]);
  if (!min || !q || valueInQuote * q >= min) return;
  const n = min >= 10 ? Math.ceil(min) : Math.ceil(min * 10) / 10;
  node.textContent = stop ? 'Small stop: below about $' + n + ' on this chain, the keeper may not fill it in time.'
    : 'Small order: below about $' + n + ' on this chain, the fill fee may not cover gas, so it can wait.';
}


// ---- Instant (X2): pay on another chain, buy here in one signature. Relay delivers the native coin and calls QXReceiver,
// which buys through QFeeRouter for you (1% fee, 30% cashback) or reverts so Relay refunds you on the chain you paid from.
const ORIGINS = [8453, 42161, 56, 4663, 99901, 1];
function instantForm(m, tabs) {
  const c = chainById(m.chainId), wrapped = String(c?.wrappedNative || '').toLowerCase(), nativeIn = m.key.currency0 === '0x' + '0'.repeat(40) && m.quote === '0x' + '0'.repeat(40);
  const usable = nativeIn || m.quote === wrapped;
  const box = el('form', { class: 'qpo-form' }, tabs);
  if (!usable) { box.append(el('p', { class: 'qpo-note' }, 'Instant buys need a market quoted in ' + (c?.native || 'the native coin') + '. This one is quoted in ' + m.quoteSymbol + '.')); return box; }
  const from = el('select', { class: 'qpo-in', 'aria-label': 'Pay from' }, ...ORIGINS.filter(id => String(id) !== m.chainId).map(id => el('option', { value: String(id) }, (chainById(id)?.native || '') + ' on ' + (chainById(id)?.name || id))));
  const amount = el('input', { class: 'qpo-in', inputmode: 'decimal', autocomplete: 'off', placeholder: '0.0', 'aria-label': 'Buy with (' + c.native + ' arriving on ' + c.name + ')' });
  const out = el('p', { class: 'qpo-out', 'aria-live': 'polite' }), go = el('button', { type: 'submit', class: 'qpo-btn qpo-primary', disabled: true }, 'Get a quote');
  let quote = null, plan = null, rev = 0;
  const reset = () => { quote = null; plan = null; go.textContent = 'Get a quote'; go.disabled = !(Number(amount.value) > 0); out.textContent = ''; };
  amount.addEventListener('input', reset); from.addEventListener('change', reset);
  box.append(el('label', {}, el('span', {}, 'Pay from'), from), el('label', {}, el('span', {}, 'Buy with'), el('div', { class: 'qpo-row' }, amount, el('b', {}, c.native))), out, go,
    el('p', { class: 'qpo-note' }, 'One signature on the chain you pay from. The buy goes through QHooks with the 1% fee: 30% of it comes back to you as cashback. If the price moves too far before it arrives, nothing is bought and Relay refunds you there.'));
  box.addEventListener('submit', async e => {
    e.preventDefault();
    const me = connectedAddress(); if (!me) { document.querySelector('[data-qa-connect],.qhc-open,#qhc-trigger,#qxt-connect')?.click(); return; }
    go.disabled = true; const mine = ++rev;
    try {
      if (!quote) {
        const value = parseUnits(amount.value, 18); if (!(value > 0n)) throw new TypeError('Enter an amount');
        // At least 95% of what the current price gives after the 1% fee: a bigger move reverts and is refunded.
        const expected = m.price ? Number(amount.value) * 0.99 / m.price : 0; if (!(expected > 0)) throw Error('This market has no price yet.');
        const minOut = parseUnits((expected * 0.95).toFixed(Math.min(m.tdec, 12)), m.tdec);
        const ref = savedReferrer(), blocksPool = (BigInt(m.key.hooks) & 16383n) === 10956n;
        const payWith = nativeIn ? '0x' + '0'.repeat(40) : wrapped;
        const hops = [{ key: m.key, zeroForOne: m.key.currency0.toLowerCase() === payWith, hookData: ref && blocksPool ? '0x' + ref.slice(2).padStart(64, '0') : '0x' }];
        const data = encodeBuyFor({ user: me, hops, wrapNative: nativeIn ? null : wrapped, minOut, referrer: ref, deadline: Math.floor(Date.now() / 1000) + 900 });
        statusEl.textContent = 'Getting a quote…';
        const r = await fetch('/api/relay/xbuy', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ user: me, originChainId: Number(from.value), destinationChainId: Number(m.chainId), amount: value.toString(), data }) });
        const q = await r.json().catch(() => ({}));
        if (mine !== rev) return;
        if (!r.ok || !q.steps) throw Error(q.error === 'not_set_up' ? 'Instant buys are not set up on ' + c.name + ' yet.' : q.message || 'No quote right now. Try again.');
        quote = q; plan = { min: minOut };
        const d = q.details || {}, fee = Object.values(q.fees || {}).reduce((t, f) => t + (Number(f?.amountUsd) || 0), 0) - (Number(q.fees?.app?.amountUsd) || 0);
        out.textContent = 'Costs ' + (d.currencyIn?.amountFormatted ? Number(d.currencyIn.amountFormatted).toPrecision(5) : '?') + ' ' + (chainById(from.value)?.native || '') + ' on ' + (chainById(from.value)?.name || '') +
          ' · moving cost ≈ $' + fee.toFixed(2) + ' · arrives in about ' + (d.timeEstimate ?? 20) + ' s · you get at least ' + formatUnits(minOut, m.tdec, 4) + ' ' + m.symbol + '.';
        statusEl.textContent = ''; go.textContent = 'Buy now';
      } else {
        const q = quote; quote = null;
        const { relayWallet } = await import('/qx-relay-wallet.mjs'), wallet = await relayWallet();
        try {
          statusEl.textContent = 'Confirm in your wallet on ' + (chainById(from.value)?.name || 'the chain you pay from') + '…';
          await relayExecute(q, wallet, { onUpdate: u => { if (u.status === 'pending' || u.status === 'submitted') statusEl.textContent = 'Moving and buying…'; } });
          statusEl.textContent = 'Bought. Your ' + m.symbol + ' and cashback are in your wallet on ' + c.name + '.'; reset();
        } catch (err) {
          statusEl.textContent = /refund/.test(String(err?.code)) ? 'The price moved before it arrived, so nothing was bought. Relay refunded you on ' + (chainById(from.value)?.name || 'the chain you paid from') + '.' : say(err);
          reset();
        } finally { wallet.dispose?.(); }
      }
    } catch (err) { statusEl.textContent = say(err); reset(); }
    finally { go.disabled = !(Number(amount.value) > 0); }
  });
  return box;
}

async function refreshOrders() { const me = connectedAddress(); st.orders = me ? await myOrders(me) : []; }
const LABEL = { open: 'Open', sent: 'Filling', filled: 'Filled', cancelled: 'Withdrawn', expired: 'Expired', closed: 'Closed', failed: 'Stopped' };
const NOTE = { pair_filled: 'its pair filled' };
function ordersView() {
  const list = el('ul', { class: 'qpo-orders' });
  const mine = (st.orders || []).filter(o => !st.market || o.chainId === st.market.chainId);
  if (!mine.length) list.append(el('li', { class: 'qpo-note' }, connectedAddress() ? 'No orders yet.' : 'Connect a wallet to see your orders.'));
  for (const x of mine.slice(0, 30)) {
    const o = x.order, m = st.market, buy = m && o.tokenOut === m.token, inDec = buy ? m.qdec : m?.tdec ?? 18;
    const what = m ? (buy ? 'Buy ' + m.symbol + ' with ' + formatUnits(BigInt(o.amountIn), inDec, 4) + ' ' + m.quoteSymbol : 'Sell ' + formatUnits(BigInt(o.amountIn), inDec, 4) + ' ' + m.symbol) : x.kind;
    const exit = x.kind === 'take_profit' || x.kind === 'stop';
    const at = exit && m ? priceFromSqrt(o.triggerSqrtPriceX96, { tokenIs0: m.token === m.key.currency0.toLowerCase(), tdec: m.tdec, qdec: m.qdec }) : null;
    const pair = exit && mine.some(y => y.hash !== x.hash && y.order.nonce === o.nonce);
    const p = exit ? at : m ? (buy ? Number(SCALE) / Number(o.minOutPerIn) * 10 ** (m.tdec - m.qdec) : Number(o.minOutPerIn) / Number(SCALE) * 10 ** (m.tdec - m.qdec)) : null;
    const acts = el('div', { class: 'qpo-acts' });
    if (x.status === 'open') {
      const wd = el('button', { type: 'button', class: 'qpo-btn' }, 'Withdraw');
      wd.addEventListener('click', async () => { wd.disabled = true; try { if (!boardSession()) await signIn(); await post('/api/orders/' + x.hash, null, 'DELETE'); await refreshOrders(); render(); statusEl.textContent = (pair ? 'Withdrawn, with its pair. ' : 'Withdrawn. ') + 'For a guarantee on chain, use Cancel on chain.'; } catch (e) { statusEl.textContent = say(e); wd.disabled = false; } });
      acts.append(wd);
    }
    if (['open', 'cancelled'].includes(x.status)) {
      const oc = el('button', { type: 'button', class: 'qpo-btn' }, 'Cancel on chain');
      oc.addEventListener('click', async () => { oc.disabled = true; try { const n = BigInt(o.nonce); await send(x.chainId, { to: PERMIT2, data: calldata('0x3ff9dcb1', ['uint256', 'uint256'], [n >> 8n, 1n << (n & 255n)]) }, s => statusEl.textContent = s); statusEl.textContent = 'Cancelled on chain. This order can never fill.'; } catch (e) { statusEl.textContent = say(e); oc.disabled = false; } });
      acts.append(oc);
    }
    // X1: funds from a funded buy that did not fill go back where they came from; sale proceeds can go home.
    const origin = xchainEnabled && buy && connectedAddress() ? orderOrigin(connectedAddress(), x.chainId, x.hash) : null;
    if (origin && ['cancelled', 'expired', 'closed', 'failed'].includes(x.status)) {
      const mb = el('button', { type: 'button', class: 'qpo-btn' }, 'Move back to ' + chainName(origin.chainId));
      mb.addEventListener('click', () => { void offerMoveBack({ chainId: Number(x.chainId), asset: { address: o.tokenIn, decimals: inDec, symbol: m?.quoteSymbol || '' }, amount: BigInt(o.amountIn), origin }).catch(e => statusEl.textContent = say(e)); });
      acts.append(mb);
    }
    if (xchainEnabled && m && !buy && x.status === 'filled') {
      const home = cashHome(), mp = el('button', { type: 'button', class: 'qpo-btn' }, home && home !== Number(x.chainId) ? 'Move proceeds to ' + chainName(home) : 'Move proceeds');
      mp.addEventListener('click', () => { void moveProceeds({ chainId: Number(x.chainId), asset: { address: m.quote, decimals: m.qdec, symbol: m.quoteSymbol }, amount: BigInt(o.amountIn) * BigInt(o.minOutPerIn) / SCALE, home }).catch(e => statusEl.textContent = say(e)); });
      acts.append(mp);
    }
    const explorer = chainById(x.chainId)?.explorer;
    list.append(el('li', { class: 'qpo-order' }, el('div', {}, el('b', {}, exit ? (x.kind === 'stop' ? 'Stop · ' : 'Take profit · ') + what + (pair ? ' (pair)' : '') : what), el('small', {}, (p ? 'at ' + priceText(p) + ' ' + (m?.quoteSymbol || '') + ' · ' : '') + (LABEL[x.status] || x.status) + (NOTE[x.note] ? ' · ' + NOTE[x.note] : ''))),
      x.tx && explorer ? el('a', { href: explorer + '/tx/' + x.tx, target: '_blank', rel: 'noopener', class: 'qpo-link' }, 'Fill') : null, acts));
  }
  return el('section', { class: 'qpo-mine', 'aria-label': 'Your orders' }, el('h3', {}, 'Your orders'), list);
}

export async function openOrders(chainId, controller, side) {
  const owner = connectedAddress()?.toLowerCase() || null;
  const requested = ['buy', 'sell', 'tpsl'].includes(side) ? side : null;
  // Reopening the same intent keeps its draft, in-flight promise and recovery UI.
  if (st?.market?.chainId === String(chainId) && st.market.controller?.toLowerCase() === controller.toLowerCase() && st.owner === owner && root?.childNodes.length && (!requested || st.side === requested || goBtn?.disabled || st.recovery)) {
    if(st.approval?.disposed){render();return;}
    if (!goBtn?.disabled && !st.recovery) await onWallet();
    return;
  }
  st = { side: requested || 'buy', days: 7, orders: [], market: null, owner };
  try { st.market = await loadMarket(chainId, controller); } catch (e) { st.error = say(e); }
  await refreshOrders(); render();
}
// ---- where it shows: the /orders page, or a sheet over the terminal ----
let sheet = null;
function openSheet(chainId, controller, side) {
  if (!sheet) {
    if (!document.querySelector('link[href="/qx-pro-orders.css"]')) document.head.append(el('link', { rel: 'stylesheet', href: '/qx-pro-orders.css' }));
    sheet = el('dialog', { class: 'qpo-sheet qpo-page', 'aria-label': 'Limit order' });
    const close = el('button', { type: 'button', class: 'qpo-x', 'aria-label': 'Close', onclick: () => {st?.disarmOrderReview?.();st?.approval?.dispose();sheet.close();} }, '×');
    statusEl = el('p', { class: 'qpo-status', role: 'status', 'aria-live': 'polite' });
    root = el('div', { id: 'qpo-sheet-root' });
    sheet.append(el('div', { class: 'qpo-sheet-in' }, el('div', { class: 'qpo-sheet-bar' }, el('b', {}, 'Limit order'), close), statusEl, root));
    sheet.addEventListener('click', e => { if (e.target === sheet) {st?.disarmOrderReview?.();st?.approval?.dispose();sheet.close();} });
    sheet.addEventListener('cancel',()=>{st?.disarmOrderReview?.();st?.approval?.dispose();});
    sheet.addEventListener('close',()=>{if(!sheet.open){st?.disarmOrderReview?.();st?.approval?.dispose();}});
    document.body.append(sheet);
    onWalletChange?.(() => { if (sheet.open) onWallet(); });
  }
  statusEl.textContent = '';
  if (!sheet.open) sheet.showModal();
  return openOrders(chainId, controller, side);
}
/// The terminal's open market, from its address bar (#m=<chain>:<controller>), EVM markets only.
export function terminalMarket(hash = location.hash) {
  const m = /^(\d+):(0x[0-9a-fA-F]{40})$/.exec(new URLSearchParams(String(hash).replace(/^#/, '')).get('m') || '');
  return m ? { chainId: m[1], controller: m[2].toLowerCase() } : null;
}
window.addEventListener('qhooks:order-open', e => { const d = e.detail || terminalMarket(); if (!d) return; if (document.getElementById('qpo-root')) openOrders(d.chainId, String(d.controller || '').toLowerCase(), d.side); else openSheet(d.chainId, String(d.controller || '').toLowerCase(), d.side); });
const node = document.getElementById('qpo-root');
if (node) {
  import('/qx-account-wallet.mjs').catch(() => {});
  root = node; statusEl = document.getElementById('qpo-status');
  const intent = PAGE_INTENT;
  if (intent) openOrders(intent.chainId, intent.controller, intent.side); else { st = { orders: [], market: null }; refreshOrders().then(render); }
  onWalletChange?.(onWallet);
}
// The terminal's "Limit order" button: shown while an EVM market is open; opens the sheet for it.
const btn = document.getElementById('qx-pro-limit');
if (btn) {
  if (!document.querySelector('link[href="/qx-pro-orders.css"]')) document.head.append(el('link', { rel: 'stylesheet', href: '/qx-pro-orders.css' }));
  const sync = () => { btn.hidden = !terminalMarket(); };
  btn.addEventListener('click', () => { const m = terminalMarket(); if (m) window.dispatchEvent(new CustomEvent('qhooks:order-open', { detail: m })); });
  window.addEventListener('hashchange', sync); sync();
}
