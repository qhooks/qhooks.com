const Q = 2n ** 96n;
export function integerSqrt(n) {
  if (typeof n !== 'bigint' || n < 0n || n > (2n ** 448n - 1n)) {
    throw new TypeError('integerSqrt n must bigint 0..(2^448-1)');
  }
  if (n === 0n) return 0n;
  if (n === 1n) return 1n;
  let x = n;
  let y = (x + 1n) >> 1n;
  while (y < x) {
    x = y;
    y = (x + n / x) >> 1n;
  }
  return x;
}
export function fullRangeLiquidity(amount0, amount1, lower, upper) {
  if (typeof amount0 !== 'bigint' || typeof amount1 !== 'bigint' ||
      typeof lower !== 'bigint' || typeof upper !== 'bigint') {
    throw new TypeError('All arguments must be BigInt');
  }
  if (amount0 < 1n || amount0 > (2n ** 256n - 1n) ||
      amount1 < 1n || amount1 > (2n ** 256n - 1n) ||
      lower < 1n || lower > (2n ** 160n - 1n) ||
      upper < 1n || upper > (2n ** 160n - 1n) || lower >= upper) {
    throw new TypeError('Invalid range or amount');
  }
  const P = integerSqrt((amount1 * Q * Q) / amount0);
  if (!(lower < P && P < upper)) throw new TypeError('P must be within (lower, upper)');
  const L0 = (amount0 * P * upper) / (Q * (upper - P));
  const L1 = (amount1 * Q) / (P - lower);
  let L = L0 < L1 ? L0 : L1;
  if (L > (2n ** 127n - 1n)) L = 2n ** 127n - 1n;
  if (L <= 0n) throw new TypeError('L must be positive');
  const ceil = (a, b) => (a + b - 1n) / b;
  const used0 = ceil(L * Q * (upper - P), upper * P);
  const used1 = ceil(L * (P - lower), Q);
  if (used0 <= 0n || used1 <= 0n || used0 > amount0 || used1 > amount1) throw new TypeError('Insufficient amounts');
  return Object.freeze({sqrtPriceX96:P,liquidity:L,amount0:used0,amount1:used1,unused0:amount0-used0,unused1:amount1-used1});
}
