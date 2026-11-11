import {keccakHex, safeHashCall, safeExecData} from './qdrops-core.mjs';

export const MANIFEST = '/full-launch/flywheel2-v1.json';
export const DEPLOY_HREF = '/chain-setup?set=flywheel2&chain=4663&go=4663';
export const WAIT_AMOUNT = 'Waiting on the QHOOKS approval amount';
const hexBytes = h => Uint8Array.from(h.slice(2).match(/../g) || [], b => parseInt(b, 16));
export const selector = signature => keccakHex(new TextEncoder().encode(signature)).slice(0, 10);
export const word = n => { const v = BigInt(n); if (v < 0n || v >= 2n ** 256n) throw Error('Invalid amount'); return v.toString(16).padStart(64, '0'); };
export const addressWord = a => { if (!/^0x[0-9a-f]{40}$/i.test(a)) throw Error('Invalid address'); return a.slice(2).toLowerCase().padStart(64, '0'); };
const uint = h => { if (!/^0x[0-9a-f]{64}$/i.test(h)) throw Error('Incomplete integer read'); return BigInt(h); };
const address = h => { const v = uint(h); if (v >= 2n ** 160n) throw Error('Incomplete address read'); return '0x' + h.slice(-40).toLowerCase(); };
const bool = h => { const v = uint(h); if (v > 1n) throw Error('Incomplete boolean read'); return v === 1n; };
const same = (a, b) => a?.toLowerCase() === b?.toLowerCase();
export const SEL = Object.freeze(Object.fromEntries(['feed()', 'owedWeth()', 'owedQhooks()', 'keeper()', 'stalled()', 'manager()', 'lastProgress()', 'nonce()', 'getOwners()', 'getThreshold()'].map(s => [s.split('(')[0], selector(s)])));
export const allowanceData = (owner, spender) => '0xdd62ed3e' + addressWord(owner) + addressWord(spender);
export const approveData = (spender, amount) => '0x095ea7b3' + addressWord(spender) + word(amount);
export const approveHashData = hash => { if (!/^0x[0-9a-f]{64}$/i.test(hash)) throw Error('Invalid Safe hash'); return '0xd4d9bdcd' + hash.slice(2); };
export const approvedHashData = (owner, hash) => '0x7d832974' + addressWord(owner) + hash.slice(2);
export function staticCallData(fn, args) {
  const encode = x => Array.isArray(x) ? x.map(encode).join('') : typeof x === 'boolean' ? word(x ? 1 : 0) : /^0x[0-9a-f]{40}$/i.test(String(x)) ? addressWord(x) : word(BigInt(x) < 0n ? 2n ** 256n + BigInt(x) : x);
  return selector(fn) + args.map(encode).join('');
}
export function multiSendData(calls) {
  const packed = calls.map(c => {
    if (!/^0x(?:[0-9a-f]{2})*$/i.test(c.data)) throw Error('Invalid call bytes');
    return '00' + addressWord(c.to).slice(24) + word(c.value || 0) + word((c.data.length - 2) / 2) + c.data.slice(2);
  }).join('');
  return '0x8d80ff0a' + word(32) + word(packed.length / 2) + packed + '0'.repeat((64 - packed.length % 64) % 64);
}
export function approvalChecks(art) {
  return [
    ...[art.weth, art.qhooks].map(to => ({to, data: allowanceData(art.safe, art.v1), expect: {kind: 'equals', value: '0'}})),
    ...[art.weth, art.qhooks].map(to => ({to, data: allowanceData(art.safe, art.v2), expect: 'nonzero'})),
  ];
}
export function approvalTransaction(art) {
  if (art.qhooksApproval == null) return null;
  if (typeof art.qhooksApproval !== 'string' || !/^[1-9][0-9]*$/.test(art.qhooksApproval)) throw Error('QHOOKS approval must be a positive wei string');
  word(art.qhooksApproval);
  const calls = [[art.weth, art.v1, '0'], [art.qhooks, art.v1, '0'], [art.weth, art.v2, '5000000000000000000'], [art.qhooks, art.v2, art.qhooksApproval]]
    .map(([to, spender, amount]) => ({to, value: '0', data: approveData(spender, amount)}));
  return {to: art.multiSend, value: '0', operation: 1, data: multiSendData(calls)};
}
export const optionalTransaction = (art, id) => ({to: art[id].to, value: '0', operation: 0, data: staticCallData(art[id].fn, art[id].args)});
// EIP-712 reference hash for offline fixtures. The page always asks the Safe for its own hash.
export function safeTransactionHash(tx, nonce, chainId, safe) {
  const hashText = s => keccakHex(new TextEncoder().encode(s));
  const hashHex = h => keccakHex(hexBytes(h));
  const domain = hashHex(hashText('EIP712Domain(uint256 chainId,address verifyingContract)') + word(chainId) + addressWord(safe));
  const typeHash = hashText('SafeTx(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce)');
  const struct = hashHex(typeHash + addressWord(tx.to) + word(tx.value || 0) + keccakHex(hexBytes(tx.data)).slice(2) + word(tx.operation) + word(0).repeat(5) + word(nonce));
  return hashHex('0x1901' + domain.slice(2) + struct.slice(2));
}
export const settled = (w, q) => BigInt(w) === 0n && BigInt(q) === 0n;
export const approvalsDone = values => values.length === 4 && BigInt(values[0]) === 0n && BigInt(values[1]) === 0n && BigInt(values[2]) > 0n && BigInt(values[3]) > 0n;
const attempt = async fn => { try { return {status: 'ok', ...await fn()}; } catch (e) { return {status: 'unknown', reason: e.message || 'Refreshing'}; } };
function decodeOwners(h) {
  if (!/^0x(?:[0-9a-f]{64})+$/i.test(h)) throw Error('Incomplete owners read');
  const words = h.slice(2).match(/.{64}/g);
  if (BigInt('0x' + words[0]) !== 32n || BigInt('0x' + words[1]) !== BigInt(words.length - 2)) throw Error('Incomplete owners read');
  return words.slice(2).map(w => address('0x' + w));
}
export async function readFlywheel2(art, rpc) {
  const block = await rpc('eth_getBlockByNumber', ['latest', false]);
  if (!/^0x[0-9a-f]+$/i.test(block?.number) || !/^0x[0-9a-f]+$/i.test(block?.timestamp)) throw Error('Incomplete block read');
  const tag = block.number;
  const call = (to, data) => rpc('eth_call', [{to, data}, tag]);
  const [create, settle, approvals, stop, target, safe] = await Promise.all([
    attempt(async () => { const code = await rpc('eth_getCode', [art.v2, tag]); if (!/^0x(?:[0-9a-f]{2})*$/i.test(code)) throw Error('Incomplete code read'); return {done: code !== '0x'}; }),
    attempt(async () => { const [w, q] = await Promise.all([call(art.v1, SEL.owedWeth), call(art.v1, SEL.owedQhooks)]); return {weth: uint(w).toString(), qhooks: uint(q).toString(), done: settled(uint(w), uint(q))}; }),
    attempt(async () => { const values = await Promise.all(approvalChecks(art).map(c => call(c.to, c.data).then(uint))); return {values: values.map(String), done: approvalsDone(values), waiting: art.qhooksApproval == null}; }),
    attempt(async () => { const keeper = address(await call(art.flywheel, SEL.keeper)); return {keeper, done: same(keeper, art.dead)}; }),
    attempt(async () => { const [manager, stalled, last] = await Promise.all([call(art.flywheel, SEL.manager), call(art.flywheel, SEL.stalled), call(art.flywheel, SEL.lastProgress)]); return {manager: address(manager), stalled: bool(stalled), lastProgress: uint(last).toString(), remaining: Math.max(0, Number(uint(last)) + 604801 - Number(BigInt(block.timestamp))), done: same(address(manager), art.v2)}; }),
    attempt(async () => {
      const [n, owners, th, code] = await Promise.all([call(art.safe, SEL.nonce), call(art.safe, SEL.getOwners), call(art.safe, SEL.getThreshold), rpc('eth_getCode', [art.multiSend, tag])]);
      const actual = decodeOwners(owners);
      if (uint(th) !== 2n || actual.length !== 2 || !art.owners.every(o => actual.some(a => same(a, o)))) throw Error('Safe owners or threshold differ');
      if (!/^0x(?:[0-9a-f]{2})+$/i.test(code)) throw Error('MultiSend is not available');
      return {nonce: uint(n).toString(), owners: actual};
    }),
  ]);
  const transactions = {approvals: approvalTransaction(art), stop: optionalTransaction(art, 'stop'), target: optionalTransaction(art, 'target')};
  const signatures = Object.fromEntries(await Promise.all(Object.entries(transactions).map(async ([id, tx]) => [id, tx && safe.status === 'ok' ? await attempt(async () => {
    const hash = await call(art.safe, safeHashCall(tx, safe.nonce)); uint(hash);
    const approved = await Promise.all(art.owners.map(o => call(art.safe, approvedHashData(o, hash)).then(v => uint(v) > 0n)));
    return {hash, approved, nonce: safe.nonce};
  }) : {status: 'unknown'}])));
  return {block: tag, timestamp: Number(BigInt(block.timestamp)), create, settle, approvals, stop, target, safe, signatures};
}
export function stepAction(art, s, id, owner) {
  if (id === 'approvals' && art.qhooksApproval == null) return {text: WAIT_AMOUNT, buttons: []};
  if (!s) return {text: 'Refreshing', buttons: []};
  const part = s[id];
  if (part.status !== 'ok') return {text: 'Refreshing', buttons: []};
  if (id === 'create') return {text: part.done ? 'Created' : 'Not created yet', buttons: part.done ? [] : ['create']};
  if (id === 'settle') return {text: part.done ? 'Settled · nothing owed' : 'v1 has tokens to settle', buttons: ['feed'], disabled: part.done};
  if (id === 'approvals' && part.waiting) return {text: WAIT_AMOUNT, buttons: []};
  if (part.done || (id === 'stop' && s.target.done)) return {text: 'Done', buttons: []};
  if (!s.create.done || !s.settle.done) return {text: 'Complete the wallet steps first', buttons: []};
  if (id !== 'approvals' && !s.approvals.done) return {text: 'Move approvals to v2 first', buttons: []};
  if (id === 'target' && (!s.stop.done || !part.stalled)) return {text: 'Waiting for 7 days', buttons: []};
  const sig = s.signatures[id];
  if (s.safe.status !== 'ok' || sig?.status !== 'ok') return {text: 'Refreshing', buttons: []};
  const index = art.owners.findIndex(o => same(o, owner));
  if (index < 0) return {text: 'Connect a Safe owner wallet', buttons: ['connect']};
  if (!sig.approved[index]) return {text: 'Approve this Safe transaction', buttons: ['approve']};
  return sig.approved.every(Boolean) ? {text: 'Both owners approved', buttons: ['execute']} : {text: 'Waiting for the other Safe owner', buttons: []};
}
export function mountFlywheel2({document: doc, hub, io, pollMs = 30000}) {
  const root = doc.getElementById('qfw2-root');
  let art, state, reading = false, busy = false, message = '', stopped = false, focusKey;
  const el = (tag, attrs = {}, ...kids) => { const n = doc.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (v === false || v == null) continue; if (k === 'onclick') n.addEventListener('click', v); else n.setAttribute(k, v); } n.append(...kids.flat().filter(k => k != null)); return n; };
  const button = (text, onclick, disabled = false, key = text) => el('button', {type: 'button', class: 'qtx-mini qas-go', 'data-focus': key, disabled: disabled || busy || reading, onclick}, text);
  const transaction = id => id === 'approvals' ? approvalTransaction(art) : optionalTransaction(art, id);
  const render = () => {
    focusKey = doc.activeElement?.getAttribute?.('data-focus') || focusKey;
    if (!art) { root.replaceChildren(el('p', {role: 'status'}, message || 'Refreshing')); return; }
    const me = hub.snapshot().current?.owner;
    const cards = [['create', '1 · Create QFlywheelLiquidity2'], ['settle', '2 · Settle v1'], ['approvals', '3 · Safe: move approvals to v2'], ['stop', '4a · Stop flywheel buybacks'], ['target', '4b · Switch the flywheel target']].map(([id, title]) => {
      const view = stepAction(art, state, id, me), part = state?.[id];
      const card = el('section', {class: 'qfw2-step', 'aria-labelledby': 'fw2-' + id, 'data-step': id}, el('h2', {id: 'fw2-' + id}, title));
      if (id === 'stop' || id === 'target') card.append(el('p', {class: 'qfw2-label'}, 'Optional · 7-day flywheel switch'));
      if (id === 'create') card.append(el('p', {class: 'qfw2-address'}, art.v2));
      if (id === 'settle') card.append(el('p', {}, 'Any connected wallet can settle the tokens v1 is owed. Do this before moving approvals.'));
      if (id === 'approvals') card.append(el('p', {}, 'One Safe batch removes both v1 approvals and approves v2 for 5 WETH and the QHOOKS amount. Both owners approve, then one executes.'));
      if (id === 'stop') card.append(el('p', {}, 'Set the keeper to the burn address so buybacks stop.'));
      if (id === 'target') card.append(el('p', {}, 'Switch to v2 once the flywheel has gone 7 days without a successful buyback.'));
      card.append(el('p', {class: 'qfw2-state', role: 'status'}, reading ? 'Refreshing' : view.text));
      if (id === 'settle' && part?.status === 'ok') card.append(el('p', {class: 'qfw2-address'}, 'Owed: ' + part.weth + ' wei WETH · ' + part.qhooks + ' wei QHOOKS'));
      if (id === 'approvals' && part?.values) card.append(el('p', {class: 'qfw2-address'}, 'Allowance wei · v1 WETH / QHOOKS: ' + part.values.slice(0, 2).join(' / ') + ' · v2 WETH / QHOOKS: ' + part.values.slice(2).join(' / ')));
      if (id === 'target' && view.text === 'Waiting for 7 days' && part?.remaining != null) card.append(el('p', {}, 'Time remaining: ' + Math.ceil(part.remaining / 3600) + ' hours'));
      if (['approvals', 'stop', 'target'].includes(id)) {
        const sig = state?.signatures[id];
        card.append(el('p', {class: 'qfw2-address'}, 'Safe nonce: ' + (state?.safe.nonce ?? 'Refreshing')),
          el('ul', {class: 'qfw2-approvals'}, ...art.owners.map((o, i) => el('li', {}, o + ' · ' + (sig?.status === 'ok' ? sig.approved[i] ? 'Approved' : 'Not approved' : id === 'approvals' && art.qhooksApproval == null ? 'Waiting on amount' : 'Refreshing')))));
      }
      for (const action of view.buttons) {
        if (action === 'create') card.append(el('a', {class: 'qtx-mini qas-go', href: DEPLOY_HREF}, 'Create QFlywheelLiquidity2'));
        else if (action === 'connect') card.append(button('Connect a Safe owner wallet', () => hub.open()));
        else card.append(button(action === 'feed' ? 'Settle v1' : action === 'approve' ? 'Approve as Safe owner' : 'Execute Safe transaction', () => send(id, action), view.disabled, id + ':' + action));
      }
      return card;
    });
    root.replaceChildren(el('p', {class: 'qfw2-address'}, 'Safe · 2 of 2 · ' + art.safe), ...cards, el('p', {class: 'qas-status', role: 'status', 'aria-live': 'polite'}, message), button('Refresh status', refresh));
    if (!reading && !busy && focusKey) root.querySelector?.('[data-focus="' + focusKey + '"]')?.focus();
  };
  async function refresh() {
    if (reading || stopped || busy) return;
    reading = true; render();
    try { art = await io.fetchJson(MANIFEST); io.begin?.(); state = await readFlywheel2(art, io.rpc); }
    catch { state = null; message = 'Could not read the network. Refresh to try again.'; }
    finally { reading = false; render(); }
  }
  async function send(id, action) {
    if (busy || reading || !state) return;
    let conn = hub.snapshot().current;
    if (!conn) { hub.open(); return; }
    const before = state.signatures[id];
    busy = true; message = 'Preparing your wallet…'; render();
    try {
      const originalOwner = conn.owner;
      if (String(conn.chainId) !== String(art.chainId)) conn = await hub.switchChain(String(art.chainId));
      if (!same(conn?.owner, originalOwner) || String(conn?.chainId) !== String(art.chainId)) throw Error('Your wallet changed. Try again.');
      const freshArt = await io.fetchJson(MANIFEST);
      if (JSON.stringify(freshArt) !== JSON.stringify(art)) throw Error('Setup details changed. Refresh to try again.');
      io.begin?.(); const fresh = await readFlywheel2(art, io.rpc); state = fresh;
      const view = stepAction(art, fresh, id, conn.owner);
      if (!view.buttons.includes(action) || view.disabled) throw Error('This step changed. Review its status and try again.');
      if (id !== 'settle' && (before?.hash !== fresh.signatures[id]?.hash || before?.nonce !== fresh.safe.nonce)) throw Error('The Safe nonce changed. Review the approvals and try again.');
      const tx = {from: conn.owner, to: id === 'settle' ? art.v1 : art.safe, value: '0x0', data: id === 'settle' ? SEL.feed : action === 'approve' ? approveHashData(fresh.signatures[id].hash) : safeExecData(transaction(id), art.owners)};
      io.begin?.(); await io.rpc('eth_call', [tx, 'latest']);
      const gas = BigInt(await io.rpc('eth_estimateGas', [tx])); tx.gas = '0x' + (gas * 13n / 10n).toString(16);
      if (!same(hub.snapshot().current?.owner, conn.owner) || String(hub.snapshot().current?.chainId) !== String(art.chainId)) throw Error('Your wallet changed. Try again.');
      message = 'Confirm in your wallet'; render();
      const hash = await conn.entry.provider.request({method: 'eth_sendTransaction', params: [tx]});
      message = 'Sent. Waiting for the network…'; render();
      let receipt;
      for (let i = 0; i < 90 && !receipt && !stopped; i++) { io.begin?.(); receipt = await io.rpc('eth_getTransactionReceipt', [hash]); if (!receipt) await new Promise(r => setTimeout(r, 2000)); }
      if (!receipt) throw Error('Still pending. Check your wallet activity, then refresh.');
      if (BigInt(receipt.status) !== 1n) throw Error('The transaction did not complete. Check your wallet activity.');
      message = 'Transaction confirmed. Checking the result…';
    } catch (e) { message = /reject|denied|cancel/i.test(e.message) ? 'Cancelled in your wallet' : e.message || 'Could not complete this step'; }
    finally { busy = false; await refresh(); }
  }
  const unsubscribe = hub.subscribe(() => render());
  const ready = refresh();
  const timer = pollMs ? setInterval(() => { if (doc.visibilityState !== 'hidden') refresh(); }, pollMs) : null;
  return {ready, refresh, getState: () => state, dispose() { stopped = true; if (timer) clearInterval(timer); unsubscribe?.(); }};
}
if (typeof document !== 'undefined' && document.getElementById('qfw2-root')) {
  Promise.all([import('./wallet-hub-fresh.mjs'), import('./qx-taps.mjs'), import('./chains.mjs')]).then(([wallet, reads, chains]) => {
    const client = reads.createReadClient();
    const rpc = async (method, params) => {
      if (method !== 'eth_estimateGas') return client.rpc('4663', method, params);
      const response = await client.request(chains.chainById('4663').rpc, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params})});
      if (!response.ok) throw Error('Could not estimate network gas');
      const result = await response.json();
      if (result.error || !/^0x[0-9a-f]+$/i.test(result.result)) throw Error('This transaction would fail right now');
      return result.result;
    };
    mountFlywheel2({document, hub: wallet.getWalletHub(window), io: {...client, rpc}});
  }).catch(() => { document.getElementById('qfw2-root').textContent = 'Could not load setup. Reload to try again.'; });
}
