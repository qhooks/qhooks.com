// The sale page: /sale.html?chain=<id>&id=<sale id>. Reads the sale straight from QSaleLaunch on the chain (no server
// needed), shows progress, time left, the price and your allocation, and sends buy, settle, claim or refund with the
// connected wallet. Refreshes every 5 seconds.
import {getWalletHub} from './wallet-hub-fresh.mjs';
import {chainById} from './chains.mjs';
import {saleAddress, decodeSale, stateAt, outcome, clearAt, priceAt, capAt, tokensFor, timeText, compact, fromWei, toWei,
  encodeCommit, encodeSettle, encodeClaim, encodeRefund, encodeAllocation, SEL, feeFields, saleCapText, SUPPLY} from './qx-sale-core.mjs';
import {readCreateNativeUSD} from './qx-create-prices.mjs';

const root = document.getElementById('qsa-root'), hub = getWalletHub(window), q = new URLSearchParams(location.search);
const chainId = String(q.get('chain') || ''), saleId = /^\d{1,9}$/.test(q.get('id') || '') ? Number(q.get('id')) : null;
const chain = chainById(chainId), address = saleAddress(chainId);
const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v); } n.append(...kids.flat().filter(k => k != null && k !== false)); return n; };
let sale = null, mine = null, busy = false, note = '', noteBad = false, offset = 0;
let paymentUsd = null, usdAt = 0, totalSupply = SUPPLY;
async function readUsd() {
  if (Date.now() - usdAt < 60000) return;
  paymentUsd = /USD/.test(chain.native) ? 1 : await readCreateNativeUSD(chain.native).catch(() => null);
  usdAt = Date.now();
}

async function rpc(method, params) {
  const r = await fetch(chain.rpc, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params})});
  const j = await r.json(); if (j.error) throw Error(j.error.message || 'Network read failed'); return j.result;
}
const call = data => rpc('eth_call', [{to: address, data}, 'latest']);
const word = v => BigInt(v).toString(16).padStart(64, '0');

async function load() {
  // Bare /sale (no chain, no id): a neutral intro. The error is only for a malformed or unknown link.
  if (!q.has('chain') && !q.has('id')) { show(el('p', {class: 'sa-intro'}, 'Open a sale link to see it here')); return; }
  if (!chain || !address || saleId === null) { show(el('p', {}, 'This sale link is not valid.')); return; }
  try {
    const [h, block] = await Promise.all([call(SEL.saleOf + word(saleId)), rpc('eth_getBlockByNumber', ['latest', false]), readUsd()]);
    sale = decodeSale(h);
    // Settlement may burn unsold inventory. Do not call the original 1B supply its current market cap.
    totalSupply = sale.settled ? await rpc('eth_call', [{to: sale.token, data: '0x18160ddd'}, 'latest']).then(raw => BigInt(raw)).catch(() => 0n) : SUPPLY;
    offset = Number(BigInt(block.timestamp)) - Math.floor(Date.now() / 1000); // chain clock vs this device
    const who = hub.snapshot().current?.owner;
    if (who) {
      const a = await call(encodeAllocation(saleId, who));
      mine = {owner: who, coin: BigInt('0x' + a.slice(2, 66)), done: BigInt('0x' + a.slice(130, 194)) === 1n};
    } else mine = null;
    render();
  } catch (e) {
    show(el('p', {}, /revert|invalid|BadParams/i.test(String(e.message)) ? 'No sale with this number on ' + (chain?.name || 'this chain') + '.' : 'Could not read the sale right now. It retries in a few seconds.'));
  }
}

function show(...kids) { root.replaceChildren(...kids.filter(k => k != null && k !== false)); }
const now = () => Math.floor(Date.now() / 1000) + offset;
const coin = v => fromWei(v, 6) + ' ' + chain.native;

