// One queued QHooks Safe transaction, executed from the site (lead brief 2026-11-08: Randall could not execute it
// from Kraken Wallet in the Safe app, "not enough funds", which was false). Pinned to exactly one transaction:
// QFlywheel.setBatch(2e15, 2e16, 1e23, 0x0) → holder cashback minimum 100,000 QHOOKS, Safe nonce 1.
// Qhooks 1 connects and calls execTransaction itself: its own signature is the approved-by-sender form
// (r = owner, s = 0, v = 1), Qhooks2's ECDSA signature comes from the Safe transaction service.
// Every check must pass before the button enables; it simulates first and sends with an explicit gas limit and fees,
// so the wallet never estimates.
import {getWalletHub} from '/wallet-hub.mjs';
import {chainById} from '/chains.mjs';
const CHAIN = '4663', HEX_CHAIN = '0x1237';
const SAFE = '0x2b1cf7c4071a98a59709166dfa73c7acb7e83e71', FLYWHEEL = '0xb85e67cf7728572033a9d36aee3218dadf85baa2';
const SAFE_TX_HASH = '0xa28bace3ac6a32d6f89594cc8bf4d728fbc177316a54c338bd0ad0980f9913ff', NONCE = 1n;
const DATA = '0x1056359900000000000000000000000000000000000000000000000000071afd498d000000000000000000000000000000000000000000000000000000470de4df82000000000000000000000000000000000000000000000000152d02c7e14af68000000000000000000000000000000000000000000000000000000000000000000000';
const QHOOKS1 = '0x88db60586866294409e47bbbb0b436104f09c1b5', QHOOKS2 = '0x9b13398df547c18e68d1cfe086ff1cb5f1a84127';
const SERVICE = 'https://api.safe.global/tx-service/robinhood/api/v1/multisig-transactions/' + SAFE_TX_HASH + '/';
const SEL = {nonce: '0xaffed0e0', threshold: '0xe75235b8', isOwner: '0x2f54bf6e', getTxHash: '0xd8d11f78', exec: '0x6a761202', holderMin: '0x9e7cd7fe'};
const EXPLORER = 'https://robinhoodchain.blockscout.com';
const ZERO = '0x0000000000000000000000000000000000000000';
const $ = id => document.getElementById(id);
const hub = getWalletHub(window), line = $('qt-connection');
hub.subscribe(s => { const a = s.current?.owner?.toLowerCase() || ''; const t = a ? 'EVM · ' + a : ''; if (line.textContent !== t) line.textContent = t; check().catch(() => {}); });

const w32 = v => BigInt(v).toString(16).padStart(64, '0'), aw = a => a.slice(2).toLowerCase().padStart(64, '0');
async function rpc(method, params) {
  const r = await fetch(chainById(CHAIN).rpc, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params})});
  const j = await r.json(); if (j.error) { const e = Error(j.error.message || 'RPC error'); e.data = j.error.data; throw e; } return j.result;
}
const call = (to, data, from) => rpc('eth_call', [{to, data, ...(from ? {from} : {})}, 'latest']);
const dataBytes = DATA.slice(2), dataPad = dataBytes.padEnd(Math.ceil(dataBytes.length / 64) * 64, '0');
// getTransactionHash(to, value, data, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, nonce)
const hashCall = SEL.getTxHash + aw(FLYWHEEL) + w32(0) + w32(10 * 32) + w32(0) + w32(0) + w32(0) + w32(0) + aw(ZERO) + aw(ZERO) + w32(NONCE) + w32(dataBytes.length / 2) + dataPad;
// Signatures sorted by owner address: Qhooks 1 (approved by msg.sender) then Qhooks2 (ECDSA from the service).
function execCall(sig2) {
  const sigs = aw(QHOOKS1) + w32(0) + '01' + sig2.slice(2).toLowerCase(), sigLen = sigs.length / 2, sigPad = sigs.padEnd(Math.ceil(sigs.length / 64) * 64, '0');
  const dataWords = dataPad.length / 64;
  return SEL.exec + aw(FLYWHEEL) + w32(0) + w32(10 * 32) + w32(0) + w32(0) + w32(0) + w32(0) + aw(ZERO) + aw(ZERO) + w32(10 * 32 + 32 + dataWords * 32)
    + w32(dataBytes.length / 2) + dataPad + w32(sigLen) + sigPad;
}
function row(id, state, text) { const li = $(id); li.dataset.state = state; li.querySelector('span').textContent = text; }
const tokens = hex => (BigInt(hex) / 10n ** 18n).toLocaleString('en-US');
let ready = null, busy = false, done = false, svcCache = null; // the signed service data never changes once read

