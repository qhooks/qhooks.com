// Trade page / terminal: one panel per builder-marketplace module this launch pays (market-modules.mjs). Each panel
// shows who built the module, what share of the launch's income it gets and what its builder keeps, lets anyone open
// (deploy) it at its fixed address, pay out what the launch holds, and pay the builder; then the module's own controls.
// Staking modules are driven by the Staking tab (qx-trade-staking.mjs); this panel links there.
import { calldata, ethCall, codeAt, words, toAddress, parseUnits, formatUnits, erc20, send, ensureAllowance, connectedAddress, onWalletChange, rpc, h } from '/qx-chain.mjs';
import { BLOCK_FIELDS } from '/full-launch/packages/multichain-launch/launch-blocks.mjs';
import { modulesAmong, moduleDeployData, MODULE_DEPLOYER, loadModules } from '/full-launch/packages/multichain-launch/market-modules.mjs';

const BLK = { config: '0x79502c55', release: '0x86d1a69f', creatorQuote: '0xe55e1ce9', creatorToken: '0x483a5f14' };
const card = document.getElementById('qtm');
let state = null, seq = 0;
const ZERO = '0x' + '0'.repeat(40);

async function act(btn, status, fn) {
  btn.disabled = true; status.textContent = '';
  let last = ''; const slug = btn.closest('[data-module]')?.dataset.module;
  try {
    await fn(t => { last = t; status.textContent = t; });
    await render();
    const fresh = card.querySelector(`[data-module="${slug}"] .qtx-status`);
    if (fresh) fresh.textContent = /…$/.test(last) ? 'Done.' : last || 'Done.';
  } catch (e) { status.textContent = e.message || 'That did not go through'; btn.disabled = false; }
}
const cell = (k, v) => h('div', {}, h('span', {}, k), h('b', {}, v));
const grid = (...cells) => { const g = h('div', { class: 'qtb-now' }, ...cells.filter(Boolean)); g.style.gridTemplateColumns = 'repeat(auto-fit,minmax(120px,1fr))'; return g; };
const btn = (label, disabled) => h('button', { type: 'button', class: 'qtx-mini', disabled: !!disabled }, label);
// Small amounts keep three significant digits instead of rounding to 0 (launch income in ETH is often tiny).
function amount(n, decimals, min) {
  n = BigInt(n); if (n === 0n) return '0';
  for (let d = min; d <= decimals; d++) if (formatUnits(n, decimals, d) !== '0') return formatUnits(n, decimals, Math.min(decimals, d + (d > min ? 2 : 0)));
  return formatUnits(n, decimals, decimals);
}
const pct = bps => (Number(bps) / 100).toString() + '%';
const sel = (m, name) => m.selectors[name];
const call = (m, addr, name, types = [], values = []) => ethCall(state.chainId, addr, calldata(sel(m, name), types, values));
const left = s => { s = Math.max(0, Number(s)); const hr = Math.floor(s / 3600), mn = Math.floor((s % 3600) / 60); return hr ? hr + 'h ' + mn + 'm' : mn + 'm'; };

