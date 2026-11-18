// TradingView Advanced Charts datafeed (JS API: onReady / searchSymbols / resolveSymbol / getBars / subscribeBars /
// unsubscribeBars). ux-tradingview 2026-11-18. Our own market data only, as the license requires (§2.2):
//  - history: the bars the terminal already read from our index (/api/terminal/market, pushed in with push()), and
//    /api/candles (qx-candles.mjs serverBars, never the browser/GeckoTerminal path) only when no pushed bars exist;
//  - realtime: the terminal's existing market poll pushes each new read here; this module runs no timer of its own.
// Symbols: "QH:<chain>:launch:<controller>", "QH:<chain>:x:<token>" (outside tokens, bars served by our own server
// routes /api/terminal/x/candles or /api/candles and pushed in by the page) or "QH:<chain>:pool:<pool>:<token>:<quote>", plus ":mc" for the market-cap
// variant (each bar × the header's own supply, so the chart and the header print the same figure).
import {serverBars} from './qx-candles.mjs';

export const TF_TO_RES = Object.freeze({1: '1S', 60: '1', 300: '5', 900: '15', 3600: '60', 14400: '240', 86400: '1D'});
export const RES_TO_TF = Object.freeze({'1S': 1, '1': 60, '5': 300, '15': 900, '60': 3600, '240': 14400, '1D': 86400, 'D': 86400});
export const SUPPORTED = Object.freeze(['1S', '1', '5', '15', '60', '240', '1D']);
export const MAX_BARS = 2000; // one /api/candles read never asks for more than this many bars of history

const A40 = /^0x[0-9a-f]{40}$/, A64 = /^0x[0-9a-f]{64}$/;
const EVM = /^0x[0-9a-f]{40}$/, B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
/// Outside tokens ({chainId, token, outside:true}) use "QH:<chain>:x:<token>": bars come only from what our own server
/// routes answered the page (pushed in); the datafeed never reads anything for them itself.
export function symbolFor({chainId, controller, pool, token, quote, outside}, unit = 'price') {
  const base = controller ? `QH:${chainId}:launch:${String(controller).toLowerCase()}`
    : outside ? `QH:${chainId}:x:${String(chainId) === 'solana' ? String(token) : String(token).toLowerCase()}`
    : `QH:${chainId}:pool:${String(pool).toLowerCase()}:${String(token).toLowerCase()}:${String(quote).toLowerCase()}`;
  return unit === 'mcap' ? base + ':mc' : base;
}
export function parseSymbol(name) {
  const p = String(name || '').split(':');
  if (p[0] !== 'QH' || !/^(\d{1,6}|solana)$/.test(p[1] || '')) return null;
  let sel = null, n = 0;
  if (p[2] === 'x' && (p[1] === 'solana' ? B58 : EVM).test(p[3] || '')) { sel = {chainId: p[1], token: p[3], outside: true}; n = 4; }
  else if (p[1] === 'solana') return null;
  else if (p[2] === 'launch' && A40.test(p[3] || '')) { sel = {chainId: p[1], controller: p[3]}; n = 4; }
  else if (p[2] === 'pool' && A64.test(p[3] || '') && A40.test(p[4] || '') && A40.test(p[5] || '')) { sel = {chainId: p[1], pool: p[3], token: p[4], quote: p[5]}; n = 6; }
  if (!sel) return null;
  if (p.length === n + 1 && p[n] === 'mc') return {...sel, unit: 'mcap', base: p.slice(0, n).join(':')};
  if (p.length !== n) return null;
  return {...sel, unit: 'price', base: p.join(':')};
}
/// Price scale with ~4 significant digits for a value (micro-cap prices need many decimals).
export function priceScale(value) {
  if (!(value > 0)) return 100;
  const decimals = Math.min(16, Math.max(0, 3 - Math.floor(Math.log10(value))));
  return 10 ** decimals;
}
const tvBar = (b, k) => ({time: b.time * 1000, open: b.open * k, high: b.high * k, low: b.low * k, close: b.close * k, volume: b.volume || 0});
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const okBar = (b) => b && finite(b.time) && [b.open, b.high, b.low, b.close].every((v) => finite(v) && v > 0);

