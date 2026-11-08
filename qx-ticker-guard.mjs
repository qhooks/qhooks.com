// Anti-copycat ticker block on the site (Randall, 2026-11-08). Asks /api/v1/launches/ticker whether a ticker is already a
// QHooks launch on any of our chains (look-alikes folded the trust layer's way). Guided Create and the one-tap cards
// check while the ticker is typed and again right before the wallet opens.
// If the check can't be reached, the launch is not blocked (the factory is permissionless anyway); the trust layer's
// copy labels and down-ranking stay the backstop.
const API = '/api/v1/launches/ticker', reads = new Map();

/** {available: true} or {available: false, message, original: {symbol, chainId, href}}. */
export function checkTicker({symbol, chainId, creator = ''}, {fresh = false} = {}) {
  const s = String(symbol || '').trim();
  if (!s || !chainId) return Promise.resolve({available: true});
  const key = s.toUpperCase() + '|' + chainId + '|' + String(creator || '').toLowerCase();
  const hit = reads.get(key);
  if (!fresh && hit && Date.now() - hit.at < 30000) return hit.promise;
  const q = new URLSearchParams({symbol: s, chain: String(chainId)});
  if (/^0x[0-9a-fA-F]{40}$/.test(creator || '')) q.set('creator', creator.toLowerCase());
  const promise = fetch(API + '?' + q, {cache: 'no-store'}).then(r => r.ok ? r.json() : {available: true, unchecked: true})
    .then(j => j && j.available === false && j.original ? j : {available: true, unchecked: !!j?.unchecked})
    .catch(() => ({available: true, unchecked: true}));
  reads.set(key, {at: Date.now(), promise});
  return promise;
}

/** The refusal as nodes: "$X is already a QHooks launch. Open it →". */
export function tickerBlockNodes(result, doc = document) {
  const a = doc.createElement('a');
  a.href = result.original.href; a.textContent = 'Open it →'; a.className = 'qx-link';
  return [doc.createTextNode(result.message + ' '), a];
}

/** Thrown before the wallet opens; carries the original launch for the message. */
export class TickerTaken extends Error {
  constructor(result) { super(result.message); this.name = 'TickerTaken'; this.result = result; }
}
export async function assertTickerFree(args) {
  const r = await checkTicker(args, {fresh: true});
  if (!r.available) throw new TickerTaken(r);
  return r;
}
