// QHOOKS launch day: the launch wallet's deploys as buttons. Every transaction is built here from
// /data/qhooks-launch-day.json (the rehearsed bytecode), checked against the chain with eth_call first, then sent
// through the site's shared wallet path (browser wallets and the QHooks email wallet, as on /flywheel).
// ?rpc= is honoured on localhost only (rehearsals).
import {connectedAddress, onWalletChange, send as siteSend} from '/qx-chain.mjs';
import {getWalletHub} from '/wallet-hub.mjs';

const $ = id => document.getElementById(id);
const E = 10n ** 18n, SUPPLY = 1_000_000_000n * E;
const SEL = {
  launch: '0x85b12c7c', chain: '0xc763e5a1', launcher: '0x16eebd1e', factory: '0xc45a0155', minTotal: '0x94a66c8e',
  maxBuy: '0x70db69d6', start: '0xbe9a6555', end: '0xefbe1c1c', launchDeadline: '0x701052f4', total: '0x2ddbd13a',
  participants: '0x6c4470fb', launched: '0x8091f3bf', roundCancelled: '0xb8fb33c2', cancelledByCanceller: '0x01902975',
  token: '0xfc0c546a', poolId: '0x3e0dc34e', launchOf: '0xd4bf17c5', setPayout: '0x6f71a693', lockFn: '0x806c27c7', get: '0x9507d39a', locksOf: '0xc3f9ab58',
  approve: '0x095ea7b3', transfer: '0xa9059cbb', allowance: '0xdd62ed3e', tokensBought: '0x732783ac', ethUnspent: '0x4846be28', potAtLaunch: '0x52139129', balanceOf: '0x70a08231',
};
const isAddr = a => typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a);
const w32 = n => BigInt(n).toString(16).padStart(64, '0');
const aw = a => a.slice(2).toLowerCase().padStart(64, '0');
const words = hex => (hex || '0x').slice(2).match(/.{64}/g)?.map(w => BigInt('0x' + w)) || [];
const short = a => a.slice(0, 6) + '…' + a.slice(-4);
const ct = t => new Date(Number(t) * 1000).toLocaleString('en-US', {timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'}) + ' CT';
function eth(w, d = 4) { const f = (w % E).toString().padStart(18, '0').slice(0, d).replace(/0+$/, ''); return (w / E).toString() + (f ? '.' + f : '') + ' ETH'; }
const pct = t => (Number(t * 1_000_000n / SUPPLY) / 10_000).toFixed(2) + '%';
const millions = t => (Number(t / E) / 1e6).toFixed(2) + 'M';
function parseEth(s) {
  if (!/^\d*\.?\d*$/.test(s) || !s || s === '.') return null;
  const [a, b = ''] = s.split('.'); if (b.length > 18) return null;
  return BigInt(a || '0') * E + BigInt((b + '0'.repeat(18)).slice(0, 18));
}

let cfg, me = null, busy = false, roundInfo = null, locksInfo = null;

async function rpc(method, params) {
  const r = await fetch(cfg.rpc, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params})});
  const j = await r.json(); if (j.error) { const e = new Error(j.error.message); e.data = j.error.data; throw e; } return j.result;
}
const call = (to, data, extra = {}) => rpc('eth_call', [{to, data, ...extra}, 'latest']);
const one = async (to, sel, arg = '') => words(await call(to, sel + arg))[0] ?? 0n;
const hasCode = async a => ((await rpc('eth_getCode', [a, 'latest'])) || '0x').length > 2;
const chainNow = async () => BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp);

// ---------------------------------------------------------------- round constructor (ABI encoding)
function encString(s) {
  const b = [...new TextEncoder().encode(s)].map(x => x.toString(16).padStart(2, '0')).join('');
  return w32(b.length / 2) + b.padEnd(Math.ceil(b.length / 64) * 64, '0');
}
function roundArgs({factory, launcher, canceller, minTotal, maxBuy, start, end, deadline, terms}) {
  const head = [aw(factory), aw(launcher), aw(canceller), w32(minTotal), w32(maxBuy), w32(start), w32(end), w32(deadline), w32(9 * 32)];
  const strs = [terms.name, terms.symbol, terms.meta].map(encString);
  let off = 9 * 32; const offs = strs.map(s => { const o = off; off += s.length / 2; return w32(o); });
  const tuple = [...offs, w32(terms.style), w32(terms.fee), terms.salt.slice(2), w32(terms.snipeSeconds), aw(terms.creator), w32(terms.reserveBps)];
  return head.join('') + tuple.join('') + strs.join('');
}

