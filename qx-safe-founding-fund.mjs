// Hidden page (2026-11-10): the QHooks Safe's two Founding Launchers transactions, same approve-then-send flow as
// /safe-drops-fund (no Safe app; owner A calls approveHash, owner B execTransaction with both v=1 signatures).
// 1. Grants: 50,000 QHOOKS each, vested 30 days, for founding creators who reached the milestone before today 00:00
//    UTC and don't have one yet (read from QGrants on chain), in slot order, within the 2.5M budget.
// 2. Top-up: the founding WETH the drop list is waiting for, deposited into QDrops.
// Everything that decides the hash is fixed for the day (the cut, on-chain grants, a list update), so both owners
// build the same transaction. Nothing is sent unless an eth_call of the exact transaction succeeds from the owner.
import {getWalletHub} from '/wallet-hub-fresh.mjs';
import {chainById} from '/chains.mjs';
import {FOUNDING, grantBatch, dayCut} from '/founding-config.mjs';
import {grantsTx, topUpTx, decodeGrant, grantedSet, SEL} from '/founding-fund.mjs';
import {safeHashCall, safeExecData} from '/qdrops-core.mjs';
const hub = getWalletHub(window), CHAIN = FOUNDING.pay.chain, SAFE = FOUNDING.grant.grantor;
const OWNERS = [{a: '0x88db60586866294409e47bbbb0b436104f09c1b5', name: 'Qhooks 1'}, {a: '0x9b13398df547c18e68d1cfe086ff1cb5f1a84127', name: 'Qhooks2'}];
const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v); n.append(...kids.filter(k => k != null)); return n; };
const pad = a => a.toLowerCase().slice(2).padStart(64, '0'), W = v => BigInt(v).toString(16).padStart(64, '0');
const fmt = (v, d = 0) => (Number(BigInt(v)) / 1e18).toLocaleString('en-US', {maximumFractionDigits: d});
async function rpc(method, params) {
  const r = await fetch(chainById(CHAIN).rpc, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params})});
  const j = await r.json(); if (j.error) throw Error(j.error.message || 'Network read failed'); return j.result;
}
const call = (to, data, from) => rpc('eth_call', [{to, data, ...(from ? {from} : {})}, 'latest']);
const words = h => { const s = h.slice(2), o = []; for (let i = 0; i < s.length; i += 64) o.push(BigInt('0x' + s.slice(i, i + 64))); return o; };

