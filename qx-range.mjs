// /range: add auto-ranged liquidity (QRange) to a QHooks launch. One tap each: create the range, point the launch's LP fees
// at it, and (optional, permanent) hand it the launch's creator role so the fees can never be pointed elsewhere. The range
// keeps liquidity bunched around the price (bands ±10/25/49% plus one-sided edges), re-centres after big moves, never swaps
// and has no owner or withdraw. Reads come straight from the chain; every send is simulated first. Same launch lookup as
// /floor (qx-floor.mjs). ?chain=&token= or ?chain=&id=<poolId> deep links.
import {getWalletHub} from '/wallet-hub-fresh.mjs';
import {chainById} from '/chains.mjs';
import {mountAccountQuantum} from '/qx-account-quantum-control.mjs';
import {abiEncode} from '/full-launch/packages/launchpad/abi-encode.mjs';

const root = document.getElementById('qrg-root'), hub = getWalletHub(window), qs = new URLSearchParams(location.search);
const ZERO = '0x0000000000000000000000000000000000000000';
// Function selectors (keccak of the signatures; lead/range/abi-check.mjs recomputes them).
const SEL = {launchOf: '0xd4bf17c5', chain: '0xc763e5a1', setPayout: '0x6f71a693', setCreator: '0x85ec9bd9', make: '0xa5b7705d', predict: '0x85e09383', maker: '0x50655d8c', placed: '0x8970b2f7', center: '0x1f02d715', lastRun: '0x6ba18f92', checkpoints: '0x5a48c0b0', tick: '0x3eaf5d9f', liquidities: '0x6dd6ec46', held0: '0xe4542fc9', held1: '0xa8f4c305', totalKept0: '0xbbe18d0a', totalKept1: '0x9c6e1e71', totalToCreator0: '0xd26c4945', totalToCreator1: '0xf9f8de2a', rangeBps: '0xc091b0d3', creatorWallet: '0x7cdc65f2', decimals: '0x313ce567', symbol: '0x95d89b41', balanceOf: '0x70a08231'};
const PQSEL = {roleOf: '0x4d513689', message: '0xfa2fcc1a', setPayout: '0x24337d97', lockForever: '0xa8237012'};
const LAUNCHED_TOPIC = '0xb3dfc406bd21f3b0e4aec3411c79b38d392ec20d80835e456b24f42bc0ec245f';
let cfg = null, quantum = null, signer = null;
const keyBox = document.getElementById('qrg-key');
const S = {chainId: qs.get('chain') || null, token: (qs.get('token') || '').toLowerCase(), id: (qs.get('id') || '').toLowerCase(), found: null, floor: null,
  share: 8000, busy: false, msg: '', tone: '', searching: false};

const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [a, v] of Object.entries(attrs)) { if (v === false || v == null) continue; if (a.startsWith('on')) n.addEventListener(a.slice(2), v); else n.setAttribute(a, v === true ? '' : v); } for (const c of kids.flat()) if (c != null && c !== false) n.append(c instanceof Node ? c : document.createTextNode(String(c))); return n; };
const pad = a => a.slice(2).toLowerCase().padStart(64, '0');
const W = n => BigInt.asUintN(256, BigInt(n)).toString(16).padStart(64, '0');
const isAddr = a => /^0x[0-9a-fA-F]{40}$/.test(a || '');
const isId = a => /^0x[0-9a-f]{64}$/.test(a || '');
const short = a => a ? a.slice(0, 6) + '…' + a.slice(-4) : '';
const word = (h, i = 0) => BigInt('0x' + ((h || '0x').slice(2 + 64 * i, 66 + 64 * i) || '0'));
const sword = (h, i = 0) => BigInt.asIntN(256, word(h, i));
const wAddr = (h, i = 0) => '0x' + (h || '0x').slice(2 + 64 * i + 24, 66 + 64 * i).toLowerCase();
const fmt = (v, d, max = 4) => { const s = BigInt(v), b = 10n ** BigInt(d), w = s / b, f = s % b; const fs = f ? '.' + f.toString().padStart(d, '0').slice(0, max).replace(/0+$/, '') : ''; return w.toLocaleString('en-US') + (fs === '.' ? '' : fs); };
const C = () => cfg.chains[S.chainId];
const chainName = () => chainById(S.chainId)?.name || 'this chain';