// ---------------------------------------------------------------- wallet + transactions
const reason = e => (e?.message || String(e)).replace(/^execution reverted:?\s*/i, '').slice(0, 160) || 'refused';

// Checks the transaction with eth_call, then sends it through the site's wallet path (switches to Robinhood
// Chain, explicit fees, 30% gas headroom) and waits for the receipt. Returns the receipt or null.
async function send(to, data, value, statusEl, label) {
  if (busy) return null; busy = true; render();
  const from = me;
  try {
    statusEl.textContent = 'Checking…';
    try { await rpc('eth_call', [{from, to, data, value: '0x' + value.toString(16)}, 'latest']); } catch (e) { statusEl.textContent = label + ' would fail, so nothing was sent: ' + reason(e); return null; }
    const r = await siteSend(cfg.chainId, {to, data, value}, t => { statusEl.textContent = t; }, () => { if (connectedAddress() !== from) throw Error('Your wallet changed. Start this step again.'); });
    const cost = BigInt(r.gasUsed) * BigInt(r.effectiveGasPrice || 0);
    statusEl.textContent = 'Done. Gas used ' + Number(BigInt(r.gasUsed)).toLocaleString('en-US') + (cost ? ' (' + eth(cost, 6) + ')' : '') + ', block ' + BigInt(r.blockNumber) + ', tx ' + r.transactionHash.slice(0, 10) + '…';
    return r;
  } catch (e) { statusEl.textContent = e?.code === 4001 || /reject|denied|cancel/i.test(e?.message || '') ? 'Cancelled in the wallet. Nothing was sent.' : label + ': ' + reason(e); return null; }
  finally { busy = false; await refresh(); }
}

// The site's wallet hub (browser wallets and the QHooks email wallet) drives the connection; qx-chain's send()
// reads the address from #qt-connection, as on flywheel.html.
function watchWallet() {
  const hub = getWalletHub(window), line = $('qt-connection');
  // A network switch (the email wallet reconnects on the new chain) briefly empties the hub; while a step is being
  // sent, keep the same wallet on the line so the send isn't mistaken for a wallet change. A different wallet still shows.
  hub.subscribe(st => { const a = st.current?.owner?.toLowerCase() || ''; if (!a && busy && me) return; const t = a ? 'EVM · ' + a : ''; if (line.textContent !== t) line.textContent = t; });
  const changed = () => { if (busy && !connectedAddress()) return; me = connectedAddress(); refresh().then(() => predictRound()).then(render); };
  onWalletChange(changed); changed();
}

// ---------------------------------------------------------------- state
const engine = {token: false, blocks: false, factory: false};
let factoryBlock = null;

function localInput(t) { const d = new Date(Number(t) * 1000); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }
const fromInput = v => v ? BigInt(Math.floor(new Date(v).getTime() / 1000)) : 0n;

