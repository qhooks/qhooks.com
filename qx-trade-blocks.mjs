// Trade page: reads the selected pool's launch blocks from chain and shows what a trade pays now.
import { BLOCKS, QUOTE_ASSETS, AUCTION_ADDRESS } from '/qx-block-catalog.mjs';
import { BLOCK_FIELDS, BLOCK_BITS } from '/full-launch/packages/multichain-launch/launch-blocks.mjs';
import { setSwapReferrer } from '/full-launch/packages/multichain-swap/calldata.mjs';
import { stockPair } from '/full-launch/packages/multichain-launch/stock-pairs.mjs';

// Referral links: the first ?ref= this browser sees is kept, so saved swaps rebuild identically.
const REF_KEY = 'qhooks:referrer:v1';
try {
  const incoming = (new URLSearchParams(location.search).get('ref') || '').toLowerCase();
  if (/^0x[0-9a-f]{40}$/.test(incoming) && !localStorage.getItem(REF_KEY)) localStorage.setItem(REF_KEY, incoming);
  setSwapReferrer(localStorage.getItem(REF_KEY));
} catch {}

const RPC = { '8453': 'https://mainnet.base.org', '4663': 'https://rpc.mainnet.chain.robinhood.com', '1': 'https://ethereum-rpc.publicnode.com',
  '42161': 'https://arb1.arbitrum.io/rpc', '56': 'https://bsc-dataseed.bnbchain.org', '5042': 'https://rpc.mainnet.arc.io' };
const SEL = { config: '0x79502c55', previewRate: '0xb9c3fc44', kingCurrent: '0x32cf3d5f', kingPot: '0x496def18', clockPot: '0x68ca9100', clockDeadline: '0x0e6b792b', buybackPot: '0x39a704dc', totalPoints: '0x567142be', launchTime: '0x790ca413' };
const card = document.getElementById('qtb');
// Trade page: "Open in the terminal" carries the selected pool.
document.addEventListener('qhooks:pool', e => { const a = document.getElementById('qt-terminal'); if (a && e.detail) a.href = '/terminal.html#pool=' + encodeURIComponent(JSON.stringify(e.detail)); });
const word = (hex, i) => BigInt('0x' + hex.slice(2 + i * 64, 2 + (i + 1) * 64));
const pad = v => BigInt(v).toString(16).padStart(64, '0');
let seq = 0;

async function call(chainId, to, data) {
  const r = await fetch(RPC[chainId], { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }) });
  const j = await r.json(); if (!j.result || j.result === '0x') throw new Error('No blocks contract'); return j.result;
}
const pct = bps => (Number(bps) / 100).toFixed(2).replace(/\.?0+$/, m => m.startsWith('.') ? '' : m).replace(/(\.\d*[1-9])0+$/, '$1') + '%';
const dur = s => { s = Number(s); return s >= 86400 ? +(s / 86400).toFixed(1) + ' d' : s >= 3600 ? +(s / 3600).toFixed(1) + ' h' : s >= 60 ? Math.round(s / 60) + ' min' : s + ' s'; };

function summary(id, c, [sym, dec]) {
  const q = v => (Number(v) / 10 ** dec).toLocaleString(undefined, { maximumFractionDigits: 4 }) + ' ' + sym;
  switch (id) {
    case 'openDelay': return 'opens ' + dur(c.openDelay) + ' after launch';
    case 'antiSnipe': return pct(c.snipeBps) + ' falling over ' + dur(c.snipeDecay) + (c.maxBuyPerBlock > 0n ? ', ' + q(c.maxBuyPerBlock) + ' per block' : '');
    case 'walletCap': return pct(c.walletCapBps) + ' of supply per wallet for ' + dur(c.guardSeconds);
    case 'maxTrade': return pct(c.maxTradeBps) + ' of supply per trade' + (c.maxTradeSeconds > 0n ? ' for ' + dur(c.maxTradeSeconds) : '');
    case 'cooldown': return dur(c.cooldownSeconds) + ' between buys';
    case 'holderGate': return 'holders only for ' + dur(c.gateSeconds);
    case 'openingAuction': return 'one price for the first ' + dur(c.gateSeconds);
    case 'exitClock': return pct(c.exitTopBps) + ' → ' + pct(c.exitFloorBps) + ' over ' + dur(c.exitHorizon);
    case 'sandwich': return 'up to ' + pct(c.sandwichMaxBps);
    case 'impactFee': return 'up to ' + pct(c.impactCeilBps);
    case 'stormFee': return pct(c.stormFloorBps) + ' to ' + pct(c.stormCeilBps);
    case 'sessionFee': return pct(c.regularBps) + ' regular · ' + pct(c.closedBps) + ' weekend';
    case 'tax': return 'buy ' + pct(c.buyTaxBps) + ' · sell ' + pct(c.sellTaxBps) + (c.launchTaxBps > 0n ? ' (from ' + pct(c.launchTaxBps) + ')' : '');
    case 'sizeTiers': return pct(c.tier1Bps) + ' from ' + q(c.tier1) + ', ' + pct(c.tier2Bps) + ' from ' + q(c.tier2);
    case 'autoBurn': return pct(c.burnBps) + ' of each buy';
    case 'king': return pct(c.kingShareBps) + ' of charges, ' + dur(c.kingRound) + ' rounds';
    case 'clockPot': return pct(c.clockShareBps) + ' of charges, ' + dur(c.clockTimer) + ' timer';
    case 'buyback': return pct(c.buybackShareBps) + ' of charges';
    case 'referrals': return pct(c.referralShareBps) + ' to referrers';
    default: return '';
  }
}