function render() {
  const s = sale, t = now(), st = stateAt(s, t), next = outcome(s, t), clear = clearAt(s);
  const cap = s.mode === 0 ? capAt(s, s.start) : capAt(s, t);
  const pct = cap ? Math.min(100, Number(BigInt(s.raised) * 10000n / cap) / 100) : 0;
  const minPct = cap ? Math.min(100, Number(BigInt(s.softCap) * 10000n / cap) / 100) : 0;
  const label = {upcoming: 'Starts in ' + timeText(s.start - t), live: 'Live · ends in ' + timeText(s.end - t), closed: next === 'ready' ? 'Sale over · ready to settle' : 'Sale over · under the minimum',
    failed: 'Failed · refunds open', settled: 'Settled · trading'}[st];
  const head = el('div', {class: 'qsa-head'}, el('h1', {}, s.name, ' ', el('span', {class: 'qsa-sym'}, '$' + s.symbol)),
    el('p', {class: 'qsa-meta'}, chain.name + ' · ' + (s.mode === 1 ? 'Falling price' : 'Fixed price') + ' · sale #' + saleId),
    el('p', {class: 'qsa-state', 'data-state': st}, label));
  const bar = el('div', {class: 'qsa-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(pct)), 'aria-label': 'Raised so far'},
    el('span', {class: 'qsa-fill', style: 'width:' + pct + '%'}), el('span', {class: 'qsa-min', style: 'left:' + minPct + '%', title: 'Minimum'}));
  const nums = el('dl', {class: 'qsa-nums'},
    el('div', {}, el('dt', {}, 'Raised'), el('dd', {}, coin(s.raised))),
    el('div', {}, el('dt', {}, 'Minimum'), el('dd', {}, coin(s.softCap))),
    el('div', {}, el('dt', {}, st === 'live' && s.mode === 1 ? 'Sells out at' : 'Most it can raise'), el('dd', {}, coin(cap))),
    el('div', {}, el('dt', {}, 'Buyers'), el('dd', {}, String(s.buyers))),
    el('div', {}, el('dt', {}, st === 'settled' ? 'Final price' : 'Price now'), el('dd', {}, coin(st === 'settled' ? BigInt(s.clearPrice) * 10n ** 6n : priceAt(s, t) * 10n ** 6n) + ' per 1M', el('small', {class: 'qsa-price-cap'}, saleCapText(st === 'settled' ? s.clearPrice : priceAt(s, t), paymentUsd, totalSupply)))),
    s.mode === 1 && st !== 'settled' ? el('div', {}, el('dt', {}, 'Start price'), el('dd', {}, coin(BigInt(s.price) * 10n ** 6n) + ' per 1M', el('small', {class: 'qsa-price-cap'}, saleCapText(s.price, paymentUsd)))) : null,
    s.mode === 1 && st !== 'settled' ? el('div', {}, el('dt', {}, 'Floor'), el('dd', {}, coin(BigInt(s.floorPrice) * 10n ** 6n) + ' per 1M', el('small', {class: 'qsa-price-cap'}, saleCapText(s.floorPrice, paymentUsd)))) : null,
    s.walletCap > 0n ? el('div', {}, el('dt', {}, 'Wallet limit'), el('dd', {}, coin(s.walletCap))) : null);
  const you = mine ? el('div', {class: 'qsa-you'}, el('h2', {}, 'Your allocation'),
    mine.coin > 0n ? el('p', {}, 'You put in ' + coin(mine.coin) + '. ' + (st === 'failed' || next === 'refund' ? (mine.done ? 'Refunded.' : 'You get it all back.')
      : (mine.done ? 'Claimed ' : (st === 'settled' ? 'You can claim ' : 'At the price now that is about ')) + compact(tokensFor(mine.coin, clear)) + ' ' + s.symbol + '.')) : el('p', {}, 'You have not bought in this sale.')) : null;
  show(head, bar, nums, you, actions(st, next), el('p', {class: 'qsa-note', role: 'status', 'data-error': noteBad ? 'true' : null}, note),
    st === 'settled' ? el('p', {}, el('a', {href: '/terminal.html#m=' + chainId + ':' + s.token, class: 'qsa-link'}, 'Trade ' + s.symbol + ' in the terminal →')) : null,
    el('p', {class: 'qsa-fine'}, 'Token ', el('code', {}, s.token), st === 'settled' ? '' : ' (created when the sale settles)'));
}

function actions(st, next) {
  const conn = hub.snapshot().current;
  if (!conn) return el('div', {class: 'qsa-actions'}, el('button', {type: 'button', class: 'qxc-primary', onclick: () => hub.open()}, 'Connect wallet'));
  if (st === 'live') {
    const input = el('input', {id: 'qsa-amount', inputmode: 'decimal', autocomplete: 'off', placeholder: '0.01', 'aria-label': 'Amount in ' + chain.native});
    return el('div', {class: 'qsa-actions'}, el('label', {for: 'qsa-amount'}, 'Amount (' + chain.native + ')'), input,
      el('button', {type: 'button', class: 'qxc-primary', disabled: busy, onclick: () => buy(input.value)}, 'Buy'),
      el('p', {class: 'qsa-fine'}, sale.mode === 1 ? 'Everyone pays the final price. Anything above what sells out the sale comes straight back.' : 'Anything above what is left comes straight back.'));
  }
  if (st === 'closed') return el('div', {class: 'qsa-actions'}, next === 'ready'
    ? el('button', {type: 'button', class: 'qxc-primary', disabled: busy, onclick: () => send(encodeSettle(saleId), 0n, 'Settling: creating the token and its locked pool…', 'Settled.')}, 'Settle sale')
    : (mine?.coin > 0n && !mine.done ? el('button', {type: 'button', class: 'qxc-primary', disabled: busy, onclick: () => send(encodeRefund(saleId, conn.owner), 0n, 'Refunding…', 'Refunded.')}, 'Get my refund') : el('p', {}, 'The sale missed its minimum; buyers can take a full refund.')));
  if (st === 'failed') return mine?.coin > 0n && !mine.done ? el('div', {class: 'qsa-actions'}, el('button', {type: 'button', class: 'qxc-primary', disabled: busy, onclick: () => send(encodeRefund(saleId, conn.owner), 0n, 'Refunding…', 'Refunded.')}, 'Get my refund')) : null;
  if (st === 'settled') return mine?.coin > 0n && !mine.done ? el('div', {class: 'qsa-actions'}, el('button', {type: 'button', class: 'qxc-primary', disabled: busy, onclick: () => send(encodeClaim(saleId, conn.owner), 0n, 'Claiming…', 'Claimed.')}, 'Claim my tokens')) : null;
  return null;
}

async function buy(text) {
  let v;
  try { v = toWei(text); if (v <= 0n) throw new TypeError('Enter an amount.'); } catch (e) { setNote(e.message, true); return; }
  const done = mine?.coin || 0n;
  if (sale.walletCap > 0n && done + v > sale.walletCap) { setNote('That is over this sale’s wallet limit of ' + coin(sale.walletCap) + '.', true); return; }
  await send(encodeCommit(saleId), v, 'Buying…', 'Bought.');
}

async function receipt(provider, hash) {
  for (let i = 0; i < 240; i++) {
    const r = await provider.request({method: 'eth_getTransactionReceipt', params: [hash]}).catch(() => null);
    if (r) return r;
    await new Promise(res => setTimeout(res, i < 20 ? 750 : 2000));
  }
  throw Error('The network took too long to confirm. Your transaction may still land.');
}

async function send(data, value, working, ok) {
  if (busy) return;
  let conn = hub.snapshot().current; if (!conn) { hub.open(); return; }
  busy = true; setNote(working);
  try {
    if (conn.chainId !== chainId) { setNote('Switching your wallet to ' + chain.name + '…'); conn = await hub.switchChain(chainId); }
    const fees = await feeFields(rpc);
    const hash = await conn.entry.provider.request({method: 'eth_sendTransaction', params: [{from: conn.owner, to: address, data, value: '0x' + value.toString(16), ...fees}]});
    setNote('Sent. Waiting for the network…');
    const r = await receipt(conn.entry.provider, hash);
    if (r.status !== '0x1') throw Error('The network refused it. Nothing changed; only network gas was spent.');
    setNote(ok);
  } catch (e) {
    const m = String(e?.message || e);
    setNote(/reject|denied|cancel/i.test(m) ? 'You cancelled in your wallet.' : /wallet limit/i.test(m) ? 'That is over this sale’s wallet limit.' : /WrongState|0x3e5ab8e5/.test(m) ? 'The sale moved on. Reloading…' : m.slice(0, 200), true);
  } finally { busy = false; await load(); }
}
function setNote(text, bad = false) { note = text; noteBad = bad; if (sale) render(); }

hub.subscribe(() => void load());
load();
setInterval(() => { if (!document.hidden && !busy) void load(); }, 5000);
