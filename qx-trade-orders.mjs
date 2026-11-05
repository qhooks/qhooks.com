// Trade page: limit orders on the selected pool through the chain's ownerless QLimitOrders contract.
// A buy order escrows quote and fills when the token price falls to the target; a sell order escrows
// tokens and fills when it rises to it. Anyone can fill a ready order and earn its tip, so the page
// lists ready orders with a Fill button. Targets are net of the pool fee, block charges and the tip.
import { calldata, ethCall, rpc, words, toAddress, uintArray, livePoolKey, keyTuple, KEY_T, parseUnits, formatUnits, erc20, send, ensureAllowance,
  connectedAddress, onWalletChange, spotQuote, sqrtBig, MANAGER, CHAIN_NAME, h } from '/qx-chain.mjs';
import { extraAddress, isLive, setUp } from '/qx-extras.mjs';
import { oneClickPlan, withOneClick, pressGate, silentActive } from './qx-instant-bridge.mjs';
import { getWalletHub } from './wallet-hub.mjs';
import { relayWallet } from './qx-relay-wallet.mjs';
import { createFundingRow, fundingAsset, destinationCosts, runFundedOrder, retryLanded, recoveryView,
  orderOrigin, cancelWithRefund, offerMoveBack, moveProceeds, chainName, loadFundingStyle, xchainEnabled } from './qx-xchain-gate.mjs';

const card = document.getElementById('qto');
// Selectors of the pinned QLimitOrders ABI (full-launch/extras.json).
const SEL = { place: '0x25cc7d15', fill: '0x3fda5389', cancel: '0x40e58ee5', get: '0x9507d39a', ordersOf: '0xdf457659', ordersBy: '0xface881d', poolId: '0x53e579bf', previewRate: '0xb9c3fc44' };
let state = null, seq = 0, acting = false, pendingPool = null;

function decodeOrder(id, hex) {
  const w = words(hex);
  return { id, maker: toAddress(w[0]), expiry: Number(w[1]), tipBps: Number(w[2]), zeroForOne: w[3] === 1n, manager: toAddress(w[4]), limit: w[5], remaining: w[6], filledIn: w[7], receivedOut: w[8], minOut: w[9],
    key: { currency0: toAddress(w[10]), currency1: toAddress(w[11]), fee: Number(w[12]), hooks: toAddress(w[14]) } };
}

async function blockRate(isBuy) {
  const b = state.blocks; if (!b) return 0n;
  try { return BigInt(await ethCall(state.chainId, b, SEL.previewRate + [isBuy ? 1n : 0n, 0n, 0n].map(v => v.toString(16).padStart(64, '0')).join(''))); } catch { return 0n; }
}

/// Price is quote per whole token. Returns the swap's sqrt price bound and the order's net minimum.
async function terms(side, amount, priceText, tipBps) {
  const { key, token, tdec, qdec } = state;
  const P = parseUnits(priceText, 18), ONE = 10n ** 18n; if (P === 0n) throw new TypeError('Enter a target price');
  const isBuy = side === 'buy', tokenIs0 = key.currency0 === token;
  // Pool price is currency1 per currency0 in raw units; with the token as currency0 that is quote per token.
  let num = P * 10n ** BigInt(qdec), den = ONE * 10n ** BigInt(tdec);
  // Move the bound by the LP fee, block charges and tip so the net price at the bound still meets the target.
  const costBps = BigInt(key.fee) / 100n + (await blockRate(isBuy)) + BigInt(tipBps) + 5n;
  if (isBuy) num = num * (10000n - costBps); else num = num * 10000n; // buy: pay at most P net → pool price lower
  if (isBuy) den = den * 10000n; else den = den * (10000n - costBps); // sell: receive at least P net → pool price higher
  if (!tokenIs0) [num, den] = [den, num];
  const limit = sqrtBig((num << 192n) / den);
  const minOut = isBuy ? amount * ONE * 10n ** BigInt(tdec) / (P * 10n ** BigInt(qdec)) : amount * P * 10n ** BigInt(qdec) / (ONE * 10n ** BigInt(tdec));
  const zeroForOne = isBuy ? key.currency0 === state.quoteToken : tokenIs0;
  return { limit, minOut, zeroForOne };
}

