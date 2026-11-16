// Public chart/tape reads only. Keep real snapshots through short provider outages;
// the observation time never moves forward until a new response arrives.
const clients = new WeakMap();
const FRESH_MS = 30000, RETAIN_MS = 300000;
function client(fetcher) {
  if (!clients.has(fetcher)) clients.set(fetcher, {rows: new Map(), flights: new Map(), blockedUntil: 0});
  return clients.get(fetcher);
}
function retryDelay(value, now) {
  const seconds = Number(value), date = Date.parse(value || '');
  const delay = value && Number.isFinite(seconds) ? seconds * 1000 : Number.isFinite(date) ? date - now : 60000;
  return Math.max(1000, Math.min(600000, delay));
}
export async function readGecko(url, {fetcher = globalThis.fetch, signal} = {}) {
  const target = new URL(url);
  if (target.origin !== 'https://api.geckoterminal.com' || !target.pathname.startsWith('/api/v2/')) return null;
  if (signal?.aborted) throw signal.reason || new DOMException('Aborted', 'AbortError');
  const state = client(fetcher), now = Date.now(), hit = state.rows.get(url);
  const retained = () => hit?.value && Date.now() - hit.value.observedAt <= RETAIN_MS
    ? {...hit.value, stale: Date.now() - hit.value.observedAt >= FRESH_MS} : null;
  if (hit?.value && now - hit.value.observedAt < FRESH_MS) return retained();
  if (now < state.blockedUntil || now < (hit?.retryAt || 0)) return retained();
  if (state.flights.has(url)) {
    const value = await state.flights.get(url);
    if (signal?.aborted) throw signal.reason || new DOMException('Aborted', 'AbortError');
    return value;
  }
  const pending = (async () => {
    try {
      const response = await fetcher(url, {headers: {accept: 'application/json'}, credentials: 'omit', referrerPolicy: 'no-referrer', signal});
      if (response.status === 429) state.blockedUntil = Date.now() + retryDelay(response.headers.get('retry-after'), Date.now());
      if (!response.ok) throw Error('public_chart_unavailable');
      const value = {body: await response.json(), observedAt: Date.now(), stale: false};
      state.rows.set(url, {value});
      return value;
    } catch (error) {
      if (signal?.aborted) throw error;
      state.rows.set(url, {value: hit?.value || null, retryAt: Date.now() + 10000});
      return retained();
    } finally {
      state.flights.delete(url);
      if (state.rows.size > 32) state.rows.delete(state.rows.keys().next().value);
    }
  })();
  state.flights.set(url, pending);
  return pending;
}