function referral(c) {
  const h = (t, a = {}, ...k) => { const n = document.createElement(t); Object.assign(n, a); n.append(...k); return n; };
  const box = h('div', { className: 'qtb-ref' }, h('h3', { textContent: 'Earn ' + pct(c.referralShareBps) + ' of block charges' }));
  const out = h('input', { readOnly: true, value: '', placeholder: 'Connect your wallet to get your link', ariaLabel: 'Your referral link' });
  const copy = h('button', { type: 'button', textContent: 'Copy', disabled: true, onclick: async () => { try { await navigator.clipboard.writeText(out.value); copy.textContent = 'Copied'; setTimeout(() => copy.textContent = 'Copy', 1500); } catch {} } });
  const update = () => { const m = (document.getElementById('qt-connection')?.textContent || '').match(/0x[0-9a-fA-F]{40}/); if (m) { const u = new URL(location.href); u.searchParams.set('ref', m[0].toLowerCase()); out.value = u.toString(); copy.disabled = false; } };
  update(); new MutationObserver(update).observe(document.getElementById('qt-connection') || document.body, { childList: true, subtree: true, characterData: true });
  box.append(h('p', { textContent: 'Trades made through your link credit you a share of their block charges. Claim it from the blocks contract any time.' }), h('div', { className: 'qtb-ref-row' }, out, copy));
  return box;
}

async function show(pool) {
  const mine = ++seq;
  const blocks = pool?.constructor?.blocks;
  if (!card || !blocks || BigInt(blocks) === 0n || !RPC[pool.chainId]) { if (card) card.hidden = true; return; }
  try {
    const raw = await call(pool.chainId, blocks, SEL.config);
    const c = Object.fromEntries(BLOCK_FIELDS.map(([k], i) => [k, word(raw, i)]));
    let on = Object.entries(BLOCK_BITS).filter(([, b]) => (c.mask >> BigInt(b)) & 1n).map(([id]) => id);
    if (on.includes('holderGate') && c.gateToken === BigInt(AUCTION_ADDRESS)) on = on.map(x => x === 'holderGate' ? 'openingAuction' : x);
    const [buy, sell, kingRound, clockPot, buybackPot] = await Promise.all([
      call(pool.chainId, blocks, SEL.previewRate + pad(1) + pad(0) + pad(0)), call(pool.chainId, blocks, SEL.previewRate + pad(0) + pad(0) + pad(0)),
      call(pool.chainId, blocks, SEL.kingCurrent), call(pool.chainId, blocks, SEL.clockPot), call(pool.chainId, blocks, SEL.buybackPot)]);
    const kingPot = on.includes('king') ? await call(pool.chainId, blocks, SEL.kingPot + pad(BigInt(kingRound))) : '0x0';
    if (mine !== seq) return;
    const stock = stockPair(pool.chainId, pool.constructor.quote), asset = stock ? [stock.symbol, 18] : QUOTE_ASSETS[pool.chainId] || ['quote', 18], q = v => (Number(BigInt(v)) / 10 ** asset[1]).toLocaleString(undefined, { maximumFractionDigits: 4 }) + ' ' + asset[0];
    const h = (t, a = {}, ...k) => { const n = document.createElement(t); Object.assign(n, a); n.append(...k); return n; };
    const list = h('ul', { className: 'qtb-list' }, ...on.map(id => { const b = BLOCKS.find(x => x.id === id); return h('li', {}, h('a', { href: '/hooks.html#block-' + id, textContent: b?.name || id }), h('span', { textContent: summary(id, c, asset) })); }));
    const pots = [on.includes('king') && ['King pot', q(kingPot)], on.includes('clockPot') && ['Last-buyer pot', q(clockPot)], on.includes('buyback') && ['Buyback pot', q(buybackPot)]].filter(Boolean);
    card.replaceChildren(
      h('h2', { id: 'qtb-heading', textContent: 'Blocks on this pool' }),
      h('div', { className: 'qtb-now' }, h('div', {}, h('span', { textContent: 'A buy pays now' }), h('b', { textContent: pct(BigInt(buy)) })), h('div', {}, h('span', { textContent: 'A sell pays now' }), h('b', { textContent: pct(BigInt(sell)) }))),
      h('p', { className: 'qtb-note', textContent: 'Block charges on top of the LP and protocol fees, before any price-impact or sandwich charge. Your quote includes everything.' }),
      on.length ? list : h('p', { className: 'qtb-note', textContent: 'No blocks are switched on for this pool.' }),
      pots.length ? h('dl', { className: 'qtb-pots' }, ...pots.map(([k, v]) => h('div', {}, h('dt', { textContent: k }), h('dd', { textContent: v })))) : '',
      on.includes('referrals') ? referral(c) : '');
    card.hidden = false;
  } catch { if (mine === seq) card.hidden = true; }
}

document.addEventListener('qhooks:pool', e => show(e.detail));
// A pool from the page link may be chosen before this module runs.
if (window.__qhooksPool) show(window.__qhooksPool);
