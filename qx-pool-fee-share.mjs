import {keccakHex, safeHashCall, safeExecData} from './qdrops-core.mjs';
import {selector, word, addressWord, allowanceData, staticCallData, multiSendData, approveHashData, approvedHashData} from './qx-flywheel2-setup.mjs';

export const MANIFEST = '/full-launch/pool-fee-share-v1.json';
const same = (a, b) => a?.toLowerCase() === b?.toLowerCase();
const bytes = h => Uint8Array.from(h.slice(2).match(/../g) || [], b => parseInt(b, 16));
const uint = h => { if (!/^0x[0-9a-f]{64}$/i.test(h)) throw Error('Incomplete integer read'); return BigInt(h); };
const attempt = async fn => { try { return {status: 'ok', ...await fn()}; } catch (e) { return {status: 'unknown', reason: e.message || 'Refreshing'}; } };
const SIM_FROM = '0x000000000000000000000000000000000000dEaD';
export function verifyDeployment(art) {
  if (String(art.chainId) !== '4663' || !/^0x[0-9a-f]{40}$/i.test(art.deployer) || !/^0x[0-9a-f]{64}$/i.test(art.salt) || !/^0x(?:[0-9a-f]{2}){33,}$/i.test(art.calldata)) throw Error('Invalid deployment details');
  if (!same(art.calldata.slice(0, 66), art.salt)) throw Error('Deployment salt differs');
  const initCodeHash = keccakHex(bytes('0x' + art.calldata.slice(66)));
  if (!same(initCodeHash, art.initCodeHash)) throw Error('Deployment code hash differs');
  const address = '0x' + keccakHex(bytes('0xff' + art.deployer.slice(2) + art.salt.slice(2) + initCodeHash.slice(2))).slice(-40);
  if (!same(address, art.address)) throw Error('Deployment address differs');
  const batch = art.safeBatch, stop = art.safeTap_stop;
  if (!batch || !/^0x[0-9a-f]{40}$/i.test(batch.to) || batch.operation !== 1 || batch.value !== '0' || batch.signers !== 'both' || batch.calls?.length !== 2) throw Error('Safe batch details differ');
  const [approve, transfer] = batch.calls;
  if (approve.fn !== 'approve(address,uint256)' || approve.args?.length !== 2 || !same(approve.args[0], art.address) || BigInt(approve.args[1]) !== 10n ** 18n) throw Error('Safe approval details differ');
  if (transfer.fn !== 'transfer(address,uint256)' || transfer.args?.length !== 2 || !same(transfer.to, approve.to) || !same(transfer.args[0], art.constructor.dest_v2) || BigInt(transfer.args[1]) !== 400000000000000000n) throw Error('Safe liquidity addition details differ');
  if (stop.fn !== 'approve(address,uint256)' || stop.args?.length !== 2 || !same(stop.to, approve.to) || !same(stop.args[0], art.address) || BigInt(stop.args[1]) !== 0n) throw Error('Safe stop details differ');
  if (!same(multiSendData(batch.calls.map(c => ({to: c.to, value: '0', data: staticCallData(c.fn, c.args)}))), batch.data)) throw Error('Safe batch data differs from its calls');
  return {initCodeHash, address};
}
export function revertReason(e) {
  const data = e?.data?.data || e?.data;
  if (typeof data === 'string' && data.startsWith('0x08c379a0')) {
    try { const length = Number(BigInt('0x' + data.slice(74, 138))); return new TextDecoder().decode(bytes('0x' + data.slice(138, 138 + length * 2))).slice(0, 160); } catch {}
  }
  const message = String(e?.message || '').replace(/^.*execution reverted:?\s*/i, '').slice(0, 160);
  return message || (typeof data === 'string' ? data.slice(0, 10) : 'This transaction would fail right now');
}
const transaction = (art, id) => id === 'approve'
  ? {to: art.safeBatch.to, value: art.safeBatch.value, operation: art.safeBatch.operation, data: art.safeBatch.data}
  : {to: art.safeTap_stop.to, value: '0', operation: 0, data: staticCallData(art.safeTap_stop.fn, art.safeTap_stop.args)};
