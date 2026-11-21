// /round?chain=<id>&round=<address>[&b=<creation block>] (2026-11-21): one contributor round, read from the chain.
// Shown only when the RoundFactory has code on the chain and isRound(round) is true; any read error shows nothing but a
// plain line (no card, no claim UI). Actions: contribute (approve first on USDC rounds), settle when Ready (anyone; meta
// from the RoundCreated log, hash-checked here against metaHash), claim / claimFor with the vesting schedule,
// refund / refundAll when refunds are open, cancel for the creator before the first contribution.
// Every send is simulated (eth_call) and estimated first; nothing is sent from any wallet but the connected one.
import {getWalletHub} from '/wallet-hub-fresh.mjs';
import {chainById} from '/chains.mjs';
import {ROUND_TEXT as T, ROUND_FACTORY, roundChain, call, SEL, projectRound, vestedAt, toUnits, fromUnits, pct, keccakText} from '/qx-round-core.mjs';
import {readRound, rpcBatch} from '/qx-round-read.mjs';

const root = document.getElementById('qrp-root'), hub = getWalletHub(window), q = new URLSearchParams(location.search);
const chainId = String(q.get('chain') || ''), round = String(q.get('round') || '').toLowerCase(), hint = /^\d{1,12}$/.test(q.get('b') || '') ? q.get('b') : null;
const rpcUrl = id => String(id) === '4663' ? '/api/rpc/4663' : chainById(id)?.rpc;
const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v); } n.append(...kids.flat().filter(x => x != null && x !== false)); return n; };
const dl = (...pairs) => el('dl', {}, ...pairs.filter(Boolean).flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)]));
let R = null, meta = null, metaRead = false, busy = false, msg = {text: '', tone: ''}, amountText = '', claimTo = '', loaded = false;

const net = () => chainById(chainId);
const unit = () => R.nativeQuote ? net().native : (net().quote?.address?.toLowerCase() === R.quote.toLowerCase() ? net().quote.symbol : 'tokens');
const amt = v => fromUnits(v, R.decimals) + ' ' + unit();
const tokens = v => fromUnits(v, 18, 4);
const when = s => new Date(s * 1000).toLocaleString(undefined, {dateStyle: 'medium', timeStyle: 'short'});
function rel(s) {
  const d = s - Math.floor(Date.now() / 1000), a = Math.abs(d), days = Math.floor(a / 86400), hours = Math.floor(a % 86400 / 3600), mins = Math.floor(a % 3600 / 60);
  const t = days ? days + ' d ' + hours + ' h' : hours ? hours + ' h ' + mins + ' min' : mins + ' min';
  return d >= 0 ? 'in ' + t : t + ' ago';
}
const say = (text, tone = '') => { msg = {text, tone}; draw(); };

async function load() {
  if (!roundChain(chainId) || !/^0x[0-9a-f]{40}$/.test(round) || !rpcUrl(chainId)) { R = null; loaded = true; draw(); return; }
  const owner = hub.snapshot().current?.owner || null;
  try { const r = await readRound({batch: rpcBatch(rpcUrl(chainId)), chainId, round, account: owner}); R = r.ok ? r : null; }
  catch { R = null; }
  loaded = true;
  if (R && R.status === 'Ready' && !metaRead) await readMeta();
  draw();
}
// The launch details settle needs, from the Worker's RoundCreated lookup; used only if they hash to the round's metaHash.
async function readMeta() {
  metaRead = true;
  try {
    const j = await fetch('/api/v1/rounds/' + chainId + '/round/' + round + (hint ? '?b=' + hint : '')).then(r => r.ok ? r.json() : null);
    meta = typeof j?.meta === 'string' && keccakText(j.meta) === R.metaHash.toLowerCase() ? j.meta : null;
  } catch { meta = null; }
}

