// /adaptive-liquidity (2026-11-12, Randall: "let's switch to adaptive liquidity now then"). Moves the QHOOKS pool-fee share
// (50% of the Safe's pool-fee WETH) from QFlywheelLiquidity2 to a QRange: bands around the price that re-centre after big
// moves. Three taps: make the range (any wallet), set up the fee share (any wallet), one Safe transaction (both owners) that
// approves the new share for 1 WETH and sets the old share's approval to 0. Everything is read from the plan, checked here
// (CREATE2 addresses, init code hash, call bytes) and simulated before any wallet request.
import {keccakHex, safeHashCall, safeExecData} from './qdrops-core.mjs';
import {selector, addressWord, allowanceData, staticCallData, multiSendData, approveHashData, approvedHashData} from './qx-flywheel2-setup.mjs';
import {revertReason} from './qx-pool-fee-share.mjs';

export const MANIFEST = '/full-launch/pool-fee-share-range-v1.json';
export const PERMANENT = 'WETH sent here stays as QHOOKS liquidity for good. Stop ends new flow only.';
const same = (a, b) => a?.toLowerCase() === b?.toLowerCase();
const bytes = h => Uint8Array.from(h.slice(2).match(/../g) || [], b => parseInt(b, 16));
const uint = h => { if (!/^0x[0-9a-f]{64}$/i.test(h)) throw Error('Incomplete integer read'); return BigInt(h); };
const int = h => { const v = uint(h); return v >= 2n ** 255n ? v - 2n ** 256n : v; };
const attempt = async fn => { try { return {status: 'ok', ...await fn()}; } catch (e) { return {status: 'unknown', reason: e.message || 'Refreshing'}; } };
const SIM_FROM = '0x000000000000000000000000000000000000dEaD';
const ONE = 10n ** 18n;
const ZERO = '0x' + '0'.repeat(40);

export function verifyPlan(art) {
  if (String(art?.chainId) !== '4663' || !/^0x[0-9a-f]{40}$/i.test(art.deployer) || !/^0x[0-9a-f]{64}$/i.test(art.salt) || !/^0x(?:[0-9a-f]{2}){33,}$/i.test(art.calldata)) throw Error('Invalid setup details');
  // The fee share: CREATE2 through the deterministic deployer.
  if (!same(art.calldata.slice(0, 66), art.salt)) throw Error('Setup salt differs');
  const initCodeHash = keccakHex(bytes('0x' + art.calldata.slice(66)));
  if (!same(initCodeHash, art.initCodeHash)) throw Error('Setup code hash differs');
  const address = '0x' + keccakHex(bytes('0xff' + art.deployer.slice(2) + art.salt.slice(2) + initCodeHash.slice(2))).slice(-40);
  if (!same(address, art.address)) throw Error('Setup address differs');
  // The constructor's destination is the range (last 9 words of the init code: safe, dest, launch, manager, key x5, lo, hi, share).
  const tail = art.calldata.slice(-64 * 12).match(/.{64}/g);
  if (!same('0x' + tail[0].slice(24), art.constructor.safe) || !same('0x' + tail[1].slice(24), art.range.address) || BigInt('0x' + tail[11]) !== BigInt(art.constructor.shareBps)) throw Error('Setup destination differs');
  // The range: a clone of the maker's implementation at its CREATE2 address for (launch, id, no wallet, 10000).
  const r = art.range;
  if (!same(r.creatorWallet, ZERO) || r.rangeBps !== 10000 || !same(r.make.to, r.maker) || r.make.fn !== 'make(address,bytes32,address,uint16)') throw Error('Range details differ');
  if (!same(r.make.data, staticCallData(r.make.fn, r.make.args)) || !same(r.make.args[0], r.launch) || !same(r.make.args[1], r.launchId) || !same(r.make.args[2], ZERO) || r.make.args[3] !== '10000') throw Error('Range call differs');
  const rsalt = keccakHex(bytes('0x' + addressWord(r.launch) + r.launchId.slice(2) + addressWord(ZERO) + (10000).toString(16).padStart(64, '0')));
  const clone = '0x3d602d80600a3d3981f3363d3d373d3d3d363d73' + r.implementation.slice(2).toLowerCase() + '5af43d82803e903d91602b57fd5bf3';
  const raddr = '0x' + keccakHex(bytes('0xff' + r.maker.slice(2) + rsalt.slice(2) + keccakHex(bytes(clone)).slice(2))).slice(-40);
  if (!same(raddr, r.address)) throw Error('Range address differs');
  // The Safe batch: approve the new share for 1 WETH, the old share for 0. Nothing else.
  const batch = art.safeBatch, stop = art.safeTap_stop;
  if (!batch || batch.operation !== 1 || batch.value !== '0' || batch.signers !== 'both' || batch.calls?.length !== 2) throw Error('Safe batch details differ');
  const [approve, revoke] = batch.calls;
  if (approve.fn !== 'approve(address,uint256)' || !same(approve.args[0], art.address) || BigInt(approve.args[1]) !== ONE) throw Error('Safe approval details differ');
  if (revoke.fn !== 'approve(address,uint256)' || !same(revoke.to, approve.to) || !same(revoke.args[0], art.replaces.feeShare) || BigInt(revoke.args[1]) !== 0n) throw Error('Safe stop-previous details differ');
  if (stop.fn !== 'approve(address,uint256)' || !same(stop.to, approve.to) || !same(stop.args[0], art.address) || BigInt(stop.args[1]) !== 0n) throw Error('Safe stop details differ');
  if (!same(multiSendData(batch.calls.map(c => ({to: c.to, value: '0', data: staticCallData(c.fn, c.args)}))), batch.data)) throw Error('Safe batch data differs from its calls');
  return {address, range: raddr};
}

