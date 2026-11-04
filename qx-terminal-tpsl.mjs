// Terminal: take-profit and stop-loss on a launch, through the ownerless QTriggerOrders contract (one
// address on every chain). An order escrows the tokens to sell with a target above the price and a stop
// below it; whichever is reached first sells everything, at no less than its minimum. Anyone can execute a
// reached order and earn its tip; this panel offers to do it whenever the page is open.
import { abi, calldata, ethCall, rpc, words, toAddress, uintArray, livePoolKey, keyTuple, KEY_T, parseUnits, formatUnits, erc20, send, ensureAllowance,
  connectedAddress, onWalletChange, MANAGER, CHAIN_NAME, h } from '/qx-chain.mjs';
import { extraAddress, isLive, setUp } from '/qx-extras.mjs';
import { quoteSingle } from '/qx-swap.mjs';
import { keccak_256 } from '/full-launch/prototypes/qpools/client/vendor/hashes/sha3.js';

const SEL = { place: '0x953a6fc6', arm: '0x20c69c89', execute: '0xfe0d94c1', cancel: '0x40e58ee5', check: '0x5f72f450', get: '0x9507d39a', ordersBy: '0xface881d', ordersOf: '0xdf457659', extsload: '0x1e2eaeaf' };
const STATE = ['Closed', 'Waiting', 'Take-profit reached', 'Stop reached', 'Stop armed', 'Stop reached', 'Expired'];
const Q96 = 2 ** 96;
const card = document.getElementById('qts');
const pref = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem('qhooks:terminal:tpsl') || '{}')[k]; const all = JSON.parse(localStorage.getItem('qhooks:terminal:tpsl') || '{}'); all[k] = v; localStorage.setItem('qhooks:terminal:tpsl', JSON.stringify(all)); } catch {} return undefined; };
let st = null, seq = 0, timer = null, notify = () => {}, lastDue = '';
const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
const poolId = k => '0x' + hex(keccak_256(Uint8Array.from(abi([KEY_T], [keyTuple(k)]).slice(2).match(/../g).map(x => parseInt(x, 16)))));

/// The pool's sqrtPriceX96, read straight from the manager's storage (StateLibrary layout, pools at slot 6).
async function sqrtPrice() {
  const slot = '0x' + hex(keccak_256(Uint8Array.from((poolId(st.key).slice(2) + (6).toString(16).padStart(64, '0')).match(/../g).map(x => parseInt(x, 16)))));
  return BigInt(await ethCall(st.chainId, MANAGER[st.chainId], calldata(SEL.extsload, ['bytes32'], [slot]))) & ((1n << 160n) - 1n);
}
// Token price in the quote currency at a given sqrt price.
const priceAt = s => { const p = (Number(s) / Q96) ** 2 * 10 ** (st.tokenIs0 ? st.decimals - st.quoteDecimals : st.quoteDecimals - st.decimals); return st.tokenIs0 ? p : 1 / p; };
// The sqrt price at which the token is worth `f` times what it is worth at `s`.
const scaled = (s, f) => { const r = BigInt(Math.round(Math.sqrt(f) * 1e9)); return st.tokenIs0 ? s * r / 1_000_000_000n : s * 1_000_000_000n / r; };
const fmtP = p => p >= 1 ? p.toLocaleString('en-US', { maximumFractionDigits: 4 }) : p.toPrecision(4);

async function act(btn, status, fn) {
  btn.disabled = true; status.textContent = '';
  try { await fn(t => { status.textContent = t; }); await render(); card.querySelector('.qtx-status').textContent = 'Done.'; }
  catch (e) { status.textContent = e.message || 'That did not go through'; btn.disabled = false; }
}

async function readOrder(id) {
  const [g, c] = await Promise.all([ethCall(st.chainId, st.address, calldata(SEL.get, ['uint256'], [id])), ethCall(st.chainId, st.address, calldata(SEL.check, ['uint256'], [id]))]);
  const w = words(g);
  return { id, maker: toAddress(w[0]), expiry: Number(w[1]), tipBps: Number(w[2]), zeroForOne: w[3] === 1n, tp: w[5], stop: w[6], amountIn: w[7], tpMin: w[8], stopMin: w[9],
    key: { currency0: toAddress(w[12]), currency1: toAddress(w[13]), hooks: toAddress(w[16]) }, state: Number(BigInt(c)) };
}

