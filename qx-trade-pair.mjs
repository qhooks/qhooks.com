// Trade page: the launch's second pool, token / native ETH, run by a QPairHook that applies the
// launch's own blocks. Its address follows from the launch (salt = engine ++ counter), so the page
// finds it without a registry. The creator opens and seeds it once; its liquidity is permanent.
import { abi, calldata, ethCall, rpc, codeAt, words, toAddress, keyTuple, KEY_T, parseUnits, formatUnits, erc20, send, ensureAllowance,
  connectedAddress, onWalletChange, sqrtBig, MANAGER, QUOTER, h } from '/qx-chain.mjs';
import { extras } from '/qx-extras.mjs';
import { keccak_256 } from '/full-launch/prototypes/qpools/client/vendor/hashes/sha3.js';

const Z = '0x0000000000000000000000000000000000000000';
// Chains where the launch quote is USDC, so an ETH pair adds a real second market.
const ROUTER = { '8453': '0x6ff5693b99212da76ad316178a184ab56d299b43', '1': '0x66a9893cc07d91d95644aedd05d03f95e1dba8af', '42161': '0x96b2fd2f80e9428daa65d859653117d453981ab4' };
const USDC = { '8453': '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', '1': '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', '42161': '0xaf88d065e77c8cc2239327c5edb3a432268e5831' };
const PERMIT2 = '0x000000000022d473030f116ddee9f6b43ac78ba3';
const FEE = 3000, SPACING = 60, Q96 = 1n << 96n;
const SEL = { seeded: '0x334041a6', charges: '0xe00cda26', release: '0x86d1a69f', collect: '0xe5225381', seed: '0x168eb640', owner: '0x8da5cb5b' };
const card = document.getElementById('qtp');
let state = null, seq = 0;

const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
const bytes = s => Uint8Array.from((s.replace(/^0x/, '').match(/../g) || []).map(x => parseInt(x, 16)));

/// The pair hook's CREATE2 address: the first counter after the engine whose address carries the hook flags.
async function pairAddress(chainId, engine) {
  const a = await extras(), init = a.pairHook.creationCode + abi(['address', 'address', 'address', 'uint24', 'int24'], [MANAGER[chainId], engine, Z, FEE, SPACING]).slice(2);
  const initHash = keccak_256(bytes(init)), prefix = bytes('ff' + a.deployer.slice(2)), buf = new Uint8Array(85);
  buf.set(prefix, 0); buf.set(bytes(engine), 21); buf.set(initHash, 53);
  for (let i = 0; i < 2_000_000; i++) {
    let n = i; for (let j = 52; j >= 41; j--) { buf[j] = n & 0xff; n = Math.floor(n / 256); }
    const out = keccak_256(buf);
    if ((((out[30] & 0x3f) << 8) | out[31]) === 10956) return { address: '0x' + hex(out.slice(12)), salt: '0x' + hex(buf.slice(21, 53)), init };
  }
  throw new Error('No pair address found');
}

async function act(btn, status, fn) {
  btn.disabled = true; status.textContent = ''; let last = '';
  try { await fn(t => { last = t; status.textContent = t; }); await render(); const s = card.querySelector('.qtx-status'); if (s) s.textContent = /…$/.test(last) ? 'Done.' : last || 'Done.'; }
  catch (e) { status.textContent = e.message || 'That did not go through'; btn.disabled = false; }
}

const pairKey = () => ({ currency0: Z, currency1: state.token, fee: FEE, tickSpacing: SPACING, hooks: state.pair.address });
async function quotePair(zeroForOne, amountIn) {
  const r = await ethCall(state.chainId, QUOTER[state.chainId], calldata('0xaa9d21cb', [`(${KEY_T},bool,uint128,bytes)`], [[keyTuple(pairKey()), zeroForOne, amountIn, '0x']]), connectedAddress() || undefined);
  return BigInt(r.slice(0, 66));
}

