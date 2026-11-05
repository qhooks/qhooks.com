// Trade page / terminal: holder staking for launches whose revenue split pays stakers: the marketplace staking module
// (QStakeModule, same functions) or, for launches made before the marketplace, the original QStakeVault. The launch's vault
// (one per token and pair, deterministic address) receives that share; stakers earn it, streamed over a day, in the
// token and the pair currency. Anyone can open the vault, pay out what the launch holds, and stake, unstake or claim.
import { calldata, ethCall, codeAt, words, toAddress, parseUnits, formatUnits, erc20, send, ensureAllowance, connectedAddress, onWalletChange, h } from '/qx-chain.mjs';
import { BLOCK_FIELDS } from '/full-launch/packages/multichain-launch/launch-blocks.mjs';
import { stakeVaultAddress, stakeVaultDeployData, STAKE_DEPLOYER } from '/full-launch/packages/multichain-launch/stake-vault.mjs';
import { modulesAmong, moduleDeployData, MODULE_DEPLOYER, loadModules } from '/full-launch/packages/multichain-launch/market-modules.mjs';

// Selectors of the pinned QStakeVault ABI (full-launch/extras.json, stakeVault) and the blocks contract.
const SEL = { stake: '0xa694fc3a', unstake: '0x2e17de78', claim: '0x4e71d92d', sync: '0xfff6cae9', earned: '0x008cc262', staked: '0x98807d84', totalStaked: '0x817b1cd2', stream: '0x2d94d8b5',
  config: '0x79502c55', release: '0x86d1a69f', creatorQuote: '0xe55e1ce9', creatorToken: '0x483a5f14' };
const card = document.getElementById('qtz');
let state = null, seq = 0;

async function act(btn, status, fn) {
  btn.disabled = true; status.textContent = '';
  let last = '';
  try {
    await fn(t => { last = t; status.textContent = t; });
    await render();
    const fresh = card.querySelector('.qtx-status'); if (fresh) fresh.textContent = /…$/.test(last) ? 'Done.' : last || 'Done.';
  } catch (e) { status.textContent = e.message || 'That did not go through'; btn.disabled = false; }
}
const statGrid = (...cells) => { const g = h('div', { class: 'qtb-now' }, ...cells.filter(Boolean)); if (cells.filter(Boolean).length > 2) g.style.gridTemplateColumns = 'repeat(auto-fit,minmax(120px,1fr))'; return g; };
const cell = (k, v) => h('div', {}, h('span', {}, k), h('b', {}, v));

