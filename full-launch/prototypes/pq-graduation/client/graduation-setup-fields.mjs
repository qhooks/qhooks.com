export function normalizeGraduationSetupFields(input) {
  const fields = ['tokenName', 'symbol', 'decimals', 'totalSupply', 'quoteSupply', 'notice'];
  if (input === null || typeof input !== 'object' || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null) {
    throw new TypeError('Input must be a plain data object');
  }
  const d = Object.getOwnPropertyDescriptors(input);
  const keys = Reflect.ownKeys(d);
  if (keys.length !== 6 || !keys.every(k => fields.includes(k))) {
    throw new TypeError('Input must have exactly the six required fields');
  }
  const result = {};
  for (const k of fields) {
    const desc = d[k];
    if (!desc.enumerable || !Object.hasOwn(desc, 'value') || typeof desc.value !== 'string') {
      throw new TypeError('Field descriptors must be enumerable data strings');
    }
    result[k] = desc.value;
  }
  result.tokenName = result.tokenName.trim();
  if (!result.tokenName.isWellFormed() || new TextEncoder().encode(result.tokenName).length < 1 || new TextEncoder().encode(result.tokenName).length > 64) {
    throw new TypeError('tokenName must be well-formed and 1-64 bytes in UTF-8');
  }
  result.symbol = result.symbol.trim().toUpperCase();
  if (!/^[A-Z0-9]{1,10}$/.test(result.symbol)) {
    throw new TypeError('symbol must be 1-10 uppercase alphanumeric characters');
  }
  const bounds = {
    decimals: [0n, 18n],
    totalSupply: [1n, (1n << 256n) - 1n],
    quoteSupply: [1n, (1n << 256n) - 1n],
    notice: [3600n, 2592000n]
  };
  for (const k of ['decimals', 'totalSupply', 'quoteSupply', 'notice']) {
    const s = result[k];
    if (s.length > 78 || !/^(0|[1-9][0-9]*)$/.test(s)) {
      throw new TypeError('Numeric fields must be canonical unsigned decimal strings');
    }
    const n = BigInt(s);
    if (n < bounds[k][0] || n > bounds[k][1]) {
      throw new TypeError('Numeric field out of bounds');
    }
  }
  return Object.freeze(result);
}
