// Creator keys: the wallet and post-quantum key that act for a launch. Both keys together can replace either
// one (rotate). If one is lost, the other alone starts a recovery that completes after 90 days unless the
// remaining key cancels it; any two-key action also cancels it. New post-quantum keys are backed up and the
// backup re-verified before they are used. Reads and writes the launch controller directly.
import { abi, calldata, ethCall, words, toAddress, rpc, send, signTypedData, connectedAddress, onWalletChange, h } from '/qx-chain.mjs';
import { createSigner, restoreSigner } from '/full-launch/packages/multichain-launch/actions/signer.mjs';
import { typedGraduationAction } from '/full-launch/prototypes/pq-graduation/client/graduation-typed-data.mjs';
import { keccak_256 } from '/full-launch/prototypes/qpools/client/vendor/hashes/sha3.js';
import { alertsButton } from '/qx-alerts.mjs';

const SEL = { currentOwner: '0xb387ef92', currentPublicKey: '0xd0deef17', authEpoch: '0xccdee525', nextNonce: '0xd69c3d30', accountId: '0x9cfd7cff',
  pendingOwner: '0xe30c3978', pendingPublicKey: '0xb4de27dd', recoveryEta: '0x1479b3da', recoveryBy: '0xaa19ddc3', MODULE: '0x094d3a34', PROFILE: '0x33329811',
  rotate: '0xfb790f2c', walletRecovery: '0x068c46a5', keyRecovery: '0x17e3ce51', cancel: '0x7e3ab359', finish: '0xc7423803' };
const PROOF_T = '(uint256,uint64,uint64,bytes,bytes)';
const ZERO32 = '0x' + '0'.repeat(64);
const card = document.getElementById('qtk');
let st = null, seq = 0;
const short = a => a.slice(0, 6) + '…' + a.slice(-4);
const hash = hex => '0x' + Array.from(keccak_256(Uint8Array.from(hex.slice(2).match(/../g).map(x => parseInt(x, 16)))), b => b.toString(16).padStart(2, '0')).join('');
const op = (tag, types, values) => hash(abi(['string', ...types], [tag, ...values]));

async function read() {
  const c = st.controller, r = s => ethCall(st.chainId, c, s);
  const [o, k, e, n, id, po, pk, eta, by, m, p] = await Promise.all([SEL.currentOwner, SEL.currentPublicKey, SEL.authEpoch, SEL.nextNonce, SEL.accountId, SEL.pendingOwner, SEL.pendingPublicKey, SEL.recoveryEta, SEL.recoveryBy, SEL.MODULE, SEL.PROFILE].map(r));
  return { owner: toAddress(BigInt(o)), publicKey: k, epoch: BigInt(e), nonce: BigInt(n), accountId: id, pendingOwner: toAddress(BigInt(po)), pendingKey: pk, eta: Number(BigInt(eta)), by: Number(BigInt(by)), module: m, profile: p };
}

/// The signed action every key operation carries (same layout as the launch's other two-key actions).
async function action(kind, operationHash, k) {
  const now = BigInt((await rpc(st.chainId, 'eth_getBlockByNumber', ['latest', false])).timestamp);
  return { schemaVersion: 1n, chainId: BigInt(st.chainId), controller: st.controller, moduleId: k.module, profileId: k.profile, accountId: k.accountId, owner: k.owner,
    publicKey: k.publicKey, actionType: BigInt(kind), authEpoch: k.epoch, policyVersion: 0n, policyHash: ZERO32, operationHash, nonce: k.nonce, validAfter: now - 30n, validUntil: now + 600n };
}
const proofOf = (a, wallet, pq) => [a.nonce, a.validAfter, a.validUntil, wallet || '0x', pq || '0x'];
const noProof = [0n, 0n, 1n, '0x', '0x'];

function download(name, text) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const fileText = input => new Promise((res, rej) => { const f = input.files?.[0]; if (!f) return rej(new TypeError('Choose the backup file')); const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsText(f); });