/// Executes a reached order: arms a stop first and waits a block when it needs that.
async function run(o, s) {
  let state = o.state;
  if (state === 3) {
    await send(st.chainId, { to: st.address, data: calldata(SEL.arm, ['uint256'], [o.id]) }, s);
    state = 4;
  }
  if (state === 4) {
    s('Waiting one block before the stop can execute…');
    const b0 = BigInt(await rpc(st.chainId, 'eth_blockNumber', []));
    for (let i = 0; i < 60 && BigInt(await rpc(st.chainId, 'eth_blockNumber', [])) <= b0; i++) await new Promise(r => setTimeout(r, 1000));
  }
  await send(st.chainId, { to: st.address, data: calldata(SEL.execute, ['uint256'], [o.id]) }, s);
}

/// Places a TP/SL on `amount` tokens with the given percentages (null turns one off).
async function place(amount, tpPct, slPct, floorBps, tipBps, s) {
  const p0 = await sqrtPrice(), q = await quoteSingle(st.chainId, st.key, st.tokenIs0, amount);
  const f = x => BigInt(Math.round(x * 1e6)), keep = 10000n - BigInt(floorBps);
  const tp = tpPct ? scaled(p0, 1 + tpPct / 100) : 0n, sl = slPct ? scaled(p0, 1 - slPct / 100) : 0n;
  // Minimums follow today's sell quote (charges included) scaled to each trigger, less the floor.
  const tpMin = tpPct ? q * f(1 + tpPct / 100) / 1_000_000n * keep / 10000n : 0n, slMin = slPct ? q * f(1 - slPct / 100) / 1_000_000n * keep / 10000n : 0n;
  const now = BigInt((await rpc(st.chainId, 'eth_getBlockByNumber', ['latest', false])).timestamp);
  await ensureAllowance(st.chainId, st.token, st.address, amount, s);
  s('Confirm the order in your wallet…');
  await send(st.chainId, { to: st.address, data: calldata(SEL.place, ['address', KEY_T, 'bool', 'uint128', 'uint160', 'uint128', 'uint160', 'uint128', 'uint40', 'uint16'],
    [MANAGER[st.chainId], keyTuple(st.key), st.tokenIs0, amount, tp, tpMin, sl, slMin, now + 30n * 86400n, tipBps]) }, s);
}

