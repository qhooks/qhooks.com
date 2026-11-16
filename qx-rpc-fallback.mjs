import {createDisplayRpcFetch, rpcEndpoint, RELAY_CHAINS} from './qx-display-rpc.mjs';
const READ = new Set(['eth_chainId','eth_blockNumber','eth_call','eth_getCode','eth_getBalance','eth_getStorageAt','eth_getTransactionCount','eth_getTransactionReceipt','eth_getTransactionByHash','eth_getBlockByNumber','eth_getBlockByHash','eth_estimateGas','eth_gasPrice','eth_maxPriorityFeePerGas','eth_feeHistory','eth_getLogs','net_version']);
function safeRead(init, input) {
  if ((init.method || input?.method || 'GET').toUpperCase() !== 'POST' || typeof init.body !== 'string' || init.body.length > 16384) return false;
  try {
    const body = JSON.parse(init.body), calls = Array.isArray(body) ? body : [body], ids = new Set();
    const valid = calls.length > 0 && calls.length <= 20 && calls.every(c => {
      const id = typeof c?.id + ':' + c?.id;
      if (c?.jsonrpc !== '2.0' || !READ.has(c.method) || !Array.isArray(c.params) || !['number','string'].includes(typeof c.id) || typeof c.id === 'number' && !Number.isFinite(c.id) || ids.has(id)) return false;
      ids.add(id); return true;
    });
    return valid ? {calls, batch: Array.isArray(body), ids} : null;
  } catch { return false; }
}
const abortError = () => new DOMException('The read was cancelled.', 'AbortError');
const errorCode = error => typeof error?.code === 'string' && /^-?\d{1,7}$/.test(error.code) ? Number(error.code) : error?.code;
// Match the server's semantic-error precedence; one semantic batch item keeps the whole answer.
const semanticError = row => row?.error && ([3,-32600,-32602].includes(errorCode(row.error)) || /\brevert(?:ed)?\b|\binvalid (?:argument|params?|parameters?|request)\b|\bmissing (?:argument|params?|parameters?)\b/i.test(String(row.error.message || '')));
const providerError = error => [-32005,-32016,-32603,-32601].includes(errorCode(error)) || /rate.?limit|too many requests|limit exceeded|exceeds? (?:the |maximum |max )?(?:request|rate|compute|capacity)|internal (?:json.?rpc )?error|upstream|temporarily unavailable|service unavailable|timed? ?out|timeout|server (?:error|busy)|try again|method not (?:found|supported)/i.test(String(error?.message || ''));
async function retryableReply(response, request, signal) {
  if (signal?.aborted) throw abortError();
  const max = 65536, length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > max) return false; // Large successful log/block bodies stay on their existing route.
  let reader, cancel, timer, timedOut = false;
  const stop = () => { try { void reader?.cancel().catch(() => {}); } catch {} };
  try {
    let stream;
    try { stream = response.clone().body; } catch { return false; }
    if (!stream) return true;
    // BYOB bounds bytes actually read, even when a provider emits one enormous chunk.
    // Uninspectable/polyfilled streams keep the original route rather than force recovery.
    try { reader = stream.getReader({mode: 'byob'}); } catch { try { void stream.cancel().catch(() => {}); } catch {} return false; }
    const aborted = new Promise((_, reject) => { cancel = () => { stop(); reject(abortError()); }; });
    signal?.addEventListener('abort', cancel, {once: true});
    const expired = new Promise(resolve => { timer = setTimeout(() => { timedOut = true; resolve(null); stop(); }, 250); });
    const decoder = new TextDecoder(); let bytes = 0, text = '';
    for (;;) {
      if (signal?.aborted) throw abortError();
      if (bytes === max) return false;
      const chunk = await Promise.race([reader.read(new Uint8Array(Math.min(8192, max - bytes))), aborted, expired]);
      if (timedOut) return false; // Inspection deadline preserves the original; it is not a recovery signal.
      const {done, value} = chunk;
      if (done) break;
      if (bytes + value.byteLength > max) return false;
      bytes += value.byteLength; text += decoder.decode(value, {stream: true});
    }
    const body = JSON.parse(text + decoder.decode()), rows = Array.isArray(body) ? body : [body];
    if (rows.some(semanticError)) return false;
    const ids = new Set(rows.map(row => typeof row?.id + ':' + row?.id));
    if (Array.isArray(body) !== request.batch || rows.length !== request.calls.length || ids.size !== rows.length || rows.some(row => !row || row.jsonrpc !== '2.0' || !request.ids.has(typeof row.id + ':' + row.id) || Object.hasOwn(row, 'result') === Object.hasOwn(row, 'error'))) return true;
    const errors = rows.filter(row => Object.hasOwn(row, 'error')).map(row => row.error);
    if (errors.some(error => !error || typeof error !== 'object' || !Number.isInteger(errorCode(error)) || typeof error.message !== 'string')) return true;
    // Unknown valid application errors are answers; do not replay a mixed batch around them.
    return errors.length > 0 && errors.every(providerError);
  } catch (error) {
    if (signal?.aborted || error?.name === 'AbortError') throw abortError();
    return !timedOut;
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', cancel);
    // Never await tee cancellation: it may wait until the untouched original body is consumed.
    stop(); try { reader?.releaseLock(); } catch {}
  }
}
const retryMs = (r, now) => {
  const v = r?.headers.get('retry-after'); if (!v) return 0;
  const n = Number(v); return Number.isFinite(n) && n >= 0 ? n * 1000 : Math.max(0, Date.parse(v) - now) || 0;
};
export function createRpcFallback({fetchImpl = globalThis.fetch, ...options} = {}) {
  const viaProxy = new Set(['56', '8453', '4663', '99901']), now = options.now || Date.now;
  const route = async (input, init = {}) => {
    const request = safeRead(init, input);
    if (init.qhooksPublicOnly === true || !request) return fetchImpl(input, init);
    const endpoint = rpcEndpoint(input, options.origin);
    if (!endpoint?.public || !RELAY_CHAINS.has(endpoint.chain)) return fetchImpl(input, init);
    const signal = init.signal ?? (input instanceof Request ? input.signal : undefined);
    if (signal?.aborted) throw abortError();
    const proxied = () => {
      const headers = new Headers({'content-type': 'application/json'});
      const purpose = new Headers(init.headers).get('x-qhooks-read-purpose') || init.qhooksReadPurpose;
      if (purpose) headers.set('x-qhooks-read-purpose', purpose);
      return fetchImpl('/api/rpc/' + endpoint.chain, {method: 'POST', headers, body: init.body, signal});
    };
    // Once recovery chose the relay, it owns provider fallback/backoff; never bounce back to browser public RPC.
    if (viaProxy.has(endpoint.chain)) return proxied();
    let r;
    try { r = await fetchImpl(input, init); }
    catch (e) {
      if (e?.name === 'AbortError' || signal?.aborted) throw e;
      viaProxy.add(endpoint.chain); return proxied();
    }
    if (signal?.aborted) throw abortError();
    const fallback = r.status === 429 || r.status >= 500 || r.ok && await retryableReply(r, request, signal);
    if (signal?.aborted) throw abortError();
    if (!fallback) return r;
    viaProxy.add(endpoint.chain);
    if (signal?.aborted) throw abortError();
    try {
      const p = await proxied();
      if (signal?.aborted) throw abortError();
      if (p.ok && !(retryMs(r, now()) > retryMs(p, now()) && await retryableReply(p, request, signal))) return p;
      return retryMs(r, now()) > retryMs(p, now()) ? r : p;
    } catch (e) { if (e?.name === 'AbortError' || signal?.aborted) throw e; return r; }
  };
  return createDisplayRpcFetch({fetchImpl: route, ...options});
}
if (typeof window !== 'undefined' && !window.__qxRpcFallback) {
  window.__qxRpcFallback = true;
  window.fetch = createRpcFallback({fetchImpl: window.fetch.bind(window)});
}
