// Browser read fallback (2026-11-10): Robinhood Chain's public RPC sometimes sends "Access-Control-Allow-Origin: *,*",
// so the browser blocks the response. Load this module before a page's own scripts: a POST to the Robinhood or Elysium
// public RPC that fails in the browser is retried once through qhooks.com/api/rpc/<chain> (read methods only), and later
// reads on the page go straight there. Wallet transactions are unaffected: they go through the wallet, not fetch.
const HOSTS = {'rpc.mainnet.chain.robinhood.com': '4663', 'rpc.elysium.kinetiq.xyz': '99901', 'rpc.monad.xyz': '143'};
if (typeof window !== 'undefined' && !window.__qxRpcFallback) {
  window.__qxRpcFallback = true;
  // Robinhood's public RPC answers "*,*" often enough that a first direct try logs a console error: go through the proxy
  // from the start (2026-11-10). Elysium too: its public RPC answers bursts with 429, and the proxy reads via Alchemy.
  const base = window.fetch.bind(window), viaProxy = new Set(['4663', '99901']); // both: the proxy reads through the Worker's Alchemy route
  window.fetch = async function (input, init) {
    // walletpnl (2026-11-12): a caller that must stay on the free public RPC (the proxy reads through the Worker's paid
    // route) marks its request; it handles a failed read itself.
    if (init?.qhooksPublicOnly === true) return base(input, init);
    let url; try { url = new URL(typeof input === 'string' ? input : input?.url || ''); } catch { return base(input, init); }
    const chain = HOSTS[url.hostname], method = (init?.method || input?.method || 'GET').toUpperCase();
    if (!chain || method !== 'POST' || !init || typeof init.body !== 'string') return base(input, init);
    const proxied = () => base('/api/rpc/' + chain, {method: 'POST', headers: {'content-type': 'application/json'}, body: init.body, signal: init.signal});
    if (viaProxy.has(chain)) { const r = await proxied().catch(() => null); if (r?.ok) return r; return base(input, init); }
    let r;
    try { r = await base(input, init); }
    catch (e) { if (e?.name === 'AbortError') throw e; viaProxy.add(chain); return proxied(); }
    // Elysium's public RPC answers bursts with 429 "Rate Limit Exceeded" (2026-11-10, terminal): retry that once through
    // the proxy too. A read the proxy refuses (e.g. an unbounded eth_getLogs) keeps the original answer.
    if (r.status === 429 || r.status >= 500) { const p = await proxied().catch(() => null); if (p?.ok) return p; }
    return r;
  };
}
