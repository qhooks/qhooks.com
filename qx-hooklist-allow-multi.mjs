import {selector, word, addressWord, approveHashData, approvedHashData, safeTransactionHash, SEL} from './qx-flywheel2-setup.mjs';
// These are the same upstream builders used by the flywheel setup.
import {safeHashCall, safeExecData} from './qdrops-core.mjs';

export const MANIFEST = '/full-launch/flywheel2-v1.json';
export const CHAIN_ID = '4663';
export const SAFE = '0x2b1Cf7c4071A98A59709166DFA73C7acb7E83E71';
export const HOOK_LIST = '0x24Ca277B0b6ddCBCDEA162914970BdD08e150ad4';
export const LAUNCH = '0x3fcf7693f799da31134970787f9f35578d0f60cc';
export const CODE_HASH = '0x8a71abdc5802e8ecb6868827e6d9a2921f38ac23468a9a64ab63512d963f2198';
export const REVIEW = 'qhooks multi-pool v4 (QSimpleLaunch v4) 2026-11-11, MULTIPOOL-DELTA.md';
const reviewBytes = new TextEncoder().encode(REVIEW);
const reviewHex = Array.from(reviewBytes, b => b.toString(16).padStart(2, '0')).join('');
export const ALLOW_DATA = selector('allow(address,bytes32,string)') + addressWord(LAUNCH) + CODE_HASH.slice(2) + word(96) + word(reviewBytes.length) + reviewHex.padEnd(Math.ceil(reviewBytes.length / 32) * 64, '0');
export const IS_ALLOWED_DATA = selector('isAllowed(address)') + addressWord(LAUNCH);
export const ALLOW_TRANSACTION = Object.freeze({to: HOOK_LIST, value: '0', operation: 0, data: ALLOW_DATA});
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
// Strict one-word decoder, matching the private integer reader in the flywheel setup.
const uint = h => { if (!/^0x[0-9a-f]{64}$/i.test(h)) throw Error('Incomplete integer read'); return BigInt(h); };
function config(art) {
  if (!same(art.safe, SAFE) || String(art.chainId) !== CHAIN_ID || art.threshold !== 2 || art.owners?.length !== 2) throw Error('Check the Safe setup details and refresh.');
  art.owners.forEach(addressWord);
  if (same(art.owners[0], art.owners[1])) throw Error('Check the Safe owners and refresh.');
  return {safe: SAFE, chainId: CHAIN_ID, threshold: 2, owners: [...art.owners]};
}
export async function readHooklist(art, rpc) {
  config(art);
  const block = await rpc('eth_getBlockByNumber', ['latest', false]);
  if (!/^0x[0-9a-f]+$/i.test(block?.number)) throw Error('Incomplete block read');
  const tag = block.number, call = (to, data) => rpc('eth_call', [{to, data}, tag]);
  const code = await rpc('eth_getCode', [HOOK_LIST, tag]);
  if (!/^0x(?:[0-9a-f]{2})+$/i.test(code)) throw Error('Check the hook list contract and refresh.');
  const allowed = uint(await call(HOOK_LIST, IS_ALLOWED_DATA));
  if (allowed > 1n) throw Error('Incomplete allowed read');
  if (allowed === 1n) return {status: 'ok', done: true, block: tag};
  const [n, owners, threshold] = await Promise.all([call(SAFE, SEL.nonce), call(SAFE, SEL.getOwners), call(SAFE, SEL.getThreshold)]);
  // getOwners() is a dynamic address array; require exactly the configured two owners.
  if (!/^0x[0-9a-f]{256}$/i.test(owners)) throw Error('Incomplete owners read');
  const words = owners.slice(2).match(/.{64}/g);
  if (uint('0x' + words[0]) !== 32n || uint('0x' + words[1]) !== 2n || uint(threshold) !== 2n ||
      !words.slice(2).every(w => /^0{24}[0-9a-f]{40}$/i.test(w)) ||
      !art.owners.every(o => words.slice(2).some(w => same('0x' + w.slice(24), o)))) throw Error('Safe owners or threshold differ.');
  const nonce = uint(n).toString(), hash = await call(SAFE, safeHashCall(ALLOW_TRANSACTION, nonce));
  uint(hash);
  if (!same(hash, safeTransactionHash(ALLOW_TRANSACTION, nonce, CHAIN_ID, SAFE))) throw Error('Safe transaction details differ.');
  const approved = await Promise.all(art.owners.map(o => call(SAFE, approvedHashData(o, hash)).then(v => uint(v) > 0n)));
  return {status: 'ok', done: false, block: tag, nonce, hash, approved};
}
export function stepAction(art, state, owner) {
  if (state?.status !== 'ok') return {text: 'Refreshing', buttons: []};
  if (state.done) return {text: 'Allowed', buttons: []};
  const index = art.owners.findIndex(o => same(o, owner));
  if (index < 0) return {text: 'Connect a Safe owner wallet above', buttons: []};
  if (!state.approved[index]) return {text: 'Approve this Safe transaction', buttons: ['approve']};
  return state.approved.every(Boolean) ? {text: 'Both owners approved', buttons: ['execute']} : {text: 'Waiting for the other Safe owner', buttons: []};
}
export function mountHooklist({document: doc, hub, io, pollMs = 30000}) {
  const root = doc.getElementById('qhlm-root');
  let art, state, reading = false, busy = false, message = '', stopped = false, focusKey;
  const el = (tag, attrs = {}, ...kids) => {
    const n = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === false || v == null) continue;
      if (k === 'onclick') n.addEventListener('click', v); else n.setAttribute(k, v);
    }
    n.append(...kids.flat().filter(k => k != null)); return n;
  };
  const button = (text, onclick, key = text) => el('button', {type: 'button', class: 'qtx-mini qas-go', 'data-focus': key, disabled: busy || reading, onclick}, text);
  function render() {
    if (stopped) return;
    focusKey = doc.activeElement?.getAttribute?.('data-focus') || focusKey;
    root.setAttribute('aria-busy', String(reading || busy));
    if (!art) { root.replaceChildren(el('p', {role: 'status'}, message || 'Refreshing')); return; }
    const owner = hub.snapshot().current?.owner, view = stepAction(art, state, owner);
    const card = el('section', {class: 'qhlm-step', 'data-step': 'allow', 'aria-labelledby': 'qhlm-safe'},
      el('h2', {id: 'qhlm-safe'}, 'Safe, both signers'),
      el('p', {class: 'qhlm-address'}, 'Safe · 2 of 2 · ' + SAFE),
      el('p', {class: 'qhlm-address'}, 'Hook list · ' + HOOK_LIST),
      el('p', {class: 'qhlm-address'}, 'Multi-pool launch contract · ' + LAUNCH),
      el('p', {class: 'qhlm-state', role: 'status'}, reading ? 'Refreshing' : view.text));
    if (!state?.done) {
      card.append(el('p', {class: 'qhlm-address'}, 'Safe nonce: ' + (state?.nonce ?? 'Refreshing')),
        el('ul', {class: 'qhlm-approvals'}, ...art.owners.map((o, i) => el('li', {}, o + ' · ' + (state?.status === 'ok' ? state.approved[i] ? 'Approved' : 'Not approved' : 'Refreshing')))));
      for (const action of view.buttons) card.append(button(action === 'approve' ? 'Approve' : 'Execute', () => send(action), action));
      if (art.owners.some(o => same(o, owner))) card.append(button('Refresh status', refresh));
    }
    root.replaceChildren(card, el('p', {class: 'qas-status', role: 'status', 'aria-live': 'polite'}, message));
    if (!reading && !busy && focusKey) root.querySelector?.('[data-focus="' + focusKey + '"]')?.focus();
  }
  async function refresh() {
    if (reading || stopped || busy) return;
    reading = true; render();
    try {
      art = config(await io.fetchJson(MANIFEST));
      io.begin?.(); state = await readHooklist(art, io.rpc);
      if (state.done || message === 'Could not read the network. Reload to try again.') message = '';
    } catch { state = null; message = message || 'Could not read the network. Reload to try again.'; }
    finally { reading = false; render(); }
  }
  async function send(action) {
    if (busy || reading || stopped || !state || !art) return;
    let conn = hub.snapshot().current;
    if (!stepAction(art, state, conn?.owner).buttons.includes(action)) return;
    const before = state;
    let walletOpened = false;
    busy = true; message = 'Preparing your wallet…'; render();
    try {
      const originalOwner = conn.owner;
      if (String(conn.chainId) !== CHAIN_ID) conn = await hub.switchChain(CHAIN_ID);
      if (!same(conn?.owner, originalOwner) || String(conn?.chainId) !== CHAIN_ID) throw Error('Your wallet changed. Try again.');
      const freshArt = config(await io.fetchJson(MANIFEST));
      if (JSON.stringify(freshArt) !== JSON.stringify(art)) throw Error('Safe setup details changed. Review them and try again.');
      io.begin?.(); state = await readHooklist(art, io.rpc);
      if (state.done) { message = ''; return; }
      if (before.hash !== state.hash || before.nonce !== state.nonce) throw Error('The Safe nonce changed. Review the approvals and try again.');
      if (!stepAction(art, state, conn.owner).buttons.includes(action)) throw Error('This step changed. Review its status and try again.');
      const tx = {from: conn.owner, to: SAFE, value: '0x0', data: action === 'approve' ? approveHashData(state.hash) : safeExecData(ALLOW_TRANSACTION, art.owners)};
      io.begin?.();
      const simulated = await io.rpc('eth_call', [tx, 'latest']);
      if (!/^0x(?:[0-9a-f]{2})*$/i.test(simulated) || (action === 'execute' && uint(simulated) !== 1n)) throw Error('This transaction would not complete right now.');
      const estimate = await io.rpc('eth_estimateGas', [tx]);
      if (!/^0x[0-9a-f]+$/i.test(estimate) || BigInt(estimate) <= 0n) throw Error('Could not estimate network gas.');
      tx.gas = '0x' + (BigInt(estimate) * 13n / 10n).toString(16);
      if (stopped || !same(hub.snapshot().current?.owner, tx.from) || String(hub.snapshot().current?.chainId) !== CHAIN_ID) throw Error('Your wallet changed. Try again.');
      message = 'Confirm in your wallet'; render(); walletOpened = true;
      const hash = await conn.entry.provider.request({method: 'eth_sendTransaction', params: [tx]});
      message = 'Sent. Waiting for the network…'; render();
      let receipt;
      for (let i = 0; i < 90 && !receipt && !stopped; i++) {
        io.begin?.(); receipt = await io.rpc('eth_getTransactionReceipt', [hash]);
        if (!receipt) await new Promise(r => setTimeout(r, 2000));
      }
      if (!receipt) throw Error('Still pending. Check your wallet activity, then refresh.');
      if (BigInt(receipt.status) !== 1n) throw Error('The transaction did not complete. Check your wallet activity.');
      message = 'Transaction confirmed. Checking the result…';
    } catch (e) {
      message = !walletOpened ? (e.message || 'Could not prepare this step.') + ' Nothing was sent.'
        : /reject|denied|cancel/i.test(e.message) || e.code === 4001 ? 'Cancelled in your wallet. Nothing was sent.'
        : (e.message || 'Could not confirm this step.') + ' Check your wallet activity, then refresh.';
    } finally { busy = false; await refresh(); }
  }
  const unsubscribe = hub.subscribe(() => render());
  const ready = refresh();
  const timer = pollMs ? setInterval(() => { if (doc.visibilityState !== 'hidden') refresh(); }, pollMs) : null;
  return {ready, refresh, getState: () => state, dispose() { stopped = true; if (timer) clearInterval(timer); unsubscribe?.(); }};
}
if (typeof document !== 'undefined' && document.getElementById('qhlm-root')) {
  Promise.all([import('./wallet-hub-fresh.mjs'), import('./qx-taps.mjs'), import('./chains.mjs')]).then(([wallet, reads, chains]) => {
    const client = reads.createReadClient();
    const rpc = async (method, params) => {
      if (method !== 'eth_estimateGas') return client.rpc(CHAIN_ID, method, params);
      const response = await client.request(chains.chainById(CHAIN_ID).rpc, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params})});
      if (!response.ok) throw Error('Could not estimate network gas');
      const result = await response.json();
      if (result.error || !/^0x[0-9a-f]+$/i.test(result.result)) throw Error('This transaction would fail right now');
      return result.result;
    };
    mountHooklist({document, hub: wallet.getWalletHub(window), io: {...client, rpc}});
  }).catch(() => { document.getElementById('qhlm-root').textContent = 'Could not load setup. Reload to try again.'; });
}