const txFor = (art, id) => id === 'approve'
  ? {to: art.safeBatch.to, value: art.safeBatch.value, operation: art.safeBatch.operation, data: art.safeBatch.data}
  : {to: art.safeTap_stop.to, value: '0', operation: 0, data: staticCallData(art.safeTap_stop.fn, art.safeTap_stop.args)};
const walletTx = (art, id, from) => id === 'range' ? {from, to: art.range.make.to, data: art.range.make.data, value: '0x0'} : {from, to: art.deployer, data: art.calldata, value: '0x0'};
function decodeOwners(h) {
  if (!/^0x(?:[0-9a-f]{64}){4}$/i.test(h)) throw Error('Safe must have two owners');
  const w = h.slice(2).match(/.{64}/g);
  if (BigInt('0x' + w[0]) !== 32n || BigInt('0x' + w[1]) !== 2n) throw Error('Safe must have two owners');
  const owners = w.slice(2).map(v => '0x' + v.slice(-40).toLowerCase());
  if (same(...owners)) throw Error('Safe owners differ');
  return owners;
}

export async function readAdaptive(art, rpc, {from = SIM_FROM} = {}) {
  verifyPlan(art);
  const block = await rpc('eth_getBlockByNumber', ['latest', false]);
  if (!/^0x[0-9a-f]+$/i.test(block?.number)) throw Error('Incomplete block read');
  const call = (to, data) => rpc('eth_call', [{to, data}, block.number]);
  const code = async a => { const c = await rpc('eth_getCode', [a, block.number]); if (!/^0x(?:[0-9a-f]{2})*$/i.test(c)) throw Error('Incomplete code read'); return c !== '0x'; };
  const simulate = async tx => { try { await rpc('eth_call', [tx, block.number]); await rpc('eth_estimateGas', [tx]); return null; } catch (e) { return revertReason(e); } };
  const weth = art.safeBatch.calls[0].to, safeAddr = art.constructor.safe;
  const [range, create, allowNew, allowOld, safe] = await Promise.all([
    attempt(async () => { const done = await code(art.range.address); return {done, simError: done ? null : await simulate(walletTx(art, 'range', from))}; }),
    attempt(async () => { const done = await code(art.address); return {done, rangeReady: await code(art.range.address)}; }),
    attempt(async () => ({value: uint(await call(weth, allowanceData(safeAddr, art.address))).toString()})),
    attempt(async () => ({value: uint(await call(weth, allowanceData(safeAddr, art.replaces.feeShare))).toString()})),
    attempt(async () => {
      const [nonce, owners, threshold] = await Promise.all(['nonce()', 'getOwners()', 'getThreshold()'].map(fn => call(safeAddr, selector(fn))));
      if (uint(threshold) !== 2n) throw Error('Safe threshold must be two');
      return {nonce: uint(nonce).toString(), owners: decodeOwners(owners)};
    }),
  ]);
  // The fee share's constructor needs the range to exist, so its simulation only means something after tap 1.
  if (create.status === 'ok' && !create.done) create.simError = create.rangeReady ? await simulate(walletTx(art, 'create', from)) : null;
  const allowOk = allowNew.status === 'ok' && allowOld.status === 'ok';
  const approve = {status: allowOk ? 'ok' : 'unknown', done: allowOk && BigInt(allowNew.value) > 0n && BigInt(allowOld.value) === 0n};
  const stop = {status: allowNew.status, done: allowNew.status === 'ok' && BigInt(allowNew.value) === 0n};
  const share = create.status === 'ok' && create.done ? await attempt(async () => Object.fromEntries(await Promise.all(art.views_for_page.map(async fn => [fn.split('(')[0], uint(await call(art.address, selector(fn))).toString()])))) : {status: 'unknown'};
  const rangeView = range.status === 'ok' && range.done ? await attempt(async () => Object.fromEntries(await Promise.all(art.range_views_for_page.map(async fn => [fn.split('(')[0], (fn === 'center()' ? int : uint)(await call(art.range.address, selector(fn))).toString()])))) : {status: 'unknown'};
  const signatures = Object.fromEntries(await Promise.all(['approve', 'stop'].map(async id => [id, create.done && safe.status === 'ok' ? await attempt(async () => {
    if (id === 'approve' && !(await code(art.safeBatch.to))) throw Error('MultiSendCallOnly is not available');
    const tx = txFor(art, id), hash = await call(safeAddr, safeHashCall(tx, safe.nonce)); uint(hash);
    const approved = await Promise.all(safe.owners.map(owner => call(safeAddr, approvedHashData(owner, hash)).then(v => uint(v) > 0n)));
    const approvalErrors = await Promise.all(safe.owners.map((o, i) => approved[i] ? null : simulate({from: o, to: safeAddr, value: '0x0', data: approveHashData(hash)})));
    const execError = approved.every(Boolean) ? await simulate({from: safe.owners[0], to: safeAddr, value: '0x0', data: safeExecData(tx, safe.owners)}) : null;
    return {hash, nonce: safe.nonce, approved, approvalErrors, execError};
  }) : {status: 'unknown'}])));
  return {block: block.number, range, create, approve, stop, allowNew, allowOld, safe, signatures, share, rangeView};
}