async function rpcAt(url, method, params) {
  const r = await fetch(url, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params})});
  const j = await r.json(); if (j.error) { const e = Error(j.error.message || 'Network read failed'); e.data = j.error.data; throw e; } return j.result;
}
const rpc = (m, p) => rpcAt(chainById(S.chainId).rpc, m, p);
const call = (to, data, from) => rpc('eth_call', [{to, data, ...(from ? {from} : {})}, 'latest']);
const tryCall = async (to, data) => { try { return await call(to, data); } catch { return null; } };
function say(msg, tone = '') { S.msg = msg; S.tone = tone; render(); }

// ---------- finding the launch ----------
async function launchOfAny(id) {
  for (const [launch] of C().launches) {
    const r = await tryCall(launch, SEL.launchOf + id.slice(2));
    if (r && wAddr(r, 0) !== ZERO) return {launch, id, raw: r};
  }
  return null;
}
async function findLaunch() {
  S.found = null; S.floor = null;
  if (!C()) return;
  let hit = null;
  if (isId(S.id)) hit = await launchOfAny(S.id);
  if (!hit && isAddr(S.token)) {
    try { const r = await fetch('/api/v1/launches/' + S.chainId + '/' + S.token); if (r.ok) { const j = await r.json(); const id = j.launch?.poolId || j.poolId; if (isId(id)) hit = await launchOfAny(id); } } catch {}
    if (!hit) hit = await scanLaunched(S.token);
  }
  // Nothing entered yet is not a launch: leave the page on its Chain/Token fields (it rendered "undefined" and read the floor list for id=undefined).
  if (!hit) { S.found = isAddr(S.token) || isId(S.id) ? {error: 'No QHooks launch found for that on ' + chainName() + '.'} : null; return; }
  const r = hit.raw, tokenIs0 = word(r, 4) === 1n, token = wAddr(r, 0);
  const ch = await call(hit.launch, SEL.chain);
  const quote = wAddr(ch, 1);
  const [td, qd, ts, qsym] = await Promise.all([tryCall(token, SEL.decimals), tryCall(quote, SEL.decimals), tryCall(token, SEL.symbol), tryCall(quote, SEL.symbol)]);
  S.found = {launch: hit.launch, id: hit.id, token, quote, tokenIs0, fee: Number(word(r, 3)), creator: wAddr(r, 7), payout: wAddr(r, 8),
    role: wAddr(r, 7) === cfg.pqCreator ? await pqRole(hit.launch, hit.id) : null,
    tokenDec: td ? Number(word(td)) : 18, quoteDec: qd ? Number(word(qd)) : 18, symbol: str(ts) || 'TOKEN', quoteSymbol: str(qsym) || 'quote'};
  S.token = token; S.id = hit.id;
  await loadRange();
}
async function pqRole(factory, id) {
  const d = await call(cfg.pqCreator, PQSEL.roleOf + pad(factory) + id.slice(2));
  return {wallet: wAddr(d, 0), pk: '0x' + d.slice(66, 130), nonce: word(d, 2)};
}
function str(h) { try { if (!h || h === '0x') return ''; if (h.length === 66) return new TextDecoder().decode(Uint8Array.from(h.slice(2).match(/../g).map(x => parseInt(x, 16)).filter(x => x))); const len = Number(word(h, 1)); return new TextDecoder().decode(Uint8Array.from(h.slice(130, 130 + len * 2).match(/../g) || [], x => parseInt(x, 16))); } catch { return ''; } }

/// Launched(poolId, token, creator, …) on the chain's launch contracts, newest first, a bounded number of log windows.
async function scanLaunched(token) {
  const ch = chainById(S.chainId), url = ch.logsRpc || ch.rpc, step = C().logWindow || Math.min(ch.logStep || 2000, 25000);
  const head = Number(BigInt(await rpcAt(url, 'eth_blockNumber', [])));
  S.searching = true; render();
  try {
    for (const [launch, from] of C().launches) {
      for (let to = head, n = 0; to >= from && n < 32; n += 4) {
        const wins = []; for (let i = 0; i < 4 && to >= from; i++) { const lo = Math.max(from, to - step + 1); wins.push([lo, to]); to = lo - 1; }
        const res = await Promise.all(wins.map(([lo, hi]) => rpcAt(url, 'eth_getLogs', [{address: launch, fromBlock: '0x' + lo.toString(16), toBlock: '0x' + hi.toString(16), topics: [LAUNCHED_TOPIC, null, '0x' + pad(token)]}]).catch(() => rpcAt(url, 'eth_getLogs', [{address: launch, fromBlock: '0x' + lo.toString(16), toBlock: '0x' + hi.toString(16), topics: [LAUNCHED_TOPIC, null, '0x' + pad(token)]}]).catch(() => []))));
        for (const logs of res) if (logs.length) { const hit = await launchOfAny(logs[0].topics[1]); if (hit) return hit; }
      }
    }
  } finally { S.searching = false; }
  return null;
}

