// Price triggers for signed orders (pro terminal phase D, TP/SL). DOM-free, so tests import it directly.
// Prices are quote per whole token as decimal strings; pools hold sqrt(currency1/currency0) in raw units × 2^96.
const Q192 = 1n << 192n;
export function isqrt(n) { if (n < 2n) return n; let x = 1n << BigInt(Math.ceil(n.toString(2).length / 2)); for (;;) { const y = (x + n / x) >> 1n; if (y >= x) return x; x = y; } }
const parse18 = text => { const s = String(text).trim(); if (!/^\d*(\.\d*)?$/.test(s) || s === '' || s === '.') throw new TypeError('Enter a price'); const [i, f = ''] = s.split('.'); return BigInt(i || '0') * 10n ** 18n + BigInt((f + '0'.repeat(18)).slice(0, 18) || '0'); };
/// sqrtPriceX96 of the pool at token price `price` (quote per token).
export function sqrtPriceAt(price, { tokenIs0, tdec, qdec }) {
  const P = parse18(price); if (P === 0n) throw new TypeError('Enter a price');
  const num = P * 10n ** BigInt(qdec), den = 10n ** 18n * 10n ** BigInt(tdec); // raw quote per raw token
  return tokenIs0 ? isqrt(num * Q192 / den) : isqrt(den * Q192 / num);
}
/// Trigger for a take-profit (token price at or above) or a stop (at or below), as the executor checks it on the pool.
/// When the token is currency1 the pool price moves opposite to the token price, so the direction flips.
export function triggerFor(kind, price, market) {
  const up = kind === 'take_profit';
  return { triggerSqrtPriceX96: sqrtPriceAt(price, market).toString(), triggerBelow: market.tokenIs0 ? !up : up };
}
/// keccak-free PoolId input: abi.encode(PoolKey) as hex (the caller hashes it with keccak-256).
export function poolKeyEncoded(key) {
  const w = v => (typeof v === 'string' ? v.replace(/^0x/, '').toLowerCase() : (BigInt(v) < 0n ? (1n << 256n) + BigInt(v) : BigInt(v)).toString(16)).padStart(64, '0');
  return '0x' + [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks].map(w).join('');
}
/// Token price (quote per whole token, a Number for display) from a pool sqrtPriceX96.
export function priceFromSqrt(sqrtPriceX96, { tokenIs0, tdec, qdec }) {
  const s = Number(BigInt(sqrtPriceX96)) / 2 ** 96, pool = s * s; // raw currency1 per raw currency0
  const raw = tokenIs0 ? pool : 1 / pool; // raw quote per raw token
  return raw * 10 ** (tdec - qdec);
}