export function stepAction(art, s, id, owner) {
  if (!s || s[id]?.status !== 'ok') return {text: 'Refreshing', buttons: []};
  const part = s[id];
  if (id === 'range') return part.done ? {text: 'Done', buttons: []} : part.simError ? {text: part.simError, buttons: []} : {text: 'Not made yet', buttons: ['range']};
  if (id === 'create') {
    if (part.done) return {text: 'Done', buttons: []};
    if (!s.range.done) return {text: 'Make the range first', buttons: []};
    return part.simError ? {text: part.simError, buttons: []} : {text: 'Not set up yet', buttons: ['create']};
  }
  if (!s.create.done) return {text: 'Set up the fee share first', buttons: []};
  if (part.done) return {text: id === 'stop' ? 'Stopped' : 'Done', buttons: []};
  if (id === 'stop' && !s.approve.done) return {text: 'Not running', buttons: []};
  const sig = s.signatures[id];
  if (s.safe.status !== 'ok' || sig?.status !== 'ok') return {text: 'Refreshing', buttons: []};
  const index = s.safe.owners.findIndex(o => same(o, owner));
  if (sig.approved.every(Boolean) && sig.execError) return {text: sig.execError, buttons: []};
  if (index < 0) return {text: 'Connect a Safe owner wallet', buttons: ['connect']};
  if (!sig.approved[index]) return sig.approvalErrors[index] ? {text: sig.approvalErrors[index], buttons: []} : {text: 'Approve this Safe transaction', buttons: ['approve']};
  return sig.approved.every(Boolean) ? {text: 'Both owners approved', buttons: ['execute']} : {text: 'Waiting for the other Safe owner', buttons: []};
}

