// TradingView Advanced Charts mount (2026-11-10). Licensed library (signed 2026-11-06), hosted only on our servers
// under /charting_library/ and NEVER in the public repo (see lead/candles/mirror-guard.sh). Until those files are on the
// server this module reports unavailable and the terminal keeps its native chart on our candle feed.
// TradingView's own attribution inside the widget must stay intact (license §3.2): do not hide or restyle it.
import {createDatafeed, symbolFor} from './qx-tv-datafeed.mjs';
const LIB = '/charting_library/charting_library.standalone.js';
let available = null;
export async function tvAvailable(fetcher = globalThis.fetch) {
  if (available !== null) return available;
  try { const r = await fetcher(LIB, {method: 'HEAD', cache: 'no-store'}); available = r.ok && /javascript/.test(r.headers.get('content-type') || ''); }
  catch { available = false; }
  return available;
}
function loadScript(src) {
  return new Promise((resolve, reject) => { if (globalThis.TradingView?.widget) return resolve(); const s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = () => reject(Error('chart library')); document.head.append(s); });
}
/// Mounts the widget into `container` for one market; returns {remove()} or null when the library isn't installed.
export async function mountTvChart(container, sel, {symbolLabel = '', interval = '1', theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'} = {}) {
  if (!container || !(await tvAvailable())) return null;
  await loadScript(LIB);
  const symbol = symbolFor(sel), datafeed = createDatafeed({label: {[symbol]: symbolLabel}});
  const widget = new globalThis.TradingView.widget({container, library_path: '/charting_library/', datafeed, symbol, interval, theme, autosize: true, locale: 'en',
    timezone: 'Etc/UTC', disabled_features: ['header_symbol_search', 'symbol_search_hot_key', 'header_compare'], enabled_features: [], custom_css_url: undefined});
  return {remove() { try { widget.remove(); } catch {} }};
}
