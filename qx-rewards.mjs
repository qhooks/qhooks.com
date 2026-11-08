// Terminal rewards in the admitted EVM quote assets. Cashback and referral credits share a balance per currency.
// Reads go through the public RPCs; claiming switches the wallet to that chain and sends router.claim(currency).
import { STOCK_PAIRS } from '/full-launch/packages/multichain-launch/stock-pairs.mjs';
import { chainMap, visibleChains } from '/chains.mjs';
import { formatUnits, send, connectedAddress, onWalletChange, CHAIN_NAME, NATIVE, codeAt, h } from '/qx-chain.mjs';
import { cashbackOf, referralLink, claimCall } from '/qx-swap.mjs';
import { extraAddress } from '/qx-extras.mjs';
import { readEvmRewardSnapshot, sameRewardOwner } from '/qx-reward-state.mjs';

const Z = '0x0000000000000000000000000000000000000000';
// The quote tokens terminal fees are taken in, besides each chain's coin.
// From the registry (chains.mjs): each chain's launch quote (Robinhood also its most-traded stock pairs).
const QUOTES = chainMap(c => c.id === '4663'
  ? [[c.quote.address, c.quote.symbol, c.quote.decimals], ...STOCK_PAIRS['4663'].tokens.slice(0, 8).map(([a, s]) => [a, s, 18])]
  : [[c.quote.address, c.quote.symbol, c.quote.decimals]], visibleChains().filter(c => c.router));
const ICON = chainMap(c => c.icon);
const LABEL = chainMap(c => c.short);
const small = (v, d) => { let max = 4; while (max < d && v > 0n && formatUnits(v, d, max) === '0') max++; return formatUnits(v, d, Math.min(d, max + 2)); };
const short = a => a.slice(0, 6) + '…' + a.slice(-4);

const wallet = document.querySelector('.qxt-wallet');
const btn = h('button', { type: 'button', id: 'qxt-rewards', class: 'qxt-rewards-btn', 'aria-haspopup': 'true', 'aria-expanded': 'false', hidden: true },
  h('span', {}, 'Rewards'), h('i', { class: 'qxt-rewards-dot', 'aria-hidden': 'true' }));
const panel = h('div', { id: 'qxt-rewards-panel', class: 'qxt-rewards', role: 'dialog', 'aria-label': 'Rewards', hidden: true });
wallet?.before(h('div', { class: 'qxt-rewards-wrap' }, btn, panel));
let seq = 0, epoch = 0, owner = null, router = null, pending = null, claiming = null;
// Last successful asset reads belong only to the current connection. A failed refresh never turns them into zero.
const known = new Map();
const key = x => x.chainId + ':' + x.address.toLowerCase();
const time = at => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
function currentOwner() {
  const me = connectedAddress();
  return /^0x[0-9a-f]{40}$/i.test(me || '') && BigInt(me) !== 0n ? me.toLowerCase() : null;
}
const owns = (me, generation) => epoch === generation && sameRewardOwner(currentOwner(), me);
const current = (me, generation, mine) => owns(me, generation) && mine === seq && !panel.hidden;

function unavailable(me) {
  return { owner: me, observedAt: Date.now(), partial: true, claimable: [], chains: [],
    balances: Object.entries(QUOTES).flatMap(([chainId, quotes]) => [[Z, NATIVE[chainId], 18], ...quotes]
      .map(([address, symbol, decimals]) => ({ chainId, address, symbol, decimals, status: 'unavailable', amount: null }))) };
}

function scan(me, generation) {
  if (pending?.owner === me && pending.epoch === generation) return pending.promise;
  const job = { owner: me, epoch: generation };
  job.promise = (async () => {
    const target = router || await extraAddress('feeRouter');
    if (!/^0x[0-9a-f]{40}$/i.test(target || '') || BigInt(target) === 0n) throw Error('Rewards router unavailable');
    router = target;
    const snapshot = await readEvmRewardSnapshot(me, { quotes: QUOTES, native: NATIVE, router: target, codeAt, cashbackOf });
    if (owns(me, generation)) {
      for (const chain of snapshot.chains) if (chain.status === 'not_deployed') {
        for (const [id, row] of known) if (row.chainId === chain.chainId) known.delete(id);
      }
      for (const row of snapshot.balances) if (row.status === 'checked') known.set(key(row), { ...row, observedAt: snapshot.observedAt });
    }
    return { ...snapshot, router: target };
  })().finally(() => { if (pending === job) pending = null; });
  pending = job;
  return job.promise;
}

