// Batch G (2026-11-18). List rows that carry a buy link show one fixed-width verb ("Buy" / "Trade"); the token
// name is already in the row, and the accessible name keeps it ("Buy HOOKDOG"). Display only: hrefs, amounts and
// the trade flow are the caller's and are never touched here.
export const PRICE_PLACEHOLDER = '–';
export function listBuyLabel(symbol, { verb = 'Buy', fallback = 'this token' } = {}) {
  const v = verb === 'Trade' ? 'Trade' : 'Buy';
  const s = String(symbol ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
  return { text: v, ariaLabel: v + ' ' + (s || fallback) };
}
// A row price: the formatted value when it is a usable positive number, otherwise the quiet placeholder.
// Never a status word on a row; freshness belongs to one module-level line at most.
export function listPriceText(value, format) {
  const n = typeof value === 'number' ? value : Number.NaN;
  if (!(Number.isFinite(n) && n > 0)) return { text: PRICE_PLACEHOLDER, known: false };
  const text = typeof format === 'function' ? String(format(n) ?? '') : String(n);
  return text.trim() ? { text, known: true } : { text: PRICE_PLACEHOLDER, known: false };
}
