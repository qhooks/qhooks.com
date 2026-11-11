import { guardWalletChain, marketFees, guardedSend, asTradeError } from './qx-chain-guard.mjs';
// Relay's wallet contract, backed only by the wallet selected in wallet-hub.
import { chainById } from './chains.mjs';

const ADDRESS = /^0x[0-9a-f]{40}$/i;
const HASH = /^0x[0-9a-f]{64}$/i;
const SUPPORTED = new Set([1, 8453, 42161, 56, 4663, 99901]); // + Elysium (2026-11-09)
const fail = (code, message, extra = {}) => Object.assign(new Error(message), { code, ...extra });
const hex = n => '0x' + n.toString(16);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();

export function relayChainId(value) {
  const n = typeof value === 'number' || /^(?:[1-9]\d*|0x[0-9a-f]+)$/i.test(String(value)) ? Number(value) : NaN;
  if (!SUPPORTED.has(n)) throw fail('unsupported_chain', 'Choose Base, Ethereum, Arbitrum, BNB Chain, Robinhood Chain or Elysium.');
  return n;
}

function quantity(value, name) {
  if (typeof value === 'bigint' && value >= 0n) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  if (typeof value === 'string' && /^(?:\d+|0x[0-9a-f]+)$/i.test(value)) return BigInt(value);
  throw fail('invalid_transaction', `The transaction has an invalid ${name}.`);
}

// Lazy because qx-chain's browser imports use site-root paths. Tests inject RPC at the public seam.
export async function relayRpc(chainId, method, params) {
  const { rpc } = await import('./qx-chain.mjs');
  let timer;
  try {
    return await Promise.race([rpc(chainId, method, params), new Promise((_, reject) => {
      timer = setTimeout(() => reject(fail('rpc_timeout', 'The network is taking too long to answer.')), 12_000);
    })]);
  } finally { clearTimeout(timer); }
}

// Same fee policy as qx-chain.send: 2 × latest base fee + tip, with 30% gas headroom.
export async function relayFees(chainId, { rpc = relayRpc } = {}) {
  return marketFees(chainId,rpc);
}

export const gasWithHeadroom = gas => (quantity(gas, 'gas estimate') * 13n + 9n) / 10n;

