// One price format for the whole site (2026-11-12). No DOM, no I/O: pages, the terminal and node tests share it.
//   1 and up:  grouped, at most 4 decimals (2 from 1,000)            12.3456, 1,234.56
//   below 1:   4 significant digits, trailing zeros dropped          0.1235, 0.00001234
//   from 5 leading zeros the zero run is a subscript count           0.0₅1234 = 0.000001234
// Returns the digits without a currency sign; null for a missing, negative or non-finite value.
const SUB = '₀₁₂₃₄₅₆₇₈₉';
export const SUBSCRIPT_FROM = 5;
export function priceDigits(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n === 0) return '0';
  if (n >= 1) return n.toLocaleString('en-US', { maximumFractionDigits: n >= 1000 ? 2 : 4 });
  // round before counting zeros, so a value rounding across a power of ten stays correct
  const [mantissa, exponent] = n.toExponential(3).split('e');
  const zeros = -Number(exponent) - 1, digits = mantissa.replace('.', '').replace(/0+$/, '') || '0';
  if (zeros >= SUBSCRIPT_FROM) return '0.0' + String(zeros).replace(/\d/g, (d) => SUB[d]) + digits;
  return '0.' + '0'.repeat(zeros) + digits;
}