const deployTx = (art, from) => ({from, to: art.deployer, data: art.calldata, value: '0x0'});
function decodeOwners(h) {
  if (!/^0x(?:[0-9a-f]{64}){4}$/i.test(h)) throw Error('Safe must have two owners');
  const w = h.slice(2).match(/.{64}/g);
  if (BigInt('0x' + w[0]) !== 32n || BigInt('0x' + w[1]) !== 2n || w.slice(2).some(v => BigInt('0x' + v) <= 0n || BigInt('0x' + v) >= 2n ** 160n)) throw Error('Safe must have two owners');
  const owners = w.slice(2).map(v => '0x' + v.slice(-40).toLowerCase());
  if (same(...owners)) throw Error('Safe owners differ');
  return owners;
}
export async function readPoolFeeShare(art, rpc, {from = SIM_FROM} = {}) {
  verifyDeployment(art);
  const block = await rpc('eth_getBlockByNumber', ['latest', false]);
  if (!/^0x[0-9a-f]+$/i.test(block?.number) || !/^0x[0-9a-f]+$/i.test(block?.timestamp)) throw Error('Incomplete block read');
  const call = (to, data) => rpc('eth_call', [{to, data}, block.number]);
  const simulate = async tx => { try { await rpc('eth_call', [tx, block.number]); await rpc('eth_estimateGas', [tx]); return null; } catch (e) { return revertReason(e); } };
  const [create, allowance, safe] = await Promise.all([
    attempt(async () => {
      const code = await rpc('eth_getCode', [art.address, block.number]);
      if (!/^0x(?:[0-9a-f]{2})*$/i.test(code)) throw Error('Incomplete code read');
      return {done: code !== '0x', simError: code === '0x' ? await simulate(deployTx(art, from)) : null};
    }),
    attempt(async () => ({value: uint(await call(art.safeBatch.calls[0].to, allowanceData(art.constructor.safe, art.address))).toString()})),
    attempt(async () => {
      const [nonce, owners, threshold] = await Promise.all(['nonce()', 'getOwners()', 'getThreshold()'].map(fn => call(art.constructor.safe, selector(fn))));
      if (uint(threshold) !== 2n) throw Error('Safe threshold must be two');
      return {nonce: uint(nonce).toString(), owners: decodeOwners(owners)};
    }),
  ]);
  const approve = {...allowance, done: allowance.status === 'ok' && BigInt(allowance.value) >= BigInt(art.safeBatch.calls[0].args[1])};
  const stop = {...allowance, done: allowance.status === 'ok' && BigInt(allowance.value) === 0n};
  const readout = create.status === 'ok' && create.done ? await attempt(async () => Object.fromEntries(await Promise.all(art.views_for_page.map(async fn => [fn.split('(')[0], uint(await call(art.address, selector(fn))).toString()])))) : {status: 'unknown'};
  const signatures = Object.fromEntries(await Promise.all(['approve', 'stop'].map(async id => [id, create.done && safe.status === 'ok' ? await attempt(async () => {
    if (id === 'approve' && !/^0x(?:[0-9a-f]{2})+$/i.test(await rpc('eth_getCode', [art.safeBatch.to, block.number]))) throw Error('MultiSendCallOnly is not available');
    const tx = transaction(art, id), hash = await call(art.constructor.safe, safeHashCall(tx, safe.nonce)); uint(hash);
    const approved = await Promise.all(safe.owners.map(owner => call(art.constructor.safe, approvedHashData(owner, hash)).then(v => uint(v) > 0n)));
    const approvalErrors = await Promise.all(safe.owners.map((from, i) => approved[i] ? null : simulate({from, to: art.constructor.safe, value: '0x0', data: approveHashData(hash)})));
    const execError = approved.every(Boolean) ? await simulate({from: safe.owners[0], to: art.constructor.safe, value: '0x0', data: safeExecData(tx, safe.owners)}) : null;
    return {hash, nonce: safe.nonce, approved, approvalErrors, execError};
  }) : {status: 'unknown'}])));
  return {block: block.number, timestamp: Number(BigInt(block.timestamp)), create, approve, stop, allowance, safe, signatures, readout};
}
export function stepAction(art, s, id, owner) {
  if (!s || s[id]?.status !== 'ok') return {text: 'Refreshing', buttons: []};
  const part = s[id];
  if (id === 'create') return part.done ? {text: 'Set up', buttons: []} : part.simError ? {text: part.simError, buttons: []} : {text: 'Not set up yet', buttons: ['create']};
  if (!s.create.done) return {text: 'Set up the contract first', buttons: []};
  if (part.done) return {text: id === 'stop' ? 'Stopped' : 'Done', buttons: []};
  const sig = s.signatures[id];
  if (s.safe.status !== 'ok' || sig?.status !== 'ok') return {text: 'Refreshing', buttons: []};
  const index = s.safe.owners.findIndex(o => same(o, owner));
  if (sig.approved.every(Boolean) && sig.execError) return {text: sig.execError, buttons: []};
  if (index < 0) return {text: 'Connect a Safe owner wallet', buttons: ['connect']};
  if (!sig.approved[index]) return sig.approvalErrors[index] ? {text: sig.approvalErrors[index], buttons: []} : {text: 'Approve this Safe transaction', buttons: ['approve']};
  return sig.approved.every(Boolean) ? {text: 'Both owners approved', buttons: ['execute']} : {text: 'Waiting for the other Safe owner', buttons: []};
}
const weth = n => { const v = BigInt(n), fraction = (v % 10n ** 18n).toString().padStart(18, '0').replace(/0+$/, ''); return `${v / 10n ** 18n}${fraction ? '.' + fraction : ''} WETH`; };
const percent = n => `${BigInt(n) / 100n}${BigInt(n) % 100n ? '.' + (BigInt(n) % 100n).toString().padStart(2, '0').replace(/0+$/, '') : ''}%`;
export function formatReadout(s) {
  if (s?.readout.status !== 'ok') return ['Refreshing'];
  const r = s.readout;
  return [`Share: ${percent(r.shareBps)}`, (BigInt(r.pendingAt) > 0n ? `Pending change: ${percent(r.pendingBps)} · applies ${new Date(Number(r.pendingAt) * 1000).toISOString().replace('T', ' ').replace('.000Z', ' UTC')}` : 'No pending change') + '. Changes take 48 hours.',
    ...['totalEarned', 'totalForwarded', 'owed', 'forwardable'].map((key, i) => `${['Total earned', 'Total forwarded', 'Owed', 'Forwardable'][i]}: ${weth(r[key])}`), `Safe allowance: ${s.allowance.status === 'ok' ? weth(s.allowance.value) : 'Refreshing'}`];
}
export function mountPoolFeeShare({document: doc, hub, io, pollMs = 30000}) {
  const root = doc.getElementById('qpfs-root');
  let art, state, reading = false, busy = false, stopped = false, message = '', focusKey;
  const el = (tag, attrs = {}, ...kids) => { const n = doc.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (v === false || v == null) continue; if (k === 'onclick') n.addEventListener('click', v); else n.setAttribute(k, v); } n.append(...kids.flat().filter(k => k != null)); return n; };
  const button = (text, onclick, key = text) => el('button', {type: 'button', class: 'qtx-mini qas-go', 'data-focus': key, disabled: busy || reading, onclick}, text);
  function render() {
    focusKey = doc.activeElement?.getAttribute?.('data-focus') || focusKey;
    root.setAttribute('aria-busy', String(reading || busy));
    if (!art) { root.replaceChildren(el('p', {role: 'status'}, message || 'Refreshing'), button('Refresh status', refresh)); return; }
    const cards = [['create', '1 · Set up QPoolFeeShare'], ['approve', '2 · Safe: approve and add liquidity'], ['stop', 'Stop']].map(([id, title]) => {
      const view = stepAction(art, state, id, hub.snapshot().current?.owner);
      const card = el('section', {class: 'qpfs-step' + (id === 'stop' ? ' qpfs-stop' : ''), 'aria-labelledby': 'pfs-' + id, 'data-step': id}, el('h2', {id: 'pfs-' + id}, title));
      if (id === 'create') card.append(el('p', {class: 'qpfs-address'}, art.address));
      if (id === 'approve') card.append(el('ul', {}, el('li', {}, 'Approve up to 1 WETH for the fee share'), el('li', {}, 'Add 0.4 WETH to the liquidity ladder (one time)')), el('p', {}, 'One Safe transaction. Both owners approve, then one executes.'));
      if (id === 'stop') card.append(el('p', {class: 'qpfs-label'}, 'Remove the Safe WETH approval. Both owners approve, then one executes.'));
      card.append(el('p', {class: 'qpfs-state', role: 'status'}, reading ? 'Refreshing' : view.text));
      if (id !== 'create') {
        card.append(el('p', {class: 'qpfs-address'}, 'Safe nonce: ' + (state?.safe.nonce ?? 'Refreshing')));
        if (state?.safe.owners) card.append(el('ul', {class: 'qpfs-approvals'}, ...state.safe.owners.map((o, i) => el('li', {}, o + ' · ' + (state.signatures[id]?.status === 'ok' ? state.signatures[id].approved[i] ? 'Approved' : 'Not approved' : 'Refreshing')))));
      }
      for (const action of view.buttons) card.append(action === 'connect' ? button(view.text, () => hub.open(), id + ':connect') : button(action === 'create' ? 'Set up' : action === 'approve' ? 'Approve as Safe owner' : 'Execute Safe transaction', () => send(id, action), id + ':' + action));
      return card;
    });
    root.replaceChildren(el('p', {class: 'qpfs-address'}, 'Safe · 2 of 2 · ' + art.constructor.safe), cards[0], cards[1], el('section', {class: 'qpfs-step', 'aria-label': 'Live pool fee share'}, el('h2', {}, 'Pool fee share'), ...formatReadout(state).map(text => el('p', {}, text))), cards[2], el('p', {class: 'qas-status', role: 'status', 'aria-live': 'polite'}, message), button('Refresh status', refresh));
    if (!reading && !busy && focusKey) root.querySelector?.('[data-focus="' + focusKey + '"]')?.focus();
  }
  async function refresh() {
    if (reading || busy || stopped) return;
    reading = true; render();
    try { art = await io.fetchJson(MANIFEST); verifyDeployment(art); io.begin?.(); state = await readPoolFeeShare(art, io.rpc, {from: hub.snapshot().current?.owner || SIM_FROM}); }
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
      const freshArt = await io.fetchJson(MANIFEST); verifyDeployment(freshArt);
      if (JSON.stringify(freshArt) !== JSON.stringify(art)) throw Error('Setup details changed. Refresh to try again.');
      io.begin?.(); state = await readPoolFeeShare(art, io.rpc, {from: originalOwner});
      const view = stepAction(art, state, id, conn.owner);
      if (!view.buttons.includes(action)) throw Error(view.text);
      if (id !== 'create' && (before?.hash !== state.signatures[id]?.hash || before?.nonce !== state.safe.nonce)) throw Error('The Safe nonce changed. Review the approvals and try again.');
      const tx = id === 'create' ? deployTx(art, conn.owner) : {from: conn.owner, to: art.constructor.safe, value: '0x0', data: action === 'approve' ? approveHashData(state.signatures[id].hash) : safeExecData(transaction(art, id), state.safe.owners)};
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
      message = 'Transaction confirmed. Refreshing';
    } catch (e) { message = /reject|denied|cancel/i.test(e.message) ? 'Cancelled in your wallet' : revertReason(e); }
    finally { busy = false; await refresh(); }
  }
  const unsubscribe = hub.subscribe(() => { render(); if (art) refresh(); }), ready = refresh();
  const timer = pollMs ? setInterval(() => { if (doc.visibilityState !== 'hidden') refresh(); }, pollMs) : null;
  return {ready, refresh, getState: () => state, dispose() { stopped = true; if (timer) clearInterval(timer); unsubscribe?.(); }};
}
if (typeof document !== 'undefined' && document.getElementById('qpfs-root')) {
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
    mountPoolFeeShare({document, hub: wallet.getWalletHub(window), io: {...client, rpc}});
  }).catch(() => { document.getElementById('qpfs-root').textContent = 'Could not load setup. Reload to try again.'; });
}