async function panel(found) {
  const { module: m, address: a, index } = found, { chainId, token, quote, blocks, shares, t, q } = state, me = connectedAddress();
  const fmtT = n => amount(n, t.decimals, 2) + ' ' + t.symbol, fmtQ = n => amount(n, q.decimals, 4) + ' ' + q.symbol;
  const both = (x, y) => [y && fmtQ(y), x && fmtT(x)].filter(Boolean).join(' + ') || 'nothing yet';
  const status = h('p', { class: 'qtx-status', role: 'status', ariaLive: 'polite' });
  const live = (await codeAt(chainId, a)) !== '0x';
  const head = [h('h3', { class: 'qtm-name' }, m.name), m.status === 'paused' ? h('p', { class: 'qtb-note qtm-paused' }, 'QHooks has paused this module: it is no longer offered to new launches. It keeps working here; read the review note before depositing.') : null,
    h('p', { class: 'qtb-note' }, m.summary),
    h('p', { class: 'qtx-meta' }, 'Built by ' + m.builderName + ' · gets ' + pct(shares[index]) + ' of this launch\'s income · ' + (m.builderBps ? 'builder keeps ' + pct(m.builderBps) + ' of that' : 'no builder share') + ' · ',
      h('a', { href: '/builders#modules' }, 'reviewed module'))];
  const [cq, ct] = (await Promise.all([ethCall(chainId, blocks, BLK.creatorQuote), ethCall(chainId, blocks, BLK.creatorToken)])).map(BigInt);
  const waitQ = cq * BigInt(shares[index]) / 10000n, waitT = ct * BigInt(shares[index]) / 10000n;
  const payBtn = btn('Pay out', !me || (!cq && !ct && !live));
  payBtn.addEventListener('click', () => act(payBtn, status, async s => {
    // Read again: another panel (or anyone) may have paid the launch out since this one was drawn; release() reverts on nothing.
    const [nq, nt] = (await Promise.all([ethCall(chainId, blocks, BLK.creatorQuote), ethCall(chainId, blocks, BLK.creatorToken)])).map(BigInt);
    if (nq || nt) { s('Confirm the payout in your wallet…'); await send(chainId, { to: blocks, data: BLK.release }, s); }
    if ((await codeAt(chainId, a)) !== '0x') { s('Confirm in your wallet: the module counts what arrived…'); await send(chainId, { to: a, data: sel(m, 'sync') }, s); }
    s('Paid out.');
  }));
  const waiting = waitQ || waitT ? h('div', { class: 'qtx-actions' }, h('span', { class: 'qtx-meta' }, 'Waiting in the launch for this module: ' + both(waitT, waitQ)), payBtn) : null;
  if (!live) {
    const open = h('button', { type: 'button', class: 'workspace-button', disabled: !me }, 'Open ' + m.name.toLowerCase());
    open.addEventListener('click', () => act(open, status, async s => {
      s('Confirm in your wallet: this deploys the module for ' + t.symbol + ' at its fixed address (one time, anyone can do it)…');
      await send(chainId, { to: MODULE_DEPLOYER, data: moduleDeployData(m, token, quote) }, s);
      if ((await codeAt(chainId, a)) === '0x') throw new Error('The module did not deploy');
      s(m.name + ' is open.');
    }));
    return h('div', { class: 'qtm-mod', 'data-module': m.slug }, ...head.filter(Boolean), h('p', { class: 'qtb-note' }, 'Not opened for this launch yet. Income for it is kept at its address until it is.'), waiting, open, status);
  }
  const [inc, owed, paid, pending] = await Promise.all([
    Promise.all([0n, 1n].map(i => call(m, a, 'income', ['uint256'], [i]).then(BigInt))),
    Promise.all([0n, 1n].map(i => call(m, a, 'builderOwed', ['uint256'], [i]).then(BigInt))),
    Promise.all([0n, 1n].map(i => call(m, a, 'builderPaid', ['uint256'], [i]).then(BigInt))),
    call(m, a, 'builderPending').then(words)]);
  const builderRow = m.builderBps ? (() => {
    const pay = btn('Pay builder', !me || (!pending[0] && !pending[1]));
    pay.addEventListener('click', () => act(pay, status, async s => { s('Confirm in your wallet: pays the builder what it is owed…'); await send(chainId, { to: a, data: sel(m, 'claimBuilder') }, s); s('Builder paid.'); }));
    return h('div', { class: 'qtx-actions' }, h('span', { class: 'qtx-meta' }, 'Owed to ' + m.builderName + ': ' + both(pending[0], pending[1])), pay);
  })() : null;
  const stats = grid(cell('Received', both(inc[0], inc[1])), m.builderBps ? cell('Builder earned', both(owed[0] + paid[0], owed[1] + paid[1])) : null);
  let body = [];
  if (m.panel === 'stake') {
    const go = btn('Open the Staking tab');
    go.addEventListener('click', () => document.querySelector('#qxt-tool-tabs [data-tool="qtz"]')?.click() || document.getElementById('qtz')?.scrollIntoView({ block: 'start' }));
    body = [h('div', { class: 'qtx-actions' }, go)];
  } else if (m.panel === 'raffle') body = await raffle(m, a, status, fmtT, fmtQ, both);
  return h('div', { class: 'qtm-mod', 'data-module': m.slug }, ...head.filter(Boolean), stats, ...body, waiting, builderRow, status);
}

