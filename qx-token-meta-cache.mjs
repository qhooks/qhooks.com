// G2 (2026-11-18, logo flash): a token's name, symbol, chain and logo sources are static for the session. They are kept
// per canonical chain:address (EVM hex lower-cased, Solana base58 kept as is) in sessionStorage + localStorage and never
// re-read or re-rendered on price ticks. A known entry is replaced only when the server sends a strictly newer metadata
// version (metaVersion / metadataVersion); an incoming row with no version, or an equal/older one, keeps what is known.
// The only other change allowed is filling a field that was still empty (a token whose logo was unknown gets one once).
// Display only: never a price, amount, route or ranking input.
const STORE_KEY = 'qx:token-meta:v1', MAX = 1500, FIELDS = ['name', 'symbol', 'chain', 'sources'];
export function metaKey(chainId, address) {
  const c = String(chainId ?? '').trim(), a = String(address ?? '').trim();
  if (!c || !a) return '';
  return c + ':' + (/^0x[0-9a-fA-F]+$/.test(a) ? a.toLowerCase() : a);
}
export function metaVersionOf(value) {
  const raw = value?.metaVersion ?? value?.metadataVersion;
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
const empty = v => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
function pick(incoming = {}) {
  const out = {};
  if (typeof incoming.name === 'string' && incoming.name.trim()) out.name = incoming.name;
  if (typeof incoming.symbol === 'string' && incoming.symbol.trim()) out.symbol = incoming.symbol;
  if (incoming.chain !== undefined && incoming.chain !== null && String(incoming.chain)) out.chain = String(incoming.chain);
  if (Array.isArray(incoming.sources)) out.sources = incoming.sources.filter(s => typeof s === 'string' && s).slice(0, 8);
  const v = metaVersionOf(incoming); if (v !== null) out.metaVersion = v;
  return out;
}
export function createTokenMetaCache({session = null, local = null, delayMs = 250} = {}) {
  const map = new Map();
  for (const store of [local, session]) {
    try { const o = JSON.parse(store?.getItem(STORE_KEY) || 'null'); if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) if (v && typeof v === 'object') { map.delete(k); map.set(k, v); } } catch {}
  }
  let timer = null;
  const persist = () => {
    if (timer || (!session && !local)) return;
    timer = setTimeout(() => { timer = null; const text = JSON.stringify(Object.fromEntries([...map].slice(-MAX))); for (const store of [session, local]) { try { store?.setItem(STORE_KEY, text); } catch {} } }, delayMs);
    timer?.unref?.();
  };
  const put = (k, v) => { map.delete(k); map.set(k, v); persist(); return v; };
  // Returns the static identity to render for this token. `incoming` is whatever the current read carries.
  function settle(chainId, address, incoming = {}) {
    const k = metaKey(chainId, address), fresh = pick(incoming);
    if (!k) return fresh;
    const known = map.get(k);
    if (!known) return put(k, fresh);
    const v = metaVersionOf(fresh);
    if (v !== null && (known.metaVersion === undefined || known.metaVersion === null || v > known.metaVersion)) return put(k, {...known, ...fresh});
    let next = null;
    for (const f of FIELDS) if (empty(known[f]) && !empty(fresh[f])) (next ??= {...known})[f] = fresh[f];
    return next ? put(k, next) : known;
  }
  return {settle, get: (chainId, address) => map.get(metaKey(chainId, address)) || null, size: () => map.size, clear() { map.clear(); }};
}
// One shared cache per page in a browser. Node (tests, the Worker) gets null, so pure callers stay pure.
export const tokenMeta = (() => {
  if (typeof document === 'undefined') return null;
  const get = name => { try { return globalThis[name] || null; } catch { return null; } };
  return createTokenMetaCache({session: get('sessionStorage'), local: get('localStorage')});
})();
