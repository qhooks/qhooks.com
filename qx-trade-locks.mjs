// Trade page: team tokens for the selected pool's token, from the chain's ownerless QLocks contract.
// Shows how much is locked, what has vested, and any public sell notice before it can execute.
// Holders can lock tokens (vesting, drip, notice); beneficiaries can announce, withdraw and extend.
// Also shows how much of the supply the creator's launch wallet still holds unlocked, next to the locked share.
import { calldata, ethCall, rpc, words, toAddress, uintArray, parseUnits, formatUnits, erc20, send, ensureAllowance, connectedAddress, onWalletChange, CHAIN_NAME, h } from '/qx-chain.mjs';
import { extraAddress, isLive, setUp } from '/qx-extras.mjs';

// Selectors of the pinned QLocks ABI (full-launch/extras.json).
const SEL = { lock: '0x806c27c7', announce: '0xcf530b0d', withdraw: '0x2e1a7d4d', extend: '0x398226cb', get: '0x9507d39a', vested: '0x968fb8ba', locksOf: '0xc3f9ab58', summary: '0x9522a80a' };
const WINDOW = 7 * 86400;
const card = document.getElementById('qtl');
let state = null, seq = 0;

const when = ts => new Date(Number(ts) * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const share = (n, supply) => { if (!supply) return '0%'; const p = Number(n * 1000000n / supply) / 10000; return (p === 0 ? '0' : p < 1 ? p.toFixed(2) : p.toFixed(1).replace(/\.0$/, '')) + '%'; };
const days = s => { s = Number(s); return s === 0 ? 'none' : s % 86400 === 0 ? s / 86400 + ' d' : (s / 3600).toFixed(1).replace(/\.0$/, '') + ' h'; };

function decodeLock(id, hex) {
  const w = words(hex);
  return { id, token: toAddress(w[0]), start: w[1], cliff: w[2], beneficiary: toAddress(w[3]), duration: w[4], notice: w[5], total: w[6], claimed: w[7], announced: w[8], readyAt: w[9] };
}

async function act(btn, status, fn) {
  btn.disabled = true; status.textContent = '';
  let last = '';
  try {
    await fn(t => { last = t; status.textContent = t; });
    await render();
    const fresh = card.querySelector('.qtx-status'); if (fresh) fresh.textContent = /…$/.test(last) ? 'Done.' : last || 'Done.';
  } catch (e) { status.textContent = e.message || 'That did not go through'; btn.disabled = false; }
}
const chainNow = async () => BigInt((await rpc(state.chainId, 'eth_getBlockByNumber', ['latest', false])).timestamp);

// What the creator's launch wallet holds right now: no lock, no notice, sellable at any time.
async function creatorLine(fmt) {
  const { chainId, token, supply, owner } = state;
  if (!owner) return { cell: null, note: null };
  const held = BigInt(await ethCall(chainId, token, calldata('0x70a08231', ['address'], [owner])));
  const who = owner.slice(0, 6) + '…' + owner.slice(-4);
  return { cell: h('div', {}, h('span', {}, 'Creator, unlocked'), h('b', {}, share(held, supply))),
    note: h('p', { class: held ? 'qtx-alert' : 'qtb-note' }, held ? 'The creator wallet ' + who + ' holds ' + fmt(held) + ' unlocked. It can be sold at any time, with no notice.' : 'The creator wallet ' + who + ' holds none of the supply unlocked.') };
}
const statGrid = (...cells) => { const g = h('div', { class: 'qtb-now' }, ...cells); if (cells.filter(Boolean).length > 2) g.style.gridTemplateColumns = 'repeat(auto-fit,minmax(120px,1fr))'; return g; };

async function render() {
  const { chainId, token, symbol, decimals, supply, address } = state, me = connectedAddress();
  const fmt = n => formatUnits(n, decimals, 2) + ' ' + symbol;
  const status = h('p', { class: 'qtx-status', role: 'status', ariaLive: 'polite' });
  const head = [h('h2', { id: 'qtl-heading' }, 'Team tokens'),
    h('p', { class: 'qtb-note' }, 'Locked tokens vest on a public schedule and can only be sold after an on-chain notice. Nobody can cancel a lock or shorten it, including the team.')];
  const creator = await creatorLine(fmt);
  if (!(await isLive(chainId, 'locks'))) {
    const btn = h('button', { type: 'button', class: 'workspace-button', disabled: !me }, 'Set up team locks on ' + CHAIN_NAME[chainId]);
    btn.addEventListener('click', () => act(btn, status, s => setUp(chainId, 'locks', s)));
    card.replaceChildren(...[...head, creator.cell ? statGrid(h('div', {}, h('span', {}, 'Locked'), h('b', {}, '0%')), creator.cell) : null, creator.note,
      h('p', { class: 'qtb-note' }, 'No tokens are locked on ' + CHAIN_NAME[chainId] + ' yet. Setup is one transaction anyone can send, once per chain.'), btn, status].filter(Boolean));
    card.hidden = false; return;
  }
  const sw = words(await ethCall(chainId, address, calldata(SEL.summary, ['address'], [token])));
  const [locked, unlocked, announced, nextReady, count] = sw;
  const stats = statGrid(
    h('div', {}, h('span', {}, 'Locked'), h('b', {}, count ? share(locked, supply) : '0%')),
    creator.cell,
    h('div', {}, h('span', {}, 'Sell notices'), h('b', {}, announced ? fmt(announced) : 'none')));
  const notes = [h('p', { class: 'qtb-note' }, count ? fmt(locked) + ' across ' + count + ' lock' + (count === 1n ? '' : 's') + ', ' + fmt(unlocked) + ' vested so far.' : 'No team tokens are locked for this token.'), creator.note];
  if (announced) notes.push(h('p', { class: 'qtx-alert' }, fmt(announced) + ' announced for sale, ' + (nextReady > (await chainNow()) ? 'executable from ' + when(nextReady) : 'executable now') + '.'));
  const ids = uintArray(await ethCall(chainId, address, calldata(SEL.locksOf, ['address'], [token]))).slice(-30);
  const locks = await Promise.all(ids.map(async id => decodeLock(id, await ethCall(chainId, address, calldata(SEL.get, ['uint256'], [id])))));
  const vestedOf = await Promise.all(locks.map(l => ethCall(chainId, address, calldata(SEL.vested, ['uint256'], [l.id])).then(BigInt)));
  const now = await chainNow();
  const rows = locks.map((l, i) => {
    const open = l.start + l.cliff, actions = [];
    if (me && l.beneficiary === me && l.total > l.claimed) {
      const amt = h('input', { type: 'text', inputMode: 'decimal', placeholder: 'amount', ariaLabel: 'Amount to announce', class: 'qtx-mini-input' });
      const ann = h('button', { type: 'button', class: 'qtx-mini' }, 'Announce sale');
      ann.addEventListener('click', () => act(ann, status, s => send(chainId, { to: address, data: calldata(SEL.announce, ['uint256', 'uint256'], [l.id, parseUnits(amt.value, decimals)]) }, s)));
      actions.push(amt, ann);
      if (l.announced && now >= l.readyAt && now <= l.readyAt + BigInt(WINDOW)) {
        const wd = h('button', { type: 'button', class: 'qtx-mini' }, 'Withdraw');
        wd.addEventListener('click', () => act(wd, status, s => send(chainId, { to: address, data: calldata(SEL.withdraw, ['uint256'], [l.id]) }, s)));
        actions.push(wd);
      }
      const ext = h('button', { type: 'button', class: 'qtx-mini' }, 'Extend 30 d');
      ext.addEventListener('click', () => act(ext, status, s => send(chainId, { to: address, data: calldata(SEL.extend, ['uint256', 'uint32'], [l.id, l.cliff + 2592000n]) }, s)));
      actions.push(ext);
    }
    const schedule = (now < open ? 'cliff ends ' + when(open) : 'cliff passed') + (l.duration ? ', drips over ' + days(l.duration) : '') + ', notice ' + days(l.notice);
    const pending = l.announced && now <= l.readyAt + BigInt(WINDOW) ? ' · ' + fmt(l.announced) + ' announced, ready ' + when(l.readyAt) : '';
    return h('li', {}, h('div', {}, h('b', {}, fmt(l.total - l.claimed)), h('span', {}, ' for ' + l.beneficiary.slice(0, 6) + '…' + l.beneficiary.slice(-4))),
      h('span', { class: 'qtx-meta' }, schedule + ' · ' + fmt(vestedOf[i] - l.claimed) + ' vested' + pending), actions.length ? h('div', { class: 'qtx-actions' }, ...actions) : null);
  });
  // Lock form for anyone holding the token.
  const bal = me ? (await erc20(chainId, token, me)).balance : 0n;
  const amount = h('input', { type: 'text', inputMode: 'decimal', placeholder: '0.0', autocomplete: 'off', ariaLabel: 'Amount to lock' });
  const who = h('input', { type: 'text', placeholder: me || '0x…', autocomplete: 'off', ariaLabel: 'Beneficiary address' });
  const sel = (label, opts, def) => h('select', { ariaLabel: label }, ...opts.map(([v, t]) => h('option', { value: v, selected: v === def }, t)));
  const cliff = sel('Cliff', [['0', 'none'], ['2592000', '30 days'], ['7776000', '90 days'], ['15552000', '180 days'], ['31536000', '1 year']], '7776000');
  const drip = sel('Drip', [['0', 'all at cliff'], ['7776000', '90 days'], ['15552000', '180 days'], ['31536000', '1 year'], ['63072000', '2 years']], '15552000');
  const notice = sel('Notice', [['86400', '1 day'], ['259200', '3 days'], ['604800', '7 days'], ['1209600', '14 days']], '259200');
  const lockBtn = h('button', { type: 'button', class: 'workspace-button', disabled: !me || bal === 0n }, 'Lock tokens');
  lockBtn.addEventListener('click', () => act(lockBtn, status, async s => {
    const amt = parseUnits(amount.value, decimals); if (amt === 0n || amt > bal) throw new TypeError('Enter an amount you hold');
    const ben = (who.value.trim() || me).toLowerCase(); if (!/^0x[0-9a-f]{40}$/.test(ben)) throw new TypeError('Enter a valid beneficiary address');
    await ensureAllowance(chainId, token, address, amt, s);
    s('Confirm the lock in your wallet…');
    await send(chainId, { to: address, data: calldata(SEL.lock, ['address', 'address', 'uint256', 'uint64', 'uint32', 'uint32', 'uint32'], [token, ben, amt, 0n, BigInt(cliff.value), BigInt(drip.value), BigInt(notice.value)]) }, s);
    s('Locked.');
  }));
  const form = me ? h('details', { class: 'qtx-details' }, h('summary', {}, 'Lock ' + symbol),
    h('p', { class: 'qtb-note' }, 'You hold ' + fmt(bal) + '. Locked tokens release after the cliff, drip over the period you choose, and every sale needs a public notice first.'),
    h('div', { class: 'qtx-row' }, h('label', {}, h('span', {}, 'Amount'), amount), h('label', {}, h('span', {}, 'Beneficiary'), who)),
    h('div', { class: 'qtx-row' }, h('label', {}, h('span', {}, 'Cliff'), cliff), h('label', {}, h('span', {}, 'Then drip over'), drip), h('label', {}, h('span', {}, 'Sell notice'), notice)),
    lockBtn) : null;
  card.replaceChildren(...[...head, stats, ...notes, rows.length ? h('ul', { class: 'qtx-locks' }, ...rows) : null, form, status].filter(Boolean));
  card.hidden = false;
}

async function show(pool) {
  const mine = ++seq;
  if (!card || !pool?.chainId) { if (card) card.hidden = true; return; }
  try {
    const c = pool.constructor, token = c.currency0 === c.quote ? c.currency1 : c.currency0;
    const [t, address] = await Promise.all([erc20(pool.chainId, token), extraAddress('locks')]);
    const supply = BigInt(await ethCall(pool.chainId, token, '0x18160ddd'));
    if (mine !== seq) return;
    const owner = /^0x[0-9a-fA-F]{40}$/.test(c.owner || '') ? c.owner.toLowerCase() : null;
    state = { chainId: pool.chainId, token, symbol: t.symbol || 'token', decimals: t.decimals, supply, address, owner };
    await render();
  } catch { if (mine === seq) card.hidden = true; }
}

document.addEventListener('qhooks:pool', e => show(e.detail));
if (window.__qhooksPool) show(window.__qhooksPool);
onWalletChange(() => { if (state) render().catch(() => {}); });