async function render() {
  const { chainId, token, engine, symbol, decimals, creator } = state, me = connectedAddress();
  const status = h('p', { class: 'qtx-status', role: 'status', ariaLive: 'polite' });
  const head = [h('h2', { id: 'qtp-heading' }, symbol + ' / ETH pool')];
  const live = (await codeAt(chainId, state.pair.address)) !== '0x' && BigInt(await ethCall(chainId, state.pair.address, SEL.seeded)) === 1n;
  if (!live) {
    if (me !== creator) { card.hidden = true; return; }
    const tAmt = h('input', { type: 'text', inputMode: 'decimal', placeholder: '0.0', ariaLabel: 'Tokens to pool', autocomplete: 'off' });
    const eAmt = h('input', { type: 'text', inputMode: 'decimal', placeholder: '0.0', ariaLabel: 'ETH to pool', autocomplete: 'off' });
    const hint = h('p', { class: 'qtb-note' });
    // Suggest the ETH side at the launch pool's current price.
    const suggest = async () => {
      try {
        const tk = parseUnits(tAmt.value, decimals); if (!tk) return;
        const usdPerToken = await state.spotUsd(), usdPerEth = await state.ethUsd();
        if (usdPerToken && usdPerEth) {
          const eth = tk * usdPerToken * 10n ** 18n / (10n ** BigInt(decimals) * usdPerEth);
          eAmt.value = formatUnits(eth, 18, 8).replace(/,/g, '');
          hint.textContent = 'Matched to the launch pool: ' + formatUnits(usdPerToken, 6, 6) + ' USDC per ' + symbol + ', ' + formatUnits(usdPerEth, 6, 2) + ' USDC per ETH.';
        }
      } catch {}
    };
    tAmt.addEventListener('change', suggest);
    const open = h('button', { type: 'button', class: 'workspace-button' }, 'Open the ' + symbol + ' / ETH pool');
    open.addEventListener('click', () => act(open, status, async s => {
      const tk = parseUnits(tAmt.value, decimals), eth = parseUnits(eAmt.value, 18);
      if (!tk || !eth) throw new TypeError('Enter both amounts');
      if ((await codeAt(chainId, state.pair.address)) === '0x') {
        s('Deploy the pool hook in your wallet…');
        await send(chainId, { to: (await extras()).deployer, data: state.pair.salt + state.pair.init.slice(2) }, s);
      }
      await ensureAllowance(chainId, token, state.pair.address, tk, s);
      // ETH is currency0 (address zero sorts first); the price is tokens per ETH in base units.
      const sqrtP = sqrtBig((tk << 192n) / eth);
      const L0 = eth * sqrtP / Q96, L1 = tk * Q96 / sqrtP, L = (L0 < L1 ? L0 : L1) * 999n / 1000n;
      s('Seed the pool in your wallet…');
      await send(chainId, { to: state.pair.address, data: calldata(SEL.seed, ['uint160', 'uint128', 'uint256', 'uint256'], [sqrtP, L, tk, eth]), value: eth }, s);
      s('Pool open.');
    }));
    card.replaceChildren(...head,
      h('p', { class: 'qtb-note' }, 'Open a second market for ' + symbol + ' against ETH. It runs this launch’s blocks: the same charges, guards and burns, paid to the same payees. The liquidity you add here can never be withdrawn; you collect its LP fees.'),
      h('div', { class: 'qtx-row' }, h('label', {}, h('span', {}, symbol + ' to pool'), tAmt), h('label', {}, h('span', {}, 'ETH to pool'), eAmt)), hint, open, status);
    card.hidden = false; return;
  }
  const [charges, ethBal, tokBal, spot] = await Promise.all([
    ethCall(chainId, state.pair.address, SEL.charges).then(BigInt),
    me ? rpc(chainId, 'eth_getBalance', [me, 'latest']).then(BigInt) : 0n,
    me ? erc20(chainId, token, me).then(x => x.balance) : 0n,
    quotePair(false, 10n ** BigInt(decimals)).catch(() => null)]);
  const side = h('select', { ariaLabel: 'Pair side' }, h('option', { value: 'buy' }, 'Buy ' + symbol + ' with ETH'), h('option', { value: 'sell' }, 'Sell ' + symbol + ' for ETH'));
  const amt = h('input', { type: 'text', inputMode: 'decimal', placeholder: '0.0', autocomplete: 'off', ariaLabel: 'Pair amount' });
  const out = h('p', { class: 'qtz-out' }, 'Enter an amount.');
  const go = h('button', { type: 'button', class: 'workspace-button', disabled: true }, 'Trade');
  let current = null, t;
  const refresh = () => { clearTimeout(t); current = null; go.disabled = true; t = setTimeout(async () => {
    try {
      const isBuy = side.value === 'buy', a = parseUnits(amt.value, isBuy ? 18 : decimals); if (!a) return;
      const q = await quotePair(isBuy, a), minOut = q * 99n / 100n;
      current = { isBuy, a, minOut };
      out.replaceChildren(h('b', {}, '≈ ' + formatUnits(q, isBuy ? decimals : 18, 6) + ' ' + (isBuy ? symbol : 'ETH')), h('span', {}, 'At least ' + formatUnits(minOut, isBuy ? decimals : 18, 6) + ' with 1% tolerance. Block charges included.'));
      go.disabled = !me;
    } catch (e) { out.textContent = /holders only|not open/.test(e.message) ? 'Buying here opens with the launch.' : 'No quote for this amount.'; }
  }, 350); };
  amt.addEventListener('input', refresh); side.addEventListener('change', refresh);
  go.addEventListener('click', () => act(go, status, async s => {
    const { isBuy, a, minOut } = current, router = ROUTER[chainId];
    const now = BigInt((await rpc(chainId, 'eth_getBlockByNumber', ['latest', false])).timestamp);
    const single = abi([`(${KEY_T},bool,uint128,uint128,bytes)`], [[keyTuple(pairKey()), isBuy, a, minOut, '0x']]);
    const [cin, cout] = isBuy ? [Z, token] : [token, Z];
    const v4 = abi(['bytes', 'bytes[]'], ['0x060c0f', [single, abi(['address', 'uint256'], [cin, a]), abi(['address', 'uint256'], [cout, minOut])]]);
    if (!isBuy) {
      await ensureAllowance(chainId, token, PERMIT2, a, s);
      const allowed = words(await ethCall(chainId, PERMIT2, calldata('0x927da105', ['address', 'address', 'address'], [me, token, router])));
      if (allowed[0] < a || Number(allowed[1]) < Number(now) + 600) { s('Allow the router in your wallet…'); await send(chainId, { to: PERMIT2, data: calldata('0x87517c45', ['address', 'address', 'uint160', 'uint48'], [token, router, a, now + 3600n]) }, s); }
    }
    await send(chainId, { to: router, data: calldata('0x3593564c', ['bytes', 'bytes[]', 'uint256'], ['0x10', [v4], now + 1200n]), value: isBuy ? a : 0n }, s);
    s('Traded.'); amt.value = '';
  }));
  const extra = [];
  if (charges) { const b = h('button', { type: 'button', class: 'qtx-mini' }, 'Pay ' + formatUnits(charges, decimals, 2) + ' ' + symbol + ' in charges to payees'); b.addEventListener('click', () => act(b, status, s => send(chainId, { to: state.pair.address, data: SEL.release }, s))); extra.push(b); }
  { const b = h('button', { type: 'button', class: 'qtx-mini' }, 'Collect LP fees for the creator'); b.addEventListener('click', () => act(b, status, s => send(chainId, { to: state.pair.address, data: SEL.collect }, s))); extra.push(b); }
  card.replaceChildren(...head,
    h('p', { class: 'qtb-note' }, 'A second market for ' + symbol + ' against ETH, running this launch’s blocks. Its liquidity is permanent.' + (spot ? ' Selling one ' + symbol + ' here fetches about ' + formatUnits(spot, 18, 10) + ' ETH.' : '')),
    h('div', { class: 'qtx-row' }, h('label', {}, h('span', {}, 'Side'), side), h('label', {}, h('span', {}, 'Amount (you hold ' + formatUnits(ethBal, 18, 4) + ' ETH, ' + formatUnits(tokBal, decimals, 2) + ' ' + symbol + ')'), amt)),
    out, go, h('div', { class: 'qtx-actions' }, ...extra), status);
  card.hidden = false;
}