// Panels for each step. `need` lists what an operation asks for.
function keyInputs(label) {
  const file = h('input', { type: 'file', accept: '.json,application/json', ariaLabel: label + ' backup file' });
  const pass = h('input', { type: 'password', autocomplete: 'off', placeholder: 'Backup passphrase', ariaLabel: label + ' passphrase' });
  return { file, pass, el: h('div', { class: 'qtx-row' }, h('label', {}, h('span', {}, label + ' backup'), file), h('label', {}, h('span', {}, 'Passphrase'), pass)) };
}
/// A new post-quantum key: generated here, saved by the user, then re-verified from the saved file before use.
function newKeyFlow(status) {
  let signer = null;
  const pass = h('input', { type: 'password', autocomplete: 'new-password', placeholder: 'New passphrase (16+ characters)', ariaLabel: 'New key passphrase' });
  const make = h('button', { type: 'button', class: 'qtx-mini' }, 'Create and download new key');
  const file = h('input', { type: 'file', accept: '.json,application/json', ariaLabel: 'Saved new key backup' });
  const check = h('button', { type: 'button', class: 'qtx-mini' }, 'Verify saved backup');
  const note = h('span', { class: 'qtx-state' }, 'Not created');
  make.addEventListener('click', async () => {
    try { signer?.lock(); signer = createSigner(); download('qhooks-launch-key-' + signer.publicKeyHex.slice(2, 10) + '.json', await signer.exportBackup(pass.value)); note.textContent = 'Downloaded. Choose the saved file and verify it.'; }
    catch (e) { status.textContent = e.message; }
  });
  check.addEventListener('click', async () => {
    try { await signer.verifyBackup(await fileText(file), pass.value); note.textContent = 'Verified: ' + short(signer.publicKeyHex); }
    catch (e) { status.textContent = e.message || 'That backup did not verify'; }
  });
  return { el: h('div', { class: 'qtk-new' }, h('div', { class: 'qtx-row' }, h('label', {}, h('span', {}, 'New key passphrase'), pass)), h('div', { class: 'qtx-actions' }, make, file, check, note)),
    key() { if (!signer?.backupVerified) throw new TypeError('Create the new key and verify its saved backup first'); return signer.publicKeyHex; } };
}

// Who must be connected for an action: 'owner' (the launch's current wallet) or 'any'.
const needs = (who, k) => { const me = connectedAddress(); if (!me) throw new Error('Connect a wallet first'); if (who === 'owner' && me !== k.owner) throw new Error('Connect the launch’s current wallet (' + short(k.owner) + ')'); };
async function act(btn, status, fn) {
  btn.disabled = true; status.textContent = '';
  try { await fn(t => { status.textContent = t; }); await render(); card.querySelector('.qtx-status').textContent = 'Done.'; }
  catch (e) { status.textContent = e.message || 'That did not go through'; btn.disabled = false; }
}

