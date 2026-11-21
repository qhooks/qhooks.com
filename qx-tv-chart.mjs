// TradingView Advanced Charts on the token page (ux-tradingview 2026-11-18). Licensed library (signed 2026-11-06), served
// only from our own origin under /charting_library/ and NEVER in the public repo (mirror-sync excludes it, mirror-guard
// refuses it). Fed only by our own data through qx-tv-datafeed.mjs. TradingView's own attribution inside the widget stays
// intact (license §3.2): this module never hides or restyles the logo/link.
//
// The native lightweight chart keeps rendering underneath and is the fallback: this layer only covers it once the
// widget reports ready. It gives up (and removes itself) when the library does not load and draw within LOAD_TIMEOUT_MS,
// when the datafeed reports an error, or when the browser lacks what the library needs.
import {createDatafeed, symbolFor, TF_TO_RES} from './qx-tv-datafeed.mjs';

export const LIB_PATH = '/charting_library/';
export const LIB_SCRIPT = LIB_PATH + 'charting_library.standalone.js';
export const THEME_CSS = '/qx-tv-theme.css';
export const LOAD_TIMEOUT_MS = 6000;
const LAYER_CSS = new URL('./qx-tv-chart.css', import.meta.url).href;

export function tvSupported(win = globalThis) {
  try {
    const ua = String(win.navigator?.userAgent || '');
    return !!(win.ResizeObserver && win.Intl && win.requestAnimationFrame && win.URL && win.Blob && win.CSS?.supports?.('display', 'grid')) && !/\bMSIE |Trident\//.test(ua);
  } catch { return false; }
}

export function loadLibrary({doc = globalThis.document, win = globalThis} = {}) {
  return new Promise((resolve, reject) => {
    if (win.TradingView?.widget) { resolve(win.TradingView); return; }
    const s = doc.createElement('script');
    s.src = LIB_SCRIPT; s.async = true; s.dataset.qxTv = '';
    s.onload = () => (win.TradingView?.widget ? resolve(win.TradingView) : reject(Error('library_missing')));
    s.onerror = () => reject(Error('library_blocked'));
    doc.head.append(s);
  });
}

const pick = (css, name, fallback) => (css?.getPropertyValue?.(name) || '').trim() || fallback;
/// Site colours for the widget, read from the page's own tokens (noir/gold, the terminal's candle colours).
export function readColors(el, win = globalThis) {
  const light = win.document?.documentElement?.dataset?.theme === 'light';
  const css = el && win.getComputedStyle ? win.getComputedStyle(el) : null;
  return {light,
    bg: pick(css, '--qa-floor', light ? '#F2F3F1' : '#090B0A'),
    text: pick(css, '--qx-muted', light ? 'rgba(13,16,15,.72)' : 'rgba(244,241,233,.70)'),
    grid: pick(css, '--qxt-grid', light ? 'rgba(27,32,29,.07)' : 'rgba(241,238,227,.05)'),
    up: pick(css, '--qxt-up', light ? '#0A7A45' : '#3EDD8F'), down: pick(css, '--qxt-down', light ? '#B42C33' : '#FF5E64'),
    upA: pick(css, '--qxt-up-a', 'rgba(62,221,143,.42)'), downA: pick(css, '--qxt-down-a', 'rgba(255,94,100,.42)'),
    gold: pick(css, '--qa-gold', light ? '#8B6631' : '#D2AD72'),
    font: pick(css, '--qa-sans', '"Mona Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif')};
}
export function chartOverrides(c) {
  return {
    'paneProperties.backgroundType': 'solid', 'paneProperties.background': c.bg,
    'paneProperties.vertGridProperties.color': c.grid, 'paneProperties.horzGridProperties.color': c.grid,
    'paneProperties.crossHairProperties.color': c.gold, 'paneProperties.separatorColor': c.grid,
    'scalesProperties.textColor': c.text, 'scalesProperties.lineColor': c.grid, 'scalesProperties.fontSize': 11,
    'mainSeriesProperties.candleStyle.upColor': c.up, 'mainSeriesProperties.candleStyle.downColor': c.down,
    'mainSeriesProperties.candleStyle.borderUpColor': c.up, 'mainSeriesProperties.candleStyle.borderDownColor': c.down,
    'mainSeriesProperties.candleStyle.wickUpColor': c.up, 'mainSeriesProperties.candleStyle.wickDownColor': c.down,
    'mainSeriesProperties.areaStyle.linecolor': c.gold, 'mainSeriesProperties.areaStyle.linewidth': 2,
    'mainSeriesProperties.areaStyle.color1': c.light ? 'rgba(139,102,49,.20)' : 'rgba(226,190,128,.30)', 'mainSeriesProperties.areaStyle.color2': 'rgba(210,173,114,0)',
    'mainSeriesProperties.priceLineColor': c.gold,
    'scalesProperties.showStudyLastValue': false, // the volume label sat on the price axis
  };
}
// Header items that make no sense for one token on our feed: symbol search / compare (other assets), save/load (no
// storage), the resolution menu (the page's own timeframe row drives the chart), market status, the bottom range bar.
export const DISABLED = Object.freeze(['header_symbol_search', 'symbol_search_hot_key', 'header_compare', 'header_saveload', 'header_resolutions',
  'show_interval_dialog_on_key_press', 'timeframes_toolbar', 'display_market_status', 'header_quick_search', 'popup_hints', 'go_to_date',
  'study_templates', 'save_chart_properties_to_local_storage', 'symbol_info', 'legend_inplace_edit', 'disable_legend_inplace_symbol_change']);
