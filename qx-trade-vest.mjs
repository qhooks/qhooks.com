// Trade page / terminal: vesting streams for launches whose revenue split pays a QVest stream (one per beneficiary and
// period, deterministic address, ownerless). Studio offers streams of 30/90/180/365 days, so the panel finds the
// creator's stream among the payees from the creator's address alone, deployed or not. Anyone can open the stream, pay
// out what the launch holds and push what has vested to the beneficiary; the funds can only go to the beneficiary.
import { calldata, ethCall, codeAt, words, toAddress, formatUnits, erc20, send, connectedAddress, onWalletChange, h } from '/qx-chain.mjs';
import { BLOCK_FIELDS } from '/full-launch/packages/multichain-launch/launch-blocks.mjs';
import { findVests, vestDeployData, VEST_DEPLOYER, VEST_SEL } from '/full-launch/packages/multichain-launch/vest.mjs';

const SEL = { config: '0x79502c55', release: '0x86d1a69f', creatorQuote: '0xe55e1ce9', creatorToken: '0x483a5f14' };
const card = document.getElementById('qtv');
let state = null, seq = 0, busy = false;

async function act(btn, status, fn) {
  btn.disabled = true; status.textContent = '';
  let last = ''; busy = true;
  try {
    await fn(t => { last = t; status.textContent = t; });
    await render();
    const fresh = card.querySelector('.qtx-status'); if (fresh) fresh.textContent = /…$/.test(last) ? 'Done.' : last || 'Done.';
  } catch (e) { status.textContent = e.message || 'That did not go through'; btn.disabled = false; }
  finally { busy = false; }
}
// Amounts to `dp` decimals, or to 3 significant digits when that would show a non-zero amount as 0 (below 0.000001: "< 0.000001").
function small(n, decimals, dp) {
  const text = formatUnits(n, decimals, dp);
  if (n === 0n || !/^0(\.0*)?$/.test(text)) return text;
  const f = formatUnits(n, decimals, decimals), m = /^0\.(0*)(\d{1,3})/.exec(f);
  if (!m) return text;
  return m[1].length >= 6 ? '< 0.000001' : '0.' + m[1] + m[2].replace(/0+$/, '');
}
const cell = (k, v) => h('div', {}, h('span', {}, k), h('b', {}, v));
const short = a => a.slice(0, 6) + '…' + a.slice(-4);
const when = s => new Date(Number(s) * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

async function render() {
  const { chainId, token, quote, blocks, vests, t, q, owner } = state, me = connectedAddress();
  const fmtT = n => small(n, t.decimals, 2) + ' ' + t.symbol, fmtQ = n => small(n, q.decimals, 4) + ' ' + q.symbol;
  const both = (a, b) => [a && fmtQ(a), b && fmtT(b)].filter(Boolean).join(' + ') || 'nothing';
  const status = h('p', { class: 'qtx-status', role: 'status', ariaLive: 'polite' });
  const [cq, ct] = (await Promise.all([ethCall(chainId, blocks, SEL.creatorQuote), ethCall(chainId, blocks, SEL.creatorToken)])).map(BigInt);
  const parts = [h('h2', { id: 'qtv-heading' }, 'Vesting')];
  for (const v of vests) {
    const who = v.beneficiary === owner ? 'the creator (' + short(v.beneficiary) + ')' : short(v.beneficiary);
    const span = v.days >= 365 ? 'a year' : v.days + ' days';
    parts.push(h('p', { class: 'qtb-note' }, (Number(v.shareBps) / 100) + '% of this launch’s income goes to a vesting stream for ' + who + ': each payout reaches them evenly over ' + span + '. The stream is public and ownerless; nobody can change who it pays or how fast.'));
    const live = (await codeAt(chainId, v.address)) !== '0x';
    const waitingQ = cq * v.shareBps / 10000n, waitingT = ct * v.shareBps / 10000n;
    const payBtn = h('button', { type: 'button', class: 'qtx-mini', disabled: !me || (!cq && !ct) }, 'Pay out');
    payBtn.addEventListener('click', () => act(payBtn, status, async s => {
      // Read again: another panel (Staking, Modules, the creator dashboard) may have paid the launch out since this was drawn.
      const [nq, nt] = (await Promise.all([ethCall(chainId, blocks, SEL.creatorQuote), ethCall(chainId, blocks, SEL.creatorToken)])).map(BigInt);
      if (nq || nt) { s('Confirm the payout in your wallet…'); await send(chainId, { to: blocks, data: SEL.release }, s); }
      if ((await codeAt(chainId, v.address)) !== '0x') { s('Confirm the vesting start in your wallet…'); await send(chainId, { to: v.address, data: calldata(VEST_SEL.claimMany, ['address[]'], [[quote, token]]) }, s); }
      s('Paid out.');
    }));
    const waiting = waitingQ || waitingT ? h('div', { class: 'qtx-actions' }, h('span', { class: 'qtx-meta' }, 'Waiting in the launch for this stream: ' + both(waitingQ, waitingT)), payBtn) : null;
    if (!live) {
      const [hq, ht] = await Promise.all([erc20(chainId, quote, v.address), erc20(chainId, token, v.address)]).then(x => x.map(y => y.balance));
      const open = h('button', { type: 'button', class: 'workspace-button', disabled: !me }, 'Open the stream');
      open.addEventListener('click', () => act(open, status, async s => {
        s('Confirm in your wallet: this deploys the vesting stream (one time, anyone can do it)…');
        await send(chainId, { to: VEST_DEPLOYER, data: vestDeployData(v.beneficiary, BigInt(v.days) * 86400n) }, s);
        if ((await codeAt(chainId, v.address)) === '0x') throw new Error('The stream did not deploy');
        s('The stream is open. Its first payout starts vesting now.');
        await send(chainId, { to: v.address, data: calldata(VEST_SEL.claimMany, ['address[]'], [[quote, token]]) }, s);
      }));
      parts.push(h('p', { class: 'qtb-note' }, 'The stream has not been opened yet. Payouts wait at its address (' + both(hq, ht) + ' so far) and start vesting when it is.'), waiting, open);
      continue;
    }
    const [sq, st, pq, pt] = await Promise.all([
      ethCall(chainId, v.address, calldata(VEST_SEL.status, ['address'], [quote])).then(words),
      ethCall(chainId, v.address, calldata(VEST_SEL.status, ['address'], [token])).then(words),
      ethCall(chainId, v.address, calldata(VEST_SEL.paid, ['address'], [quote])).then(BigInt),
      ethCall(chainId, v.address, calldata(VEST_SEL.paid, ['address'], [token])).then(BigInt)]);
    const end = sq[2] > st[2] ? sq[2] : st[2], unseen = sq[3] || st[3];
    const grid = h('div', { class: 'qtb-now' }, cell('Vesting', both(sq[1], st[1])), cell('Ready to pay', both(sq[0], st[0])), cell('Paid so far', both(pq, pt)), cell('Fully vested', end ? when(end) : '—'));
    grid.style.gridTemplateColumns = 'repeat(auto-fit,minmax(130px,1fr))';
    const claimBtn = h('button', { type: 'button', class: 'qtx-mini', disabled: !me || (!sq[0] && !st[0] && !unseen) }, unseen && !sq[0] && !st[0] ? 'Start vesting' : 'Send to ' + (v.beneficiary === me?.toLowerCase() ? 'me' : short(v.beneficiary)));
    claimBtn.addEventListener('click', () => act(claimBtn, status, async s => {
      s('Confirm in your wallet…');
      await send(chainId, { to: v.address, data: calldata(VEST_SEL.claimMany, ['address[]'], [[quote, token]]) }, s);
      s('Sent to ' + short(v.beneficiary) + '.');
    }));
    parts.push(grid, waiting, unseen ? h('p', { class: 'qtb-note' }, 'New payouts are at the stream and start vesting at the next call.') : null,
      h('div', { class: 'qtx-actions' }, h('span', { class: 'qtx-meta' }, 'Stream ' + short(v.address)), claimBtn));
  }
  card.replaceChildren(...[...parts, status].filter(Boolean));
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
    const owner = String(c.owner || '').toLowerCase(), me = String(connectedAddress() || '').toLowerCase();
    const vests = findVests(payees, [...new Set([owner, me])]).map(v => ({ ...v, shareBps: shares[v.index] }));
    if (!vests.length) { if (mine === seq) card.hidden = true; return; }
    const [t, q] = await Promise.all([erc20(pool.chainId, token), erc20(pool.chainId, quote)]);
    if (mine !== seq) return;
    state = { chainId: pool.chainId, token, quote, blocks, vests, t, q, owner, pool };
    await render();
  } catch { if (mine === seq) card.hidden = true; }
}

document.addEventListener('qhooks:pool', e => show(e.detail));
if (window.__qhooksPool) show(window.__qhooksPool);
// Income builds up with every trade: refresh when the tab is opened (terminal) and every 15 s while it is in view.
const inView = () => state && !busy && !card.hidden && !card.hasAttribute('data-off') && document.visibilityState === 'visible';
if (card) new MutationObserver(() => { if (inView()) render().catch(() => {}); }).observe(card, { attributes: true, attributeFilter: ['data-off'] });
setInterval(() => { if (inView()) render().catch(() => {}); }, 15000);
onWalletChange(() => { if (state) show(state.pool).catch(() => {}); else if (window.__qhooksPool) show(window.__qhooksPool); });