export async function check() {
  ready = null;
  // 1. The transaction the owners signed, from the Safe transaction service, must be exactly this one.
  let sig2 = null, svcOk = false;
  try {
    const t = svcCache || await (await fetch(SERVICE, {cache: 'no-store'})).json();
    svcOk = t.safeTxHash?.toLowerCase() === SAFE_TX_HASH && t.safe?.toLowerCase() === SAFE && t.to?.toLowerCase() === FLYWHEEL && String(t.value) === '0' && Number(t.operation) === 0
      && t.data?.toLowerCase() === DATA && [t.safeTxGas, t.baseGas, t.gasPrice].every(v => String(v) === '0') && [t.gasToken, t.refundReceiver].every(a => (a || ZERO).toLowerCase() === ZERO) && BigInt(t.nonce) === NONCE;
    const c = (t.confirmations || []).find(x => x.owner?.toLowerCase() === QHOOKS2);
    if (c && /^0x[0-9a-f]{130}$/i.test(c.signature || '') && Number(BigInt('0x' + c.signature.slice(-2))) >= 27) sig2 = c.signature.toLowerCase();
    if (t.isExecuted) done = true;
    if (svcOk && sig2) svcCache = t;
  } catch {}
  row('se-tx', svcOk && sig2 ? 'ok' : 'bad', svcOk && sig2 ? 'Found the queued transaction with Qhooks2’s signature.' : 'Could not read the queued transaction or Qhooks2’s signature from the Safe service. Refresh to try again.');
  // 2. The Safe still expects it: same hash, nonce 1, both owners, threshold 2.
  const [hash, nonce, threshold, o1, o2, minNow] = await Promise.all([call(SAFE, hashCall), call(SAFE, SEL.nonce), call(SAFE, SEL.threshold), call(SAFE, SEL.isOwner + aw(QHOOKS1)), call(SAFE, SEL.isOwner + aw(QHOOKS2)), call(FLYWHEEL, SEL.holderMin)]);
  const safeOk = hash.toLowerCase() === SAFE_TX_HASH && BigInt(nonce) === NONCE && BigInt(threshold) === 2n && BigInt(o1) === 1n && BigInt(o2) === 1n;
  if (BigInt(nonce) > NONCE) done = true;
  row('se-safe', done ? 'ok' : safeOk ? 'ok' : 'bad', done ? 'Already executed. The Safe has moved past this transaction.' : safeOk ? 'The Safe still expects this transaction (nonce 1, 2 of 2 owners).' : 'The Safe no longer matches this transaction. Nothing to send; tell the team.');
  row('se-change', 'ok', 'Holder cashback minimum: ' + tokens(minNow) + ' QHOOKS now → 100,000 QHOOKS after.');
  // 3. Qhooks 1 connected.
  const conn = hub.snapshot().current, me = conn?.owner?.toLowerCase() || '';
  row('se-wallet', me === QHOOKS1 ? 'ok' : me ? 'bad' : 'todo', me === QHOOKS1 ? 'Qhooks 1 connected (' + me.slice(0, 6) + '…' + me.slice(-4) + ').' : me ? 'Connected ' + me.slice(0, 6) + '…' + me.slice(-4) + '. Connect Qhooks 1 (0x88Db…c1B5) instead.' : 'Connect Qhooks 1 (0x88Db…c1B5).');
  // 4. Simulation from Qhooks 1.
  let sim = false, simText = 'Runs once the checks above pass.';
  if (!done && svcOk && sig2 && safeOk) {
    try { const r = await call(SAFE, execCall(sig2), QHOOKS1); sim = BigInt(r) === 1n; simText = sim ? 'Simulated from Qhooks 1: it succeeds.' : 'Simulation returned false. Nothing to send; tell the team.'; }
    catch (e) { simText = 'Simulation failed (' + String(e.message || e).slice(0, 120) + '). Nothing to send; tell the team.'; }
  }
  row('se-sim', sim ? 'ok' : done ? 'ok' : (svcOk && sig2 && safeOk) ? 'bad' : 'todo', done ? 'Nothing left to run.' : simText);
  if (sim) ready = {data: execCall(sig2)};
  $('se-go').disabled = busy || !ready || me !== QHOOKS1;
  $('se-go').hidden = done; $('se-done').hidden = !done; $('se-connect').hidden = me === QHOOKS1 || done;
  return {svcOk, sig2: !!sig2, safeOk, sim, me, done};
}

