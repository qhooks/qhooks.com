// Price / MC chart unit (ux-pricemc 2026-11-18): one per-device choice for every token, the way GMGN and fomo do it.
// The chart plots market cap by multiplying each bar by the supply behind the header's own MC figure, so no extra reads
// are needed and the chart's last value, the header's main figure and the MCap stat cell print the same text.
import {priceDigits} from './qx-price.mjs';

export const CHART_UNIT_KEY = 'qhooks:chart-unit:v1';
export const CHART_UNITS = Object.freeze(['price', 'mcap']);
const defaultStorage = () => { try { return globalThis.localStorage || null; } catch { return null; } };

// null = never chosen on this device: MC by default (GMGN/fomo parity); Price when the token's supply is unknown.
export function readChartUnit(storage = defaultStorage()) {
  try { const v = storage?.getItem(CHART_UNIT_KEY); return CHART_UNITS.includes(v) ? v : null; } catch { return null; }
}
export function writeChartUnit(unit, storage = defaultStorage()) {
  if (!CHART_UNITS.includes(unit)) return false;
  try { storage?.setItem(CHART_UNIT_KEY, unit); return true; } catch { return false; }
}

const pos = (n) => { const x = Number(n); return Number.isFinite(x) && x > 0 ? x : null; };
// The multiplier from price to market cap. Prefer the header's own pair (MC ÷ price), so the chart's last close × k is the
// header's MC exactly; fall back to indexed supply. null when the token has no supply we can stand behind.
export function capSupply(summary) {
  if (!summary) return null;
  const mcUsd = pos(summary.mcapUsd), pUsd = pos(summary.priceUsd);
  if (mcUsd && pUsd) return mcUsd / pUsd;
  const mc = pos(summary.mcap), p = pos(summary.price);
  if (mc && p) return mc / p;
  return pos(summary.supply);
}
// What the chart actually shows: MC only when the token's supply is known; the saved choice is left as it is.
export function effectiveUnit(preferred, summary) {
  return preferred === 'mcap' && capSupply(summary) ? 'mcap' : 'price';
}
// Constant multiplier for OHLC bars; volume is never multiplied.
export function capBars(bars, k) {
  if (!(k > 0) || k === 1) return bars;
  return bars.map((c) => ({ ...c, open: c.open * k, high: c.high * k, low: c.low * k, close: c.close * k }));
}

// The terminal's compact() (qx-terminal.mjs), byte for byte in behaviour; the parity test checks them side by side.
export function compactNumber(n) {
  if (n == null || Number.isNaN(n)) return '—';
  const a = Math.abs(n);
  return a >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : a >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : a >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : a >= 1 ? n.toFixed(2) : a ? (priceDigits(n) ?? '—') : '0';
}
// "$12.4K", "$1.20M"; a quote-unit chart (no dollar rate yet) gets "12.4K WETH".
export function capLabel(value, unit = 'USD') {
  if (!Number.isFinite(value) || value <= 0) return '';
  const usd = !unit || unit === 'USD';
  return (usd ? '$' : '') + compactNumber(value) + (usd ? '' : ' ' + unit);
}
// Axis step that never prints two identical labels in a row: one step of the compact format's last digit.
export function capMinMove(value) {
  const a = Math.abs(Number(value) || 0);
  return a >= 1e9 ? 1e7 : a >= 1e6 ? 1e4 : a >= 1e3 ? 100 : a >= 1 ? 0.01 : 1e-12;
}

// The segmented control: "Price | MC". MC is disabled with a short reason when supply is unknown.
const STYLE = new URL('./qx-chart-unit.css', import.meta.url).href;
function ensureStyle(doc) {
  if (!doc?.head || doc.querySelector('link[data-qx-unit]')) return;
  const link = doc.createElement('link'); link.rel = 'stylesheet'; link.href = STYLE; link.dataset.qxUnit = ''; doc.head.append(link);
}
export function paintUnitControl(group, { unit, supplyKnown }) {
  if (!group) return;
  ensureStyle(group.ownerDocument);
  group.classList.add('qx-unit-toggle');
  for (const b of group.querySelectorAll('button[data-unit]')) {
    const mc = b.dataset.unit === 'mcap';
    if (mc) {
      if (b.textContent !== 'MC') b.textContent = 'MC';
      b.disabled = !supplyKnown;
      b.title = supplyKnown ? 'Market cap' : 'Supply unknown';
      b.setAttribute('aria-label', supplyKnown ? 'Market cap' : 'Market cap: supply unknown');
    }
    b.setAttribute('aria-pressed', String(b.dataset.unit === unit));
  }
}