async function show(pool) {
  const mine = ++seq;
  const engine = pool?.constructor?.blocks;
  if (!card || !ROUTER[pool?.chainId] || !engine || BigInt(engine) === 0n || pool.constructor.quote !== USDC[pool.chainId]) { if (card) card.hidden = true; return; }
  try {
    const c = pool.constructor, token = c.currency0 === c.quote ? c.currency1 : c.currency0;
    const [t, pair, creator] = await Promise.all([erc20(pool.chainId, token), pairAddress(pool.chainId, engine), ethCall(pool.chainId, engine, SEL.owner).then(toAddress)]);
    if (mine !== seq) return;
    const chainId = pool.chainId;
    state = { chainId, token, engine, pair, creator, symbol: t.symbol || 'token', decimals: t.decimals,
      // USDC (6 decimals) per whole token from the launch pool, and per ETH from Uniswap's ETH/USDC pool.
      spotUsd: async () => { const { livePoolKey, spotQuote } = await import('/qx-chain.mjs'); return spotQuote(chainId, await livePoolKey(chainId, pool.controller), token, t.decimals); },
      ethUsd: async () => BigInt((await ethCall(chainId, QUOTER[chainId], calldata('0xaa9d21cb', [`(${KEY_T},bool,uint128,bytes)`], [[[Z, USDC[chainId], 500, 10, Z], true, 10n ** 18n, '0x']]))).slice(0, 66)) };
    await render();
  } catch { if (mine === seq) card.hidden = true; }
}

document.addEventListener('qhooks:pool', e => show(e.detail));
if (window.__qhooksPool) show(window.__qhooksPool);
onWalletChange(() => { if (state) render().catch(() => {}); });