// ---------- the range ----------
async function predict(wallet) {
  const f = S.found;
  return wAddr(await call(cfg.maker, SEL.predict + pad(f.launch) + f.id.slice(2) + pad(wallet) + W(S.share)));
}
async function loadRange() {
  S.floor = null;
  const f = S.found; if (!f || f.error) return;
  const makerLive = (await rpc('eth_getCode', [cfg.maker, 'latest']).catch(() => '0x')) !== '0x';
  if (!makerLive) { S.floor = {notLive: true}; return; }
  // A range this launch already pays wins; then any registered one; otherwise the one this wallet would make.
  let addr = null;
  if (f.payout !== ZERO && (await isRange(f.payout))) addr = f.payout;
  if (!addr) try { const r = await fetch('/api/range/list?chain=' + S.chainId + '&id=' + f.id); if (r.ok) { const j = await r.json(); addr = j.ranges?.[0]?.range || null; } } catch {}
  const wallet = hub.snapshot().current?.owner;
  if (!addr && wallet) { const p = await predict(wallet); if ((await rpc('eth_getCode', [p, 'latest'])) !== '0x') addr = p; else S.floor = {predicted: p}; }
  if (!addr && !wallet) S.floor = {predicted: null};
  if (addr) S.floor = await readRange(addr);
}
async function isRange(a) { const r = await tryCall(a, SEL.maker); return r && wAddr(r) === cfg.maker; }
async function readRange(a) {
  const q = n => tryCall(a, SEL[n]);
  const names = ['placed', 'center', 'lastRun', 'checkpoints', 'tick', 'liquidities', 'held0', 'held1', 'totalKept0', 'totalKept1', 'totalToCreator0', 'totalToCreator1', 'rangeBps', 'creatorWallet'];
  const v = Object.fromEntries((await Promise.all(names.map(q))).map((r, i) => [names[i], r]));
  const liq = [0, 1, 2, 3, 4].map(i => word(v.liquidities, i));
  return {address: a, exists: true, placed: word(v.placed) === 1n, center: Number(sword(v.center)), lastRun: Number(word(v.lastRun)), checkpoints: Number(word(v.checkpoints)),
    tick: Number(sword(v.tick)), liq, held: [word(v.held0), word(v.held1)], kept: [word(v.totalKept0), word(v.totalKept1)], toCreator: [word(v.totalToCreator0), word(v.totalToCreator1)],
    share: Number(word(v.rangeBps)), creatorWallet: wAddr(v.creatorWallet)};
}
/// Pool tick -> token-price tick (up = the token is worth more quote).
const tokenTick = t => S.found.tokenIs0 ? t : -t;
/// Market cap (in the quote) at a token-price tick.
const capAt = t => { const f = S.found; return 1.0001 ** t * 10 ** (f.tokenDec - f.quoteDec) * 1e9; };
const capText = t => { const v = capAt(t); return (v >= 100 ? Math.round(v).toLocaleString('en-US') : v.toPrecision(3)) + ' ' + S.found.quoteSymbol; };
/// [quote amount, token amount] text for a token0/token1 pair.
const pair = ([a0, a1]) => { const f = S.found, [q, t] = f.tokenIs0 ? [a1, a0] : [a0, a1]; return fmt(q, f.quoteDec) + ' ' + f.quoteSymbol + ' + ' + fmt(t, f.tokenDec, 0) + ' ' + f.symbol; };

