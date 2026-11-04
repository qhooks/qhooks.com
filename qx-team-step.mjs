// Studio: the creator's tokens that are not in the pool.
// A launch mints the whole supply to the creator's wallet and only the initial liquidity goes into the pool.
// Before launch the creator picks what happens to the rest; once every stage is confirmed this step reads the
// wallet's remaining balance and carries the choice out: lock it in the chain's ownerless QLocks contract,
// burn it to the dead address, or keep it (Trade then lists it as unlocked creator holdings).
import { calldata, ethCall, words, parseUnits, formatUnits, erc20, send, ensureAllowance, connectedAddress, onWalletChange, CHAIN_NAME, h } from '/qx-chain.mjs';
import { extraAddress, isLive, setUp } from '/qx-extras.mjs';

const SEL = { lock: '0x806c27c7', summary: '0x9522a80a', transfer: '0xa9059cbb', balanceOf: '0x70a08231', totalSupply: '0x18160ddd' };
const DEAD = '0x000000000000000000000000000000000000dEaD';
const PLAN_KEY = 'qhooks:team-plan:v1';
const CHOICES = [
  ['lock', 'Lock it', 'Vests on a public schedule. Every sale needs an on-chain notice first.'],
  ['burn', 'Burn it', 'Sent to the dead address. Nobody can move it again.'],
  ['keep', 'Keep it', 'Stays in your wallet. Trade lists it as unlocked.'],
];
const CLIFFS = [['0', 'none'], ['2592000', '30 days'], ['7776000', '90 days'], ['15552000', '180 days'], ['31536000', '1 year']];
const DRIPS = [['0', 'all at cliff'], ['7776000', '90 days'], ['15552000', '180 days'], ['31536000', '1 year'], ['63072000', '2 years']];
const NOTICES = [['86400', '1 day'], ['259200', '3 days'], ['604800', '7 days'], ['1209600', '14 days']];

const $ = id => document.getElementById(id);
const readPlan = () => { try { const v = localStorage.getItem(PLAN_KEY); return CHOICES.some(c => c[0] === v) ? v : 'lock'; } catch { return 'lock'; } };
const writePlan = v => { try { localStorage.setItem(PLAN_KEY, v); } catch {} };
const pct = (n, d) => { if (!d) return '0%'; const p = Number(n * 1000000n / d) / 10000; return (p === 0 ? '0' : p < 1 ? p.toFixed(2) : p.toFixed(1).replace(/\.0$/, '')) + '%'; };
const label = (opts, v) => (opts.find(o => o[0] === v) || [, v])[1];

function choiceRow(current, onPick, name) {
  return h('div', { class: 'qxt-choices', role: 'radiogroup', ariaLabel: name },
    ...CHOICES.map(([v, title, line]) => {
      const b = h('button', { type: 'button', class: 'qxt-choice', role: 'radio', ariaChecked: String(v === current) }, h('b', {}, title), h('span', {}, line));
      b.dataset.choice = v;
      b.addEventListener('click', () => onPick(v));
      return b;
    }));
}

// ---- Before launch: a light pick in the token step ----
const plan = $('qxt-plan');
function renderPlan() {
  if (!plan) return;
  const num = id => Number(($(id)?.value || '').replace(/,/g, '').trim());
  const supply = num('ql-supply'), pooled = num('ql-token-funding'), sym = ($('ql-symbol')?.value || '').trim() || 'tokens';
  const left = Number.isFinite(supply) && Number.isFinite(pooled) && supply > 0 && pooled >= 0 && pooled <= supply ? supply - pooled : null;
  const share = left !== null ? ' (' + (Math.round(left / supply * 1000) / 10) + '% of supply)' : '';
  const line = left === null || !pooled
    ? 'Whatever you do not put in the pool stays in your wallet after launch, and buyers can see it on Trade.'
    : left === 0 ? 'Your whole supply goes into the pool. Nothing stays in your wallet.'
      : left.toLocaleString('en-US') + ' ' + sym + share + ' stays in your wallet after launch, and buyers can see it on Trade.';
  plan.replaceChildren(...[
    h('h3', { id: 'qxt-plan-heading' }, 'Tokens outside the pool'),
    h('p', { class: 'qxt-note' }, line),
    left === 0 ? null : choiceRow(readPlan(), v => { writePlan(v); renderPlan(); if (state) render(); }, 'What happens to tokens outside the pool'),
    left === 0 ? null : h('p', { class: 'qxt-fine' }, 'You confirm this right after launch. Nothing is sent now.')].filter(Boolean));
}
for (const id of ['ql-supply', 'ql-token-funding', 'ql-symbol']) $(id)?.addEventListener('input', renderPlan);
renderPlan();

// ---- After launch: the step itself ----
const card = $('qxt');
let state = null, loading = 0, statusText = '';
const draft = { amount: null, cliff: '7776000', drip: '15552000', notice: '259200', sure: false };

