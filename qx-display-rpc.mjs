// Explicit display reads only: per-tab cache, single flight and cooldown. No persistent data or automatic retries.
export const PUBLIC_RPC = Object.freeze({
  'https://mainnet.base.org/': '8453', 'https://arb1.arbitrum.io/rpc': '42161',
  'https://ethereum-rpc.publicnode.com/': '1', 'https://bsc-dataseed.bnbchain.org/': '56', 'https://bsc-rpc.publicnode.com/': '56',
  'https://rpc.mainnet.chain.robinhood.com/': '4663', 'https://rpc.elysium.kinetiq.xyz/': '99901', 'https://rpc.monad.xyz/': '143'
});
export const RELAY_CHAINS = new Set(['56', '1', '8453', '42161', '4663', '99901', '143']);
export function rpcEndpoint(input, origin = 'https://qhooks.com') {
  try {
    const u = new URL(typeof input === 'string' ? input : input?.url || '', origin);
    if (u.username || u.password || u.search || u.hash) return null;
    if (PUBLIC_RPC[u.href]) return {url: u.href, chain: PUBLIC_RPC[u.href], public: true};
    const m = /^\/api\/rpc\/(\d+)$/.exec(u.pathname);
    return u.origin === new URL(origin).origin && m && RELAY_CHAINS.has(m[1]) ? {url: u.href, chain: m[1], public: false} : null;
  } catch { return null; }
}
const ADDRESS = /^0x[0-9a-f]{40}$/i;
const stable = x => Array.isArray(x) ? '[' + x.map(stable).join(',') + ']' : x && typeof x === 'object'
  ? '{' + Object.keys(x).sort().map(k => JSON.stringify(k) + ':' + stable(x[k])).join(',') + '}' : JSON.stringify(x);