function roundParams() {
  const start = fromInput($('ld-open').value), end = fromInput($('ld-close').value), deadline = fromInput($('ld-deadline').value);
  const minTotal = parseEth($('ld-min').value.trim());
  return {factory: cfg.factory.address, launcher: me, canceller: cfg.safe, minTotal, maxBuy: BigInt(cfg.round.maxBuy), start, end, deadline, terms: {...cfg.round.terms, creator: me}};
}
function roundProblem(p, now) {
  if (!me) return 'Connect the launch wallet first.';
  if (!engine.factory) return 'Finish step 1 first.';
  if (!p.minTotal || p.minTotal > p.maxBuy) return 'Set a minimum between 0 and 0.5 ETH.';
  if (!p.start || !p.end || !p.deadline) return 'Set all three times.';
  if (p.start < now + 180n) return 'Opening time must be at least 3 minutes from now (the transaction needs time to land).';
  if (p.end <= p.start) return 'Closing time must be after opening.';
  if (p.end - p.start > 30n * 86400n) return 'The round can be open at most 30 days.';
  if (p.deadline <= p.end) return 'The launch deadline must be after closing.';
  if (p.deadline - p.end > 30n * 86400n) return 'The launch deadline can be at most 30 days after closing.';
  return '';
}
let predicted = null;
async function predictRound() {
  predicted = null; const p = roundParams(), now = await chainNow(), bad = roundProblem(p, now);
  const sum = $('ld-round-summary');
  if (bad) { sum.textContent = bad; return; }
  let text = `Opens ${ct(p.start)}, closes ${ct(p.end)}, launch deadline ${ct(p.deadline)}. Minimum ${eth(p.minTotal)}, group buy up to ${eth(p.maxBuy)}. Launcher and creator ${short(me)}; the Safe ${short(cfg.safe)} can call it off.`;
  sum.textContent = text;
  const data = cfg.round.salt + cfg.round.init.slice(2) + roundArgs(p);
  try {
    const r = await call(cfg.ddp, data, {from: me});
    predicted = {address: '0x' + r.slice(-40), data};
    sum.textContent = text + ' Round address will be ' + predicted.address + '.';
  } catch (e) { sum.textContent = text + ' The chain refuses these settings: ' + reason(e); }
}

async function readRound(addr) {
  if (!isAddr(addr) || !(await hasCode(addr))) return null;
  try {
    const names = ['launcher', 'factory', 'minTotal', 'maxBuy', 'start', 'end', 'launchDeadline', 'total', 'participants', 'launched', 'roundCancelled', 'cancelledByCanceller'];
    const v = await Promise.all(names.map(n => one(addr, SEL[n])));
    const r = Object.fromEntries(names.map((n, i) => [n, v[i]]));
    r.launcher = '0x' + r.launcher.toString(16).padStart(40, '0'); r.factory = '0x' + r.factory.toString(16).padStart(40, '0');
    r.address = addr.toLowerCase(); r.now = await chainNow();
    if (r.launched) for (const n of ['token', 'tokensBought', 'ethUnspent', 'potAtLaunch', 'poolId']) r[n] = await one(addr, SEL[n]);
    if (r.launched) r.token = '0x' + r.token.toString(16).padStart(40, '0');
    return r;
  } catch { return null; }
}

async function chainFacts() {
  const w = words(await call(cfg.factory.address, SEL.chain));
  return {launchFee: w[3], startCap: w[6]};
}
function curveTokens(buy, startCap) {
  const keep = 10_000n - BigInt(cfg.round.terms.reserveBps);
  const pool = SUPPLY * keep / 10_000n, poolStart = startCap * keep / 10_000n;
  return pool * buy / (buy + poolStart) * 9976n / 10_000n;
}

async function refresh() {
  try {
    const [t, b, f] = await Promise.all([cfg.token.address, cfg.blocks.address, cfg.factory.address].map(hasCode));
    Object.assign(engine, {token: t, blocks: b, factory: f});
    const addr = $('ld-round-addr').value.trim();
    roundInfo = await readRound(addr);
    locksInfo = roundInfo?.launched ? await readLocks(roundInfo) : null;
    if (me) {
      const bal = BigInt(await rpc('eth_getBalance', [me, 'latest']));
      $('ld-wallet-line').textContent = `Connected ${me}. Balance ${eth(bal, 5)}.` + (bal < 10n ** 15n ? ' Add at least 0.001 ETH on Robinhood Chain for gas and the launch fee.' : '') + ' This wallet becomes launcher and creator.';
    }
  } catch (e) { $('ld-wallet-line').textContent = 'Could not read the chain: ' + reason(e); }
  render();
}

function setBadge(id, text, done) { $(id).textContent = text; $(id).closest('.ld-step').dataset.state = done ? 'done' : ''; }

