// Trade page: the opening auction of a launch that runs one. Deposits buy in a single batch trade at
// one price; anyone settles in the last two minutes; everyone claims their share of what it bought.
import { calldata, ethCall, rpc, words, toAddress, parseUnits, formatUnits, erc20, send, ensureAllowance, connectedAddress, onWalletChange, h } from '/qx-chain.mjs';
import { AUCTION_ADDRESS } from '/qx-block-catalog.mjs';

const SEL = { sale: '0x75df2684', depositOf: '0xd9c2ac88', deposit: '0x47e7ef24', withdraw: '0xf3fef3a3', settle: '0x6a256b29', claim: '0x1e83409a', refund: '0xfa89401a', config: '0x79502c55' };
const card = document.getElementById('qta');
let state = null, seq = 0, timer = null;

const clock = s => { s = Math.max(0, Math.floor(s)); const m = Math.floor(s / 60); return m >= 60 ? Math.floor(m / 60) + ' h ' + (m % 60) + ' min' : m + ':' + String(s % 60).padStart(2, '0'); };

async function act(btn, status, fn) {
  btn.disabled = true; status.textContent = ''; let last = '';
  try { await fn(t => { last = t; status.textContent = t; }); await render(); const s = card.querySelector('.qtx-status'); if (s) s.textContent = /…$/.test(last) ? 'Done.' : last || 'Done.'; }
  catch (e) { status.textContent = e.message || 'That did not go through'; btn.disabled = false; }
}