async function render() {
  if (!st) return;
  const k = await read(), me = connectedAddress(), now = Number(BigInt((await rpc(st.chainId, 'eth_getBlockByNumber', ['latest', false])).timestamp));
  const status = h('p', { class: 'qtx-status', role: 'status', ariaLive: 'polite' });
  const parts = [h('h2', { id: 'qtk-heading' }, 'Creator keys'),
    h('ul', { class: 'qtb-list' }, h('li', {}, h('b', {}, 'Wallet'), h('span', {}, short(k.owner) + (me === k.owner ? ' (connected)' : ''))),
      h('li', {}, h('b', {}, 'Quantum key'), h('span', {}, short(k.publicKey))), h('li', {}, h('b', {}, 'Key generation'), h('span', {}, String(k.epoch)))),
    h('p', { class: 'qtb-note' }, 'Recovery cuts both ways. Either key alone can start a recovery that takes over both keys after 90 days, so someone who steals your wallet (or one day breaks its key) could try it. The other key can cancel it at any time before then. A pending recovery shows here and on this launch’s Terms card for everyone, so check one of them at least once a month.')];
  if (k.eta) {
    const ready = now >= k.eta;
    parts.push(h('p', { class: 'qtx-alert' }, (k.by === 1 ? 'The wallet' : 'The quantum key') + ' started a recovery to wallet ' + short(k.pendingOwner) + ' and key ' + short(k.pendingKey) + '. ' +
      (ready ? 'It can be completed now.' : 'It completes ' + new Date(k.eta * 1000).toLocaleString() + ' unless ' + (k.by === 1 ? 'the quantum key' : 'the wallet') + ' cancels it.')));
    const fin = h('button', { type: 'button', class: 'workspace-button', disabled: !ready }, 'Complete recovery');
    fin.addEventListener('click', () => act(fin, status, s => (needs('any', k), send(st.chainId, { to: st.controller, data: SEL.finish }, s))));
    parts.push(fin);
    if (k.by === 1) {
      const cur = keyInputs('Current quantum key'), cancel = h('button', { type: 'button', class: 'workspace-button' }, 'Cancel with the quantum key');
      cancel.addEventListener('click', () => act(cancel, status, async s => {
        needs('any', k);
        const signer = await restoreSigner(await fileText(cur.file), cur.pass.value);
        try {
          const a = await action(10, op('QHOOKS/QGRAD/CANCEL-RECOVERY/1', ['address', 'bytes32', 'uint64'], [k.pendingOwner, k.pendingKey, BigInt(k.eta)]), k);
          s('Signing with the quantum key…'); const pq = signer.signKeyAction(a).signatureHex;
          await send(st.chainId, { to: st.controller, data: calldata(SEL.cancel, [PROOF_T], [proofOf(a, null, pq)]) }, s);
        } finally { signer.lock(); }
      }));
      parts.push(cur.el, cancel);
    } else {
      const cancel = h('button', { type: 'button', class: 'workspace-button' }, 'Cancel with the wallet');
      cancel.addEventListener('click', () => act(cancel, status, s => (needs('owner', k), send(st.chainId, { to: st.controller, data: calldata(SEL.cancel, [PROOF_T], [noProof]) }, s))));
      parts.push(cancel);
    }
  } else {
    // Rotate with both keys.
    const rot = h('details', { class: 'qtx-details' }, h('summary', {}, 'Replace keys (both keys sign)'));
    const cur = keyInputs('Current quantum key'), nk = newKeyFlow(status), replaceKey = h('input', { type: 'checkbox', checked: true });
    const wallet = h('input', { type: 'text', value: k.owner, ariaLabel: 'New wallet address', spellcheck: false });
    const go = h('button', { type: 'button', class: 'workspace-button' }, 'Replace keys');
    go.addEventListener('click', () => act(go, status, async s => {
      needs('owner', k);
      const newOwner = wallet.value.trim().toLowerCase(); if (!/^0x[0-9a-f]{40}$/.test(newOwner)) throw new TypeError('Enter the new wallet address');
      const newKey = replaceKey.checked ? nk.key() : k.publicKey;
      const signer = await restoreSigner(await fileText(cur.file), cur.pass.value);
      try {
        if (signer.publicKeyHex !== k.publicKey) throw new TypeError('That backup is not this launch’s current quantum key');
        const a = await action(8, op('QHOOKS/QGRAD/ROTATE/1', ['address', 'bytes32'], [newOwner, newKey]), k);
        s('Approve with your wallet…'); const w = await signTypedData(st.chainId, typedGraduationAction(a));
        s('Signing with the quantum key…'); const pq = signer.signKeyAction(a).signatureHex;
        await send(st.chainId, { to: st.controller, data: calldata(SEL.rotate, ['address', 'bytes32', PROOF_T], [newOwner, newKey, proofOf(a, w, pq)]) }, s);
      } finally { signer.lock(); }
    }));
    rot.append(h('p', { class: 'qtb-note' }, 'Your current wallet and quantum key approve together. The new keys act from the next block; old signatures stop working.'),
      cur.el, h('div', { class: 'qtx-row' }, h('label', {}, h('span', {}, 'New wallet (or keep this one)'), wallet)),
      h('label', { class: 'qts-auto' }, replaceKey, h('span', {}, 'Also replace the quantum key')), nk.el, go);
    // Lost quantum key: the wallet starts recovery.
    const lostKey = h('details', { class: 'qtx-details' }, h('summary', {}, 'I lost the quantum key'));
    const nk2 = newKeyFlow(status), go2 = h('button', { type: 'button', class: 'workspace-button' }, 'Start 90-day recovery');
    go2.addEventListener('click', () => act(go2, status, async s => {
      needs('owner', k);
      const newKey = nk2.key();
      await send(st.chainId, { to: st.controller, data: calldata(SEL.walletRecovery, ['address', 'bytes32'], [k.owner, newKey]) }, s);
    }));
    lostKey.append(h('p', { class: 'qtb-note' }, 'Your wallet starts a recovery to a new quantum key. Anyone can complete it after 90 days; the old quantum key can cancel it until then.'), nk2.el, go2);
    // Lost wallet: the quantum key starts recovery.
    const lostWallet = h('details', { class: 'qtx-details' }, h('summary', {}, 'I lost the wallet'));
    const cur3 = keyInputs('Quantum key'), wallet3 = h('input', { type: 'text', placeholder: '0x… new wallet', ariaLabel: 'Recovery wallet address', spellcheck: false });
    const go3 = h('button', { type: 'button', class: 'workspace-button' }, 'Start 90-day recovery');
    go3.addEventListener('click', () => act(go3, status, async s => {
      needs('any', k);
      const newOwner = wallet3.value.trim().toLowerCase(); if (!/^0x[0-9a-f]{40}$/.test(newOwner)) throw new TypeError('Enter the new wallet address');
      const signer = await restoreSigner(await fileText(cur3.file), cur3.pass.value);
      try {
        if (signer.publicKeyHex !== k.publicKey) throw new TypeError('That backup is not this launch’s current quantum key');
        const a = await action(9, op('QHOOKS/QGRAD/RECOVER/1', ['address', 'bytes32'], [newOwner, k.publicKey]), k);
        s('Signing with the quantum key…'); const pq = signer.signKeyAction(a).signatureHex;
        await send(st.chainId, { to: st.controller, data: calldata(SEL.keyRecovery, ['address', 'bytes32', PROOF_T], [newOwner, k.publicKey, proofOf(a, null, pq)]) }, s);
      } finally { signer.lock(); }
    }));
    lostWallet.append(h('p', { class: 'qtb-note' }, 'Your quantum key moves control to a new wallet. Any connected wallet can submit it; it completes after 90 days unless the old wallet cancels it.'),
      cur3.el, h('div', { class: 'qtx-row' }, h('label', {}, h('span', {}, 'New wallet'), wallet3)), go3);
    parts.push(rot, lostKey, lostWallet);
  }
  if (!me) parts.push(h('p', { class: 'qtb-note' }, 'Connect a wallet to use these.'));
  card.replaceChildren(...parts, alertsButton(st), status);
  card.hidden = false;
}

async function show(pool) {
  const mine = ++seq;
  if (!card || !pool?.controller || !Object.hasOwn(pool.constructor || {}, 'blocks')) { if (card) card.hidden = true; return; }
  st = { chainId: pool.chainId, controller: pool.controller };
  // Older controllers have fixed keys and no rotation: they answer nothing here.
  try { await ethCall(st.chainId, st.controller, SEL.authEpoch); if (mine === seq) await render(); }
  catch { if (mine === seq) card.hidden = true; }
}

document.addEventListener('qhooks:pool', e => show(e.detail));
if (window.__qhooksPool) show(window.__qhooksPool);
onWalletChange(() => { if (st && !card.contains(document.activeElement)) render().catch(() => {}); });