// ---------- sends ----------
async function send(to, data) {
  let conn = hub.snapshot().current; if (!conn) { hub.open(); throw Error('Connect a wallet first.'); }
  if (conn.chainId !== S.chainId) { say('Switching your wallet to ' + chainName() + '…'); conn = await hub.switchChain(S.chainId); if (conn?.chainId !== S.chainId) throw Error('Switch your wallet to ' + chainName() + ', then try again.'); }
  const from = conn.owner, provider = conn.entry.provider;
  try { await call(to, data, from); } catch (e) { throw Error('This would fail right now. Nothing was sent.'); }
  const tx = {from, to, data, value: '0x0'};
  try { const est = BigInt(await rpc('eth_estimateGas', [{from, to, data, value: '0x0'}])); tx.gas = '0x' + (est * 13n / 10n).toString(16); } catch { throw Error('This would fail right now. Nothing was sent.'); }
  try { const b = await rpc('eth_getBlockByNumber', ['latest', false]), tip = BigInt(await provider.request({method: 'eth_maxPriorityFeePerGas'}).catch(() => '0x0')); if (b?.baseFeePerGas) { tx.maxPriorityFeePerGas = '0x' + tip.toString(16); tx.maxFeePerGas = '0x' + (BigInt(b.baseFeePerGas) * 2n + tip).toString(16); } } catch {}
  if (hub.snapshot().current?.owner !== from) throw Error('Your wallet changed. Try again.');
  say('Confirm in your wallet…');
  const hash = await provider.request({method: 'eth_sendTransaction', params: [tx]});
  say('Sent. Waiting for the network…');
  let r = null; for (let i = 0; i < 180 && !r; i++) { r = await rpc('eth_getTransactionReceipt', [hash]).catch(() => null); if (!r) await new Promise(res => setTimeout(res, 2000)); }
  if (!r) throw Error('Still pending. Check your wallet activity, then reload this page.');
  if (r.status !== '0x1') throw Error('The network refused it. Only gas was spent.');
  return r;
}
const guard = fn => async () => { if (S.busy) return; S.busy = true; say(''); try { await fn(); } catch (e) { say(/reject|denied|cancel/i.test(e?.message || '') ? 'Cancelled in your wallet. Nothing was sent.' : (e?.message || 'That did not go through.'), 'bad'); } finally { S.busy = false; render(); } };
const doMake = guard(async () => {
  const f = S.found, w = hub.snapshot().current?.owner;
  await send(cfg.maker, SEL.make + pad(f.launch) + f.id.slice(2) + pad(w) + W(S.share));
  const p = await predict(w);
  fetch('/api/range/register', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({chain: S.chainId, range: p})}).catch(() => {});
  await findLaunch(); say('Range created. Next: point this launch\'s fees at it.', 'good');
});
const doPoint = guard(async () => { await send(S.found.launch, SEL.setPayout + S.found.id.slice(2) + pad(S.floor.address)); await findLaunch(); say('This launch\'s LP fees now go to the range.', 'good'); });
/// A launch whose creator role sits with QPQCreator: the role's wallet sends, its quantum key signs the exact message the
/// contract builds (checked against message() before anything is sent). kind 1 = set payout, kind 3 = lock forever.
async function pqSend(kind, values, types, build) {
  if (!signer) throw Error('Open your quantum key below first.');
  const f = S.found, r = await pqRole(f.launch, f.id), me = hub.snapshot().current?.owner?.toLowerCase();
  if (r.wallet !== me) throw Error('This launch is protected by another wallet (' + short(r.wallet) + ').');
  if (r.pk.toLowerCase() !== signer.publicKeyHex.toLowerCase()) throw Error('This launch uses a different quantum key than the one open.');
  const until = BigInt(Math.floor(Date.now() / 1000) + 600);
  say('Signing with your quantum key…');
  const sg = signer.signCreatorAction({chainId: S.chainId, contract: cfg.pqCreator, factory: f.launch, id: f.id, kind, values, nonce: r.nonce, validUntil: until, wallet: me});
  const args = types.length ? abiEncode(types, values) : '0x';
  const onchain = await call(cfg.pqCreator, PQSEL.message + abiEncode(['address', 'bytes32', 'uint8', 'bytes', 'uint64'], [f.launch, f.id, String(kind), args, until.toString()]).slice(2));
  const off = Number(word(onchain, 0)) * 2, len = Number(BigInt('0x' + onchain.slice(2 + off, 2 + off + 64)));
  if (('0x' + onchain.slice(2 + off + 64, 2 + off + 64 + len * 2)).toLowerCase() !== sg.messageHex.toLowerCase()) throw Error('The signed message did not match the contract. Nothing was sent.');
  return send(cfg.pqCreator, build(until, sg.signatureHex));
}
const doPointPq = guard(async () => {
  const f = S.found, a = S.floor.address;
  await pqSend(1, [a], ['address'], (u, sig) => PQSEL.setPayout + abiEncode(['address', 'bytes32', 'address', 'uint64', 'bytes'], [f.launch, f.id, a, u.toString(), sig]).slice(2));
  await findLaunch(); say('This launch\'s LP fees now go to the range.', 'good');
});
const doLockPq = guard(async () => {
  if (!confirm('This is permanent. Fee routing for this launch is locked for good, so nobody (you included) can point the fees anywhere else again. Continue?')) return;
  const f = S.found;
  await pqSend(3, [], [], (u, sig) => PQSEL.lockForever + abiEncode(['address', 'bytes32', 'uint64', 'bytes'], [f.launch, f.id, u.toString(), sig]).slice(2));
  await findLaunch(); say('Locked: the fees go to the range for good.', 'good');
});

