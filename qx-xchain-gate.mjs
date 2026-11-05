// Loads the cross-chain funding pieces only when the site says Relay is usable (GET /api/relay/status → {usable:true}).
// Until RELAY_API_KEY is set the worker answers {usable:false} and serves /qx-move-funds.mjs as a 404, so a static
// import of qx-xchain.mjs would take the whole ticket down. Here the ticket and the limit-order panel get inert
// stand-ins instead: no funding row, no "Sell to cash", no move-back offers; same-chain trading is unchanged.
import { chainById } from './chains.mjs';

async function load() {
  if (globalThis.__qhooksXchainOff) return null;
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch('/api/relay/status', { signal: controller.signal, credentials: 'omit', cache: 'no-store' });
    if (!response.ok || (await response.json())?.usable !== true) return null;
    return await import('./qx-xchain.mjs');
  } catch { return null; } finally { clearTimeout(timer); }
}
const m = await load();
export const xchainEnabled = !!m;

const off = () => { throw Object.assign(new Error('Moving funds between chains is not available right now.'), { code: 'relay_unavailable' }); };
/// Same shape as qx-xchain's row; never asks for funding, so the ticket's own balance checks apply.
function inertRow({ h, onChange = () => {} }) {
  const ready = () => onChange({ quote: null, required: false, ready: true });
  return { element: h('div', { hidden: true }), update: async () => ready(), clear: ready, setBusy() {}, fresh: () => false,
    get quote() { return null; }, get required() { return false; } };
}

export const createFundingRow = options => m ? m.createFundingRow(options) : inertRow(options);
export const fundingAsset = (chainId, asset) => m ? m.fundingAsset(chainId, asset)
  : { chainId: Number(chainId), ...(asset && typeof asset === 'object' ? asset : { address: asset, native: asset === 'native' }) };
export const destinationCosts = (...args) => m ? m.destinationCosts(...args) : Promise.resolve({ approvals: 0, setup: 0, estimatedGasCost: 0n });
export const runCrossChainBuy = (...args) => m ? m.runCrossChainBuy(...args) : off();
export const runFundedOrder = (...args) => m ? m.runFundedOrder(...args) : off();
export const retryLanded = (...args) => m ? m.retryLanded(...args) : off();
export const recoveryView = (...args) => m ? m.recoveryView(...args) : off();
export const readAssetBalance = (...args) => m ? m.readAssetBalance(...args) : off();
export const moveProceeds = (...args) => m ? m.moveProceeds(...args) : off();
export const offerMoveBack = (...args) => m ? m.offerMoveBack(...args) : off();
export const cashAsset = chainId => m ? m.cashAsset(chainId) : null;
export const cashHome = (...args) => m ? m.cashHome(...args) : null;
export const cashSettings = h => m ? m.cashSettings(h) : h('span', { hidden: true });
export const orderOrigin = (...args) => m ? m.orderOrigin(...args) : null;
/// Without Relay a cancel is a plain cancel: no refund offer.
export const cancelWithRefund = async options => m ? m.cancelWithRefund(options) : (await options.cancel(), 0n);
export const chainName = id => m ? m.chainName(id) : chainById(id)?.name ?? String(id);
export const loadFundingStyle = (...args) => { if (m) m.loadFundingStyle(...args); };