async function read(chainId, token, me) {
  const [t, supplyHex, locksAddr] = await Promise.all([erc20(chainId, token, me), ethCall(chainId, token, SEL.totalSupply), extraAddress('locks')]);
  const balOf = async who => BigInt(await ethCall(chainId, token, calldata(SEL.balanceOf, ['address'], [who])));
  const live = await isLive(chainId, 'locks');
  const [burned, locked] = await Promise.all([balOf(DEAD), live ? ethCall(chainId, locksAddr, calldata(SEL.summary, ['address'], [token])).then(r => words(r)[0]) : 0n]);
  return { chainId, token, me, symbol: t.symbol || 'tokens', decimals: t.decimals, bal: t.balance, supply: BigInt(supplyHex), locksAddr, live, burned, locked };
}

async function act(btn, fn) {
  btn.disabled = true;
  const say = t => { statusText = t; const s = card.querySelector('.qxt-status'); if (s) s.textContent = t; };
  try {
    const done = await fn(say);
    state = await read(state.chainId, state.token, state.me);
    draft.amount = null; draft.sure = false; statusText = done; render();
  } catch (e) { say(e?.code === 4001 ? 'Cancelled in your wallet.' : e?.message || 'That did not go through.'); btn.disabled = false; }
}

function render() {
  if (!card || !state) return;
  const { chainId, symbol, decimals, bal, supply, live, burned, locked, me } = state;
  const fmt = n => formatUnits(n, decimals, 2) + ' ' + symbol;
  const choice = readPlan();
  const stats = h('div', { class: 'qxt-stats' },
    h('div', {}, h('span', {}, 'In your wallet'), h('b', {}, fmt(bal)), h('small', {}, pct(bal, supply) + ' of supply')),
    h('div', {}, h('span', {}, 'Locked in QLocks'), h('b', {}, fmt(locked)), h('small', {}, pct(locked, supply) + ' of supply')),
    h('div', {}, h('span', {}, 'Burned'), h('b', {}, fmt(burned)), h('small', {}, pct(burned, supply) + ' of supply')));
  const head = [h('p', { class: 'qx-eyebrow' }, 'Last step'), h('h3', { id: 'qxt-heading' }, 'Team tokens'),
    h('p', { class: 'qxt-note' }, 'Only your initial liquidity went into the pool. Whatever stays in your launch wallet shows on Trade as unlocked creator holdings. Decide what happens to it.')];
  const status = h('p', { class: 'qxt-status', role: 'status', ariaLive: 'polite' }, statusText);
  if (bal === 0n) {
    card.replaceChildren(...head, stats, h('p', { class: 'qxt-done' }, 'Nothing is left in your wallet. Trade shows 0% unlocked for the creator.'), status);
    card.hidden = false; return;
  }
  const pick = v => { writePlan(v); statusText = ''; renderPlan(); render(); };
  // The field shows the balance to 6 decimals; left at that value it moves the exact balance, dust included.
  const whole = formatUnits(bal, decimals, 6).replace(/,/g, '');
  const amount = h('input', { type: 'text', inputMode: 'decimal', autocomplete: 'off', ariaLabel: 'Amount', value: draft.amount ?? whole });
  amount.addEventListener('input', () => { draft.amount = amount.value; });
  const max = h('button', { type: 'button', class: 'qxt-max' }, 'All');
  max.addEventListener('click', () => { draft.amount = null; amount.value = whole; });
  const amountField = h('label', { class: 'qxt-field' }, h('span', {}, 'Amount'), h('div', { class: 'qxt-input' }, amount, h('i', {}, symbol), max));
  const parsed = () => { if (amount.value.trim() === whole) return bal; const a = parseUnits(amount.value, decimals); if (a === 0n || a > bal) throw new TypeError('Enter an amount up to ' + fmt(bal) + '.'); return a; };
  let body;
  if (choice === 'lock') {
    const sel = (lab, key, opts) => { const s = h('select', { ariaLabel: lab }, ...opts.map(([v, t]) => h('option', { value: v, selected: v === draft[key] }, t))); s.addEventListener('change', () => { draft[key] = s.value; render(); }); return h('label', { class: 'qxt-field' }, h('span', {}, lab), s); };
    const schedule = (draft.cliff === '0' ? 'Vesting starts now' : 'Nothing vests for ' + label(CLIFFS, draft.cliff)) + (draft.drip === '0' ? (draft.cliff === '0' ? ' and all of it is vested at once' : ', then all of it at once') : ', then it drips out over ' + label(DRIPS, draft.drip)) + '. Every sale needs a ' + label(NOTICES, draft.notice) + ' public notice first. Nobody can cancel or shorten the lock, including you.';
    const btn = h('button', { type: 'button', class: 'workspace-button' }, live ? 'Lock tokens' : 'Set up QLocks and lock');
    btn.addEventListener('click', () => act(btn, async s => {
      const amt = parsed();
      if (!(await isLive(chainId, 'locks'))) { s('Setting up QLocks on ' + CHAIN_NAME[chainId] + '…'); await setUp(chainId, 'locks', s); state.live = true; }
      await ensureAllowance(chainId, state.token, state.locksAddr, amt, s);
      s('Confirm the lock in your wallet…');
      await send(chainId, { to: state.locksAddr, data: calldata(SEL.lock, ['address', 'address', 'uint256', 'uint64', 'uint32', 'uint32', 'uint32'], [state.token, me, amt, 0n, BigInt(draft.cliff), BigInt(draft.drip), BigInt(draft.notice)]) }, s);
      return 'Locked ' + fmt(amt) + '.';
    }));
    body = [h('div', { class: 'qxt-row' }, amountField, sel('Cliff', 'cliff', CLIFFS), sel('Then drip over', 'drip', DRIPS), sel('Sell notice', 'notice', NOTICES)),
      h('p', { class: 'qxt-note' }, schedule + ' Vested tokens go to your wallet ' + me.slice(0, 6) + '…' + me.slice(-4) + '.'),
      live ? null : h('p', { class: 'qxt-fine' }, 'QLocks is not on ' + CHAIN_NAME[chainId] + ' yet. Your first transaction sets it up for everyone on this chain; it has no owner.'),
      h('div', { class: 'qxt-go' }, btn)];
  } else if (choice === 'burn') {
    const sure = h('input', { type: 'checkbox', checked: draft.sure });
    const btn = h('button', { type: 'button', class: 'workspace-button qxt-danger', disabled: !draft.sure }, 'Burn tokens');
    sure.addEventListener('change', () => { draft.sure = sure.checked; btn.disabled = !sure.checked; });
    btn.addEventListener('click', () => act(btn, async s => {
      const amt = parsed();
      if (!draft.sure) throw new TypeError('Confirm that you understand the burn is permanent.');
      s('Confirm the burn in your wallet…');
      await send(chainId, { to: state.token, data: calldata(SEL.transfer, ['address', 'uint256'], [DEAD, amt]) }, s);
      return 'Burned ' + fmt(amt) + '.';
    }));
    body = [h('div', { class: 'qxt-row qxt-row-one' }, amountField),
      h('p', { class: 'qxt-note' }, 'The tokens go to ' + DEAD.slice(0, 6) + '…' + DEAD.slice(-4) + ', an address nobody controls. Total supply on-chain stays the same, but these tokens can never move again.'),
      h('label', { class: 'qxt-confirm' }, sure, h('span', {}, 'I understand burned tokens cannot be recovered.')),
      h('div', { class: 'qxt-go' }, btn)];
  } else {
    body = [h('p', { class: 'qxt-note' }, 'Nothing is sent. Trade lists ' + fmt(bal) + ' (' + pct(bal, supply) + ' of supply) as unlocked in the creator wallet, which can sell it at any time without notice. You can still lock it later from Trade.')];
  }
  card.replaceChildren(...head, stats, choiceRow(choice, pick, 'What happens to your remaining tokens'), h('div', { class: 'qxt-body' }, ...body), status);
  card.hidden = false;
}