function markDot(snapshot) {
  const has = !!snapshot?.claimable.length;
  btn.classList.toggle('has', has);
  btn.title = has ? 'You have rewards to claim' : !snapshot || snapshot.partial ? 'Some reward balances are unavailable. Open Rewards to refresh.' : '';
}

async function refreshDot() {
  const me = owner, generation = epoch;
  if (!me) return;
  let snapshot;
  try { snapshot = await scan(me, generation); } catch { snapshot = null; }
  if (owns(me, generation)) markDot(snapshot); else sync();
}

function rowsFor(snapshot) {
  return snapshot.balances.flatMap(row => {
    if (row.status === 'checked') return BigInt(row.amount) > 0n ? [{ ...row, observedAt: snapshot.observedAt }] : [];
    const previous = known.get(key(row));
    return previous && BigInt(previous.amount) > 0n ? [{ ...previous, stale: true }] : [{ ...row, unknown: true }];
  });
}

async function load(notice = '') {
  if (currentOwner() !== owner) { sync(); return; }
  const me = owner, generation = epoch, mine = ++seq;
  if (!me) return;
  const link = referralLink(me);
  const copy = h('button', { type: 'button', class: 'qxt-rewards-copy' }, 'Copy link');
  copy.addEventListener('click', async () => {
    if (!current(me, generation, mine)) { sync(); return; }
    try {
      await navigator.clipboard.writeText(link);
      if (current(me, generation, mine)) {
        copy.textContent = 'Copied';
        setTimeout(() => { if (current(me, generation, mine)) copy.textContent = 'Copy link'; }, 1800);
      }
    } catch { if (current(me, generation, mine)) copy.textContent = 'Select the link'; }
  });
  const status = h('p', { class: 'qxt-rewards-status', 'aria-live': 'polite' }, notice ? notice + ' Refreshing balances…' : 'Checking reward balances…');
  const list = h('div', { class: 'qxt-rewards-list' });
  const refresh = h('button', { type: 'button', class: 'qxt-rewards-copy', disabled: true }, 'Refresh balances');
  refresh.addEventListener('click', () => {
    if (!current(me, generation, mine)) { sync(); return; }
    if (!refresh.disabled && !claiming) load();
  });
  function row(x, target) {
    const ready = !x.stale && !x.unknown && !!target;
    const b = h('button', { type: 'button', class: 'qxt-rewards-claim', disabled: !ready || !!claiming,
      'data-ready': String(ready), title: ready ? 'Claim on ' + CHAIN_NAME[x.chainId] + '. Network gas applies.' : 'Refresh this balance before claiming.' }, 'Claim');
    b.addEventListener('click', async () => {
      if (!current(me, generation, mine)) { sync(); return; }
      if (!ready || b.disabled || claiming) return;
      const job = {}; claiming = job;
      for (const control of list.querySelectorAll('button')) control.disabled = true;
      refresh.disabled = true; b.textContent = 'Claiming…';
      status.className = 'qxt-rewards-status';
      status.textContent = 'Confirm the ' + x.symbol + ' claim in your wallet. Network gas is paid on ' + CHAIN_NAME[x.chainId] + '.';
      let confirmed = false, failure;
      try {
        // The displayed balance is never authority to send from a different wallet.
        if (!owns(me, generation)) { sync(); return; }
        await send(x.chainId, { to: target, data: claimCall(x.address) }, text => {
          if (current(me, generation, mine)) status.textContent = text;
        });
        if (owns(me, generation)) { confirmed = true; document.dispatchEvent(new CustomEvent('qhooks:rewards-claimed')); }
      } catch (error) { failure = error; }
      finally {
        if (claiming === job) claiming = null;
        if (!owns(me, generation)) {
          if (currentOwner() !== owner) sync();
          else if (owner && !panel.hidden) load();
        }
        else if (panel.hidden) refreshDot();
        else if (mine !== seq || confirmed) load(confirmed ? 'Claim confirmed for ' + x.symbol + ' on ' + CHAIN_NAME[x.chainId] + '.' : '');
        else {
          status.className = 'qxt-rewards-status err'; status.textContent = failure?.message || 'The claim did not go through.';
          for (const control of list.querySelectorAll('button')) control.disabled = control.getAttribute('data-ready') !== 'true';
          refresh.disabled = false; b.textContent = 'Claim';
        }
      }
    });
    const value = h('div', {}, h('b', {}, x.unknown ? 'Unknown' : small(BigInt(x.amount), x.decimals), h('small', {}, ' ' + x.symbol)));
    if (x.stale) value.append(h('div', { class: 'qxt-rewards-chain', title: 'Last successful read; refresh before claiming' }, 'Last read ' + time(x.observedAt)));
    return h('div', { class: 'qxt-rewards-row' },
      h('img', { src: '/chain-symbol-icons/' + ICON[x.chainId] + '.svg', alt: '', width: 18, height: 18 }),
      h('span', { class: 'qxt-rewards-chain', title: CHAIN_NAME[x.chainId] }, LABEL[x.chainId]), value, b);
  }
  const previous = [...known.values()].filter(x => BigInt(x.amount) > 0n);
  list.replaceChildren(...(previous.length ? previous.map(x => row({ ...x, stale: true }, null)) : [h('div', { class: 'qxt-rewards-skel' }), h('div', { class: 'qxt-rewards-skel' })]));
  panel.replaceChildren(
    h('div', { class: 'qxt-rewards-head' }, h('h2', {}, 'Rewards'), h('p', {}, 'Cashback and referral earnings from eligible EVM terminal trades. Claims use network gas.')),
    list, status, refresh,
    h('section', { class: 'qxt-rewards-ref' },
      h('h3', {}, 'Bring traders. Earn rewards.'),
      h('p', {}, 'Share your link with your community. Earn 20% of QHooks’ terminal fee on eligible referred EVM trades. They receive 30% of that fee as cashback.'),
      h('div', { class: 'qxt-rewards-link' }, h('code', { title: link }, 'qhooks.com/terminal.html?ref=' + short(me)), copy)));
  let snapshot;
  try { snapshot = await scan(me, generation); } catch { snapshot = unavailable(me); }
  if (!current(me, generation, mine)) { if (!owns(me, generation)) sync(); return; }
  markDot(snapshot);
  const rows = rowsFor(snapshot);
  const unknown = rows.filter(x => x.unknown), observed = rows.filter(x => !x.unknown);
  list.replaceChildren(...observed.map(x => row(x, snapshot.router)),
    ...(unknown.length ? [h('details', {class:'qxt-rewards-unknown'},
      h('summary', {}, unknown.length + ' asset balances unavailable'),
      ...unknown.map(x => row(x, null)))] : []));
  if (!rows.length) list.replaceChildren(h('div', { class: 'qxt-rewards-empty' }, h('span', {}, snapshot.balances.length
    ? 'No claimable balance in the checked assets yet.' : 'No reward balances are available to read on these networks.')));
  status.className = 'qxt-rewards-status' + (notice ? ' ok' : '');
  status.textContent = (notice ? notice + ' ' : '') + (snapshot.partial
    ? 'Some balances could not be read. Unknown and last-read amounts need a refresh before claiming.'
    : 'Checked ' + time(snapshot.observedAt) + '. Claims use network gas on each network.');
  if (claiming) status.textContent += ' A claim is still waiting for its wallet result.';
  refresh.disabled = !!claiming;
}

function toggle(open = panel.hidden) {
  panel.hidden = !open; btn.setAttribute('aria-expanded', String(open));
  if (open) load(); else seq++;
}
btn.addEventListener('click', e => { e.stopPropagation(); toggle(); });
document.addEventListener('click', e => {
  // Refresh replaces its clicked control before this event reaches document.
  const path = e.composedPath?.() || [];
  if (!panel.hidden && !path.includes(panel) && !path.includes(btn) && !panel.contains(e.target) && !btn.contains(e.target)) toggle(false);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) { toggle(false); btn.focus(); } });
document.addEventListener('qhooks:rewards-claimed', () => { sync(); if (owner && panel.hidden) refreshDot(); });
document.addEventListener('qhooks:traded', () => { sync(); if (owner) panel.hidden ? refreshDot() : load(); });
function sync() {
  const me = currentOwner(), changed = me !== owner;
  if (changed) {
    owner = me; epoch++; seq++; pending = null; known.clear();
    panel.replaceChildren(); btn.classList.remove('has'); btn.title = '';
  }
  btn.hidden = !me;
  if (!me) { toggle(false); panel.replaceChildren(); }
  else if (changed) panel.hidden ? refreshDot() : load();
}
onWalletChange(sync); sync();