async function raffle(m, a, status, fmtT, fmtQ, both) {
  const { chainId, token, t } = state, me = connectedAddress();
  const [round, start, prize, pend] = await Promise.all([call(m, a, 'currentRound').then(BigInt), call(m, a, 'start').then(BigInt), call(m, a, 'nextPrize').then(words), call(m, a, 'pendingDraw').then(words)]);
  const now = BigInt((await rpc(chainId, 'eth_getBlockByNumber', ['latest', false]))?.timestamp || Math.floor(Date.now() / 1000)), end = start + (round + 1n) * 86400n;
  const [weight] = words(await call(m, a, 'rounds', ['uint256'], [round]));
  const entries = BigInt(await call(m, a, 'entries', ['uint256'], [round]));
  const out = [grid(cell('Pot', both(prize[0], prize[1])), cell('Round ' + (round + 1n), left(end - now) + ' left'), cell('Entries', entries.toString()))];
  if (me) {
    const [dep, tix, wonW, bal] = await Promise.all([
      call(m, a, 'deposits', ['uint256', 'address'], [round, me]).then(BigInt), call(m, a, 'tickets', ['uint256', 'address'], [round, me]).then(BigInt),
      call(m, a, 'won', ['address'], [me]).then(words), erc20(chainId, token, me).then(x => x.balance)]);
    const chance = weight ? (Number(tix * 10000n / weight) / 100).toString() + '%' : '0%';
    out.push(h('p', { class: 'qtb-note' }, 'You hold ' + fmtT(bal) + '. ' + (dep ? 'In this round: ' + fmtT(dep) + ', a ' + chance + ' chance so far.' : 'Deposit ' + t.symbol + ' to enter this round; it comes back after the round ends. Tickets are tokens × time left, so enter early.')));
    const amount = h('input', { type: 'text', inputMode: 'decimal', placeholder: '0.0', autocomplete: 'off', ariaLabel: 'Amount to enter', class: 'qtx-mini-input' });
    const enter = btn('Enter', bal === 0n);
    enter.addEventListener('click', () => act(enter, status, async s => {
      const amt = parseUnits(amount.value || '0', t.decimals); if (amt === 0n || amt > bal) throw new TypeError('Enter an amount you hold');
      await ensureAllowance(chainId, token, a, amt, s);
      s('Confirm the entry in your wallet…'); await send(chainId, { to: a, data: calldata(sel(m, 'enter'), ['uint256'], [amt]) }, s); s('Entered.');
    }));
    const row = [amount, enter];
    if (wonW[0] || wonW[1]) {
      const claim = btn('Claim ' + both(wonW[0], wonW[1]));
      claim.addEventListener('click', () => act(claim, status, async s => { s('Confirm the claim in your wallet…'); await send(chainId, { to: a, data: sel(m, 'claim') }, s); s('Claimed.'); }));
      row.push(claim);
    }
    // Deposits in ended rounds (the last week) come back with Withdraw.
    const past = [];
    for (let r = round - 1n; r >= 0n && r >= round - 7n; r--) past.push(r);
    const deps = await Promise.all(past.map(r => call(m, a, 'deposits', ['uint256', 'address'], [r, me]).then(BigInt)));
    past.forEach((r, i) => { if (!deps[i]) return; const w = btn('Withdraw ' + fmtT(deps[i]));
      w.addEventListener('click', () => act(w, status, async s => { s('Confirm in your wallet…'); await send(chainId, { to: a, data: calldata(sel(m, 'withdraw'), ['uint256'], [r]) }, s); s('Withdrawn.'); }));
      row.push(w); });
    out.push(h('div', { class: 'qtx-actions' }, ...row));
  }
  if (pend[0] && pend[1] < round) {
    const drawRound = pend[1], armed = pend[2];
    const draw = btn('Draw round ' + (drawRound + 1n), !me);
    draw.addEventListener('click', () => act(draw, status, async s => {
      // Two steps: the first call picks a draw block a few blocks ahead, the second (after it) draws with its hash.
      let [, , at] = words(await call(m, a, 'pendingDraw'));
      if (!at) { s('Confirm in your wallet: step 1 of 2 picks the draw block…'); await send(chainId, { to: a, data: sel(m, 'draw') }, s); [, , at] = words(await call(m, a, 'pendingDraw')); }
      for (let i = 0; i < 90 && BigInt(await rpc(chainId, 'eth_blockNumber', [])) <= at; i++) { s('Waiting for the draw block…'); await new Promise(r => setTimeout(r, 2000)); }
      s('Confirm in your wallet: step 2 of 2 draws the winner…'); await send(chainId, { to: a, data: sel(m, 'draw') }, s);
      const [, , , winner] = words(await call(m, a, 'rounds', ['uint256'], [drawRound]));
      s('Drawn: ' + (toAddress(winner) === String(me).toLowerCase() ? 'you won!' : 'the winner is ' + toAddress(winner).slice(0, 6) + '…' + toAddress(winner).slice(-4) + '.'));
    }));
    out.push(h('div', { class: 'qtx-actions' }, h('span', { class: 'qtx-meta' }, 'Round ' + (drawRound + 1n) + ' has ended' + (armed ? ' and its draw block is picked' : '') + '. Anyone can draw it: two transactions, a few blocks apart.'), draw));
  }
  return out;
}