// Phones: the top toolbar keeps only indicators; the drawing toolbar starts collapsed (one tap opens it).
export const PHONE_DISABLED = Object.freeze(['header_chart_type', 'header_settings', 'header_undo_redo', 'header_screenshot', 'header_fullscreen_button']);
export function widgetOptions({container, datafeed, symbol, interval, phone = false, colors}) {
  return {container, datafeed, symbol, interval, library_path: LIB_PATH, locale: 'en', timezone: 'Etc/UTC', autosize: true,
    theme: colors.light ? 'light' : 'dark', custom_css_url: THEME_CSS, custom_font_family: colors.font, toolbar_bg: colors.bg,
    loading_screen: {backgroundColor: colors.bg, foregroundColor: colors.gold},
    overrides: chartOverrides(colors),
    studies_overrides: {'volume.volume.color.0': colors.downA, 'volume.volume.color.1': colors.upA},
    disabled_features: [...DISABLED, ...(phone ? PHONE_DISABLED : [])],
    enabled_features: ['seconds_resolution', 'iframe_loading_same_origin', ...(phone ? ['hide_left_toolbar_by_default'] : [])],
    custom_formatters: {priceFormatterFactory: (symbolInfo) => datafeed.formatter?.(symbolInfo) || null}};
}

function ensureStyle(doc) {
  if (!doc?.head || doc.querySelector('link[data-qx-tv-css]')) return;
  const l = doc.createElement('link'); l.rel = 'stylesheet'; l.href = LAYER_CSS; l.dataset.qxTvCss = ''; doc.head.append(l);
}