async function loadOrders() {
  const { chainId, address, key } = state;
  const pid = await ethCall(chainId, address, calldata(SEL.poolId, [KEY_T], [keyTuple(key)]));
  const ids = uintArray(await ethCall(chainId, address, calldata(SEL.ordersOf, ['bytes32'], [pid]))).slice(-40);
  const me = connectedAddress();
  const mineIds = me ? uintArray(await ethCall(chainId, address, calldata(SEL.ordersBy, ['address'], [me]))).slice(-40) : [];
  const all = [...new Set([...ids, ...mineIds].map(String))].map(BigInt);
  const orders = await Promise.all(all.map(async id => decodeOrder(id, await ethCall(chainId, address, calldata(SEL.get, ['uint256'], [id])))));
  const now = Number(await chainNow());
  return Promise.all(orders.filter(o => o.remaining > 0n || o.maker === me && o.receivedOut > 0n && o.key.hooks === key.hooks).map(async o => {
    let ready = false;
    if (o.remaining > 0n && o.expiry >= now && o.key.hooks === key.hooks) { try { await ethCall(chainId, address, calldata(SEL.fill, ['uint256'], [o.id]), me || undefined); ready = true; } catch {} }
    return { ...o, ready, expired: o.expiry < now };
  }));
}

function describe(o) {
  const { token, tdec, qdec, qsym, symbol } = state;
  const sellsToken = o.zeroForOne === (state.key.currency0 === token);
  const total = o.remaining + o.filledIn;
  const price = sellsToken ? (o.minOut * 10n ** BigInt(tdec) * 10n ** 18n) / (total * 10n ** BigInt(qdec)) : (total * 10n ** BigInt(tdec) * 10n ** 18n) / (o.minOut * 10n ** BigInt(qdec));
  return { side: sellsToken ? 'Sell' : 'Buy', amount: sellsToken ? formatUnits(o.remaining, tdec, 4) + ' ' + symbol : formatUnits(o.remaining, qdec, 4) + ' ' + qsym, price: formatUnits(price, 18, 6) + ' ' + qsym };
}

async function act(btn, status, fn) {
  if (acting) return;
  acting = true;
  btn.disabled = true; status.textContent = '';
  let last = '';
  try {
    const followup = await fn(t => { last = t; status.textContent = t; });
    await render();
    const fresh = card.querySelector('.qtx-status'); if (fresh) fresh.textContent = /…$/.test(last) ? 'Done.' : last || 'Done.';
    if (typeof followup === 'function') followup(fresh);
  } catch (e) { status.textContent = e.message || 'That did not go through'; btn.disabled = false; }
  finally { acting = false; if (pendingPool) { const pool = pendingPool; pendingPool = null; void show(pool); } }
}
const chainNow = async () => BigInt((await rpc(state.chainId, 'eth_getBlockByNumber', ['latest', false])).timestamp);

