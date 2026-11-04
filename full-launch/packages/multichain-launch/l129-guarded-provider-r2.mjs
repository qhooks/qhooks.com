// One module-owned request boundary. The brand proves exact provider/session
// lineage, not cached identity, transaction consent, or a provider URL match.
import {requireBoundWalletSession} from './l129-bound-session.mjs';

const bindings = new WeakMap();
const probes = new Set(['eth_chainId', 'eth_accounts']);
const reads = new Set([
  'eth_call', 'eth_getCode', 'eth_getStorageAt', 'eth_getBlockByNumber',
  'eth_getBalance', 'eth_getTransactionCount', 'eth_getTransactionByHash',
  'eth_getTransactionReceipt', 'eth_estimateGas', 'eth_gasPrice',
  'eth_maxPriorityFeePerGas', 'eth_feeHistory', 'eth_blockNumber',
]);
const methodNames = ['request', 'on', 'removeListener'];
const assert = (ok, message) => { if (!ok) throw new Error(message); };

export function createGuardedLaunchProvider({provider, session, connection, check, beforeSend}) {
  requireBoundWalletSession(session, provider);
  assert(connection && session.current === connection, 'Bound launch connection required');
  assert(typeof check === 'function' && typeof beforeSend === 'function', 'Launch guards required');
  const rawRequest = provider.request.bind(provider);
  let dead = false;
  // Synchronous checkpoints stay at every existing local await boundary. Only
  // network probes move into request(); there is no TTL, shared probe promise,
  // or externally supplied identity observation.
  function current() {
    requireBoundWalletSession(session, provider);
    assert(!dead && session.current === connection, 'Launch connection changed');
    const result = check();
    assert(!result || typeof result.then !== 'function', 'Launch checkpoint must be synchronous');
    requireBoundWalletSession(session, provider);
    assert(!dead && session.current === connection, 'Launch connection changed');
  }
  async function fresh() {
    current();
    await session.refresh(connection);
    current();
  }
  const guarded = Object.freeze({
    on(event, listener) { current(); return provider.on(event, listener); },
    // Cleanup must remain possible after invalidation/disposal.
    removeListener(event, listener) { return provider.removeListener(event, listener); },
    async request({method, params = []}) {
      assert(typeof method === 'string' && Array.isArray(params), 'Launch RPC request required');
      assert(probes.has(method) || reads.has(method) || method === 'eth_signTypedData_v4' || method === 'eth_sendTransaction', 'Unsupported launch RPC method');
      // Capture before the first await, so caller mutations cannot alter a
      // request after it was reviewed. No wallet-provider API is added here.
      const copied = structuredClone(params);
      if (method === 'eth_sendTransaction') {
        try {
          await fresh();
          // The workspace supplies its unchanged exact-call/PQ-key/dependency/
          // nonce/fee-consent gate, plus Arc's shared-balance gate where used.
          await beforeSend(copied);
          current();
        } catch (error) {
          throw Object.assign(new Error(error.message, {cause: error}), {code: 4001, phase: 'before-wallet-request'});
        }
        // Never discard a returned hash if identity changes in the wallet
        // dialog. The executor persists it before its next live checkpoint.
        return rawRequest({method, params: copied});
      }
      if (probes.has(method)) {
        current();
        const value = structuredClone(await rawRequest({method, params: copied}));
        current();
        // Callers of these two explicit fresh probes still validate the value.
        return value;
      }
      await fresh();
      const value = structuredClone(await rawRequest({method, params: copied}));
      await fresh();
      return value;
    },
  });
  bindings.set(guarded, Object.freeze({session, connection, current, methods: methodNames.map(k => guarded[k])}));
  current();
  return Object.freeze({provider: guarded, dispose() { dead = true; bindings.delete(guarded); }});
}

// Only a wrapper created above can replace redundant nested network probes.
// A copied/proxied provider, different session, stale connection, or changed
// raw method is rejected. This check never claims fresh network observation.
export function requireLiveBoundLaunchProvider(provider, session, connection) {
  const binding = provider && bindings.get(provider);
  assert(binding && binding.session === session && binding.connection === connection && methodNames.every((k, i) => provider[k] === binding.methods[i]), 'Bound launch provider required');
  binding.current();
  return provider;
}
