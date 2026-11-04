// Trade page: buy the selected pool's token with the chain's native coin in one transaction.
// On USDC-quoted chains the route is native → USDC → token through Uniswap v4, using whichever
// native/USDC fee tier quotes best for this amount; on WETH/WBNB-quoted chains the router wraps first.
// Quotes run through the real pool and its hook, so block charges are included.
import { rpc, livePoolKey, parseUnits, formatUnits, erc20, send, connectedAddress, onWalletChange, NATIVE, h } from '/qx-chain.mjs';
import { nativeRoute, quoteNative, nativeSwapCall } from '/qx-swap.mjs';

const card = document.getElementById('qtz');
let state = null, seq = 0, qseq = 0;

const quote = amountIn => quoteNative(state.chainId, state.key, state.token, state.quoteToken, amountIn, state.symbol);
const swapCall = (amountIn, minOut, q, now) => nativeSwapCall(state.chainId, state.key, state.token, state.quoteToken, amountIn, minOut, q, now + 1200n);

function render() {
  const nat = NATIVE[state.chainId];
  const amount = h('input', { type: 'text', inputMode: 'decimal', placeholder: '0.0', ariaLabel: 'Amount of ' + nat, autocomplete: 'off' });
  const slip = h('select', { ariaLabel: 'Price tolerance' }, ...[['50', '0.5%'], ['100', '1%'], ['300', '3%']].map(([v, t]) => h('option', { value: v, selected: v === '100' }, t)));
  const out = h('p', { class: 'qtz-out' }, 'Enter an amount to see what you get.');
  const status = h('p', { class: 'qtx-status', role: 'status', ariaLive: 'polite' });
  const buyBtn = h('button', { type: 'button', class: 'workspace-button', disabled: true }, 'Buy with ' + nat);
  let current = null, timer;
  const refresh = () => {
    clearTimeout(timer); current = null; buyBtn.disabled = true;
    timer = setTimeout(async () => {
      const mine = ++qseq; let amountIn;
      try { amountIn = parseUnits(amount.value, 18); if (amountIn === 0n) throw 0; } catch { out.textContent = 'Enter an amount to see what you get.'; return; }
      out.textContent = 'Finding the best route…';
      try {
        const q = await quote(amountIn); if (mine !== qseq) return;
        const minOut = q.out * (10000n - BigInt(slip.value)) / 10000n;
        current = { amountIn, minOut, q };
        out.replaceChildren(h('b', {}, '≈ ' + formatUnits(q.out, state.decimals, 4) + ' ' + state.symbol), h('span', {}, q.label + ' · at least ' + formatUnits(minOut, state.decimals, 4) + ' after tolerance'));
        buyBtn.disabled = !connectedAddress();
        if (!connectedAddress()) status.textContent = 'Connect your wallet in the panel above to buy.';
      } catch (e) { if (mine === qseq) out.textContent = e.message || 'No quote for this amount'; }
    }, 350);
  };
  amount.addEventListener('input', refresh); slip.addEventListener('change', refresh);
  buyBtn.addEventListener('click', async () => {
    if (!current) return; buyBtn.disabled = true; status.textContent = '';
    try {
      const me = connectedAddress(), before = (await erc20(state.chainId, state.token, me)).balance;
      // The deadline follows the chain's clock, not this device's.
      const now = BigInt((await rpc(state.chainId, 'eth_getBlockByNumber', ['latest', false])).timestamp);
      await send(state.chainId, { to: state.route.router, data: swapCall(current.amountIn, current.minOut, current.q, now), value: current.amountIn }, t => status.textContent = t);
      const after = (await erc20(state.chainId, state.token, me)).balance;
      status.textContent = 'Bought ' + formatUnits(after - before, state.decimals, 4) + ' ' + state.symbol + '.';
      amount.value = ''; refresh();
    } catch (e) { status.textContent = e.message || 'The buy did not go through'; buyBtn.disabled = false; }
  });
  card.replaceChildren(
    h('h2', { id: 'qtz-heading' }, 'Buy with ' + nat),
    h('p', { class: 'qtb-note' }, 'One transaction, no ' + (state.route.stock ? 'stock' : state.route.wrap ? 'wrapping' : 'USDC') + ' needed first. The quote runs through this pool and its blocks, so every charge is included.'),
    h('div', { class: 'qtx-row' }, h('label', {}, h('span', {}, 'You pay (' + nat + ')'), amount), h('label', {}, h('span', {}, 'Tolerance'), slip)),
    out, buyBtn, status);
  card.hidden = false;
}

async function show(pool) {
  const mine = ++seq;
  if (!card || !pool?.constructor) { if (card) card.hidden = true; return; }
  try {
    const c = pool.constructor, quoteToken = c.quote, token = c.currency0 === quoteToken ? c.currency1 : c.currency0;
    const route = nativeRoute(pool.chainId, quoteToken);
    if (!route) { card.hidden = true; return; }
    const [key, meta] = await Promise.all([livePoolKey(pool.chainId, pool.controller), erc20(pool.chainId, token)]);
    if (mine !== seq) return;
    state = { chainId: pool.chainId, route, key, token, quoteToken, symbol: meta.symbol || pool.tokenFields?.symbol || 'token', decimals: meta.decimals };
    render();
  } catch { if (mine === seq) card.hidden = true; }
}

document.addEventListener('qhooks:pool', e => show(e.detail));
if (window.__qhooksPool) show(window.__qhooksPool);
onWalletChange(() => { if (state) render(); });