/** Await relayWallet() once per move; dispose() after settlement to remove identity listeners. */
export async function relayWallet({ hub, target = globalThis.window, rpc = relayRpc,
  pollMs = 2000, timeoutMs = 360_000, switchTimeoutMs = 30000, sleep = pause, now = Date.now, onSubmitted, onSigned } = {}) {
  if (!hub) {
    if (!target) throw fail('wallet_disconnected', 'Connect your wallet');
    const { getWalletHub } = await import('./wallet-hub.mjs');
    hub = getWalletHub(target);
  }
  const current = hub.snapshot().current, provider = current?.entry?.provider;
  if (!ADDRESS.test(current?.owner ?? '') || !provider?.request) throw fail('wallet_disconnected', 'Connect your wallet');
  const address = current.owner.toLowerCase();
  let invalid = false, switched = false;
  const changed = accounts => { if (!Array.isArray(accounts) || !same(accounts[0], address)) invalid = true; };
  const disconnected = () => { invalid = true; };
  provider.on?.('accountsChanged', changed);
  provider.on?.('disconnect', disconnected);
  target?.addEventListener?.('qhooks:wallet-disconnected', disconnected);

  async function checkOwner() {
    const selected = hub.snapshot().current;
    // wallet-hub invalidates its read-only session on chainChanged. An intentional switch may
    // temporarily clear it; the pinned provider, selected account and explicit disconnect still guard sends.
    if (invalid || (!selected && !switched) || (selected &&
        (!same(selected.owner, address) || selected.entry?.provider !== provider))) {
      throw fail('wallet_changed', 'Your wallet changed. Reconnect it and get a new quote.');
    }
    const accounts = await provider.request({ method: 'eth_accounts' });
    const latest = hub.snapshot().current;
    if (invalid || !Array.isArray(accounts) || !same(accounts[0], address) || (!latest && !switched) ||
        (latest && (!same(latest.owner, address) || latest.entry?.provider !== provider))) {
      throw fail('wallet_changed', 'Your wallet changed. Reconnect it and get a new quote.');
    }
  }

  async function switchChain(value) {
    const chainId = relayChainId(value);
    await checkOwner();
    switched = true;
    await guardWalletChain(provider,chainId,{target,timeoutMs:switchTimeoutMs});
    await checkOwner();
    return chainId;
  }

  async function sendTransaction(tx) {
    const chainId = relayChainId(tx?.chainId);
    if (!ADDRESS.test(tx?.to ?? '') || !/^0x(?:[0-9a-f]{2})*$/i.test(tx?.data ?? '0x') ||
        (tx?.from != null && !same(tx.from, address))) throw fail('invalid_transaction', 'The transaction does not match your wallet.');
    const value = hex(quantity(tx.value ?? 0, 'value'));
    await switchChain(chainId);
    let hash, submitted=false;
    const sendProvider={request:args=>{if(args.method==='eth_sendTransaction')submitted=true;return provider.request(args);}};
    try { hash=await guardedSend(sendProvider,chainId,{from:address,to:tx.to,data:tx.data,value},{rpc,target,beforeSend:checkOwner,assert:()=>{const selected=hub.snapshot().current;if(invalid||(selected&&(!same(selected.owner,address)||selected.entry?.provider!==provider)))throw fail('wallet_changed','Your wallet changed. Review again.');}}); }
    catch (cause) {
      if(!submitted)throw asTradeError(cause);
      if (Number(cause?.code) === 4001) throw cause; // An explicit user rejection did not authorize a send.
      throw fail('wallet_send_unknown', 'Your wallet did not confirm whether the transaction was sent. Check its activity and the move status before trying again.',
        { cause, chainId, mayHaveSubmitted: true });
    }
    if (!HASH.test(hash ?? '')) throw fail('invalid_wallet_response', 'Your wallet did not return a transaction hash. Check its activity and the move status before retrying.', { chainId, mayHaveSubmitted: true });
    try { onSubmitted?.({ chainId, txHash: hash }); } catch { /* Tracking must continue. */ }
    const deadline = now() + timeoutMs;
    while (now() < deadline) {
      const receipt = await rpc(chainId, 'eth_getTransactionReceipt', [hash]).catch(() => null);
      if (receipt) {
        if (receipt.status === '0x1' || receipt.status === 1) return hash;
        if (receipt.status === '0x0' || receipt.status === 0) throw fail('wallet_reverted', 'The transaction reverted. Your move did not complete.', { txHash: hash, chainId });
        throw fail('wallet_receipt_unknown', 'The network returned an incomplete receipt. Check the transaction before retrying.', { txHash: hash, chainId });
      }
      await sleep(Math.min(pollMs, Math.max(0, deadline - now())));
    }
    throw fail('wallet_receipt_pending', 'The transaction is still pending. Check it in the explorer before trying another move.', { txHash: hash, chainId });
  }

  async function signTypedData(chainId, typed) {
    chainId = relayChainId(chainId);
    if (!typed?.domain || !typed.types || !typed.primaryType || !typed.message ||
        (typed.domain.chainId != null && Number(typed.domain.chainId) !== chainId)) throw fail('invalid_signature', 'The signature does not match this network.');
    await switchChain(chainId);
    await checkOwner();
    const signature = await provider.request({ method: 'eth_signTypedData_v4', params: [address, JSON.stringify(typed)] });
    try { onSigned?.({ chainId }); } catch { /* Continue tracking the authorized request. */ }
    return signature;
  }

  async function signMessage(chainId, message) {
    if (typeof message !== 'string') throw fail('invalid_signature', 'The message to sign is missing.');
    await switchChain(chainId);
    await checkOwner();
    const encoded = /^0x(?:[0-9a-f]{2})*$/i.test(message) ? message
      : '0x' + Array.from(new TextEncoder().encode(message), b => b.toString(16).padStart(2, '0')).join('');
    const signature = await provider.request({ method: 'personal_sign', params: [encoded, address] });
    try { onSigned?.({ chainId: relayChainId(chainId) }); } catch { /* Continue tracking the authorized request. */ }
    return signature;
  }

  return { address, switchChain, sendTransaction, signTypedData, signMessage,
    dispose() {
      invalid = true;
      provider.removeListener?.('accountsChanged', changed);
      provider.removeListener?.('disconnect', disconnected);
      target?.removeEventListener?.('qhooks:wallet-disconnected', disconnected);
    } };
}