async function rpc(method, params) { const [v] = await rpcBatch(rpcUrl(chainId))([{method, params}]); return v; }
async function send(data, value = 0n, label = 'Confirm in your wallet…') {
  if (busy) return;
  let conn = hub.snapshot().current; if (!conn) { hub.open(); return; }
  busy = true; say('');
  try {
    if (conn.chainId !== chainId) { say('Switching your wallet to ' + net().name + '…'); conn = await hub.switchChain(chainId); if (conn?.chainId !== chainId) throw Error('Switch your wallet to ' + net().name + ', then try again.'); }
    const from = conn.owner, tx = {from, to: data.to || round, data: data.data || data, value: '0x' + BigInt(value).toString(16)};
    try { await rpc('eth_call', [tx, 'latest']); tx.gas = '0x' + (BigInt(await rpc('eth_estimateGas', [tx])) * 13n / 10n).toString(16); }
    catch { throw Error('This would fail right now (often: the round moved on, or not enough in the wallet on this chain). Nothing was sent.'); }
    try { const b = await rpc('eth_getBlockByNumber', ['latest', false]), tip = BigInt(await conn.entry.provider.request({method: 'eth_maxPriorityFeePerGas'}).catch(() => '0x0'));
      if (b?.baseFeePerGas) { tx.maxPriorityFeePerGas = '0x' + tip.toString(16); tx.maxFeePerGas = '0x' + (BigInt(b.baseFeePerGas) * 2n + tip).toString(16); } } catch {}
    if (hub.snapshot().current?.owner !== from) throw Error('Your wallet changed. Try again.');
    say(label);
    const hash = await conn.entry.provider.request({method: 'eth_sendTransaction', params: [tx]});
    say('Sent. Waiting for the network…');
    let r = null; for (let i = 0; i < 240 && !r; i++) { r = await conn.entry.provider.request({method: 'eth_getTransactionReceipt', params: [hash]}).catch(() => null); if (!r) await new Promise(res => setTimeout(res, i < 20 ? 750 : 2000)); }
    if (!r) throw Error('Still pending. Check your wallet activity, then reload this page.');
    if (r.status !== '0x1') throw Error('The network refused it. Only network gas was spent.');
    busy = false; amountText = ''; say('Done.', 'ok');
  } catch (e) { busy = false; say(/reject|denied|cancel/i.test(e?.message || '') ? 'Cancelled in your wallet. Nothing was sent.' : (e?.message || 'That did not go through.'), 'bad'); }
  finally { busy = false; await load(); }
}

