// QStakeLock -> QFeeRouterV2 lock list (2026-11-26, FR2SWITCH). The Robinhood fee router v2 counts QHOOKS held in QStakeLock
// timed locks toward the 100K holder bonus, but QStakeLock has no per-owner index, so v2 keeps a list of lock ids per owner:
// anyone may call v2.noteLocks(ids) and each live id is listed under its own lock's owner (listed / withdrawn / unknown ids
// are skipped, never a revert). So no lock is ever missed:
//  - a wallet with EIP-5792 atomic batches gets noteLocks([nextId]) appended to its lock batch (nextId read right before
//    sending; if another lock lands first that id is listed for its real owner, harmless, and the keeper lists ours);
//  - any other wallet sends its lock exactly as before (no extra prompt) and the page then POSTs the new id from the
//    receipt's Locked event to /api/stakelock/note, where the keeper lists it (server/stakelock-notes.mjs);
//  - the keeper's quarter-hour backstop reads new Locked logs and lists whatever is still missing.
// Inert until v2 has code (eth_getCode once, cached). Pure helpers; the server imports the same encoder and constants.
export const NOTE = Object.freeze({
  chainId: '4663',
  router: '0x352a4a1d927ed21bddf5e22b1eed728714438bcd',   // QFeeRouterV2 (public/chains.mjs 4663 extras.feeRouter)
  lock: '0x807390f11e52e8508636bac3c54b47b17a66dae3',     // QStakeLock (public/full-launch/stake-lock-v1.json "lock")
  lockedTopic: '0xd15b6fc8773f8d5df574ed800605aaf51e9c5114414c9155c7cddae43d318425',   // Locked(uint256 indexed id, address indexed owner, uint256, uint8, uint64)
  sel: Object.freeze({noteLocks: '0x27fe4197', stakeLocksOf: '0xe3762cde', nextId: '0x61b8ce8c', locks: '0xf4dadc61'}),
  endpoint: '/api/stakelock/note',
  maxIds: 32
});
const pad = v => BigInt(v).toString(16).padStart(64, '0');
const ID_MAX = 1n << 64n;
export function lockId(v) {
  let b; try { b = typeof v === 'bigint' ? v : typeof v === 'number' ? (Number.isSafeInteger(v) ? BigInt(v) : null) : /^(0x[0-9a-f]{1,64}|[0-9]{1,20})$/i.test(String(v)) ? BigInt(v) : null; } catch { b = null; }
  return b !== null && b > 0n && b < ID_MAX ? b : null;
}
/// noteLocks(uint256[] ids) calldata.
export function encodeNoteLocks(ids) {
  if (!Array.isArray(ids) || !ids.length || ids.length > NOTE.maxIds) throw Error('note_ids');
  return NOTE.sel.noteLocks + pad(32) + pad(ids.length) + ids.map(v => { const b = lockId(v); if (b === null) throw Error('note_id'); return pad(b); }).join('');
}
/// stakeLocksOf(owner) calldata and its uint256[] answer.
export const encodeStakeLocksOf = owner => NOTE.sel.stakeLocksOf + String(owner).toLowerCase().replace(/^0x/, '').padStart(64, '0');
export const encodeLocks = id => NOTE.sel.locks + pad(id);
export function decodeUintArray(hex) {
  const h = String(hex || '').replace(/^0x/, ''), w = i => BigInt('0x' + (h.slice(i * 64, i * 64 + 64) || '0'));
  if (h.length < 128) throw Error('uint_array');
  const at = Number(w(0)) / 32, n = Number(w(at));
  if (!Number.isInteger(at) || n > 1024 || h.length < (at + 1 + n) * 64) throw Error('uint_array');
  return Array.from({length: n}, (_, i) => w(at + 1 + i));
}
/// locks(id) answer: owner = word 0, amount = word 5.
export function decodeLock(hex) {
  const h = String(hex || '').replace(/^0x/, '');
  if (h.length < 6 * 64) throw Error('lock_row');
  return {owner: '0x' + h.slice(24, 64).toLowerCase(), amount: BigInt('0x' + h.slice(5 * 64, 6 * 64))};
}
/// Lock ids from Locked events in receipt logs (optionally only those owned by `owner`).
export function lockedIdsFromLogs(logs, owner = null) {
  const me = owner ? String(owner).toLowerCase().replace(/^0x/, '').padStart(64, '0') : null, out = [];
  for (const l of Array.isArray(logs) ? logs : []) {
    if (String(l?.address || '').toLowerCase() !== NOTE.lock || String(l?.topics?.[0] || '').toLowerCase() !== NOTE.lockedTopic || l.topics.length < 3) continue;
    if (me && String(l.topics[2]).toLowerCase().replace(/^0x/, '') !== me) continue;
    const id = lockId(l.topics[1]); if (id !== null && !out.includes(id)) out.push(id);
  }
  return out;
}
/// The atomic batch with noteLocks([predictedId]) appended after the caller's calls.
export const withNoteCall = (calls, predictedId) => [...calls, {to: NOTE.router, data: encodeNoteLocks([predictedId]), value: 0}];