const abortError = () => new DOMException('The read was cancelled.', 'AbortError');
const tag = x => ['latest', 'safe', 'finalized'].includes(x) || /^0x[0-9a-f]+$/i.test(x || '');
function requestOf(input, init, origin) {
  if (init?.qhooksPublicOnly || (init?.method || input?.method || 'GET').toUpperCase() !== 'POST' || typeof init?.body !== 'string' || init.body.length > 16384) return null;
  const headers = new Headers(init.headers), purpose = headers.get('x-qhooks-read-purpose') || init.qhooksReadPurpose;
  if (purpose !== 'display' || [...headers.keys()].some(k => !['content-type', 'accept', 'x-qhooks-read-purpose'].includes(k))) return null;
  let endpoint, body;
  try { const known = rpcEndpoint(input, origin); if (!known) return null; endpoint = known.url; body = JSON.parse(init.body); } catch { return null; }
  const calls = Array.isArray(body) ? body : [body];
  if (!calls.length || calls.length > 20) return null;
  let ttl = 60000;
  const ids = new Set();
  for (const c of calls) {
    const id = typeof c?.id + ':' + c?.id;
    if (c?.jsonrpc !== '2.0' || !['string', 'number'].includes(typeof c.id) || ids.has(id) || !Array.isArray(c.params)) return null;
    ids.add(id);
    if (['eth_chainId', 'net_version'].includes(c.method) && !c.params.length) continue;
    if (c.method === 'eth_blockNumber' && !c.params.length) { ttl = Math.min(ttl, 2000); continue; }
    if (c.method === 'eth_getBalance' && c.params.length === 2 && ADDRESS.test(c.params[0]) && tag(c.params[1])) { ttl = Math.min(ttl, 5000); continue; }
    const [tx, block] = c.params;
    if (c.method !== 'eth_call' || c.params.length !== 2 || !tx || Object.keys(tx).some(k => !['to', 'data'].includes(k)) || !ADDRESS.test(tx.to) || !tag(block)) return null;
    if (/^0x(?:313ce567|95d89b41|06fdde03)$/i.test(tx.data)) continue;
    if (/^0x70a08231[0-9a-f]{64}$/i.test(tx.data)) { ttl = Math.min(ttl, 5000); continue; }
    return null; // Quotes, allowance/prep, pending, gas, code and unknown selectors stay fresh.
  }
  return {endpoint, calls, batch: Array.isArray(body), ttl, key: endpoint + '|' + stable(calls.map(c => [c.method, c.params]))};
}
const retryMs = (value, now) => {
  if (!value) return 0;
  const n = Number(value); if (Number.isFinite(n) && n >= 0) return n * 1000;
  const at = Date.parse(value); return Number.isFinite(at) ? Math.max(0, at - now) : 0;
};
export function createDisplayRpcFetch({fetchImpl = globalThis.fetch, origin = globalThis.location?.origin || 'https://qhooks.com', now = Date.now, maxEntries = 128, maxConcurrent = 4, maxPending = 32, timeoutMs = 8000, setTimer = setTimeout, clearTimer = clearTimeout} = {}) {
  const cache = new Map(), inflight = new Map(), endpoints = new Map();
  const endpointState = key => {
    let s = endpoints.get(key);
    if (!s) {
      if (endpoints.size >= maxEntries) { const idle = [...endpoints].find(([, v]) => !v.running && !v.pending.length); if (idle) endpoints.delete(idle[0]); }
      endpoints.set(key, s = {until: 0, failures: 0, running: 0, pending: [], wake: null});
    }
    return s;
  };
  const response = (s, request) => new Response(s.json ? JSON.stringify(request.batch ? s.json.map((e, i) => ({...e, id: request.calls[i].id})) : {...s.json[0], id: request.calls[0].id}) : s.text, {status: s.status, statusText: s.statusText, headers: s.headers});
  const overflow = request => Response.json(request.batch ? request.calls.map(c => ({jsonrpc: '2.0', id: c.id, error: {code: -32005, message: 'Display read queue is full'}})) : {jsonrpc: '2.0', id: request.calls[0].id, error: {code: -32005, message: 'Display read queue is full'}}, {status: 429, headers: {'retry-after': '1'}});
  function cool(state, hint) {
    state.failures = Math.min(state.failures + 1, 6);
    state.until = Math.max(state.until, now() + Math.max(Math.min(60000, 1000 * 2 ** state.failures), hint));
  }
  function finish(job, error, snapshot) {
    if (job.settled) return;
    job.settled = true;
    clearTimer(job.timer);
    const index = job.state.pending.indexOf(job);
    if (index >= 0) job.state.pending.splice(index, 1);
    if (job.started) job.state.running--;
    if (inflight.get(job.request.key) === job) inflight.delete(job.request.key);
    error ? job.reject(error) : job.resolve(snapshot);
    if (!job.state.scheduled) {
      job.state.scheduled = true;
      queueMicrotask(() => { job.state.scheduled = false; pump(job.state); });
    }
  }
  function pump(state) {
    if (state.wake !== null) { clearTimer(state.wake); state.wake = null; }
    if (!state.pending.length) return;
    if (state.until > now()) {
      // This is the first dispatch of waiting work, never a retry of a failed request.
      state.wake = setTimer(() => { state.wake = null; pump(state); }, state.until - now());
      return;
    }
    while (state.running < maxConcurrent && state.pending.length) {
      const job = state.pending.shift();
      if (!job.settled) {
        if (job.expiresAt <= now()) finish(job, Object.assign(Error('Display RPC timed out'), {name: 'TimeoutError'}));
        else start(job);
      }
    }
  }
  function start(job) {
    const {request, state} = job;
    job.started = true; state.running++;
    (async () => {
      const r = await fetchImpl(job.input, {...job.init, signal: job.controller.signal});
      const text = await r.text();
      if (job.settled || job.controller.signal.aborted) throw abortError();
      if (job.expiresAt <= now()) throw Object.assign(Error('Display RPC timed out'), {name: 'TimeoutError'});
      let entries = null;
      try {
        const parsed = JSON.parse(text), list = Array.isArray(parsed) ? parsed : [parsed];
        const byId = new Map(list.map(e => [typeof e?.id + ':' + e?.id, e]));
        if (list.every(e => e?.jsonrpc === '2.0') && list.length === request.calls.length && byId.size === list.length && request.calls.every(c => byId.has(typeof c.id + ':' + c.id))) entries = request.calls.map(c => byId.get(typeof c.id + ':' + c.id));
      } catch {}
      if (r.ok && !entries) throw Error('Invalid RPC response');
      const headers = new Headers(r.headers); headers.delete('content-length'); headers.delete('content-encoding');
      const snapshot = {status: r.status, statusText: r.statusText, headers: [...headers], text, json: entries};
      const limited = entries?.some(e => e.error && ([-32005, -32016].includes(e.error.code) || /rate.?limit|too many requests/i.test(e.error.message || '')));
      if (r.status === 429 || r.status >= 500 || limited) cool(state, retryMs(r.headers.get('retry-after'), now()));
      else if (r.ok && entries?.every(e => typeof e.result === 'string' && !e.error)) {
        // A success from another already-running job cannot erase a newer rate-limit cooldown.
        if (state.until <= now()) { state.until = 0; state.failures = 0; }
        if (text.length <= 32768) { if (cache.size >= maxEntries) cache.delete(cache.keys().next().value); cache.set(request.key, {...snapshot, until: now() + request.ttl}); }
      }
      return snapshot;
    })().then(snapshot => finish(job, null, snapshot), error => {
      if (job.settled) return;
      cool(state, 0); finish(job, error);
    });
  }
  function wait(job, signal, request) {
    if (signal?.aborted) return Promise.reject(abortError());
    job.users++;
    return new Promise((resolve, reject) => {
      let done = false;
      const settle = (fn, value) => { if (done) return; done = true; signal?.removeEventListener('abort', cancel); job.users--; fn(value); };
      const cancel = () => {
        settle(reject, abortError());
        if (!job.users && !job.settled) { job.controller.abort(); finish(job, abortError()); }
      };
      signal?.addEventListener('abort', cancel, {once: true});
      job.promise.then(s => { try { settle(resolve, response(s, request)); } catch (e) { settle(reject, e); } }, e => settle(reject, e));
    });
  }
  return async function displayFetch(input, init = {}) {
    if (init.signal?.aborted) throw abortError();
    const request = requestOf(input, init, origin);
    if (!request) return fetchImpl(input, init);
    const hit = cache.get(request.key);
    if (hit && hit.until > now()) return response(hit, request);
    if (hit) cache.delete(request.key);
    const existing = inflight.get(request.key);
    if (existing) return wait(existing, init.signal, request);
    const state = endpointState(request.endpoint);
    if (state.pending.length >= maxPending) return overflow(request);
    const job = {input, init, request, state, controller: new AbortController(), users: 0, started: false, settled: false, expiresAt: now() + timeoutMs};
    job.promise = new Promise((resolve, reject) => { job.resolve = resolve; job.reject = reject; });
    job.timer = setTimer(() => {
      if (job.settled) return;
      job.controller.abort();
      // Queue wait consumes this request's deadline, but undispatched work says nothing about provider health.
      if (job.started) cool(state, 0);
      finish(job, Object.assign(Error('Display RPC timed out'), {name: 'TimeoutError'}));
    }, timeoutMs);
    inflight.set(request.key, job);
    state.pending.push(job);
    const caller = wait(job, init.signal, request);
    pump(state);
    return caller;
  };
}
