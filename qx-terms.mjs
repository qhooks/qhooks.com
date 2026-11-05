// Launch terms, read from the launch's own contracts: whether its liquidity can ever be withdrawn, how and
// when it graduates, the public notice before any graduation-policy change, and the pool's fee split.
// Shown on the Trade page and in the terminal's tools.
import { ethCall, words, livePoolKey, erc20, formatUnits, h } from '/qx-chain.mjs';
import { alertsButton } from '/qx-alerts.mjs';
import { boardLink } from '/qx-board-link.mjs';
import { renderTrust } from '/qx-trust.mjs';

const SEL = { notice: '0x6b188e85', phase: '0xb1c9fe6e', policy: '0xe2e269f2', creatorFee: '0xe9b7df7f', protocolFee: '0x6b4082d1', recoveryEta: '0x1479b3da', recoveryBy: '0xaa19ddc3' };
const PHASE = ['Not started', 'Launch pool', 'Graduated pool', 'Closed'];
const card = document.getElementById('qtt');
let seq = 0;

const dur = s => s >= 86400 ? +(s / 86400).toFixed(1) + ' days' : s >= 3600 ? +(s / 3600).toFixed(1) + ' hours' : Math.round(s / 60) + ' minutes';
const pct = ppm => (Number(ppm) / 10000).toString().replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '') + '%';

async function show(pool) {
  const mine = ++seq;
  if (!card || !pool?.controller) { if (card) card.hidden = true; return; }
  try {
    const { chainId, controller } = pool, c = pool.constructor, quote = c.quote;
    const blocksGen = Object.hasOwn(c, 'blocks');
    const [notice, phase, policy, key, q] = await Promise.all([ethCall(chainId, controller, SEL.notice), ethCall(chainId, controller, SEL.phase), ethCall(chainId, controller, SEL.policy),
      livePoolKey(chainId, controller), erc20(chainId, quote)]);
    const [creatorFee, protocolFee, recoveryEta, recoveryBy] = await Promise.all([ethCall(chainId, key.hooks, SEL.creatorFee).then(BigInt).catch(() => null), ethCall(chainId, key.hooks, SEL.protocolFee).then(BigInt).catch(() => null),
      ethCall(chainId, controller, SEL.recoveryEta).then(x => Number(BigInt(x))).catch(() => null), ethCall(chainId, controller, SEL.recoveryBy).then(x => Number(BigInt(x))).catch(() => 0)]);
    if (mine !== seq) return;
    const w = words(policy), mode = Number(w[0]), threshold = w[2], pendingHash = w[14], pendingEta = Number(w[15]);
    const graduation = mode === 2 ? 'Stays in the launch pool (no graduation)'
      : mode === 1 ? 'The creator graduates it with both keys'
      : 'Graduates once ' + formatUnits(threshold, q.decimals, 2) + ' ' + q.symbol + ' has been raised';
    const rows = [
      ['Liquidity', blocksGen ? 'Permanent. Nobody, the creator included, can ever withdraw it; graduation moves all of it to the graduated pool at the current price.' : 'The creator can withdraw the graduated pool’s liquidity with both keys.'],
      ['Now trading in', PHASE[Number(BigInt(phase))] || '—'],
      ['Graduation', graduation],
      ['Policy changes', 'Announced on chain ' + dur(Number(BigInt(notice))) + ' before they can apply' + (BigInt(pendingHash) ? '. One is pending, applicable from ' + new Date(pendingEta * 1000).toLocaleString() : '. None pending')],
      ...(creatorFee != null ? [['Pool fee', pct(creatorFee) + ' to the creator, plus ' + pct(protocolFee) + ' to the platform']] : []),
      ['Protected actions', 'Fee claims, graduation and policy changes need the creator’s wallet and post-quantum key together'],
      ...(recoveryEta == null ? [] : [['Key recovery', recoveryEta > 0
        ? '⚠ A recovery started by the creator’s ' + (recoveryBy === 1 ? 'wallet' : 'quantum key') + ' replaces the keys from ' + new Date(recoveryEta * 1000).toLocaleString() + ' unless the other key cancels it.'
        : 'Either creator key alone can start a 90-day takeover of both keys; the other key can cancel it. None pending.']])
    ];
    // Who made it, whether it copies an earlier verified launch, and the pre-buy verdict (qx-trust.mjs) come first.
    const trust = h('div', { class: 'qtr' });
    renderTrust(trust, pool).catch(() => trust.remove());
    card.replaceChildren(h('h2', { id: 'qtt-heading' }, 'Launch terms'), trust,
      h('ul', { class: 'qtb-list' }, ...rows.map(([k, v]) => h('li', {}, h('b', {}, k), h('span', {}, v)))),
      h('p', { class: 'qtb-note' }, 'Read from this launch’s contracts just now, not from anything the creator wrote.'),
      alertsButton(pool), boardLink(pool.chainId, pool.controller, { cls: 'qtb-note qb-boardlink' }));
    card.hidden = false;
  } catch { if (mine === seq) card.hidden = true; }
}

document.addEventListener('qhooks:pool', e => show(e.detail));
if (window.__qhooksPool) show(window.__qhooksPool);
