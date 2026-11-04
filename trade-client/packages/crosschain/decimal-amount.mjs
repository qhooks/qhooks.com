export function parseDecimalAmount(text, decimals) {
  if (typeof text !== 'string' || text.length > 100 || !Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new TypeError();
  }
  const match = text.match(/^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/);
  if (!match) throw new TypeError();
  const whole = match[1];
  const fraction = match[2] || '';
  if (whole === '0' && fraction === '') throw new TypeError();
  if (whole.length > 1 && whole[0] === '0') throw new TypeError();
  if (fraction.length > decimals) throw new TypeError();
  const padded = fraction.padEnd(decimals, '0');
  const raw = BigInt(whole + padded);
  if (raw <= 0n || raw > (1n << 256n) - 1n) throw new TypeError();
  return raw.toString();
}