const wethText = n => { const v = BigInt(n), f = (v % ONE).toString().padStart(18, '0').slice(0, 6).replace(/0+$/, ''); return `${v / ONE}${f ? '.' + f : ''} WETH`; };
const pct = n => `${Number(BigInt(n)) / 100}%`;
const when = t => new Date(Number(t) * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
export function formatReadout(s) {
  const out = [];
  if (s?.share.status === 'ok') {
    const r = s.share;
    out.push(`Share: ${pct(r.shareBps)} of the pool's WETH fees`);
    out.push(BigInt(r.pendingAt) > 0n ? `Pending change: ${pct(r.pendingBps)} · applies ${when(r.pendingAt)}` : 'No pending change. Changes take 48 hours.');
    out.push(`Sent to the range so far: ${wethText(r.totalForwarded)}`, `Ready to send: ${wethText(r.forwardable)}`);
  }
  if (s?.rangeView.status === 'ok') {
    const v = s.rangeView;
    out.push(BigInt(v.placed) === 1n ? 'Bands: placed' : `Bands: placing after ${Number(v.checkpoints)}/4 price checks`);
    out.push(`Added to liquidity so far: ${wethText(v.totalKept0)}`, `Waiting for the next add: ${wethText(v.held0)}`);
    if (BigInt(v.lastRecenter) > 0n) out.push(`Last re-centre: ${when(v.lastRecenter)}`);
  }
  if (s?.allowNew.status === 'ok') out.push(`Safe allowance: ${wethText(s.allowNew.value)}`);
  return out.length ? out : ['Refreshing'];
}

export function mountAdaptive({document: doc, hub, io, pollMs = 30000}) {
  const root = doc.getElementById('qal-root');
  let art, state, reading = false, busy = false, stopped = false, message = '', focusKey;
  const el = (tag, attrs = {}, ...kids) => { const n = doc.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (v === false || v == null) continue; if (k === 'onclick') n.addEventListener('click', v); else n.setAttribute(k, v); } n.append(...kids.flat().filter(k => k != null)); return n; };
  const button = (text, onclick, key = text) => el('button', {type: 'button', class: 'qtx-mini qas-go', 'data-focus': key, disabled: busy || reading, onclick}, text);
  const label = a => ({range: 'Make the range', create: 'Set up', approve: 'Approve as Safe owner', execute: 'Execute Safe transaction'})[a];
  function render() {
    focusKey = doc.activeElement?.getAttribute?.('data-focus') || focusKey;
    root.setAttribute('aria-busy', String(reading || busy));
    if (!art) { root.replaceChildren(el('p', {role: 'status'}, message || 'Refreshing'), button('Refresh status', refresh)); return; }
    const cards = [['range', '1 · Make the QHOOKS range'], ['create', '2 · Set up the fee share'], ['approve', '3 · Safe: switch the fee share'], ['stop', 'Stop']].map(([id, title]) => {
      const view = stepAction(art, state, id, hub.snapshot().current?.owner);
      const card = el('section', {class: 'qpfs-step' + (id === 'stop' ? ' qpfs-stop' : ''), 'aria-labelledby': 'qal-' + id, 'data-step': id}, el('h2', {id: 'qal-' + id}, title));
      if (id === 'range') card.append(el('p', {}, 'Any wallet. Bands around the price that re-centre after big moves.'), el('p', {class: 'qpfs-address'}, art.range.address));
      if (id === 'create') card.append(el('p', {}, 'Any wallet. Sends 50% of the pool\'s WETH fees to the range.'), el('p', {class: 'qpfs-address'}, art.address));
      if (id === 'approve') card.append(el('ul', {}, el('li', {}, 'Approve up to 1 WETH for the new fee share'), el('li', {}, 'Stop the previous fee share (approval set to 0)')), el('p', {}, 'One Safe transaction. Both owners approve, then one executes.'), el('p', {class: 'qal-permanent'}, PERMANENT));
      if (id === 'stop') card.append(el('p', {class: 'qpfs-label'}, 'Remove the Safe WETH approval. Both owners approve, then one executes.'));
      card.append(el('p', {class: 'qpfs-state', role: 'status'}, reading ? 'Refreshing' : view.text));
      if ((id === 'approve' || id === 'stop') && state?.create.done) {
        card.append(el('p', {class: 'qpfs-address'}, 'Safe nonce: ' + (state?.safe.nonce ?? 'Refreshing')));
        if (state?.safe.owners) card.append(el('ul', {class: 'qpfs-approvals'}, ...state.safe.owners.map((o, i) => el('li', {}, o + ' · ' + (state.signatures[id]?.status === 'ok' ? state.signatures[id].approved[i] ? 'Approved' : 'Not approved' : 'Refreshing')))));
      }
      for (const action of view.buttons) card.append(action === 'connect' ? button(view.text, () => hub.open(), id + ':connect') : button(label(action), () => send(id, action), id + ':' + action));
      return card;
    });
    root.replaceChildren(el('p', {class: 'qpfs-address'}, 'Safe · 2 of 2 · ' + art.constructor.safe), cards[0], cards[1], cards[2],
      el('section', {class: 'qpfs-step', 'aria-label': 'Live adaptive liquidity'}, el('h2', {}, 'Adaptive liquidity'), ...formatReadout(state).map(text => el('p', {}, text))),
      cards[3], el('p', {class: 'qas-status', role: 'status', 'aria-live': 'polite'}, message), button('Refresh status', refresh));
    if (!reading && !busy && focusKey) root.querySelector?.('[data-focus="' + focusKey + '"]')?.focus();
  }
  async function refresh() {
    if (reading || busy || stopped) return;
    reading = true; render();
    try { art = await io.fetchJson(MANIFEST); verifyPlan(art); io.begin?.(); state = await readAdaptive(art, io.rpc, {from: hub.snapshot().current?.owner || SIM_FROM}); }
    catch (e) { state = null; message = e.message || 'Could not read the network. Refresh to try again.'; }
    finally { reading = false; render(); }
  }
  async function send(id, action) {
    if (busy || reading || !state) return;
    let conn = hub.snapshot().current; if (!conn) { hub.open(); return; }
    const before = state.signatures[id]; busy = true; message = 'Preparing your wallet…'; render();
    try {
      const originalOwner = conn.owner;
      if (String(conn.chainId) !== String(art.chainId)) conn = await hub.switchChain(String(art.chainId));
      if (!same(conn?.owner, originalOwner) || String(conn?.chainId) !== String(art.chainId)) throw Error('Your wallet changed. Try again.');
      const fresh = await io.fetchJson(MANIFEST); verifyPlan(fresh);
      if (JSON.stringify(fresh) !== JSON.stringify(art)) throw Error('Setup details changed. Refresh to try again.');
      io.begin?.(); state = await readAdaptive(art, io.rpc, {from: originalOwner});
      const view = stepAction(art, state, id, conn.owner);
      if (!view.buttons.includes(action)) throw Error(view.text);
      if ((id === 'approve' || id === 'stop') && (before?.hash !== state.signatures[id]?.hash || before?.nonce !== state.safe.nonce)) throw Error('The Safe nonce changed. Review the approvals and try again.');
      const tx = id === 'range' || id === 'create' ? walletTx(art, id, conn.owner)
        : {from: conn.owner, to: art.constructor.safe, value: '0x0', data: action === 'approve' ? approveHashData(state.signatures[id].hash) : safeExecData(txFor(art, id), state.safe.owners)};
      io.begin?.(); await io.rpc('eth_call', [tx, 'latest']);
      const gas = BigInt(await io.rpc('eth_estimateGas', [tx])); tx.gas = '0x' + (gas * 13n / 10n).toString(16);
      if (!same(hub.snapshot().current?.owner, originalOwner) || String(hub.snapshot().current?.chainId) !== String(art.chainId)) throw Error('Your wallet changed. Try again.');
      message = 'Confirm in your wallet'; render();
      const hash = await conn.entry.provider.request({method: 'eth_sendTransaction', params: [tx]});
      message = 'Sent. Waiting for the network…'; render();
      let receipt;
      for (let i = 0; i < 90 && !receipt && !stopped; i++) { io.begin?.(); receipt = await io.rpc('eth_getTransactionReceipt', [hash]); if (!receipt) await new Promise(r => setTimeout(r, 2000)); }
      if (!receipt) throw Error('Still pending. Check your wallet activity, then refresh.');
      if (BigInt(receipt.status) !== 1n) throw Error('The transaction did not complete. Check your wallet activity.');
      // The range keeper also finds it from the maker's log; registering just makes the first run sooner.
      if (id === 'range') io.register?.(art.range.address);
      message = 'Transaction confirmed. Refreshing';
    } catch (e) { message = /reject|denied|cancel/i.test(e.message) ? 'Cancelled in your wallet' : revertReason(e); }
    finally { busy = false; await refresh(); }
  }
  const unsubscribe = hub.subscribe(() => { render(); if (art) refresh(); }), ready = refresh();
  const timer = pollMs ? setInterval(() => { if (doc.visibilityState !== 'hidden') refresh(); }, pollMs) : null;
  return {ready, refresh, getState: () => state, dispose() { stopped = true; if (timer) clearInterval(timer); unsubscribe?.(); }};
}

if (typeof document !== 'undefined' && document.getElementById('qal-root')) {
  Promise.all([import('./wallet-hub-fresh.mjs'), import('./qx-taps.mjs'), import('./chains.mjs')]).then(([wallet, reads, chains]) => {
    const client = reads.createReadClient();
    const rpc = async (method, params) => {
      if (method !== 'eth_estimateGas') return client.rpc('4663', method, params);
      const response = await client.request(chains.chainById('4663').rpc, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params})});
      if (!response.ok) throw Error('Could not estimate network gas');
      const result = await response.json();
      if (result.error) throw Object.assign(Error(result.error.message || 'This transaction would fail right now'), {data: result.error.data});
      if (!/^0x[0-9a-f]+$/i.test(result.result)) throw Error('Incomplete gas estimate');
      return result.result;
    };
    const register = range => fetch('/api/range/register', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({chain: '4663', range})}).catch(() => {});
    mountAdaptive({document, hub: wallet.getWalletHub(window), io: {...client, rpc, register}});
  }).catch(() => { document.getElementById('qal-root').textContent = 'Could not load setup. Reload to try again.'; });
}