async function readCommon() {
  const [n, blk, api] = await Promise.all([call(SAFE, '0xaffed0e0'), rpc('eth_getBlockByNumber', ['latest', false]), fetch('/api/founding', {cache: 'no-store'}).then(r => r.json())]);
  return {nonce: BigInt(n), now: Number(BigInt(blk.timestamp)), api};
}
async function readGrants() {
  const c = await readCommon(), g = FOUNDING.grant;
  const ids = words(await call(g.qgrants, '0x' + SEL.grantsBy + pad(SAFE))).slice(2);
  const grants = await Promise.all(ids.map(id => call(g.qgrants, '0x' + SEL.get + W(id)).then(decodeGrant)));
  const granted = grantedSet(grants), cut = dayCut(c.now);
  // Entry rule at payout: only creators holding 100,000 QHOOKS right now (others wait for a later batch).
  const due = (c.api.launches || []).filter(l => l.qualifiedAt && l.qualifiedAt < cut && !granted.has(l.creator));
  const holding = new Set(), waiting = [];
  await Promise.all(due.map(async l => { try { const r = await fetch('/api/founding/eligibility?wallet=' + l.creator, {cache: 'no-store'}), d = await r.json(); if (d.eligible) holding.add(l.creator); else waiting.push(l); } catch { waiting.push(l); } }));
  const {rows, left} = grantBatch((c.api.launches || []).filter(l => holding.has(l.creator)), granted, cut);
  const bal = BigInt(await call(g.token, '0x' + SEL.balanceOf + pad(SAFE)));
  const tx = rows.length ? grantsTx(rows) : null;
  return {...c, kind: 'grants', rows, left, granted: granted.size, bal, tx, short: tx && bal < tx.total, waiting};
}
async function readTopUp() {
  const c = await readCommon(), need = BigInt(c.api.wethWaiting || '0');
  const bal = BigInt(await call(FOUNDING.pay.token, '0x' + SEL.balanceOf + pad(SAFE)));
  const tx = need > 0n ? topUpTx(need) : null;
  return {...c, kind: 'topup', need, bal, tx, short: tx && bal < tx.amount};
}
async function withHash(s) {
  if (!s.tx) return {...s, hash: null, approved: [false, false]};
  const hash = await call(SAFE, safeHashCall(s.tx, s.nonce));
  const approved = (await Promise.all(OWNERS.map(o => call(SAFE, '0x7d832974' + pad(o.a) + hash.slice(2))))).map(x => BigInt(x) !== 0n);
  return {...s, hash, approved};
}
function section(root, read, describe) {
  let busy = false, status = {text: '', tone: ''};
  const say = (text, tone = '') => { status = {text, tone}; draw(); };
  async function send(kind) {
    if (busy) return; let conn = hub.snapshot().current; if (!conn) { hub.open(); return; }
    busy = true; say('');
    try {
      const s = await withHash(await read());
      if (!s.tx) throw Error('Nothing to sign right now. Nothing was sent.');
      if (s.short) throw Error('The Safe does not hold enough for this. Nothing was sent.');
      if (conn.chainId !== CHAIN) { say('Switching your wallet to Robinhood Chain…'); conn = await hub.switchChain(CHAIN); if (conn?.chainId !== CHAIN) throw Error('Switch your wallet to Robinhood Chain, then try again.'); }
      const from = conn.owner, me = OWNERS.find(o => o.a === String(from).toLowerCase());
      if (!me) throw Error('This wallet is not an owner of the QHooks Safe. Nothing was sent.');
      const data = kind === 'exec' ? safeExecData(s.tx, OWNERS.map(o => o.a)) : '0xd4d9bdcd' + s.hash.slice(2), tx = {from, to: SAFE, data, value: '0x0'};
      let sim; try { sim = await call(SAFE, data, from); } catch (e) { throw Error('This would fail right now (' + (e.message || 'reverted') + '). Nothing was sent.'); }
      if (kind === 'exec' && BigInt(sim || '0x0') !== 1n) throw Error('The Safe would not run it right now. Nothing was sent.');
      try { tx.gas = '0x' + (BigInt(await rpc('eth_estimateGas', [{from, to: SAFE, data, value: '0x0'}])) * 13n / 10n).toString(16); } catch { throw Error('This would fail right now. Nothing was sent.'); }
      if (hub.snapshot().current?.owner !== from) throw Error('Your wallet changed. Try again.');
      say('Confirm in your wallet…');
      const hash = await conn.entry.provider.request({method: 'eth_sendTransaction', params: [tx]});
      say('Sent. Waiting for the network…');
      let r = null; for (let i = 0; i < 180 && !r; i++) { r = await rpc('eth_getTransactionReceipt', [hash]).catch(() => null); if (!r) await new Promise(res => setTimeout(res, 2000)); }
      if (!r) throw Error('Still pending. Check your wallet activity, then reload this page.');
      if (r.status !== '0x1') throw Error('The network refused it. Only gas was spent.');
      say(kind === 'exec' ? 'Done.' : 'Approved.', 'ok');
    } catch (e) { say(/reject|denied|cancel/i.test(e?.message || '') ? 'Cancelled in your wallet. Nothing was sent.' : (e?.message || 'That did not go through.'), 'bad'); }
    finally { busy = false; draw(); }
  }
  async function draw() {
    let s = null; try { s = await withHash(await read()); } catch {}
    const conn = hub.snapshot().current, me = conn && OWNERS.find(o => o.a === String(conn.owner).toLowerCase()), other = me && OWNERS.find(o => o !== me);
    const d = s ? describe(s) : {title: 'Refreshing…', facts: [], note: ''};
    let label = 'Connect an owner wallet', action = () => hub.open(), disabled = busy, note = d.note;
    if (!s) { disabled = true; label = 'Refreshing…'; }
    else if (!s.tx) { disabled = true; label = 'Nothing to sign'; }
    else if (s.short) { disabled = true; label = 'Safe balance too low'; }
    else if (conn && !me) { label = 'Switch to an owner wallet'; note += ' This wallet is not an owner. Connect Qhooks 1 or Qhooks2.'; }
    else if (me) {
      const i = OWNERS.indexOf(me), j = 1 - i;
      if (s.approved[j]) { label = 'Step 2: Send'; action = () => send('exec'); note += ' ' + OWNERS[j].name + ' has approved. Sending from ' + me.name + ' completes it.'; }
      else if (s.approved[i]) { disabled = true; label = 'Waiting for ' + other.name; note += ' Approved by ' + me.name + '. Open this page with ' + other.name + ' to send.'; }
      else { label = 'Step 1: Approve as ' + me.name; action = () => send('approve'); note += ' Then open this page with ' + other.name + ' to send.'; }
    }
    const facts = el('dl', {}, ...d.facts.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)]),
      el('dt', {}, 'Safe transaction'), el('dd', {}, s ? (s.hash ? '#' + s.nonce + ' · ' + s.hash : '#' + s.nonce + ' · nothing to sign now') : 'Refreshing…'),
      ...OWNERS.flatMap((o, k) => [el('dt', {}, o.name), el('dd', {}, !s ? 'Refreshing…' : !s.hash ? 'nothing to sign' : s.approved[k] ? 'approved' : 'not yet')]));
    const btn = el('button', {type: 'button', class: 'qtx-mini qas-go', disabled}, label); btn.addEventListener('click', action);
    root.replaceChildren(el('h2', {}, d.title), facts, ...(d.extra || []), el('p', {}, note), btn, el('p', {class: 'qas-status', role: 'status', 'aria-live': 'polite', 'data-tone': status.tone || false}, status.text));
  }
  hub.subscribe(() => draw());
  return draw;
}
const drawGrants = section(document.getElementById('qff-grants'), readGrants, s => ({
  title: s.rows.length ? 'Grant 50,000 QHOOKS to ' + s.rows.length + ' founding creator' + (s.rows.length > 1 ? 's' : '') : 'No grants due',
  facts: [['Budget', '2,500,000 QHOOKS · ' + s.granted + ' granted · ' + fmt(s.left) + ' left after this batch'], ['Safe QHOOKS', fmt(s.bal)],
    ['Vesting', '30 days from the grant, claimable as it vests; the Safe can take back what has not vested']],
  extra: s.rows.length ? [el('ol', {}, ...s.rows.map(r => el('li', {}, '#' + r.slot + ' ' + r.beneficiary + ' · token ' + r.chainId + ':' + r.token + ' ',
    el('a', {href: '/terminal#m=' + r.chainId + ':' + r.token, target: '_blank', rel: 'noopener'}, 'check it'))))] : [],
  extraNote: null,
  note: (s.waiting?.length ? s.waiting.length + ' qualified creator' + (s.waiting.length > 1 ? 's hold' : ' holds') + ' under 100,000 QHOOKS right now and will join a later batch. ' : '') + (s.rows.length ? 'Each creator reached ' + FOUNDING.grant.holders + ' holders and $' + FOUNDING.grant.volumeUsd.toLocaleString('en-US') + ' of volume within 14 days, before today 00:00 UTC. Check the tokens before approving.' : 'Milestones reached today join tomorrow\'s batch.'),
}));
const drawTopUp = section(document.getElementById('qff-weth'), readTopUp, s => ({
  title: s.tx ? 'Deposit ' + fmt(s.tx.amount, 4) + ' WETH for founding top-ups' : 'No top-ups waiting',
  facts: [['Waiting in the drop list', fmt(s.need, 6) + ' WETH (volume share, extra cashback, bounty)'], ['Safe WETH', fmt(s.bal, 4)], ['Into', 'QDrops ' + FOUNDING.pay.drops]],
  note: s.tx ? (s.short ? 'The Safe holds less WETH than this needs. Move WETH to the Safe first.' : 'The next drop list pays these once the WETH is in.') : 'Each weekly drop list adds what founding launches earned.',
}));
drawGrants(); drawTopUp();