async function load() {
  if (!card) return;
  const success = $('qj-success'), token = ($('qj-token-address')?.textContent || '').trim().toLowerCase();
  const chainId = $('ql-chain')?.value, me = connectedAddress();
  if (!success || success.hidden || !/^0x[0-9a-f]{40}$/.test(token) || !CHAIN_NAME[chainId]) { card.hidden = true; return; }
  if (!me) { state = null; card.replaceChildren(h('h3', { id: 'qxt-heading' }, 'Team tokens'), h('p', { class: 'qxt-note' }, 'Connect your launch wallet to decide what happens to the tokens outside the pool.')); card.hidden = false; return; }
  if (state && state.token === token && state.me === me && state.chainId === chainId) return;
  const mine = ++loading;
  try { const next = await read(chainId, token, me); if (mine === loading) { state = next; statusText = ''; render(); } }
  catch { if (mine === loading) { card.replaceChildren(h('h3', { id: 'qxt-heading' }, 'Team tokens'), h('p', { class: 'qxt-note' }, 'Could not read your token balance. Reload to try again.')); card.hidden = false; } }
}

if (card) {
  const watch = new MutationObserver(() => load());
  // The step lives inside #qj-success, so only that section's own hidden flag is watched, never its subtree.
  for (const id of ['qj-success', 'qj-market-actions']) { const n = $(id); if (n) watch.observe(n, { attributes: true, attributeFilter: ['hidden'] }); }
  const addr = $('qj-token-address'); if (addr) watch.observe(addr, { childList: true, characterData: true, subtree: true });
  onWalletChange(() => { state = null; load(); });
  load();
}
