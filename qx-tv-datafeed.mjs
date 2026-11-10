// TradingView Advanced Charts datafeed (JS API: onReady / searchSymbols / resolveSymbol / getBars / subscribeBars /
// unsubscribeBars), 2026-11-10. Our own market data only, as the license requires (§2.2): /api/candles via
// qx-candles.mjs with browser:false — never DexScreener or a third-party feed inside the library.
// Symbols: "QH:<chain>:launch:<controller>" for QHooks launches, "QH:<chain>:pool:<pool>:<token>:<quote>" for outside pools.
import {serverBars} from './qx-candles.mjs';
export const RESOLUTIONS = Object.freeze({'1': 60, '5': 300, '15': 900, '60': 3600, '240': 14400, '1D': 86400, 'D': 86400});
const SUPPORTED = ['1', '5', '15', '60', '240', '1D'];

export function symbolFor({chainId, controller, pool, token, quote}) {
  return controller ? `QH:${chainId}:launch:${String(controller).toLowerCase()}` : `QH:${chainId}:pool:${String(pool).toLowerCase()}:${String(token).toLowerCase()}:${String(quote).toLowerCase()}`;
}
export function parseSymbol(name) {
  const p = String(name || '').split(':');
  if (p[0] !== 'QH' || !/^\d{1,6}$/.test(p[1] || '')) return null;
  if (p[2] === 'launch' && /^0x[0-9a-f]{40}$/.test(p[3] || '')) return {chainId: p[1], controller: p[3]};
  if (p[2] === 'pool' && /^0x[0-9a-f]{64}$/.test(p[3] || '') && /^0x[0-9a-f]{40}$/.test(p[4] || '') && /^0x[0-9a-f]{40}$/.test(p[5] || '')) return {chainId: p[1], pool: p[3], token: p[4], quote: p[5]};
  return null;
}
/// Price scale with ~4 significant digits for the market's current price (micro-cap prices need many decimals).
export function priceScale(price) {
  if (!(price > 0)) return 100;
  const decimals = Math.min(16, Math.max(2, 3 - Math.floor(Math.log10(price))));
  return 10 ** decimals;
}

export function createDatafeed({fetcher = globalThis.fetch, pollMs = 15000, label = {}, setTimer = setInterval, clearTimer = clearInterval} = {}) {
  const subs = new Map();
  const bars = async (sel, tf, from, to) => (await serverBars({...sel, tf, from, to, fetcher}))?.bars || [];
  return {
    onReady(cb) { setTimeout(() => cb({supported_resolutions: SUPPORTED, supports_marks: false, supports_timescale_marks: false, supports_time: true, exchanges: [], symbols_types: []}), 0); },
    searchSymbols(_q, _e, _t, onResult) { onResult([]); }, // QHooks search lives in the terminal, not in the chart.
    async resolveSymbol(name, onResolve, onError) {
      const sel = parseSymbol(name);
      if (!sel) { onError('unknown_symbol'); return; }
      const recent = await bars(sel, 3600).catch(() => []), last = recent.at(-1)?.close;
      const title = label[name] || (sel.controller ? 'QHooks launch' : 'Pool');
      onResolve({name: title, ticker: name, description: title, type: 'crypto', session: '24x7', timezone: 'Etc/UTC', exchange: 'QHooks', listed_exchange: 'QHooks',
        format: 'price', minmov: 1, pricescale: priceScale(last), has_intraday: true, has_daily: true, has_weekly_and_monthly: false, supported_resolutions: SUPPORTED,
        volume_precision: 2, data_status: 'streaming', currency_code: 'USD'});
    },
    async getBars(info, resolution, period, onResult, onError) {
      const sel = parseSymbol(info.ticker), tf = RESOLUTIONS[resolution];
      if (!sel || !tf) { onError('unsupported'); return; }
      try {
        const list = await bars(sel, tf, period.from, period.to);
        onResult(list.map(b => ({time: b.time * 1000, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume})), {noData: !list.length});
      } catch (e) { onError(String(e?.message || 'refreshing')); }
    },
    subscribeBars(info, resolution, onTick, guid) {
      const sel = parseSymbol(info.ticker), tf = RESOLUTIONS[resolution];
      if (!sel || !tf) return;
      let last = 0;
      const tick = async () => {
        const now = Math.floor(Date.now() / 1000), list = await bars(sel, tf, now - tf * 3, now + tf).catch(() => []), b = list.at(-1);
        if (b && b.time >= last) { last = b.time; onTick({time: b.time * 1000, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume}); }
      };
      subs.set(guid, setTimer(tick, pollMs));
    },
    unsubscribeBars(guid) { const t = subs.get(guid); if (t) clearTimer(t); subs.delete(guid); },
  };
}