const doLock = guard(async () => {
  if (!confirm('This is permanent. The range takes this launch\'s creator role, so nobody (you included) can point the fees anywhere else again. Continue?')) return;
  await send(S.found.launch, SEL.setCreator + S.found.id.slice(2) + pad(S.floor.address)); await findLaunch(); say('Locked: the fees go to the range for good.', 'good');
});

// ---------- render ----------
const field = (label, input) => el('label', {class: 'qfl-field'}, el('span', {}, label), input);
const choice = (name, opts, val, set) => el('div', {class: 'qfl-choices', role: 'radiogroup', 'aria-label': name}, ...opts.map(([v, t]) =>
  el('button', {type: 'button', class: 'qtx-mini' + (v === val ? ' is-on' : ''), 'aria-pressed': v === val ? 'true' : 'false', disabled: S.busy, onclick: async () => { set(v); await loadRange().catch(() => {}); render(); }}, t)));

async function render() {
  cfg ||= await fetch('/full-launch/range-v1.json', {cache: 'no-store'}).then(r => r.json());
  const conn = hub.snapshot().current;
  if (!S.chainId || !cfg.chains[S.chainId]) S.chainId = conn && cfg.chains[conn.chainId] ? conn.chainId : '4663';
  const kids = [];
  const chainSel = el('select', {onchange: async e => { S.chainId = e.target.value; S.id = ''; await refresh(); }}, ...(cfg.order || Object.keys(cfg.chains)).filter(id => cfg.chains[id]).map(id => el('option', {value: id, selected: id === S.chainId}, chainById(id)?.name || id)));
  const tokenIn = el('input', {placeholder: '0x… your token', value: S.token, spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Token address'});
  tokenIn.addEventListener('change', async () => { S.token = tokenIn.value.trim().toLowerCase(); S.id = ''; await refresh(); });
  kids.push(el('div', {class: 'qfl-row'}, field('Chain', chainSel), field('Token', tokenIn)));
  if (S.searching) kids.push(el('p', {class: 'qfl-note'}, 'Looking for the launch on ' + chainName() + '…'));
  const f = S.found, fl = S.floor;
  if (f?.error) kids.push(el('p', {class: 'qfl-note', 'data-tone': 'bad'}, f.error));
  if (f && !f.error) {
    kids.push(el('p', {class: 'qfl-note'}, f.symbol + ' · LP fees go to ' + (fl?.address === f.payout ? 'its range' : short(f.payout))));
    if (fl?.notLive) kids.push(el('p', {class: 'qfl-note'}, 'Auto-range liquidity is not set up on ' + chainName() + ' yet.'));
    else if (fl?.exists) kids.push(rangeCard(f, fl, conn));
    else if (fl) kids.push(createCard(f, fl, conn));
  }
  if (S.msg) kids.push(el('p', {class: 'qfl-status', role: 'status', 'data-tone': S.tone}, S.msg));
  root.replaceChildren(...kids);
}
function roleNote(f, conn) {
  if (f.creator === ZERO) return 'This launch\'s fee routing is locked, so a range can\'t be added.';
  if (f.creator === cfg.pqCreator) {
    if (!conn) return 'Connect the wallet that protects ' + f.symbol + '.';
    if (f.role && conn.owner.toLowerCase() !== f.role.wallet) return 'Only the wallet that protects this launch (' + short(f.role.wallet) + ') can point its fees at a range.';
    return null;
  }
  if (!conn) return 'Connect the wallet that launched ' + f.symbol + '.';
  if (conn.owner.toLowerCase() !== f.creator) return 'Only the launch\'s creator wallet (' + short(f.creator) + ') can point its fees at a range.';
  return null;
}
function createCard(f, fl, conn) {
  const note = roleNote(f, conn);
  return el('section', {class: 'qfl-card'},
    field('Share of LP fees kept as liquidity', choice('Share', cfg.shares, S.share, v => { S.share = v; })),
    el('p', {class: 'qfl-note'}, (S.share === 10000 ? 'All LP fees become liquidity.' : 'The rest goes to your wallet.') + ' Liquidity sits in bands around the price (±10%, ±25%, ±49%) and moves with it after big moves. Nobody can withdraw it.'),
    note ? el('p', {class: 'qfl-note', 'data-tone': 'bad'}, note) : el('button', {type: 'button', class: 'qtx-mini qas-go', disabled: S.busy, onclick: doMake}, '1 · Create range'));
}
function rangeCard(f, fl, conn) {
  const note = roleNote(f, conn), points = f.payout === fl.address, pq = f.creator === cfg.pqCreator;
  const locked = f.creator === fl.address || (!pq && f.creator === LOCKED);
  const inPool = fl.liq.some(x => x > 0n);
  const rows = [
    ['Status', fl.placed ? (inPool ? 'Live around ' + capText(tokenTick(fl.center)) + ' market cap' : 'Waiting for fees') : 'Starts after 4 price checks, 15 minutes apart (' + fl.checkpoints + ' of 4)'],
    ['Price now', fl.tick || fl.placed ? capText(tokenTick(fl.tick)) + ' market cap' : '–'],
    ['Waiting to be added', pair(fl.held)],
    ['Fees kept as liquidity so far', pair(fl.kept)],
    ['Fees to the creator so far', pair(fl.toCreator)],
    ['Kept as liquidity', (fl.share / 100) + '% of LP fees']];
  const acts = [];
  const needKey = pq && !note && (!points || !locked);
  showKey(needKey);
  if (!points) acts.push(note ? el('p', {class: 'qfl-note', 'data-tone': 'bad'}, note)
    : pq ? el('button', {type: 'button', class: 'qtx-mini qas-go', disabled: S.busy || !signer, onclick: doPointPq}, signer ? '2 · Point this launch\'s LP fees here (wallet + quantum key)' : '2 · Open your quantum key below first')
    : el('button', {type: 'button', class: 'qtx-mini qas-go', disabled: S.busy, onclick: doPoint}, '2 · Point this launch\'s LP fees here'));
  else if (!locked && !note) acts.push(pq
    ? el('button', {type: 'button', class: 'qtx-mini', disabled: S.busy || !signer, onclick: doLockPq}, signer ? '3 · Lock it for good (optional, permanent)' : '3 · Open your quantum key below to lock (optional)')
    : el('button', {type: 'button', class: 'qtx-mini', disabled: S.busy, onclick: doLock}, '3 · Lock it for good (optional, permanent)'));
  if (locked) acts.push(el('p', {class: 'qfl-note'}, 'Locked: this launch\'s LP fees go to the range for good.'));
  return el('section', {class: 'qfl-card'}, el('dl', {class: 'qfl-facts'}, ...rows.flatMap(([a, b]) => [el('dt', {}, a), el('dd', {}, b)])),
    el('p', {class: 'qfl-note'}, 'Range contract ', el('a', {href: (chainById(S.chainId)?.explorer || '') + '/address/' + fl.address, target: '_blank', rel: 'noopener'}, short(fl.address)),
      fl.lastRun ? ' · last run ' + new Date(fl.lastRun * 1000).toLocaleString() : ''), ...acts);
}

const LOCKED = '0x000000000000000000000000000000000000dead';
/// The quantum key panel (same control as /pq-upgrade), mounted once, shown only for a post-quantum launch's steps.
function showKey(on) {
  if (!keyBox) return;
  keyBox.hidden = !on;
  if (on && !quantum) quantum = mountAccountQuantum(keyBox, {hub, id: 'qrg', mode: 'account', onChange: st => { const next = st.ready && st.signer ? st.signer : null; if (next !== signer) { signer = next; render(); } }});
}
async function refresh() { try { await findLaunch(); } catch (e) { S.found = {error: e?.message || 'Network read failed.'}; } render(); }
render().then(refresh).catch(e => { root.textContent = e.message; });
hub.subscribe(async () => { if (!cfg) return; await loadRange().catch(() => {}); render(); });