function button(text, onclick, disabled = false) { const b = el('button', {type: 'button', class: 'qtx-mini qas-go', disabled: busy || disabled}, text); b.addEventListener('click', onclick); return b; }
function overview() {
  const c = net(), tokenLink = R.settled ? el('a', {href: '/terminal#m=' + chainId + ':' + R.token}, R.token) : null;
  return el('section', {class: 'qcs-chainset qrp-overview'},
    el('h2', {}, R.name + ' (' + R.symbol + ')'),
    el('p', {}, T.statusLine[R.status] || R.status),
    // The setup shell folds a list of 6+ rows into "Review transaction details", so the money rows stay in short lists.
    dl([T.pot, amt(R.pot)], [T.min, amt(R.minRaise)], [T.max, amt(R.maxRaise)],
      [T.deadline, when(R.deadline) + ' (' + rel(R.deadline) + ')'],
      !R.settled && !R.cancelled && [T.grace, when(R.graceEnd) + ' (' + rel(R.graceEnd) + ')']),
    dl([T.poolFee, T.feeLine(R.fee)], ['Reserve', T.reserveLine(R.reserveBps)],
      ['Vesting', T.vestLine(+(R.vestCliff / 86400).toFixed(2), +(R.vestDuration / 86400).toFixed(2))], ['Chain', c.name]),
    R.settled ? dl(['Settled', when(R.settledAt)], tokenLink && ['Token', tokenLink],
      R.totalSupply && ['Round holds', pct(Number(R.tokensReceived * 1000000n / R.totalSupply) / 1e6, 2) + ' of supply']) : null,
    el('details', {class: 'setup-facts'}, el('summary', {}, 'Contracts'), dl(['Creator', R.creator], ['Round contract', R.round], ['Launch contract', R.launchFactory],
      ['Source code', el('a', {href: 'https://repo.sourcify.dev/' + chainId + '/' + ROUND_FACTORY, target: '_blank', rel: 'noopener'}, 'Verified on Sourcify')])));
}
function projection(potAfter = null) {
  const p = projectRound({pot: R.pot, startCap: R.startCap, reserveBps: R.reserveBps});
  if (!p) return null;
  return el('section', {class: 'qcs-chainset qrp-proj'}, el('h2', {}, T.projTitle),
    dl(['Start market cap', amt(R.startCap)], ['Pot now', amt(R.pot)], ['Average price', T.projAvg(p.avgRatio.toFixed(2))], ['Supply', T.projShare(pct(p.share))]),
    el('p', {class: 'qxc-fine'}, T.projExplain));
}
function seatSchedule(s) {
  const v = {settled: R.settled, settledAt: R.settledAt, vestCliff: R.vestCliff, vestDuration: R.vestDuration};
  const vested = vestedAt(s.allocation, R.now, v), claimable = vested > s.claimed ? vested - s.claimed : 0n;
  const lines = [];
  if (R.vestDuration) {
    if (R.vestCliff) lines.push('Nothing before ' + when(R.settledAt + R.vestCliff) + '.');
    lines.push('Fully unlocked ' + when(R.settledAt + R.vestDuration) + '.');
  } else lines.push('Everything is claimable now.');
  return {vested, claimable, lines};
}
function walletsCard() {
  const owner = hub.snapshot().current?.owner?.toLowerCase();
  return el('section', {class: 'qcs-chainset qrp-wallets'}, el('h2', {}, T.wallets + ' · ' + R.seats.length),
    ...R.seats.map(s => {
      const sch = R.settled ? seatSchedule(s) : null, owed = R.settled && (sch.claimable > 0n || s.quoteRefund > 0n);
      return el('div', {class: 'qcs-step qrp-seat', 'data-me': s.address === owner ? 'true' : false},
        el('h3', {}, s.address + (s.address === owner ? ' · you' : '')),
        dl(['Put in', T.seatLine(fromUnits(s.contributed, R.decimals), fromUnits(s.cap, R.decimals), unit())],
          R.settled && [T.allocation, tokens(s.allocation) + ' ' + R.symbol], R.settled && [T.claimed, tokens(s.claimed) + ' ' + R.symbol],
          R.settled && [T.claimable, tokens(sch.claimable) + ' ' + R.symbol + (s.quoteRefund > 0n ? ' + ' + amt(s.quoteRefund) : '')],
          R.refundsOpen && s.contributed > 0n && ['Refund', s.refunded ? 'Refunded' : 'Not yet refunded']),
        owed && s.address !== owner ? button(T.claimFor, () => void send(call.claimFor(s.address), 0n)) : null);
    }));
}
function mine() {
  const a = R.account; if (!a?.seat) return null;
  const s = a.seat, kids = [el('h2', {}, 'Your seat')];
  if (R.status === 'Open') {
    const left = s.cap - s.contributed, v = toUnits(amountText, R.decimals), ok = v != null && v > 0n && v <= left;
    const input = el('input', {id: 'qrp-amount', inputmode: 'decimal', autocomplete: 'off', value: amountText});
    input.addEventListener('input', () => { amountText = input.value; const n = document.getElementById('qrp-after'); if (n) n.textContent = afterText(); const b = document.getElementById('qrp-go'); if (b) b.disabled = !goOk(); const ap = document.getElementById('qrp-approve'); if (ap) ap.disabled = !approveOk(); });
    const afterText = () => { const x = toUnits(amountText, R.decimals); if (x == null || x <= 0n) return ''; const p = projectRound({pot: R.pot + x, startCap: R.startCap, reserveBps: R.reserveBps}); return p ? T.projAfter(p.avgRatio.toFixed(2), pct(p.share)) : ''; };
    const need = () => { const x = toUnits(amountText, R.decimals); return x != null && x > 0n && x <= left ? x : null; };
    const approveOk = () => !R.nativeQuote && need() != null && a.allowance < need();
    const goOk = () => need() != null && (R.nativeQuote || a.allowance >= need()) && a.balance >= need();
    kids.push(el('p', {}, T.left(fromUnits(left, R.decimals), unit())), el('label', {}, T.contributeLabel(unit()), input),
      el('p', {class: 'qxc-fine', id: 'qrp-after', role: 'status'}, ok ? afterText() : ''),
      el('p', {class: 'qxc-fine'}, 'In your wallet: ' + amt(a.balance) + (R.nativeQuote ? '' : ' · approved for this round: ' + amt(a.allowance))));
    if (!R.nativeQuote) { const b = button(T.approve(unit()), () => { const x = need(); if (x) void send({to: R.quote, data: call.approve(round, x)}, 0n, 'Approve exactly this amount in your wallet…'); }, !approveOk()); b.id = 'qrp-approve'; kids.push(b); }
    const g = button(T.contribute, () => { const x = need(); if (x) void send(call.contribute(x), R.nativeQuote ? x : 0n); }, !goOk()); g.id = 'qrp-go'; kids.push(g);
  } else if (R.settled) {
    const sch = seatSchedule(s), input = el('input', {id: 'qrp-to', autocomplete: 'off', spellcheck: 'false', placeholder: a.address, value: claimTo});
    input.addEventListener('input', () => { claimTo = input.value.trim(); });
    kids.push(dl([T.allocation, tokens(s.allocation) + ' ' + R.symbol], [T.claimed, tokens(s.claimed) + ' ' + R.symbol], [T.claimable, tokens(sch.claimable) + ' ' + R.symbol + (s.quoteRefund > 0n ? ' + ' + amt(s.quoteRefund) : '')], [T.schedule, sch.lines.join(' ')]),
      el('label', {}, T.claimTo, input),
      button(T.claim, () => { const to = claimTo || a.address; if (!/^0x[0-9a-fA-F]{40}$/.test(to)) { say('Check the address to send to.', 'bad'); return; } void send(call.claim(to.toLowerCase()), 0n); }, sch.claimable === 0n && s.quoteRefund === 0n));
  } else if (R.refundsOpen) {
    kids.push(dl(['Put in', amt(s.contributed)], ['Refund', s.refunded ? 'Refunded' : s.contributed > 0n ? 'Ready to take back' : 'Nothing to take back']),
      button(T.refund, () => void send(call.refund(a.address), 0n), s.refunded || s.contributed === 0n));
  } else kids.push(dl(['Put in', amt(s.contributed)]));
  return el('section', {class: 'qcs-chainset qrp-mine'}, ...kids);
}
function actions() {
  const kids = [], owner = hub.snapshot().current?.owner?.toLowerCase();
  if (R.status === 'Ready') {
    const fee = fromUnits(R.launchFee, 18) + ' ' + net().native;
    kids.push(el('h3', {}, T.settle), el('p', {class: 'qxc-fine'}, T.settleNote(fee)));
    if (!meta) kids.push(el('p', {class: 'qxc-fine', 'data-tone': 'bad'}, T.settleNeedsMeta));
    if (!R.chainQuoteOk) kids.push(el('p', {class: 'qxc-fine', 'data-tone': 'bad'}, 'The launch contract’s quote changed since this round was made, so settle would be refused.'));
    kids.push(button(T.settle, () => void send(call.settle(meta), R.launchFee, 'Confirm the launch in your wallet…'), !meta || !R.chainQuoteOk));
  }
  if (R.refundsOpen && R.seats.some(s => s.contributed > 0n && !s.refunded)) kids.push(el('h3', {}, T.refundAll), el('p', {class: 'qxc-fine'}, 'Anyone can send every wallet exactly what it put in. A wallet that can’t receive it keeps it here to take back itself.'), button(T.refundAll, () => void send(SEL.refundAll, 0n)));
  if (R.status === 'Open' && R.pot === 0n && owner === R.creator.toLowerCase()) kids.push(el('h3', {}, T.cancel), el('p', {class: 'qxc-fine'}, 'Only before anyone has put anything in. Nothing can be sent to the round after this.'), button(T.cancel, () => void send(SEL.cancel, 0n)));
  return kids.length ? el('section', {class: 'qcs-chainset qrp-actions'}, el('h2', {}, 'Actions'), ...kids) : null;
}
function draw() {
  if (!loaded) { root.replaceChildren(el('p', {}, 'Refreshing…')); return; }
  if (!R) { root.replaceChildren(el('p', {role: 'status'}, T.notShown)); return; }
  const conn = hub.snapshot().current;
  root.replaceChildren(...[overview(), !R.settled && !R.refundsOpen && !R.cancelled ? projection() : null, mine() || (conn ? null : el('p', {class: 'qxc-fine'}, 'Connect a listed wallet to put in, claim or take back.')), walletsCard(), actions(),
    el('p', {class: 'qas-status', role: 'status', 'aria-live': 'polite', 'data-tone': msg.tone || false}, msg.text)].filter(Boolean));
}
draw(); void load();
let lastOwner = null;
hub.subscribe(c => { const o = c.current?.owner || null; if (o !== lastOwner) { lastOwner = o; if (!busy) void load(); } else draw(); });