async function render() {
  const { chainId, symbol, qsym } = state, me = connectedAddress();
  loadFundingStyle();
  const status = h('p', { class: 'qtx-status', role: 'status', ariaLive: 'polite' });
  const head = [h('h2', { id: 'qto-heading' }, 'Limit orders'),
    h('p', { class: 'qtb-note' }, 'Set a price and walk away. Your funds wait in a public contract with no owner; anyone can fill the order once the market reaches your price and earns your tip for doing it. Cancel any time.')];
  const live = await isLive(chainId, 'limitOrders');
  if (!live) {
    const btn = h('button', { type: 'button', class: 'workspace-button', disabled: !me }, 'Set up limit orders on ' + CHAIN_NAME[chainId]);
    btn.addEventListener('click', () => act(btn, status, s => setUp(chainId, 'limitOrders', s)));
    head.push(h('p', { class: 'qtb-note' }, 'Limit orders have not been used on ' + CHAIN_NAME[chainId] + ' yet. Placing your first order includes the one-time setup transaction, or you can set up separately.'), btn);
  }
  const spot = await spotQuote(chainId, state.key, state.token, state.tdec, me || undefined).catch(() => null);
  const side = h('select', { ariaLabel: 'Order side' }, h('option', { value: 'buy' }, 'Buy ' + symbol), h('option', { value: 'sell' }, 'Sell ' + symbol));
  const amount = h('input', { type: 'text', inputMode: 'decimal', placeholder: '0.0', autocomplete: 'off', ariaLabel: 'Amount' });
  const amountLabel = h('span', {}, 'Spend (' + qsym + ')');
  const price = h('input', { type: 'text', inputMode: 'decimal', placeholder: spot ? formatUnits(spot, state.qdec, 6) : '0.0', autocomplete: 'off', ariaLabel: 'Target price' });
  const expiry = h('select', { ariaLabel: 'Expires' }, ...[['86400', '1 day'], ['604800', '7 days'], ['2592000', '30 days']].map(([v, t]) => h('option', { value: v, selected: v === '604800' }, t)));
  const tip = h('select', { ariaLabel: 'Filler tip' }, ...[['5', '0.05%'], ['10', '0.1%'], ['30', '0.3%']].map(([v, t]) => h('option', { value: v, selected: v === '10' }, t)));
  side.addEventListener('change', () => { amountLabel.textContent = side.value === 'buy' ? 'Spend (' + qsym + ')' : 'Sell (' + symbol + ')'; });
  const place = h('button', { type: 'button', class: 'workspace-button', disabled: !me }, 'Place order');
  let armedAt = null, armTimer, fundingTimer, recovery = null, localBusy = false, revision = 0;
  const followup = h('div'), selectedState = state, hub = getWalletHub(window);
  const usd = q => { const value = Number(q?.details?.currencyIn?.amountUsd); return value > 0 ? value : /^(USDC|USDT|USDG)$/.test(qsym) && side.value === 'buy' ? Number(amount.value) : null; };
  const planFor = q => oneClickPlan(me, hub.snapshot().current?.owner?.toLowerCase() === me?.toLowerCase() ? hub.snapshot().current.entry : null, usd(q));
  function disarm() { clearTimeout(armTimer); armedAt = null; place.textContent = 'Place order'; }
  const funding = createFundingRow({ h, action: 'order', getPlan: planFor, onChange: ({ ready }) => { disarm(); place.disabled = !me || localBusy || !ready; } });
  const review = async amt => destinationCosts({ owner: me, chainId, asset: fundingAsset(chainId, { address: state.quoteToken, decimals: state.qdec }),
    amountNeeded: amt, spender: state.address, setup: await isLive(chainId, 'limitOrders') ? 0 : 1, gasUnits: 350000n });
  async function refreshFunding() {
    const mine = ++revision; disarm(); recovery = null; followup.replaceChildren(); funding.clear();
    if (/^Enter an amount/.test(status.textContent)) status.textContent = '';
    if (localBusy || acting || selectedState !== state || !me) return;
    if (side.value !== 'buy') { place.disabled = false; return; }
    place.disabled = true;
    try {
      const amt = parseUnits(amount.value, state.qdec); if (amt <= 0n) return;
      const balance = (await erc20(chainId, state.quoteToken, me)).balance;
      if (mine !== revision || selectedState !== state) return;
      if (balance >= amt) { place.disabled = false; return; }
      await funding.update({ owner: me, chainId, asset: fundingAsset(chainId, { address: state.quoteToken, decimals: state.qdec }),
        amountNeeded: amt, balance, review: () => review(amt) });
    } catch (e) { if (mine === revision) status.textContent = e.message; }
  }
  for (const input of [side, amount, price, expiry, tip]) input.addEventListener('input', () => {
    if (localBusy) return; revision++; disarm(); recovery = null; followup.replaceChildren(); funding.clear(); place.disabled = true;
    clearTimeout(fundingTimer); fundingTimer = setTimeout(refreshFunding, 300);
  });
  side.addEventListener('change', () => { void refreshFunding(); });
  async function placePress() {
    if (localBusy || acting || selectedState !== state || !me) return;
    if (connectedAddress()?.toLowerCase() !== me.toLowerCase()) { status.textContent = 'Reconnect the wallet that reviewed this order.'; return; }
    if (!recovery && (place.disabled || funding.required && !funding.quote)) return;
    const q = funding.quote, plan = planFor(q);
    if (q && !recovery && !funding.fresh()) { status.textContent = 'Refresh funding to review the current fees.'; place.disabled = true; return; }
    if (pressGate({ plan, armedAt, now: Date.now() }) === 'arm') {
      armedAt = Date.now(); place.textContent = usd(q) > 0 ? 'Confirm $' + Math.round(usd(q)) : 'Confirm order';
      if (recovery) place.disabled = false;
      armTimer = setTimeout(disarm, 15000); return;
    }
    disarm(); localBusy = true; acting = true; funding.setBusy(true);
    for (const el of [side, amount, price, expiry, tip, place, ...followup.querySelectorAll('button')]) el.disabled = true;
    const s = text => { status.textContent = text; }, isBuy = side.value === 'buy', input = isBuy ? state.quoteToken : state.token;
    const assertOwner = () => {
      if (connectedAddress()?.toLowerCase() !== me.toLowerCase()) throw new Error('Reconnect the wallet that funded this order.');
      if (plan.silent && !silentActive()) throw new Error('This one-click press expired. Retry from the funds in your wallet.');
    };
    try {
      const amt = parseUnits(amount.value, isBuy ? state.qdec : state.tdec); if (amt <= 0n) throw new TypeError('Enter an amount');
      await terms(side.value, amt, price.value, Number(tip.value)); // Validate the target before delivering funds.
      const setup = async () => { assertOwner(); if (!(await isLive(chainId, 'limitOrders'))) await setUp(chainId, 'limitOrders', s); };
      const placeArrived = async arrived => {
        assertOwner(); const t = await terms(side.value, arrived, price.value, Number(tip.value));
        const ids = q ? uintArray(await ethCall(chainId, state.address, calldata(SEL.ordersBy, ['address'], [me]))).map(String) : [];
        assertOwner(); await ensureAllowance(chainId, input, state.address, arrived, s);
        assertOwner(); s('Place the order in your wallet…');
        await send(chainId, { to: state.address, data: calldata(SEL.place, ['address', KEY_T, 'bool', 'uint128', 'uint128', 'uint160', 'uint40', 'uint16'],
          [MANAGER[chainId], keyTuple(state.key), t.zeroForOne, arrived, t.minOut, t.limit, BigInt((await rpc(chainId, 'eth_getBlockByNumber', ['latest', false])).timestamp) + BigInt(expiry.value), Number(tip.value)]) }, s);
        s('Order placed.');
        if (q) { try {
          const added = uintArray(await ethCall(chainId, state.address, calldata(SEL.ordersBy, ['address'], [me]))).filter(id => !ids.includes(String(id)));
          if (added.length === 1) orderOrigin(me, chainId, added[0], q.funding.from);
        } catch { /* Placement succeeded; a history read failure must never invite another placement. */ } }
      };
      await withOneClick(plan, async () => {
        if (recovery) { await retryLanded(recovery, { owner: me, swap: async a => { await setup(); await placeArrived(a); } }); recovery = null; }
        else if (q) {
          const wallet = await relayWallet();
          try {
            const result = await runFundedOrder({ quote: q, wallet, setup, place: placeArrived, onStep: e => { if (e.message) s(e.message); } });
            if (!result.completed) recovery = result;
          } finally { wallet.dispose(); }
        } else { await setup(); await placeArrived(amt); }
      });
      if (recovery) followup.replaceChildren(recoveryView(h, recovery, placePress));
      else { await render(); const fresh = card.querySelector('.qtx-status'); if (fresh) fresh.textContent = 'Order placed.'; }
    } catch (e) { s(e.message || 'That did not go through'); }
    finally {
      localBusy = false; acting = false; funding.setBusy(false);
      for (const el of [side, amount, price, expiry, tip, place, ...followup.querySelectorAll('button')]) el.disabled = false;
      if (recovery) place.disabled = true;
      if (recovery?.retryable === false) for (const el of followup.querySelectorAll('button')) el.disabled = true;
      if (pendingPool) { const pool = pendingPool; pendingPool = null; void show(pool); }
    }
  }
  place.addEventListener('click', placePress);
  const form = h('div', { class: 'qtx-form' },
    h('div', { class: 'qtx-row' }, h('label', {}, h('span', {}, 'Side'), side), h('label', {}, amountLabel, amount)),
    h('div', { class: 'qtx-row' }, h('label', {}, h('span', {}, 'Price (' + qsym + ' per ' + symbol + ')'), price), h('label', {}, h('span', {}, 'Expires'), expiry), h('label', {}, h('span', {}, 'Filler tip'), tip)),
    spot ? h('p', { class: 'qtb-note' }, 'Selling one ' + symbol + ' fetches about ' + formatUnits(spot, state.qdec, 6) + ' ' + qsym + ' right now, after fees.') : null,
    funding.element, place, followup);
  let list = h('p', { class: 'qtb-note' }, 'Loading orders…');
  card.replaceChildren(...head, form, status, h('h3', { class: 'qtx-sub' }, 'Open orders'), list);
  card.hidden = false;
  try {
    const orders = live ? await loadOrders() : [];
    const rows = orders.map(o => {
      const d = describe(o), actions = [];
      if (o.ready) { const b = h('button', { type: 'button', class: 'qtx-mini', disabled: !me }, 'Fill · earn ' + (o.tipBps / 100) + '%'); b.addEventListener('click', () => act(b, status, s => send(chainId, { to: state.address, data: calldata(SEL.fill, ['uint256'], [o.id]) }, s))); actions.push(b); }
      if (o.remaining > 0n && me && (o.maker === me || o.expired)) { const b = h('button', { type: 'button', class: 'qtx-mini' }, o.maker === me ? 'Cancel' : 'Return funds'); b.addEventListener('click', () => act(b, status, async s => {
        let refund;
        const asset = { address: o.zeroForOne ? o.key.currency0 : o.key.currency1, decimals: d.side === 'Buy' ? state.qdec : state.tdec, symbol: d.side === 'Buy' ? qsym : symbol };
        await cancelWithRefund({ owner: o.maker, chainId, asset, origin: o.maker === me ? orderOrigin(me, chainId, o.id) : null,
          cancel: () => send(chainId, { to: state.address, data: calldata(SEL.cancel, ['uint256'], [o.id]) }, s), offer: value => { refund = value; } });
        return fresh => { if (refund && fresh) { const back = h('button', { type: 'button', class: 'qtx-mini' }, 'Move back to ' + chainName(refund.origin.chainId));
          back.addEventListener('click', () => { if (!acting) void offerMoveBack(refund).catch(e => { fresh.textContent = e.message; }); }); fresh.append(back); } };
      })); actions.push(b); }
      if (xchainEnabled && o.maker === me && d.side === 'Sell' && o.receivedOut > 0n) {
        const proceeds = h('button', { type: 'button', class: 'qtx-mini' }, 'Move proceeds to cash');
        proceeds.addEventListener('click', () => { if (!acting) void moveProceeds({ chainId, asset: { address: state.quoteToken, decimals: state.qdec, symbol: qsym }, amount: o.receivedOut }).catch(e => { status.textContent = e.message; }); }); actions.push(proceeds);
      }
      return h('li', {}, h('span', { class: 'qtx-side ' + d.side.toLowerCase() }, d.side), h('span', {}, d.amount), h('span', {}, 'at ' + d.price), h('span', { class: 'qtx-state' }, o.remaining === 0n ? 'filled' : o.expired ? 'expired' : o.ready ? 'ready' : o.key.hooks !== state.key.hooks ? 'old pool' : 'waiting'), h('span', { class: 'qtx-actions' }, ...actions));
    });
    list.replaceWith(list = rows.length ? h('ul', { class: 'qtx-orders' }, ...rows) : h('p', { class: 'qtb-note' }, 'No open orders on this pool yet.'));
  } catch { list.replaceWith(h('p', { class: 'qtb-note' }, 'Could not read orders right now.')); }
}

async function show(pool) {
  if (acting) { pendingPool = pool; return; }
  const mine = ++seq;
  if (!card || !pool?.chainId || !MANAGER[pool.chainId]) { if (card) card.hidden = true; return; }
  try {
    const c = pool.constructor, quoteToken = c.quote, token = c.currency0 === quoteToken ? c.currency1 : c.currency0;
    const [key, t, q, address] = await Promise.all([livePoolKey(pool.chainId, pool.controller), erc20(pool.chainId, token), erc20(pool.chainId, quoteToken), extraAddress('limitOrders')]);
    if (mine !== seq) return;
    const blocks = c.blocks && BigInt(c.blocks) !== 0n ? c.blocks : null;
    state = { chainId: pool.chainId, key, token, quoteToken, symbol: t.symbol || 'token', tdec: t.decimals, qsym: q.symbol || 'quote', qdec: q.decimals, address, blocks };
    await render();
  } catch { if (mine === seq) card.hidden = true; }
}

document.addEventListener('qhooks:pool', e => show(e.detail));
if (window.__qhooksPool) show(window.__qhooksPool);
onWalletChange(() => { if (state && !acting) render().catch(() => {}); });