async function render() {
  if (!st) return;
  const me = connectedAddress(), status = h('p', { class: 'qtx-status', role: 'status', ariaLive: 'polite' });
  const parts = [h('h2', { id: 'qts-heading' }, 'Take profit · stop loss'),
    h('p', { class: 'qtb-note' }, 'Sells when the price reaches your target or falls to your stop, whichever comes first, and never for less than the minimum shown. Anyone can execute a reached order and earns its tip; while this page is open it offers to do that for you.')];
  if (!(await isLive(st.chainId, 'triggerOrders'))) {
    const b = h('button', { type: 'button', class: 'workspace-button' }, 'Set up TP/SL on ' + CHAIN_NAME[st.chainId]);
    b.addEventListener('click', () => act(b, status, s => setUp(st.chainId, 'triggerOrders', s)));
    card.replaceChildren(...parts, h('p', { class: 'qtb-note' }, 'TP/SL has not been used on ' + CHAIN_NAME[st.chainId] + ' yet. Setting it up is one transaction anyone can send, once per chain.'), b, status);
    card.hidden = false; return;
  }
  const p0 = await sqrtPrice(), price = priceAt(p0), bal = me ? (await erc20(st.chainId, st.token, me)).balance : 0n;
  const amount = h('input', { type: 'text', inputMode: 'decimal', placeholder: '0.0', autocomplete: 'off', ariaLabel: 'Tokens to sell' });
  const tp = h('input', { type: 'text', inputMode: 'decimal', value: pref('tp') ?? '100', ariaLabel: 'Take profit percent' });
  const sl = h('input', { type: 'text', inputMode: 'decimal', value: pref('sl') ?? '30', ariaLabel: 'Stop loss percent' });
  const floor = h('select', { ariaLabel: 'Floor below each trigger' }, ...[['300', '3%'], ['500', '5%'], ['1000', '10%']].map(([v, t]) => h('option', { value: v, selected: v === (pref('floor') || '500') }, t)));
  const tip = h('select', { ariaLabel: 'Tip for whoever executes' }, ...[['10', '0.1%'], ['30', '0.3%'], ['100', '1%']].map(([v, t]) => h('option', { value: v, selected: v === (pref('tip') || '30') }, t)));
  const auto = h('input', { type: 'checkbox', checked: !!pref('auto') });
  const summary = h('p', { class: 'qtb-note qts-sum' });
  const pctOf = el => { const v = Number(el.value); return el.value.trim() && v > 0 ? v : null; };
  const describe = () => {
    const t = pctOf(tp), s2 = pctOf(sl);
    summary.textContent = 'Now ' + fmtP(price) + ' ' + st.quoteSymbol + '. ' + (t ? 'Take profit at ' + fmtP(price * (1 + t / 100)) + '. ' : 'No take-profit. ') + (s2 && s2 < 100 ? 'Stop at ' + fmtP(price * (1 - s2 / 100)) + '.' : 'No stop.');
    for (const [k, el] of [['tp', tp], ['sl', sl], ['floor', floor], ['tip', tip]]) pref(k, el.value);
  };
  [tp, sl, floor, tip].forEach(el => el.addEventListener('input', describe)); describe();
  auto.addEventListener('change', () => pref('auto', auto.checked));
  const presets = h('div', { class: 'qxt-presets' }, ...[25, 50, 100].map(pc => h('button', { type: 'button', onclick: () => { amount.value = formatUnits(bal * BigInt(pc) / 100n, st.decimals, st.decimals).replace(/,/g, ''); } }, pc + '%')));
  const go = h('button', { type: 'button', class: 'workspace-button', disabled: !me }, 'Place TP/SL');
  go.addEventListener('click', () => act(go, status, async s => {
    const a = parseUnits(amount.value, st.decimals), t = pctOf(tp), s2 = pctOf(sl);
    if (a === 0n || a > bal) throw new TypeError('Enter an amount you hold');
    if (!t && !s2) throw new TypeError('Set a take-profit, a stop, or both');
    if (s2 && s2 >= 100) throw new TypeError('A stop must be under 100%');
    await place(a, t, s2, Number(floor.value), Number(tip.value), s);
  }));
  parts.push(h('div', { class: 'qtx-row' }, h('label', {}, h('span', {}, 'Sell (' + st.symbol + ', you hold ' + formatUnits(bal, st.decimals, 2) + ')'), amount)), presets,
    h('div', { class: 'qtx-row' }, h('label', {}, h('span', {}, 'Take profit, % up'), tp), h('label', {}, h('span', {}, 'Stop, % down'), sl)),
    h('div', { class: 'qtx-row' }, h('label', {}, h('span', {}, 'Floor below trigger'), floor), h('label', {}, h('span', {}, 'Tip to executor'), tip)),
    summary, go, h('label', { class: 'qts-auto' }, auto, h('span', {}, 'After each buy here, set this TP/SL on what I bought')));
  // Your orders on this launch, and anyone's that are ready to execute.
  const mine = me ? uintArray(await ethCall(st.chainId, st.address, calldata(SEL.ordersBy, ['address'], [me]))).slice(-20) : [];
  const ofPool = uintArray(await ethCall(st.chainId, st.address, calldata(SEL.ordersOf, ['bytes32'], [poolId(st.key)]))).slice(-30);
  const orders = await Promise.all([...new Set([...mine, ...ofPool])].map(readOrder));
  const here = o => [o.key.currency0, o.key.currency1].includes(st.token);
  const own = orders.filter(o => o.maker === me && here(o) && o.state !== 0).sort((a, b) => Number(b.id - a.id));
  const ready = orders.filter(o => o.maker !== me && [2, 3, 4, 5].includes(o.state));
  const row = o => {
    const trig = (s, sign) => s ? sign + fmtP(priceAt(s)) : '—';
    const out = [h('span', {}, h('b', {}, formatUnits(o.amountIn, st.decimals, 2) + ' ' + st.symbol), ' · TP ' + trig(o.tp, '') + ' · Stop ' + trig(o.stop, '')), h('span', { class: 'qtx-state' }, STATE[o.state])];
    const btns = [];
    if ([2, 3, 4, 5].includes(o.state)) { const b = h('button', { type: 'button', class: 'qtx-mini' }, o.maker === me ? 'Execute now' : 'Execute (earn ' + (o.tipBps / 100) + '%)'); b.addEventListener('click', () => act(b, status, s => run(o, s))); btns.push(b); }
    if (o.maker === me || o.state === 6) { const b = h('button', { type: 'button', class: 'qtx-mini' }, o.maker === me ? 'Cancel' : 'Return to owner'); b.addEventListener('click', () => act(b, status, s => send(st.chainId, { to: st.address, data: calldata(SEL.cancel, ['uint256'], [o.id]) }, s))); btns.push(b); }
    return h('li', {}, ...out, h('span', { class: 'qtx-actions' }, ...btns));
  };
  if (own.length) parts.push(h('h3', { class: 'qtx-sub' }, 'Your TP/SL orders'), h('ul', { class: 'qtx-locks' }, ...own.map(row)));
  if (ready.length) parts.push(h('h3', { class: 'qtx-sub' }, 'Ready to execute'), h('ul', { class: 'qtx-locks' }, ...ready.map(row)));
  if (!me) parts.push(h('p', { class: 'qtb-note' }, 'Connect a wallet to set a TP/SL.'));
  card.replaceChildren(...parts, status);
  card.hidden = false;
  const due = own.filter(o => [2, 3, 5].includes(o.state));
  // Tell the page once per change in which orders are due, not on every refresh.
  const dueKey = due.map(o => o.id + ':' + o.state).join(',');
  if (dueKey !== lastDue) { lastDue = dueKey; if (due.length) notify(due.length === 1 ? 'Your ' + st.symbol + ' ' + (due[0].state === 2 ? 'take-profit' : 'stop') + ' is reached. Execute it in TP/SL.' : due.length + ' of your ' + st.symbol + ' TP/SL orders are reached.'); }
}

