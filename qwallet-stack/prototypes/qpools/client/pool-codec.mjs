export function encodePoolAction(a) {
  if (a === null || typeof a !== 'object' || Array.isArray(a) || ![null, Object.prototype].includes(Object.getPrototypeOf(a))) {
    throw new TypeError('Plain object or null-prototype object required');
  }
  const keys = Reflect.ownKeys(a);
  if (keys.length !== 15) throw new TypeError('Exactly 15 own keys required');
  const known = new Set(['schemaVersion','chainId','pool','moduleId','actionType','accountId','owner','publicKey','policyHash','nonce','asset','amount','recipient','validAfter','validUntil']);
  for (const k of keys) {
    if (typeof k !== 'string' || !known.has(k)) throw new TypeError('Unknown field');
  }
  const desc = Object.getOwnPropertyDescriptors(a);
  for (const k of keys) {
    if (!Object.hasOwn(desc[k], 'value')) {
      throw new TypeError('Accessors not allowed');
    }
  }
  // Snapshot only validated data descriptors; never read user accessors.
  a = Object.fromEntries(keys.map(k => [k, desc[k].value]));
  const nums = ['schemaVersion','chainId','actionType','nonce','amount','validAfter','validUntil'];
  for (const k of nums) {
    const v = a[k];
    if (typeof v !== 'bigint' || v < 0n || v >= 2n ** 256n) throw new TypeError(k + ' must be BigInt 0..2^256-1');
  }
  if (a.validAfter >= 2n ** 64n) throw new TypeError('validAfter must be < 2^64');
  if (a.validUntil >= 2n ** 64n) throw new TypeError('validUntil must be < 2^64');
  const addrs = ['pool','owner','asset','recipient'];
  for (const k of addrs) {
    const v = a[k];
    if (typeof v !== 'string' || !/^0x[0-9a-f]{40}$/.test(v)) throw new TypeError(k + ' must be 0x40 hex lowercase');
  }
  const bytes32 = ['moduleId','accountId','publicKey','policyHash'];
  for (const k of bytes32) {
    const v = a[k];
    if (typeof v !== 'string' || !/^0x[0-9a-f]{64}$/.test(v)) throw new TypeError(k + ' must be 0x64 hex lowercase');
  }
  const words = [
    a.schemaVersion, a.chainId, a.pool, a.moduleId, a.actionType, a.accountId,
    a.owner, a.publicKey, a.policyHash, a.nonce, a.asset, a.amount, a.recipient,
    a.validAfter, a.validUntil
  ].map(v => typeof v === 'bigint' ? v : BigInt('0x' + v.slice(2)));
  const buf = new Uint8Array(480);
  let off = 0;
  for (const w of words) {
    const word = w.toString(16).padStart(64, '0');
    for (let i = 0; i < 32; i++) buf[off + i] = parseInt(word.slice(i * 2, i * 2 + 2), 16);
    off += 32;
  }
  return buf;
}
