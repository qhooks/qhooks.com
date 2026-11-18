import {hotEvent, hotKey, mergeHotRows} from './qx-hot-core.mjs';

const TEN_MINUTES = 600000, STORAGE_KEY = 'qxt:hot:seen:v1';
export function createHotReporter({now = Date.now, storage = () => globalThis.localStorage,
  navigator = globalThis.navigator, fetcher = globalThis.fetch} = {}) {
  const memory = new Map();
  return (chain, token, kind) => {
    const event = hotEvent({chain: String(chain), token, kind});
    if (!event) return false;
    const at = now(), key = hotKey(event);
    let store, saved = {};
    try { store = storage(); saved = JSON.parse(store?.getItem(STORAGE_KEY) || '{}') || {}; } catch { saved = {}; }
    const last = Math.max(typeof saved[key] === 'number' ? saved[key] : -Infinity, memory.get(key) ?? -Infinity);
    if (last <= at && at - last < TEN_MINUTES) return false;
    const body = JSON.stringify(event);
    let queued = false;
    try { queued = !!navigator?.sendBeacon?.('/api/terminal/hot/event', new Blob([body], {type: 'application/json'})); } catch { queued = false; }
    if (!queued) {
      try {
        if (typeof fetcher !== 'function') return false;
        Promise.resolve(fetcher('/api/terminal/hot/event', {method: 'POST', body, headers: {'content-type': 'application/json'}, keepalive: true, credentials: 'same-origin'})).catch(() => false);
      } catch { return false; }
    }
    memory.set(key, at);
    for (const [k, time] of memory) if (at - time >= TEN_MINUTES || time > at) memory.delete(k);
    // A single bounded record avoids accumulating a localStorage key per token.
    const recent = Object.entries(saved).filter(([k, time]) => k !== key && Number.isFinite(time) && time <= at && at - time < TEN_MINUTES).slice(-255);
    try { store?.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries([...recent, [key, at]]))); } catch { /* The in-tab guard still works. */ }
    if (memory.size > 256) memory.delete(memory.keys().next().value);
    return true;
  };
}
export const reportHotEvent = createHotReporter();
export function createHotSelectionReporter({report = reportHotEvent, now = Date.now} = {}) {
  let pendingSearch = null;
  return {
    remember(chain, token) {
      const event = hotEvent({chain: String(chain), token, kind: 'search'});
      pendingSearch = event ? {key: hotKey(event), at: now()} : null;
    },
    open(chain, token, {search = false} = {}) {
      const event = hotEvent({chain: String(chain), token, kind: 'open'});
      if (!event) return false;
      const pending = pendingSearch?.key === hotKey(event) && now() - pendingSearch.at < 60000;
      if (pending) pendingSearch = null;
      return report(chain, token, search || pending ? 'search' : 'open');
    },
  };
}
const selectionReporter = createHotSelectionReporter();
export const rememberHotSearch = selectionReporter.remember;
export const reportHotOpen = selectionReporter.open;

// Latest selection owns the result, including when a fetch ignores its abort signal.
export function createHotLoader({fetcher = globalThis.fetch, knownRows = () => [], changed = () => {}} = {}) {
  let revision = 0, controller;
  return {
    cancel() { revision++; controller?.abort(); },
    async load(window, chain) {
      const mine = ++revision;
      controller?.abort(); controller = new AbortController();
      const controllerForRequest = controller, signal = controller.signal;
      const ceiling = setTimeout(() => controllerForRequest.abort(), 12000);
      changed({loading: true, error: null});
      try {
        const response = await fetcher('/api/terminal/hot?' + new URLSearchParams({window, chain}), {signal});
        if (!response.ok) throw Error('Hot searches could not refresh. Try again.');
        const body = await response.json();
        if (!Array.isArray(body?.rows)) throw Error('Hot searches could not refresh. Try again.');
        if (mine === revision) changed({loading: false, error: null, data: {rows: mergeHotRows(body.rows, knownRows()), source: 'Hot searches · ' + window, hot: true, observedAt: Date.now()}});
      } catch {
        if (mine === revision) changed({loading: false, error: 'Hot searches could not refresh. Try again.'});
      } finally { clearTimeout(ceiling); }
    },
  };
}
