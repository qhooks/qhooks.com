import {BUILT} from './chains.mjs';
export function pageScope(location = globalThis.location, document = globalThis.document) {
  const path = location?.pathname || '', query = new URLSearchParams(location?.search || ''), hash = new URLSearchParams((location?.hash || '').slice(1));
  const page = /portfolio/.test(path) ? 'portfolio' : /wallets(?:\.html)?$/.test(path) ? 'wallets' : /terminal/.test(path) ? 'terminal' : /wallet/.test(path) ? 'wallet' : null;
  if (!page) return null;
  const selection = hash.get('m') || hash.get('t') || hash.get('pool') || '', selectedChain = selection.split(':')[0], market = selection.split(':').slice(1).join(':') || query.get('pool') || null;
  const input = document?.querySelector?.('#qxt-chains [aria-pressed="true"], #qpw-chain, [data-presence-chain], #chain');
  const chain = query.get('chain') || (BUILT.some(c => c.id === selectedChain) || selectedChain === 'solana' ? selectedChain : input?.value || input?.dataset?.presenceChain || input?.dataset?.chain);
  const chains = chain && chain !== 'all' ? [chain] : BUILT.filter(c => c.status === 'live' && (page !== 'wallets' || ['4663','8453','56','42161','99901','1'].includes(c.id))).map(c => c.id);
  const followed = page === 'wallet' || page === 'wallets' && document?.querySelector?.('[data-presence-followed]')?.dataset?.presenceFollowed === 'true';
  return {page, chains, market, followed};
}
export function startPresence({document = globalThis.document, location = globalThis.location, fetchImpl = (...a) => globalThis.fetch(...a), scope = () => pageScope(location, document), headersFor = async () => ({}), setInterval = globalThis.setInterval, clearInterval = globalThis.clearInterval} = {}) {
  let pending = false;
  const beat = async () => {
    if (pending || document?.visibilityState === 'hidden') return;
    const body = scope(); if (!body) return;
    pending = true;
    try { await fetchImpl('/api/presence', {method: 'POST', headers: {'content-type': 'application/json', ...await headersFor()}, body: JSON.stringify(body), credentials: 'same-origin', keepalive: true}); } catch {} finally { pending = false; }
  };
  const controls = e => { if (e?.target?.closest?.('[data-chain], .qpw-tabs button, [data-presence-chain]')) beat(); };
  document?.addEventListener?.('click', controls);
  const timer = setInterval(beat, 60000); document?.addEventListener?.('visibilitychange', beat); globalThis.addEventListener?.('hashchange', beat);
  beat();
  return {beat, stop() { clearInterval(timer); document?.removeEventListener?.('click',controls); document?.removeEventListener?.('visibilitychange', beat); globalThis.removeEventListener?.('hashchange', beat); }};
}
if (typeof window !== 'undefined' && !window.__qhooksPresence) {
  window.__qhooksPresence = startPresence({headersFor: async () => { try { return (await import('/qx-board-session.mjs')).authHeaders(); } catch { return {}; } }});
  const base = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const r = await base(...args);
    if (r.headers.get('x-qhooks-refreshing') === '1') {
      let node = document.getElementById('qhooks-refreshing');
      if (!node) { node = document.createElement('div'); node.id = 'qhooks-refreshing'; node.setAttribute('role','status'); node.style.cssText='position:fixed;right:16px;bottom:16px;z-index:9999;padding:8px 12px;border-radius:8px;background:#17212e;color:#fff;font:13px system-ui'; document.body.append(node); }
      node.textContent = 'Refreshing';
    }
    if (r.headers.get('x-qhooks-cache') === 'fresh') document.getElementById('qhooks-refreshing')?.remove();
    return r;
  };
}