async function render() {
  const { chainId, engine } = state, me = connectedAddress();
  const w = words(await ethCall(chainId, AUCTION_ADDRESS, calldata(SEL.sale, ['address'], [engine])));
  const sale = { token: toAddress(w[0]), quote: toAddress(w[1]), closesAt: Number(w[2]), endsAt: Number(w[3]), totalIn: w[4], totalOut: w[5], settled: w[6] === 1n };
  const [q, t, now] = await Promise.all([erc20(chainId, sale.quote, me), erc20(chainId, sale.token), rpc(chainId, 'eth_getBlockByNumber', ['latest', false]).then(b => Number(b.timestamp))]);
  const mine = me ? BigInt(await ethCall(chainId, AUCTION_ADDRESS, calldata(SEL.depositOf, ['address', 'address'], [engine, me]))) : 0n;
  const open = now < sale.closesAt, settling = !sale.settled && now >= sale.closesAt && now < sale.endsAt, refundable = !sale.settled && now >= sale.endsAt;
  const fq = n => formatUnits(n, q.decimals, 4) + ' ' + q.symbol, ft = n => formatUnits(n, t.decimals, 4) + ' ' + t.symbol;
  const status = h('p', { class: 'qtx-status', role: 'status', ariaLive: 'polite' });
  const phase = sale.settled ? 'Settled' : open ? 'Open' : now < sale.endsAt ? 'Settling' : 'Not settled · refunds open';
  const left = open ? sale.closesAt - now : now < sale.endsAt ? sale.endsAt - now : 0;
  const stats = h('div', { class: 'qtb-now' },
    h('div', {}, h('span', {}, phase + (left ? ' · ' + (open ? 'closes in ' : 'trading opens in ') + clock(left) : '')), h('b', {}, fq(sale.totalIn))),
    h('div', {}, h('span', {}, sale.settled ? 'Price everyone paid' : 'Your deposit'),
      h('b', {}, sale.settled && sale.totalOut ? formatUnits(sale.totalIn * 10n ** BigInt(t.decimals) / sale.totalOut, q.decimals, 6) + ' ' + q.symbol : fq(mine))));
  const parts = [h('h2', { id: 'qta-heading' }, 'Opening auction'),
    h('p', { class: 'qtb-note' }, 'Until trading opens, the pool takes no direct buys. Every deposit buys in one trade at one price, block charges included; then each depositor claims their share. Anyone can settle once deposits close.'), stats];
  if (open && me) {
    const amt = h('input', { type: 'text', inputMode: 'decimal', placeholder: '0.0', autocomplete: 'off', ariaLabel: 'Deposit amount' });
    const dep = h('button', { type: 'button', class: 'workspace-button' }, 'Deposit');
    dep.addEventListener('click', () => act(dep, status, async s => {
      const a = parseUnits(amt.value, q.decimals); if (a === 0n || a > q.balance) throw new TypeError('Enter an amount you hold');
      await ensureAllowance(chainId, sale.quote, AUCTION_ADDRESS, a, s);
      s('Confirm the deposit in your wallet…');
      await send(chainId, { to: AUCTION_ADDRESS, data: calldata(SEL.deposit, ['address', 'uint256'], [engine, a]) }, s); s('Deposited.');
    }));
    parts.push(h('div', { class: 'qtx-row' }, h('label', {}, h('span', {}, 'Deposit (' + q.symbol + ', you hold ' + formatUnits(q.balance, q.decimals, 2) + ')'), amt)), dep);
    if (mine) {
      const wd = h('button', { type: 'button', class: 'qtx-mini' }, 'Take back my deposit');
      wd.addEventListener('click', () => act(wd, status, s => send(chainId, { to: AUCTION_ADDRESS, data: calldata(SEL.withdraw, ['address', 'uint256'], [engine, mine]) }, s)));
      parts.push(h('div', { class: 'qtx-actions' }, wd));
    }
  }
  const actions = [];
  if (settling && sale.totalIn && me) { const b = h('button', { type: 'button', class: 'workspace-button' }, 'Settle the auction'); b.addEventListener('click', () => act(b, status, s => send(chainId, { to: AUCTION_ADDRESS, data: calldata(SEL.settle, ['address'], [engine]) }, s))); actions.push(b); }
  if (sale.settled && mine && me) { const share = mine * sale.totalOut / sale.totalIn; const b = h('button', { type: 'button', class: 'workspace-button' }, 'Claim ' + ft(share)); b.addEventListener('click', () => act(b, status, s => send(chainId, { to: AUCTION_ADDRESS, data: calldata(SEL.claim, ['address'], [engine]) }, s))); actions.push(b); }
  if (refundable && mine && me) { const b = h('button', { type: 'button', class: 'workspace-button' }, 'Refund my deposit'); b.addEventListener('click', () => act(b, status, s => send(chainId, { to: AUCTION_ADDRESS, data: calldata(SEL.refund, ['address'], [engine]) }, s))); actions.push(b); }
  if (sale.settled) parts.push(h('p', { class: 'qtb-note' }, fq(sale.totalIn) + ' bought ' + ft(sale.totalOut) + ' in one trade.'));
  if (!me) parts.push(h('p', { class: 'qtb-note' }, 'Connect your wallet in the panel above to take part.'));
  card.replaceChildren(...parts, ...actions, status);
  card.hidden = false;
  clearTimeout(timer);
  if (!sale.settled) timer = setTimeout(() => render().catch(() => {}), left && left < 120 ? 5000 : 20000);
}

async function show(pool) {
  const mine = ++seq; clearTimeout(timer);
  const engine = pool?.constructor?.blocks;
  if (!card || !engine || BigInt(engine) === 0n) { if (card) card.hidden = true; return; }
  try {
    const w = words(await ethCall(pool.chainId, engine, SEL.config));
    if (!((w[1] >> 5n) & 1n) || toAddress(w[16]) !== AUCTION_ADDRESS) { if (mine === seq) card.hidden = true; return; }
    if (mine !== seq) return;
    state = { chainId: pool.chainId, engine };
    await render();
  } catch { if (mine === seq) card.hidden = true; }
}

document.addEventListener('qhooks:pool', e => show(e.detail));
if (window.__qhooksPool) show(window.__qhooksPool);
onWalletChange(() => { if (state) render().catch(() => {}); });
