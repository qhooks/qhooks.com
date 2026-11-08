// Holder cashback threshold, read from the flywheel on Robinhood Chain (lead, 2026-11-08: the Safe can change it with
// setBatch, so pages must not hardcode it). The page ships with the last known value; this replaces it with the
// on-chain holderMin once read. 0 means holder cashback is off; the static text is then left as is.
import {chainById} from '/chains.mjs';
export const FLYWHEEL = '0xb85E67cf7728572033A9d36aEe3218DadF85bAA2';
const HOLDER_MIN = '0x9e7cd7fe';
let read = null;
/** holderMin in whole QHOOKS (Number), or null when it can't be read. Cached per page. */
export function holderMinTokens(fetchImpl = (...a) => fetch(...a)) {
  return read ||= fetchImpl(chainById('4663').rpc, {method: 'POST', headers: {'content-type': 'application/json'},
    body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{to: FLYWHEEL, data: HOLDER_MIN}, 'latest']})})
    .then(r => r.json()).then(j => typeof j?.result === 'string' && j.result.length > 2 ? Number(BigInt(j.result) / 10n ** 18n) : null)
    .catch(() => { read = null; return null; });
}
/** 1000000 → "1,000,000" (pages). */
export const fullText = n => n.toLocaleString('en-US');
/** 1000000 → "1M", 250000 → "250K" (terminal). */
export const shortText = n => n >= 1e9 ? +(n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? +(n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? +(n / 1e3).toFixed(1) + 'K' : String(n);
const THRESHOLD_TEXT = /\b\d{1,3}(?:,\d{3})+\+ QHOOKS/g; // "100,000+ QHOOKS": the static fallback, whatever it was built with
/** Rewrites "<n>+ QHOOKS" text and [data-qx-holdermin] elements to the on-chain value. */
export async function applyHolderMin(doc = document) {
  const n = await holderMinTokens();
  if (!n) return false;
  const v = fullText(n);
  doc.querySelectorAll('[data-qx-holdermin]').forEach(e => { e.textContent = v; });
  const w = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  for (let t = w.nextNode(); t; t = w.nextNode()) if (THRESHOLD_TEXT.test(t.textContent)) { THRESHOLD_TEXT.lastIndex = 0; t.textContent = t.textContent.replace(THRESHOLD_TEXT, v + '+ QHOOKS'); }
  return true;
}
if (typeof document !== 'undefined' && document.body) applyHolderMin().catch(() => {});