async function render() {
  const { chainId, token, quote, vault, blocks, shareBps, t, q, supply, mod } = state, me = connectedAddress();
  const fmtT = n => formatUnits(n, t.decimals, 2) + ' ' + t.symbol, fmtQ = n => formatUnits(n, q.decimals, 4) + ' ' + q.symbol;
  const status = h('p', { class: 'qtx-status', role: 'status', ariaLive: 'polite' });
  const head = [h('h2', { id: 'qtz-heading' }, 'Staking'),
    h('p', { class: 'qtb-note' }, 'This launch pays ' + (Number(shareBps) / 100) + '% of its income to holders who stake ' + t.symbol + '. Payouts stream to stakers over a day, in ' + t.symbol + ' and ' + q.symbol + '. No lockup: unstake any time.'
      + (mod?.builderBps ? ' The module\'s builder, ' + mod.builderName + ', keeps ' + mod.builderBps / 100 + '% of what it receives.' : ''))];
  const live = (await codeAt(chainId, vault)) !== '0x';
  const [cq, ct] = (await Promise.all([ethCall(chainId, blocks, SEL.creatorQuote), ethCall(chainId, blocks, SEL.creatorToken)])).map(BigInt);
  const waitingQ = cq * shareBps / 10000n, waitingT = ct * shareBps / 10000n;
  // Payout: the launch's release() pays every payee (the vault included); the vault's sync() starts streaming it.
  const payBtn = h('button', { type: 'button', class: 'qtx-mini', disabled: !me || (!cq && !ct && !live) }, live ? 'Pay out to stakers' : 'Pay out');
  payBtn.addEventListener('click', () => act(payBtn, status, async s => {
    // Read again: another panel (or anyone) may have paid the launch out since this one was drawn; release() reverts on nothing.
    const [nq, nt] = (await Promise.all([ethCall(chainId, blocks, SEL.creatorQuote), ethCall(chainId, blocks, SEL.creatorToken)])).map(BigInt);
    if (nq || nt) { s('Confirm the payout in your wallet…'); await send(chainId, { to: blocks, data: SEL.release }, s); }
    if ((await codeAt(chainId, vault)) !== '0x') { s('Confirm the stream start in your wallet…'); await send(chainId, { to: vault, data: SEL.sync }, s); }
    s('Paid out.');
  }));
  const waiting = waitingQ || waitingT ? h('div', { class: 'qtx-actions' }, h('span', { class: 'qtx-meta' }, 'Waiting to be paid to stakers: ' + [waitingQ && fmtQ(waitingQ), waitingT && fmtT(waitingT)].filter(Boolean).join(' + ')), payBtn) : null;
  if (!live) {
    const open = h('button', { type: 'button', class: 'workspace-button', disabled: !me }, 'Open staking');
    open.addEventListener('click', () => act(open, status, async s => {
      s('Confirm in your wallet: this deploys the staking vault for ' + t.symbol + ' (one time, anyone can do it)…');
      await send(chainId, mod ? { to: MODULE_DEPLOYER, data: moduleDeployData(mod, token, quote) } : { to: STAKE_DEPLOYER, data: stakeVaultDeployData(token, quote) }, s);
      if ((await codeAt(chainId, vault)) === '0x') throw new Error('The vault did not deploy');
      s('Staking is open.');
    }));
    card.replaceChildren(...[...head, h('p', { class: 'qtb-note' }, 'Staking has not been opened for this launch yet. Income for stakers is kept at the vault address until it is.'), waiting, open, status].filter(Boolean));
    card.hidden = false; return;
  }
  const [total, mine, earned, bal] = await Promise.all([
    ethCall(chainId, vault, SEL.totalStaked).then(BigInt),
    me ? ethCall(chainId, vault, calldata(SEL.staked, ['address'], [me])).then(BigInt) : 0n,
    me ? ethCall(chainId, vault, calldata(SEL.earned, ['address'], [me])).then(words) : [0n, 0n],
    me ? erc20(chainId, token, me).then(x => x.balance) : 0n]);
  const [rq, finish] = words(await ethCall(chainId, vault, calldata(SEL.stream, ['uint256'], [1n])));
  const perDay = finish > BigInt(Math.floor(Date.now() / 1000)) ? rq * 86400n / 10n ** 18n : 0n;
  const pctOf = (n, d) => d ? (Number(n * 10000n / d) / 100).toString() + '%' : '0%';
  const stats = statGrid(cell('Staked', pctOf(total, supply) + ' of supply'), cell('Paying out', perDay ? fmtQ(perDay) + ' / day' : 'nothing right now'),
    me ? cell('Your stake', mine ? fmtT(mine) + ' (' + pctOf(mine, total) + ')' : 'none') : null);
  const rows = [];
  if (me) {
    const amount = h('input', { type: 'text', inputMode: 'decimal', placeholder: '0.0', autocomplete: 'off', ariaLabel: 'Amount to stake or unstake', class: 'qtx-mini-input' });
    const stakeBtn = h('button', { type: 'button', class: 'qtx-mini', disabled: bal === 0n }, 'Stake');
    stakeBtn.addEventListener('click', () => act(stakeBtn, status, async s => {
      const amt = parseUnits(amount.value || '0', t.decimals); if (amt === 0n || amt > bal) throw new TypeError('Enter an amount you hold');
      await ensureAllowance(chainId, token, vault, amt, s);
      s('Confirm the stake in your wallet…');
      await send(chainId, { to: vault, data: calldata(SEL.stake, ['uint256'], [amt]) }, s);
      s('Staked.');
    }));
    const unstakeBtn = h('button', { type: 'button', class: 'qtx-mini', disabled: mine === 0n }, 'Unstake');
    unstakeBtn.addEventListener('click', () => act(unstakeBtn, status, async s => {
      const amt = amount.value.trim() ? parseUnits(amount.value, t.decimals) : mine; if (amt === 0n || amt > mine) throw new TypeError('Enter up to your stake');
      s('Confirm in your wallet…');
      await send(chainId, { to: vault, data: calldata(SEL.unstake, ['uint256'], [amt]) }, s);
      s('Unstaked.');
    }));
    const claimBtn = h('button', { type: 'button', class: 'qtx-mini', disabled: !earned[0] && !earned[1] }, 'Claim');
    claimBtn.addEventListener('click', () => act(claimBtn, status, async s => { s('Confirm the claim in your wallet…'); await send(chainId, { to: vault, data: SEL.claim }, s); s('Claimed.'); }));
    rows.push(h('p', { class: 'qtb-note' }, 'You hold ' + fmtT(bal) + '. Earned so far: ' + fmtQ(earned[1]) + ' and ' + fmtT(earned[0]) + '.'),
      h('div', { class: 'qtx-actions' }, amount, stakeBtn, unstakeBtn, claimBtn));
  }
  card.replaceChildren(...[...head, stats, waiting, ...rows, status].filter(Boolean));
  card.hidden = false;
}

async function show(pool) {
  const mine = ++seq;
  const c = pool?.constructor, blocks = c?.blocks;
  if (!card || !blocks || BigInt(blocks) === 0n) { if (card) card.hidden = true; return; }
  try {
    const w = words(await ethCall(pool.chainId, blocks, SEL.config));
    const token = toAddress(w[BLOCK_FIELDS.findIndex(([k]) => k === 'token')]), quote = toAddress(w[BLOCK_FIELDS.findIndex(([k]) => k === 'quote')]);
    const payees = w.slice(BLOCK_FIELDS.length, BLOCK_FIELDS.length + 8).map(toAddress), shares = w.slice(BLOCK_FIELDS.length + 8, BLOCK_FIELDS.length + 16);
    let vault = stakeVaultAddress(token, quote), at = payees.indexOf(vault), mod = null;
    if (at < 0) { await loadModules(); const f = modulesAmong(payees, token, quote).find(x => x.module.panel === 'stake'); if (f) ({ address: vault, index: at, module: mod } = f); }
    if (at < 0) { if (mine === seq) card.hidden = true; return; }
    const [t, q, supply] = await Promise.all([erc20(pool.chainId, token), erc20(pool.chainId, quote), ethCall(pool.chainId, token, '0x18160ddd').then(BigInt)]);
    if (mine !== seq) return;
    state = { chainId: pool.chainId, token, quote, vault, blocks, shareBps: shares[at], t, q, supply, mod };
    await render();
  } catch { if (mine === seq) card.hidden = true; }
}

document.addEventListener('qhooks:pool', e => show(e.detail));
// Trades change what the launch holds for stakers (and the trader's balance): re-read after each one.
document.addEventListener('qhooks:traded', () => { if (state) render().catch(() => {}); });
if (window.__qhooksPool) show(window.__qhooksPool);
onWalletChange(() => { if (state) render().catch(() => {}); });
