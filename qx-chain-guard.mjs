// Shared EIP-1193 boundary. No cached wallet network is trusted for signing.
import { chainById } from './chains.mjs';
const hex = n => '0x' + BigInt(n).toString(16);
const plainErrors = new WeakSet();
const failure = message => { const e = new Error(message); plainErrors.add(e); return e; };
const chain = id => { const c = chainById(String(Number(id))); if (!c) throw failure('This network is unavailable for trading.'); return c; };
const causes = e => { const out = [], seen = new Set(); for (let n = e; n && !seen.has(n) && out.length < 12; n = n.cause || n.error || n.data?.originalError) { seen.add(n); out.push(n); } return out; };
const hasCode = (e, code) => causes(e).some(n => Number(n.code) === code);

export function tradeError(error) {
  const list = causes(error), text = list.map(e => [e.message, e.shortMessage, e.details].filter(Boolean).join(' ')).join(' ');
  if (list.some(e => plainErrors.has(e))) return list.find(e => plainErrors.has(e)).message;
  if (hasCode(error, 4001) || /user rejected|user denied|declined|cancelled in your wallet/i.test(text)) return 'You declined the wallet request.';
  if (/tip cap|gas price|fee too low|underpriced|priority fee|fee cap|maxFeePerGas|maxPriorityFeePerGas/i.test(text)) return 'The network fee was too low. Try again.';
  if (/insufficient funds|not enough balance/i.test(text)) return 'There is not enough balance for this trade and its network fee.';
  if (/revert|slippage|price moved/i.test(text)) return 'The trade could not complete at this price. Refresh the quote and try again.';
  if (/pending|already known|nonce too low/i.test(text)) return 'Check your wallet activity before trying this trade again.';
  if (/wallet.*changed|context changed|selection changed|reconnect|review again/i.test(text)) return 'Your wallet or token selection changed. Review the trade again.';
  if (/connect.*wallet|sign in/i.test(text)) return 'Connect your wallet and try again.';
  if (/no route|no quote|refreshing/i.test(text)) return 'No quote is available right now. Try again shortly.';
  return 'The request did not complete. Check your wallet activity and try again.';
}
export const asTradeError = error => failure(tradeError(error));
export function chainParams(id) {
  const c = chain(id);
  return { chainId: c.hex, chainName: c.name, nativeCurrency: { name: c.native, symbol: c.native, decimals: 18 }, rpcUrls: [c.rpc], blockExplorerUrls: [c.explorer] };
}
export async function assertWalletChain(provider, id, assert = () => {}) {
  assert(); const actual = await provider.request({ method: 'eth_chainId' }); assert();
  if (BigInt(actual) !== BigInt(chain(id).id)) throw failure('Switch to ' + chain(id).name + ' and try again.');
}
export async function guardWalletChain(provider, id, { assert = () => {}, onStatus = () => {}, target = globalThis.window } = {}) {
  const c = chain(id); assert();
  const original = await provider.request({ method: 'eth_chainId' }); assert();
  if (BigInt(original) !== BigInt(c.id)) {
    onStatus('Switching your wallet to ' + c.name + '…');
    target?.dispatchEvent?.(new (target.CustomEvent || globalThis.CustomEvent)('qhooks:chain-switch', { detail: { chainId: c.id } }));
    try {
      assert();
      try { await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: c.hex }] }); }
      catch (error) {
        if (!hasCode(error, 4902)) throw error;
        assert(); await provider.request({ method: 'wallet_addEthereumChain', params: [chainParams(c.id)] });
        assert(); await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: c.hex }] });
      }
      assert();
    } catch (error) {
      if (hasCode(error, 4001)) throw failure('You declined the switch to ' + c.name + '.');
      const before = chainById(String(Number(original)))?.name;
      throw failure(before ? 'Your wallet was on ' + before + '. Switch to ' + c.name + ' and try again.' : 'Switch to ' + c.name + ' and try again.');
    }
  }
  await assertWalletChain(provider, c.id, assert);
  return c;
}

// Reads only the destination RPC, after the caller verifies the wallet network.
// BSC requires a positive tip; other chains may legitimately suggest zero.
export async function marketFees(id, rpc) {
  const c = chain(id);
  const [block, suggested, price] = await Promise.all([
    rpc(c.id, 'eth_getBlockByNumber', ['latest', false]),
    rpc(c.id, 'eth_maxPriorityFeePerGas', []).catch(() => null),
    rpc(c.id, 'eth_gasPrice', [])
  ]);
  const gasPrice = BigInt(price), floor = BigInt(c.gasFloorWei || (c.feeModel === 'bsc' ? c.minPriorityFeeWei : 0) || 0);
  if (gasPrice <= 0n) throw failure('The network fee is unavailable. Try again.');
  if (block?.baseFeePerGas != null && c.feeModel !== 'bsc') {
    const base = BigInt(block.baseFeePerGas);
    const inferred = gasPrice > base ? gasPrice - base : 0n;
    let tip = suggested == null ? inferred : BigInt(suggested);
    if (inferred > tip) tip = inferred;
    if (c.minPriorityFeeWei && tip < BigInt(c.minPriorityFeeWei)) tip = BigInt(c.minPriorityFeeWei);
    let cap = base * 2n + tip;
    if (gasPrice > cap) cap = gasPrice;
    if (floor > cap) cap = floor;
    return { maxFeePerGas: hex(cap), maxPriorityFeePerGas: hex(tip) };
  }
  return { gasPrice: hex(gasPrice > floor ? gasPrice : floor) };
}
export async function guardedSend(provider, id, tx, { rpc, assert = () => {}, onStatus = () => {}, target, beforeSend = async () => {} } = {}) {
  await guardWalletChain(provider, id, { assert, onStatus, target });
  const fees = await marketFees(id, rpc); assert();
  const request = { from: tx.from, to: tx.to, data: tx.data || '0x', value: hex(tx.value || 0), chainId: chain(id).hex };
  // A failed estimate must not silently submit an unreviewed gas limit.
  const estimate = BigInt(await rpc(String(Number(id)), 'eth_estimateGas', [request])); assert();
  if (estimate <= 0n) throw failure('The network could not estimate this transaction. Try again.');
  await beforeSend(); assert();
  await assertWalletChain(provider, id, assert);
  onStatus('Confirm in your wallet…'); assert();
  return provider.request({ method: 'eth_sendTransaction', params: [{ ...request, ...fees, gas: hex((estimate * 13n + 9n) / 10n) }] });
}