// ---- page side (dependencies injected so tests and the page share one path) ----
let liveMemo = null;   // {ok, at, p}
/// True once QFeeRouterV2 has code on Robinhood Chain. One eth_getCode, cached for the page; a "no code" answer is
/// re-checked after 10 minutes (v2 is deployed by Randall; until then everything here stays inert).
export function routerLive(codeAt, now = Date.now()) {
  if (liveMemo?.ok === true) return Promise.resolve(true);
  if (liveMemo && (liveMemo.p || now - liveMemo.at < 600000)) return liveMemo.p || Promise.resolve(false);
  const memo = liveMemo = {ok: false, at: now, p: null};
  memo.p = Promise.resolve().then(() => codeAt(NOTE.chainId, NOTE.router)).then(c => /^0x[0-9a-f]{2,}$/i.test(String(c || '')), () => false)
    .then(ok => { memo.ok = ok; memo.p = null; return ok; });
  return memo.p;
}
export const _resetRouterLive = () => { liveMemo = null; };
/// Asks the keeper to list `id` (fire and forget; the quarter-hour backstop covers any miss).
export function postLockNote(id, fetchImpl = (...a) => globalThis.fetch(...a)) {
  const b = lockId(id); if (b === null) return Promise.resolve(null);
  return Promise.resolve().then(() => fetchImpl(NOTE.endpoint, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({id: b.toString()}), keepalive: true}))
    .then(r => r?.json?.().catch(() => null) ?? null, () => null);
}
/// After a lock landed: POST every Locked id in `receipts` owned by `owner` that the batch did not already note.
export async function reportLockReceipts(receipts, {owner = null, predicted = null, codeAt, fetchImpl} = {}) {
  try {
    if (!(await routerLive(codeAt))) return [];
    const list = (Array.isArray(receipts) ? receipts : [receipts]).flatMap(r => r?.logs || []);
    const ids = lockedIdsFromLogs(list, owner).filter(id => predicted === null || id !== BigInt(predicted));
    await Promise.all(ids.map(id => postLockNote(id, fetchImpl)));
    return ids;
  } catch { return []; }
}
/// EIP-5792 path: when v2 is live, reads nextId() right before sending and appends noteLocks([nextId]) to the same atomic
/// batch. Returns the batch receipts, or null (nothing sent) when the wallet has no atomic batches.
export async function sendCallsWithNote({chainId, calls, onStatus, sendCallsAtomic, ethCall, codeAt, owner = null, fetchImpl}) {
  let predicted = null;
  if (await routerLive(codeAt)) { try { predicted = lockId(await ethCall(chainId, NOTE.lock, NOTE.sel.nextId)); } catch {} }
  const receipts = await sendCallsAtomic(chainId, predicted === null ? calls : withNoteCall(calls, predicted), onStatus);
  if (receipts) reportLockReceipts(receipts, {owner, predicted, codeAt, fetchImpl}).catch(() => {});
  return receipts;
}
