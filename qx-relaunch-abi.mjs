// Minimal ABI encoder for QRelaunch calls (static words, bytes, string, nested tuples incl. dynamic ones), plus the
// function selectors the relaunch page uses. Values: addresses/bytes32/bytes as 0x hex, numbers as bigint/decimal strings,
// bool as boolean, tuples as arrays in field order.
const W = n => BigInt.asUintN(256, BigInt(n)).toString(16).padStart(64, '0');
const isDyn = t => t === 'bytes' || t === 'string' || (Array.isArray(t) && t.some(isDyn));
function encWord(t, v) {
  if (t === 'address') { if (!/^0x[0-9a-fA-F]{40}$/.test(v)) throw TypeError('bad address ' + v); return v.slice(2).toLowerCase().padStart(64, '0'); }
  if (t === 'bool') return W(v ? 1 : 0);
  if (t === 'bytes32') { if (!/^0x[0-9a-fA-F]{64}$/.test(v)) throw TypeError('bad bytes32'); return v.slice(2).toLowerCase(); }
  if (/^int\d+$/.test(t)) return W(BigInt(v));
  if (/^uint\d+$/.test(t)) { const b = BigInt(v); if (b < 0n) throw TypeError('negative uint'); return W(b); }
  throw TypeError('type ' + t);
}
function encDyn(t, v) {
  let hex;
  if (t === 'string') hex = Array.from(new TextEncoder().encode(v), b => b.toString(16).padStart(2, '0')).join('');
  else { if (!/^0x([0-9a-fA-F]{2})*$/.test(v)) throw TypeError('bad bytes'); hex = v.slice(2).toLowerCase(); }
  return W(hex.length / 2) + hex.padEnd(Math.ceil(hex.length / 64) * 64, '0');
}
// Size in the head: one word for a dynamic value, the full inline size for a static one (static tuples sit inline).
const headSize = t => isDyn(t) ? 32 : Array.isArray(t) ? t.reduce((n, x) => n + headSize(x), 0) : 32;
export function encodeTuple(types, values) {
  const head = [], tail = [];
  let off = types.reduce((n, t) => n + headSize(t), 0);
  types.forEach((t, i) => {
    const v = values[i];
    if (isDyn(t)) {
      const body = Array.isArray(t) ? encodeTuple(t, v) : encDyn(t, v);
      head.push(W(off)); tail.push(body); off += body.length / 2;
    } else head.push(Array.isArray(t) ? encodeTuple(t, v) : encWord(t, v));
  });
  return head.join('') + tail.join('');
}
export const SEL = {
  relaunch: '0xbdc7c30f', migratorOf: '0x23ba4147', isTeam: '0x49458a13', relaunchDigest: '0xbdd36741', circulating: '0x2e3fa612',
  newToken: '0xc42bd05a', oldToken: '0xb31c710a', creator: '0x02d05d3f', cap: '0x355274ea', capNew: '0xa9726972', allocation: '0x88a17bde',
  migrated: '0x2c678c64', end: '0xefbe1c1c', finished: '0xbef4876b', quote: '0xed1bd76c', migrate: '0x454b0608', finish: '0xd56b2889',
  originOf: '0xa6c519cb', name: '0x06fdde03', symbol: '0x95d89b41', decimals: '0x313ce567', totalSupply: '0x18160ddd', balanceOf: '0x70a08231',
  allowance: '0xdd62ed3e', approve: '0x095ea7b3', owner: '0x8da5cb5b', getOwner: '0x893d20e8', chain: '0xc763e5a1',
};
export const RELAUNCHED_TOPIC = '0xbae5f29150b42fe49a149e8c3b512beaf9eec8a24246d59904e725dbfa7cea2d';

export const PROOF = [ 'uint8', 'uint256', ['address', 'address', 'uint24', 'int24', 'address'] ];
export const AUTH = [ 'address', 'uint256', 'bytes' ];
export const LAUNCH = [ 'string', 'string', 'string', 'uint8', 'uint24', 'bytes32', 'uint32' ];
export function relaunchCalldata(selector, oldToken, proof, auth, launch, windowDays) {
  return selector + encodeTuple(['address', PROOF, AUTH, LAUNCH, 'uint16'], [oldToken, proof, auth, launch, windowDays]);
}