function render() { renderMain(); renderLocks(); }
function renderMain() {
  setBadge('ld-wallet-state', me ? 'Connected' : 'Not connected', !!me);
  $('ld-connect').textContent = me ? short(me) : 'Connect wallet';
  const steps = [['token', 'Token template'], ['blocks', 'Tax and guard template'], ['factory', 'Launch engine']];
  let first = true;
  for (const [k, name] of steps) {
    const btn = $(`ld-${k}-go`);
    btn.hidden = engine[k];
    btn.disabled = busy || !me || !first;
    $(`ld-${k}-line`).textContent = name + (engine[k] ? ': Done, on chain at ' + cfg[k].address : ' (' + short(cfg[k].address) + ')');
    if (!engine[k]) first = false;
  }
  const allEngine = engine.token && engine.blocks && engine.factory;
  setBadge('ld-engine-state', allEngine ? 'Done' : 'To do', allEngine);
  $('ld-engine-out').textContent = allEngine ? 'Launch engine ' + cfg.factory.address + (factoryBlock ? ', deployed in block ' + factoryBlock : '') + '.' : '';

  const r = roundInfo;
  const roundDone = !!(r && r.factory === cfg.factory.address);
  setBadge('ld-round-state', roundDone ? 'Done' : 'To do', roundDone);
  $('ld-round-go').disabled = busy || !predicted;
  for (const el of [document.querySelector('#ld-round .ld-times'), $('ld-round-summary'), $('ld-round-go')]) el.hidden = roundDone;
  $('ld-round-out').textContent = roundDone ? `Round ${r.address}: opens ${ct(r.start)}, closes ${ct(r.end)}, deadline ${ct(r.launchDeadline)}, minimum ${eth(r.minTotal)}. Send this address to the team.` : '';

  const L = $('ld-launch-line'), go = $('ld-launch-go'); go.disabled = true; go.hidden = !!(r && r.launched);
  if (!r) { setBadge('ld-launch-state', 'To do', false); L.textContent = $('ld-round-addr').value.trim() ? 'No round at that address yet.' : 'Paste the round address from step 2.'; return; }
  if (r.factory !== cfg.factory.address) { setBadge('ld-launch-state', 'Check', false); L.textContent = 'That address is not a QHOOKS round on this launch engine.'; return; }
  if (r.launched) {
    setBadge('ld-launch-state', 'Done', true);
    L.textContent = 'QHOOKS has launched. The round\'s ETH was the first buy.';
    $('ld-launch-out').textContent = `Token ${r.token}. First buy ${eth(r.potAtLaunch - r.ethUnspent)} got ${millions(r.tokensBought)} QHOOKS (${pct(r.tokensBought)}). ${r.ethUnspent ? eth(r.ethUnspent) + ' goes back to contributors pro rata. ' : ''}Contributors can claim now.`;
    return;
  }
  if (r.roundCancelled) { setBadge('ld-launch-state', 'Cancelled', false); L.textContent = (r.cancelledByCanceller ? 'The Safe called the round off.' : r.now >= r.launchDeadline ? 'The launch deadline passed.' : 'The round closed below its minimum.') + ' Nothing to launch; everyone can take their ETH back.'; return; }
  const who = me && me === r.launcher;
  const buy = r.total > r.maxBuy ? r.maxBuy : r.total;
  if (r.now < r.end) { setBadge('ld-launch-state', r.now < r.start ? 'Not open yet' : 'Round open', false); L.textContent = `${r.now < r.start ? 'Opens ' + ct(r.start) + '. ' : ''}Closes ${ct(r.end)}. In so far: ${eth(r.total)} from ${r.participants} wallets. The button turns on after closing.`; return; }
  if (!who) { setBadge('ld-launch-state', 'Ready', false); L.textContent = `Only the launch wallet ${short(r.launcher)} can press Launch. Connect it.`; return; }
  setBadge('ld-launch-state', 'Ready', false);
  L.textContent = `Ready. ${eth(r.total)} in from ${r.participants} wallets; the first buy is ${eth(buy)}. You send the 0.0002 ETH launch fee.`;
  go.disabled = busy;
}

