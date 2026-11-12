// Shared price and percentage formatting for public call records. No DOM or I/O.
export function priceText(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const n = Number(value); return n === 0 ? '0' : n.toLocaleString(undefined, { maximumSignificantDigits: 6 });
}
export function moveText(value, base = 1) {
  if (value == null || !(Number(base) > 0) || !Number.isFinite(Number(value))) return '—';
  const n = (Number(value) / Number(base) - 1) * 100;
  return (n > 0 ? '+' : '') + Math.round(n) + '%';
}