/// One layer per page. update(view) on every chart render; hide() when the page shows a chart we do not feed.
/// view = {sel, unit:'price'|'mcap', tf, bars, k, label, priceUnit, format(value, unit), overlay:{entry, entryText, markers}}
export function createTvLayer({host, doc = globalThis.document, win = globalThis, timeoutMs = LOAD_TIMEOUT_MS, load = loadLibrary,
  phone = () => !!win.matchMedia?.('(max-width:760px)').matches, colors = () => readColors(doc.body, win), onFallback = () => {}, onReady = () => {}} = {}) {
  let state = 'idle', widget = null, el = null, timer = null, current = null, pending = null, reason = null, shapes = [], overlayKey = '', visible = false, lastView = null;
  const feed = createDatafeed({fetcher: win.fetch?.bind(win), onError: (why) => fail('datafeed_' + why)});
  const mark = (on) => { host?.classList.toggle('qx-tv-on', on); if (el) el.dataset.state = state; };
  function fail(why) {
    if (state === 'failed') return;
    state = 'failed'; reason = String(why || 'error'); clearTimeout(timer);
    try { widget?.remove(); } catch {}
    widget = null; el?.remove(); el = null; mark(false); visible = false;
    try { onFallback(reason); } catch {}
  }
  function show(on) {
    visible = !!on && state === 'ready';
    if (el) el.hidden = !on;
    mark(visible);
  }
  function chartType() {
    let line = false; try { line = win.localStorage?.getItem('qa-chart-mode') === 'line'; } catch {}
    try { widget?.activeChart().setChartType(line ? 3 : 1); } catch {}
  }
  // Overlay draws are serialized: each draw waits for the previous draw's shapes to exist (createShape resolves
  // asynchronously), removes exactly those, then creates its own. Before, a second draw could run while the first
  // draw's ids were still pending, so those shapes were never removed (duplicates) or a later clear removed the
  // newer line (the average-entry line went missing while the markers stayed).
  let drawing = Promise.resolve();
  function drawOverlay(view) {
    drawing = drawing.then(() => drawNow(view)).catch(() => {});
  }
  async function drawNow(view) {
    if (state !== 'ready' || !widget) return;
    const o = view?.overlay || {}, key = JSON.stringify([current?.symbol, current?.tf, o.entry, o.entryText, (o.markers || []).map((m) => [m.time, m.side])]);
    if (key === overlayKey) return;
    let chart; try { chart = widget.activeChart(); } catch { return; }
    overlayKey = key;
    for (const id of shapes) { try { chart.removeEntity(id); } catch {} }
    shapes = [];
    const opts = {lock: true, disableSelection: true, disableSave: true, disableUndo: true, showInObjectsTree: false};
    const c = colors(), made = [];
    const add = (r) => { made.push(Promise.resolve(r).then((id) => id, () => null)); };
    if (o.entry > 0) add(chart.createShape({price: o.entry}, {...opts, shape: 'horizontal_line', text: o.entryText || '', overrides: {linecolor: c.up, linestyle: 2, linewidth: 1, showLabel: !!o.entryText, textcolor: c.up, horzLabelsAlign: 'left'}}));
    for (const m of (o.markers || []).slice(-60)) {
      const buy = m.side === 'buy';
      add(chart.createShape({time: m.time, price: m.price}, {...opts, shape: buy ? 'arrow_up' : 'arrow_down', text: m.text || (buy ? 'You buy' : 'You sell'), overrides: {color: buy ? c.up : c.down, arrowColor: buy ? c.up : c.down, fontsize: 11}}));
    }
    const ids = (await Promise.all(made)).filter((id) => id != null);
    shapes = ids;
    // If the line was asked for but did not come back (TradingView refused it mid-load), let the next update retry.
    if (o.entry > 0 && made.length && (await made[0]) == null) overlayKey = '';
  }
  function apply(view) {
    if (state !== 'ready' || !widget) return;
    const symbol = symbolFor(view.sel, view.unit), res = TF_TO_RES[view.tf];
    if (!res) { show(false); return; }
    if (!current || current.symbol !== symbol || current.tf !== view.tf) {
      current = {symbol, tf: view.tf}; overlayKey = '';
      // The switch callback draws the newest view: a wallet answer that lands during the switch must not be replaced by
      // the view captured when the switch began (2026-11-21, average-entry line).
      // The chart clears its drawings when the new symbol loads, so the redraw must not be skipped as 'unchanged'.
      try { widget.setSymbol(symbol, res, () => { overlayKey = ''; drawOverlay(lastView || view); }); } catch (e) { fail('set_symbol'); return; }
    } else drawOverlay(view);
    show(view.bars.length > 0);
  }
  function start(view) {
    if (!tvSupported(win)) { fail('unsupported_browser'); return; }
    state = 'loading'; ensureStyle(doc);
    el = doc.createElement('div'); el.className = 'qx-tv-layer'; el.dataset.state = 'loading'; el.setAttribute('aria-label', 'Price chart'); host.append(el);
    timer = setTimeout(() => fail('timeout'), timeoutMs);
    current = {symbol: symbolFor(view.sel, view.unit), tf: view.tf};
    Promise.resolve().then(() => load({doc, win})).then((TV) => {
      if (state !== 'loading') return;
      widget = new TV.widget(widgetOptions({container: el, datafeed: feed, symbol: current.symbol, interval: TF_TO_RES[view.tf], phone: phone(), colors: colors()}));
      const ready = () => {
        if (state !== 'loading') return;
        clearTimeout(timer); state = 'ready'; chartType();
        if (pending) { const v = pending; pending = null; apply(v); }
        try { onReady(); } catch {}
      };
      if (typeof widget.chartReady === 'function') Promise.resolve(widget.chartReady()).then(ready, () => fail('chart_ready'));
      else widget.onChartReady(ready);
    }).catch((e) => fail(e?.message || 'library_error'));
  }
  // Day/night and the token page's Line/Candles button follow the page.
  const themeWatch = win.MutationObserver ? new win.MutationObserver(() => {
    if (state !== 'ready' || !widget) return;
    const c = colors();
    Promise.resolve(widget.changeTheme?.(c.light ? 'light' : 'dark')).then(() => widget?.applyOverrides(chartOverrides(c))).catch(() => {});
  }) : null;
  themeWatch?.observe(doc.documentElement, {attributes: true, attributeFilter: ['data-theme']});
  const onModeClick = (e) => { if (e.target?.closest?.('.ta-mode')) Promise.resolve().then(chartType); };
  doc.addEventListener('click', onModeClick);

  return {
    update(view) {
      if (state === 'failed' || !view?.sel) return false;
      lastView = view;
      feed.push(symbolFor(view.sel), {tf: view.tf, bars: view.bars || [], k: view.k, label: view.label, unit: view.priceUnit, format: view.format});
      if (!view.bars?.length) { show(false); pending = view; return false; } // the native chart says "No trades yet"
      if (state === 'idle') { pending = view; start(view); return false; }
      if (state === 'loading') { pending = view; return false; }
      apply(view);
      return visible;
    },
    hide() { pending = null; show(false); },
    destroy() { themeWatch?.disconnect(); doc.removeEventListener('click', onModeClick); clearTimeout(timer); try { widget?.remove(); } catch {} widget = null; el?.remove(); el = null; state = 'failed'; reason = 'destroyed'; mark(false); },
    get state() { return state; }, get reason() { return reason; }, get visible() { return visible; }, get widget() { return widget; }, feed,
  };
}