async function run() {
  if (busy || !ready) return; busy = true; $('se-go').disabled = true;
  const say = t => { $('se-status').textContent = t; };
  try {
    let conn = hub.snapshot().current;
    if (!conn || conn.owner.toLowerCase() !== QHOOKS1) throw Error('Connect Qhooks 1 first.');
    if (String(conn.chainId) !== CHAIN) { say('Switching your wallet to Robinhood Chain…'); conn = await hub.switchChain(CHAIN); }
    const req = (method, params) => conn.entry.provider.request({method, params});
    let pre = await check(); if (!pre.sim) { await new Promise(r => setTimeout(r, 1500)); pre = await check(); }
    if (!pre.sim) throw Error('A check no longer passes. Nothing was sent.');
    // Explicit gas: a fresh estimate from Qhooks 1 plus 30%, and fees read from the chain.
    say('Preparing…');
    const [est, block, tipHex] = await Promise.all([rpc('eth_estimateGas', [{from: QHOOKS1, to: SAFE, data: ready.data, value: '0x0'}]), rpc('eth_getBlockByNumber', ['latest', false]), rpc('eth_maxPriorityFeePerGas', []).catch(() => '0x0')]);
    const gas = BigInt(est) * 13n / 10n, tip = BigInt(tipHex || 0), base = BigInt(block.baseFeePerGas || 0);
    const tx = {from: QHOOKS1, to: SAFE, data: ready.data, value: '0x0', gas: '0x' + gas.toString(16), maxPriorityFeePerGas: '0x' + tip.toString(16), maxFeePerGas: '0x' + (base * 2n + tip).toString(16)};
    say('Confirm in your wallet: about ' + Number(gas).toLocaleString('en-US') + ' gas, well under 0.0001 ETH.');
    let hash;
    try { hash = await req('eth_sendTransaction', [tx]); }
    catch (e) {
      if (e?.code === 4001 || /reject|denied|cancel/i.test(e?.message || '')) throw e;
      // Some wallets refuse EIP-1559 fields on a custom chain: same transaction with a legacy gas price.
      const gp = await rpc('eth_gasPrice', []);
      hash = await req('eth_sendTransaction', [{from: QHOOKS1, to: SAFE, data: ready.data, value: '0x0', gas: tx.gas, gasPrice: '0x' + (BigInt(gp) * 2n).toString(16)}]);
    }
    $('se-tx-link').href = EXPLORER + '/tx/' + hash; $('se-tx-wrap').hidden = false;
    say('Sent. Waiting for Robinhood Chain…');
    for (let i = 0; i < 90; i++) {
      const r = await rpc('eth_getTransactionReceipt', [hash]).catch(() => null);
      if (r) { if (r.status !== '0x1') throw Error('The transaction reverted. Nothing changed.'); break; }
      await new Promise(res => setTimeout(res, 2000));
    }
    const min = await call(FLYWHEEL, SEL.holderMin);
    done = true; say(BigInt(min) === 10n ** 23n ? 'Done. Holder cashback minimum is now 100,000 QHOOKS.' : 'Sent. The new minimum will show once the chain confirms.');
  } catch (e) { say(e?.code === 4001 || /reject|denied|cancel/i.test(e?.message || '') ? 'Cancelled in your wallet. Nothing was sent.' : (e?.message || 'Did not go through.')); }
  finally { busy = false; check().catch(() => {}); }
}
$('se-go').addEventListener('click', run);
$('se-connect')?.addEventListener('click', () => hub.open());
check().catch(() => { $('se-status').textContent = 'Could not read Robinhood Chain right now. Refresh to try again.'; });
