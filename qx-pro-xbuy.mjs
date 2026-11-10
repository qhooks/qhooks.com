// QXReceiver.buyFor calldata (pro terminal X2). DOM-free so tests and the page share it.
export const RECEIVER = '0x069208a19ba73842af023cbba043dbf7a06d2ef6';
export const BUY_FOR = '0x9672fb99';
const w = v => (typeof v === 'string' && v.startsWith('0x') ? v.slice(2).toLowerCase() : (BigInt(v) < 0n ? (1n << 256n) + BigInt(v) : BigInt(v)).toString(16)).padStart(64, '0');
const dyn = hex => { const b = String(hex || '0x').replace(/^0x/, ''); return w(BigInt(b.length / 2)) + b.padEnd(Math.ceil(b.length / 64) * 64, '0'); };
/// buyFor(address user, Hop[] hops, address wrapNative, uint256 minOut, address referrer, uint256 deadline)
export function encodeBuyFor({ user, hops, wrapNative, minOut, referrer, deadline }) {
  const enc = hops.map(h => [w(h.key.currency0), w(h.key.currency1), w(h.key.fee), w(h.key.tickSpacing), w(h.key.hooks), w(h.zeroForOne ? 1n : 0n), w(7n * 32n), dyn(h.hookData)].join(''));
  let off = BigInt(hops.length * 32); const offs = enc.map(e => { const o = off; off += BigInt(e.length / 2); return w(o); });
  return BUY_FOR + [w(user), w(6n * 32n), w(wrapNative || '0x' + '0'.repeat(40)), w(minOut), w(referrer || '0x' + '0'.repeat(40)), w(deadline)].join('') + w(BigInt(hops.length)) + offs.join('') + enc.join('');
}