async function launch() {
  const r = roundInfo; if (!r) return;
  const {launchFee, startCap} = await chainFacts();
  const buy = r.total > r.maxBuy ? r.maxBuy : r.total;
  const expect = curveTokens(buy, startCap), min = expect * 97n / 100n;
  $('ld-launch-line').textContent = `The first buy of ${eth(buy)} gets about ${millions(expect)} QHOOKS (${pct(expect)}). The launch refuses to go through if it would get less than ${millions(min)}.`;
  const rc = await send(r.address, SEL.launch + w32(min), launchFee, $('ld-launch-status'), 'Launch');
  if (rc) localStorage.setItem('qhooks-launch-day-round', r.address);
}

async function main() {
  cfg = await fetch('/data/qhooks-launch-day.json', {cache: 'no-store'}).then(r => r.json());
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname), q = new URLSearchParams(location.search);
  if (local && /^http:\/\/127\.0\.0\.1:\d+$/.test(q.get('rpc') || '')) cfg.rpc = q.get('rpc');
  const pub = await fetch('/data/qhooks-round.json', {cache: 'no-store'}).then(r => r.ok ? r.json() : null).catch(() => null);
  let saved = null; try { saved = localStorage.getItem('qhooks-launch-day-round'); } catch {}
  $('ld-round-addr').value = (isAddr(pub?.round) && pub.round) || (isAddr(saved) && saved) || '';
  const now = await chainNow().catch(() => BigInt(Math.floor(Date.now() / 1000)));
  const open = (now + 1200n + 299n) / 300n * 300n;
  $('ld-open').value = localInput(open); $('ld-close').value = localInput(open + 4n * 3600n); $('ld-deadline').value = localInput(open + 28n * 3600n);
  $('ld-connect').onclick = () => document.getElementById('qhc-trigger')?.click();
  watchWallet();
  for (const k of ['token', 'blocks', 'factory']) $(`ld-${k}-go`).onclick = async () => {
    const r = await send(cfg.ddp, cfg[k].salt + cfg[k].init.slice(2), 0n, $(`ld-${k}-status`), 'Deploy');
    if (r && k === 'factory') factoryBlock = BigInt(r.blockNumber).toString();
    render();
  };
  for (const id of ['ld-open', 'ld-close', 'ld-deadline', 'ld-min']) $(id).addEventListener('input', () => predictRound().then(render));
  $('ld-round-go').onclick = async () => {
    await predictRound(); if (!predicted) return;
    const target = predicted.address;
    const r = await send(cfg.ddp, predicted.data, 0n, $('ld-round-status'), 'Deploy the round');
    if (r) { $('ld-round-addr').value = target; try { localStorage.setItem('qhooks-launch-day-round', target); } catch {} await refresh(); }
  };
  $('ld-round-addr').addEventListener('change', refresh);
  $('ld-launch-go').onclick = launch;
  await refresh();
  setInterval(async () => { if (!busy) { await refresh(); if (me && !predicted) predictRound().then(render); } }, 15000);
}
// ---------------------------------------------------------------- step 4: the reserve into QLocks
// Rows: QLocks setup, approve, five locks to the Safe, 10M to the Safe now, LP fees to the Safe. Each row is done
// when the chain shows it; only the first open row can be pressed, and only by the creator.
async function readLocks(r) {
  const L = cfg.locks, tok = r.token, safe = cfg.safe;
  const live = await hasCode(L.address);
  const ids = live ? words(await call(L.address, SEL.locksOf + aw(tok))).slice(2) : [];
  const locks = await Promise.all(ids.map(async id => { const w = words(await call(L.address, SEL.get + w32(id))); return {beneficiary: '0x' + w[3].toString(16).padStart(40, '0'), cliff: w[2], duration: w[4], notice: w[5], total: w[6]}; }));
  const pool = locks.filter(l => l.beneficiary === safe && l.notice === BigInt(L.notice));
  const done = L.schedules.map(sch => { const i = pool.findIndex(l => l.total === BigInt(sch.amount) && l.cliff === BigInt(sch.cliff) && l.duration === BigInt(sch.duration)); if (i < 0) return false; pool.splice(i, 1); return true; });
  const remaining = L.schedules.reduce((a, sch, i) => a + (done[i] ? 0n : BigInt(sch.amount)), 0n);
  const [allowance, safeBal, creatorBal, pw] = await Promise.all([
    one(tok, SEL.allowance, aw(r.launcher) + aw(L.address)), one(tok, SEL.balanceOf, aw(safe)), one(tok, SEL.balanceOf, aw(r.launcher)),
    call(cfg.factory.address, SEL.launchOf + w32(r.poolId)).then(words)]);
  return {live, done, remaining, allowance, safeBal, creatorBal, payout: '0x' + (pw[8] ?? 0n).toString(16).padStart(40, '0'), token: tok, launcher: r.launcher, poolId: r.poolId};
}
function lockRows(x) {
  const L = cfg.locks, M = 10n ** 24n, days = n => Number(n) / 86400, safe = short(cfg.safe);
  const rows = [{key: 'setup', name: 'QLocks one-time setup (if nobody has done it yet)', done: x.live,
    tx: () => [cfg.ddp, L.salt + L.init.slice(2)]}];
  rows.push({key: 'approve', name: 'Let QLocks take ' + millions(x.remaining || 290n * M) + ' QHOOKS', done: x.remaining === 0n || x.allowance >= x.remaining,
    tx: () => [x.token, SEL.approve + aw(L.address) + w32(x.remaining)]});
  L.schedules.forEach((sch, i) => rows.push({key: 'lock' + i, name: `Lock ${millions(BigInt(sch.amount))} ${sch.name}: ${sch.cliff ? days(sch.cliff) + '-day cliff, then ' : ''}paid out over ${days(sch.duration)} days to the Safe ${safe}`, done: x.done[i],
    tx: () => [L.address, SEL.lockFn + aw(x.token) + aw(cfg.safe) + w32(sch.amount) + w32(0) + w32(sch.cliff) + w32(sch.duration) + w32(L.notice)]}));
  rows.push({key: 'marketing', name: 'Send 10M marketing to the Safe now', done: x.safeBal >= BigInt(L.marketingNow),
    tx: () => [x.token, SEL.transfer + aw(cfg.safe) + w32(L.marketingNow)]});
  rows.push({key: 'payout', name: 'Send the pool\'s LP fees to the Safe', done: x.payout === cfg.safe,
    tx: () => [cfg.factory.address, SEL.setPayout + x.poolId.toString(16).padStart(64, '0') + aw(cfg.safe)]});
  return rows;
}
let lockStatus = {};
function renderLocks() {
  const list = $('ld-locks-list'), x = locksInfo;
  if (!x) { setBadge('ld-locks-state', 'After launch', false); list.textContent = ''; $('ld-locks-out').textContent = ''; return; }
  const rows = lockRows(x), firstOpen = rows.findIndex(r => !r.done), mine = me && me === x.launcher;
  list.textContent = '';
  rows.forEach((row, i) => {
    const li = document.createElement('li'), span = document.createElement('span'), st = document.createElement('span');
    span.textContent = row.name + (row.done ? ': Done' : ''); st.className = 'cr-note'; st.id = 'ld-lk-' + row.key + '-status'; st.textContent = lockStatus[row.key] || '';
    li.append(span);
    if (!row.done) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'cr-button'; b.id = 'ld-lk-' + row.key + '-go'; b.textContent = 'Send';
      b.disabled = busy || !mine || i !== firstOpen;
      b.onclick = async () => { const [to, data] = row.tx(); const el = {set textContent(t) { lockStatus[row.key] = t; const e = $(st.id); if (e) e.textContent = t; }, get textContent() { return lockStatus[row.key] || ''; }}; await send(to, data, 0n, el, row.name); render(); };
      li.append(' ', b);
    }
    li.append(' ', st); list.append(li);
  });
  const all = firstOpen < 0;
  setBadge('ld-locks-state', all ? 'Done' : mine ? 'To do' : 'Connect the launch wallet', all);
  $('ld-locks-out').textContent = all ? `Reserve locked: 290M in QLocks for the Safe, 10M with the Safe, LP fees to the Safe. The launch wallet holds ${millions(x.creatorBal)} QHOOKS. The token address can go public.` : 'Launch wallet holds ' + millions(x.creatorBal) + ' QHOOKS.';
}
main();