/// The datafeed plus push(): `snapshot` = {tf, bars:[{time s, open, high, low, close, volume}], k (price→MC multiplier or
/// null), label, unit ('USD' or a quote symbol), format(value, unit 'price'|'mcap') → string}.
export function createDatafeed({fetcher = globalThis.fetch, maxBars = MAX_BARS, onError = null, defer = (fn) => setTimeout(fn, 0)} = {}) {
  const snaps = new Map(); // base symbol → snapshot
  const subs = new Map(); // guid → {base, unit, tf, onTick, reset, last}
  const served = new Map(); // ticker|res → last bar time (s) handed to the library
  const earliest = new Map(); // base|tf → first bar time (s) /api/candles has for it (no older reads past it)
  const fail = (cb, why) => { try { onError?.(why); } catch {} cb(why); };

  function push(base, snapshot) {
    if (!base || !snapshot) return;
    const bars = (snapshot.bars || []).filter(okBar).sort((a, b) => a.time - b.time);
    const prev = snaps.get(base), next = {...snapshot, bars};
    snaps.set(base, next);
    for (const s of subs.values()) {
      if (s.base !== base || s.tf !== next.tf) continue;
      const k = s.unit === 'mcap' ? next.k : 1;
      // Supply changed under a market-cap chart: the library re-reads history instead of mixing two multipliers.
      if (s.unit === 'mcap' && prev && prev.k !== next.k) { try { s.reset?.(); } catch {} continue; }
      if (!(k > 0)) continue;
      for (const b of s.last ? bars : bars.slice(-1)) { // never replay history as ticks
        if (b.time < s.last) continue;
        s.last = b.time; served.set(s.key, b.time);
        try { s.onTick(tvBar(b, k)); } catch {}
      }
    }
  }
  const snapshot = (base) => snaps.get(base) || null;

  return {
    push, snapshot,
    /// For the widget's priceFormatterFactory: the terminal's own formatter for this symbol (header and axis agree).
    formatter(symbolInfo) {
      const sel = parseSymbol(symbolInfo?.ticker), snap = sel && snaps.get(sel.base);
      if (!snap?.format) return null;
      return {format: (value) => snap.format(value, sel.unit)};
    },
    onReady(cb) { defer(() => cb({supported_resolutions: [...SUPPORTED], supports_marks: false, supports_timescale_marks: false, supports_time: false, exchanges: [], symbols_types: []})); },
    searchSymbols(_q, _e, _t, onResult) { onResult([]); }, // QHooks search lives in the terminal, not in the chart.
    resolveSymbol(name, onResolve, onFail) {
      const sel = parseSymbol(name);
      if (!sel) { defer(() => fail(onFail, 'unknown_symbol')); return; }
      const snap = snaps.get(sel.base), k = sel.unit === 'mcap' ? snap?.k : 1;
      if (sel.unit === 'mcap' && !(k > 0)) { defer(() => fail(onFail, 'supply_unknown')); return; }
      const label = snap?.label || (sel.controller ? 'QHooks launch' : sel.outside ? 'Token' : 'Pool'), last = snap?.bars?.at(-1)?.close;
      const usd = !snap?.unit || snap.unit === 'USD', seconds = !!sel.controller;
      defer(() => onResolve({name: label, ticker: name, full_name: name, description: label + (sel.unit === 'mcap' ? ' · MC' : ' · Price'), type: 'crypto',
        session: '24x7', timezone: 'Etc/UTC', exchange: 'QHooks', listed_exchange: 'QHooks', format: 'price', minmov: 1, pricescale: priceScale(last * (k || 1)),
        has_intraday: true, has_seconds: seconds, seconds_multipliers: seconds ? ['1'] : [], intraday_multipliers: ['1', '5', '15', '60', '240'],
        has_daily: true, daily_multipliers: ['1'], has_weekly_and_monthly: false, visible_plots_set: 'ohlcv', volume_precision: 2,
        supported_resolutions: seconds ? [...SUPPORTED] : SUPPORTED.filter((r) => r !== '1S'), data_status: 'streaming',
        ...(usd ? {currency_code: 'USD'} : {})}));
    },
    async getBars(info, resolution, period, onResult, onFail) {
      const sel = parseSymbol(info?.ticker), tf = RES_TO_TF[resolution];
      if (!sel || !tf) { fail(onFail, 'unsupported_resolution'); return; }
      const from = Math.floor(period?.from ?? 0), to = Math.floor(period?.to ?? Date.now() / 1000), key = info.ticker + '|' + resolution;
      const snap = snaps.get(sel.base);
      const k = sel.unit === 'mcap' ? snap?.k : 1;
      if (sel.unit === 'mcap' && !(k > 0)) { fail(onFail, 'supply_unknown'); return; }
      if (snap && snap.tf === tf) {
        // Pushed bars: no network. Older than what we hold → noData (with nextTime when an older bar exists), so the
        // library stops asking instead of spinning.
        const list = snap.bars.filter((b) => b.time >= from && b.time < to);
        if (!list.length) {
          const older = snap.bars.filter((b) => b.time < from).at(-1);
          onResult([], older ? {noData: true, nextTime: older.time * 1000} : {noData: true});
          return;
        }
        if (period?.firstDataRequest || !served.has(key)) served.set(key, list.at(-1).time);
        onResult(list.map((b) => tvBar(b, k)), {noData: false});
        return;
      }
      // Outside tokens: only bars the page already got from our own server routes; never a read from here.
      if (sel.outside) { onResult([], {noData: true}); return; }
      // No pushed bars for this timeframe: one bounded read of our candle API.
      const ek = sel.base + '|' + tf, first = earliest.get(ek);
      if (first != null && to <= first) { onResult([], {noData: true}); return; }
      const lo = Math.max(from, to - tf * maxBars);
      try {
        const got = await serverBars({...sel, tf, from: lo, to, fetcher});
        if (!got) { fail(onFail, 'refreshing'); return; }
        const bars = got.bars.filter((b) => b.time >= lo && b.time < to);
        const start = Number.isFinite(got.earliest) ? got.earliest : bars[0]?.time;
        if (Number.isFinite(start)) earliest.set(ek, Math.min(start, earliest.get(ek) ?? Infinity));
        else if (!bars.length) earliest.set(ek, to);
        if (!bars.length) { onResult([], {noData: true}); return; }
        if (period?.firstDataRequest || !served.has(key)) served.set(key, bars.at(-1).time);
        onResult(bars.map((b) => tvBar(b, k)), {noData: false});
      } catch (e) { fail(onFail, String(e?.message || 'refreshing')); }
    },
    subscribeBars(info, resolution, onTick, guid, onResetCacheNeeded) {
      const sel = parseSymbol(info?.ticker), tf = RES_TO_TF[resolution];
      if (!sel || !tf) return;
      const key = info.ticker + '|' + resolution;
      subs.set(guid, {base: sel.base, unit: sel.unit, tf, onTick, reset: onResetCacheNeeded, key, last: served.get(key) ?? 0});
    },
    unsubscribeBars(guid) { subs.delete(guid); },
    get subscriptions() { return subs.size; },
  };
}
