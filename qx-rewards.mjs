// Terminal "Rewards": everything the connected wallet can claim from the fee router on every chain (trade cashback and
// referral rewards share one balance per currency), each with its own Claim button, plus the wallet's referral link.
// Reads go through the public RPCs; claiming switches the wallet to that chain and sends router.claim(currency).
import { STOCK_PAIRS } from '/full-launch/packages/multichain-launch/stock-pairs.mjs';
import { chainMap, visibleChains } from '/chains.mjs';
import { formatUnits, send, connectedAddress, onWalletChange, CHAIN_NAME, NATIVE, codeAt, h } from '/qx-chain.mjs';
import { cashbackOf, referralLink, claimCall } from '/qx-swap.mjs';
import { extraAddress } from '/qx-extras.mjs';

const Z = '0x0000000000000000000000000000000000000000';
// The quote tokens terminal fees are taken in, besides each chain's coin.
// From the registry (chains.mjs): each chain's launch quote (Robinhood also its most-traded stock pairs).
const QUOTES = chainMap(c => c.id === '4663'
  ? [[c.quote.address, c.quote.symbol, c.quote.decimals], ...STOCK_PAIRS['4663'].tokens.slice(0, 8).map(([a, s]) => [a, s, 18])]
  : [[c.quote.address, c.quote.symbol, c.quote.decimals]], visibleChains().filter(c => c.router));
const ICON = chainMap(c => c.icon);
const CHAINS = Object.keys(QUOTES);
const LABEL = chainMap(c => c.short);
const small = (v, d) => { let max = 4; while (max < d && v > 0n && formatUnits(v, d, max) === '0') max++; return formatUnits(v, d, Math.min(d, max + 2)); };
const short = a => a.slice(0, 6) + '…' + a.slice(-4);

const wallet = document.querySelector('.qxt-wallet');
const btn = h('button', { type: 'button', id: 'qxt-rewards', class: 'qxt-rewards-btn', 'aria-haspopup': 'true', 'aria-expanded': 'false', hidden: true },
  h('span', {}, 'Rewards'), h('i', { class: 'qxt-rewards-dot', 'aria-hidden': 'true' }));
const panel = h('div', { id: 'qxt-rewards-panel', class: 'qxt-rewards', role: 'dialog', 'aria-label': 'Rewards', hidden: true });
wallet?.before(h('div', { class: 'qxt-rewards-wrap' }, btn, panel));
let seq = 0, router = null;

/// Claimable balances on every chain where the fee router exists: [{chain, currency, sym, d, v}].
async function scan(me) {
  router ||= await extraAddress('feeRouter');
  const rows = await Promise.all(CHAINS.map(async c => {
    try {
      if ((await codeAt(c, router)) === '0x') return [];
      const cur = [[Z, NATIVE[c], 18], ...QUOTES[c]];
      const vals = await Promise.all(cur.map(([a]) => cashbackOf(c, router, me, a).catch(() => 0n)));
      return cur.map(([a, sym, d], i) => ({ chain: c, currency: a, sym, d, v: vals[i] })).filter(x => x.v > 0n);
    } catch { return []; }
  }));
  return rows.flat();
}

function markDot(items) { btn.classList.toggle('has', items.length > 0); btn.title = items.length ? 'You have rewards to claim' : ''; }

async function load(notice = '') {
  const me = connectedAddress(), mine = ++seq;
  if (!me) return;
  const link = referralLink(me);
  const copy = h('button', { type: 'button', class: 'qxt-rewards-copy' }, 'Copy');
  copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(link); copy.textContent = 'Copied'; setTimeout(() => { copy.textContent = 'Copy'; }, 1800); } catch { copy.textContent = 'Select the link'; } });
  const status = h('p', { class: 'qxt-rewards-status' + (notice ? ' ok' : ''), 'aria-live': 'polite' }, notice || 'Checking every chain…');
  const list = h('div', { class: 'qxt-rewards-list' }, h('div', { class: 'qxt-rewards-skel' }), h('div', { class: 'qxt-rewards-skel' }));
  panel.replaceChildren(
    h('div', { class: 'qxt-rewards-head' }, h('h2', {}, 'Rewards'), h('p', {}, 'Cashback from your trades and earnings from your referrals. Claim any time.')),
    list, status,
    h('section', { class: 'qxt-rewards-ref' },
      h('h3', {}, 'Referral link'),
      h('p', {}, 'Earn 20% of the trading fee on every trade by wallets that arrive through your link.'),
      h('div', { class: 'qxt-rewards-link' }, h('code', { title: link }, 'qhooks.com/terminal.html?ref=' + short(me)), copy)));
  let items;
  try { items = await scan(me); } catch { if (mine === seq) { list.replaceChildren(); status.textContent = 'Rewards are unavailable right now. Try again in a moment.'; } return; }
  if (mine !== seq) return;
  markDot(items);
  list.replaceChildren(...items.map(x => {
    const b = h('button', { type: 'button', class: 'qxt-rewards-claim' }, 'Claim');
    b.addEventListener('click', async () => {
      for (const o of list.querySelectorAll('button')) o.disabled = true;
      b.textContent = 'Claiming…';
      try {
        await send(x.chain, { to: router, data: claimCall(x.currency) }, t => { status.className = 'qxt-rewards-status'; status.textContent = t; });
        document.dispatchEvent(new CustomEvent('qhooks:rewards-claimed'));
        load('Claimed ' + small(x.v, x.d) + ' ' + x.sym + ' on ' + CHAIN_NAME[x.chain] + '.');
      } catch (e) { status.className = 'qxt-rewards-status err'; status.textContent = e.message || 'The claim did not go through.'; for (const o of list.querySelectorAll('button')) o.disabled = false; b.textContent = 'Claim'; }
    });
    return h('div', { class: 'qxt-rewards-row' },
      h('img', { src: '/chain-symbol-icons/' + ICON[x.chain] + '.svg', alt: '', width: 18, height: 18 }),
      h('span', { class: 'qxt-rewards-chain', title: CHAIN_NAME[x.chain] }, LABEL[x.chain]),
      h('b', {}, small(x.v, x.d), h('small', {}, ' ' + x.sym)), b);
  }));
  if (!notice) status.textContent = '';
  if (!items.length) list.replaceChildren(h('div', { class: 'qxt-rewards-empty' }, h('span', {}, 'Nothing to claim right now. Trades in the terminal earn 30% of their fee back, and your link earns 20% of your referrals’ fees.')));
}

function toggle(open = panel.hidden) {
  panel.hidden = !open; btn.setAttribute('aria-expanded', String(open));
  if (open) load();
}
btn.addEventListener('click', e => { e.stopPropagation(); toggle(); });
document.addEventListener('click', e => { if (!panel.hidden && !panel.contains(e.target) && !btn.contains(e.target)) toggle(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) { toggle(false); btn.focus(); } });
document.addEventListener('qhooks:rewards-claimed', () => { const me = connectedAddress(); if (me && panel.hidden) scan(me).then(markDot).catch(() => {}); });
document.addEventListener('qhooks:traded', () => { const me = connectedAddress(); if (!panel.hidden) load(); else if (me) scan(me).then(markDot).catch(() => {}); });
let seen = null;
const sync = () => {
  const me = connectedAddress();
  btn.hidden = !me; if (!me) { toggle(false); btn.classList.remove('has'); }
  if (me && me !== seen) { seen = me; scan(me).then(markDot).catch(() => {}); }
};
onWalletChange(sync); sync();