async function show(pool) {
  const mine = ++seq; clearInterval(timer);
  if (!card || !pool?.constructor) { if (card) card.hidden = true; return; }
  try {
    const c = pool.constructor, quote = c.quote, token = c.currency0 === quote ? c.currency1 : c.currency0;
    const [key, t, q, address] = await Promise.all([livePoolKey(pool.chainId, pool.controller), erc20(pool.chainId, token), erc20(pool.chainId, quote), extraAddress('triggerOrders')]);
    if (mine !== seq) return;
    st = { chainId: pool.chainId, key, token, quote, tokenIs0: key.currency0 === token, symbol: t.symbol, decimals: t.decimals, quoteSymbol: q.symbol, quoteDecimals: q.decimals, address };
    await render();
    timer = setInterval(() => { if (!document.hidden && !card.contains(document.activeElement)) render().catch(() => {}); }, 20000);
  } catch { if (mine === seq) card.hidden = true; }
}

/// Called by the terminal after a buy: sets the saved TP/SL on what was just bought, if that is switched on.
export async function afterBuy(amount, onStatus) {
  if (!st || !pref('auto') || amount <= 0n || !(await isLive(st.chainId, 'triggerOrders'))) return false;
  const tp = Number(pref('tp')) || null, sl = Number(pref('sl')) || null;
  if (!tp && !sl) return false;
  await place(amount, tp, sl && sl < 100 ? sl : null, Number(pref('floor') || 500), Number(pref('tip') || 30), onStatus);
  await render();
  return true;
}
export function onReached(cb) { notify = cb; }

document.addEventListener('qhooks:pool', e => show(e.detail));
if (window.__qhooksPool) show(window.__qhooksPool);
onWalletChange(() => { if (st) render().catch(() => {}); });
document.addEventListener('qhooks:traded', () => { if (st) render().catch(() => {}); });