async function render() {
  const panels = [];
  for (const f of state.found) { try { panels.push(await panel(f)); } catch (e) { panels.push(h('div', { class: 'qtm-mod' }, h('h3', { class: 'qtm-name' }, f.module.name), h('p', { class: 'qtb-note' }, 'Could not read this module right now.'))); } }
  card.replaceChildren(h('h2', { id: 'qtm-heading' }, state.found.length > 1 ? 'Modules' : 'Module'),
    h('p', { class: 'qtb-note' }, 'Reviewed marketplace modules this launch pays. Each is an ownerless contract at a fixed address; its builder\'s share is set in its code.'), ...panels);
  card.hidden = false;
}

async function show(pool) {
  const mine = ++seq;
  const c = pool?.constructor, blocks = c?.blocks;
  if (!card || !blocks || BigInt(blocks) === 0n) { if (card) card.hidden = true; return; }
  try {
    await loadModules();
    const w = words(await ethCall(pool.chainId, blocks, BLK.config));
    const token = toAddress(w[BLOCK_FIELDS.findIndex(([k]) => k === 'token')]), quote = toAddress(w[BLOCK_FIELDS.findIndex(([k]) => k === 'quote')]);
    const payees = w.slice(BLOCK_FIELDS.length, BLOCK_FIELDS.length + 8).map(toAddress).filter(x => x !== ZERO), shares = w.slice(BLOCK_FIELDS.length + 8, BLOCK_FIELDS.length + 16);
    const found = modulesAmong(payees, token, quote);
    if (!found.length) { if (mine === seq) card.hidden = true; return; }
    const [t, q] = await Promise.all([erc20(pool.chainId, token), erc20(pool.chainId, quote)]);
    if (mine !== seq) return;
    state = { chainId: pool.chainId, token, quote, blocks, shares, t, q, found };
    await render();
  } catch { if (mine === seq) card.hidden = true; }
}

document.addEventListener('qhooks:pool', e => show(e.detail));
if (window.__qhooksPool) show(window.__qhooksPool);
onWalletChange(() => { if (state) render().catch(() => {}); });
