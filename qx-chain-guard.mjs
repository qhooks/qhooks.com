// Shared EIP-1193 boundary. No cached wallet network is trusted for signing.
import { chainById } from './chains.mjs';
const hex = n => '0x' + BigInt(n).toString(16);
const plainErrors = new WeakSet();
const failure = (message, cause) => { const e = new Error(message, cause ? {cause} : undefined); plainErrors.add(e); return e; };
const chain = id => { const c = chainById(String(Number(id))); if (!c) throw failure('This network is unavailable for trading.'); return c; };
const causes = e => { const out = [], seen = new Set(); for (let n = e; n && !seen.has(n) && out.length < 12; n = n.cause || n.error || n.data?.originalError) { seen.add(n); out.push(n); } return out; };
const hasCode = (e, code) => causes(e).some(n => Number(n.code) === code);

export function tradeError(error) {
  const home = {
    home_off: 'Home currency is switched off.',
    home_sign_in: 'Sign in with the wallet you chose for home.',
    home_recipient: 'Choose your own wallet for the transfer and refund.',
    home_asset_refreshing: 'This home asset is refreshing on this chain.',
    home_invalid_pref: 'Choose a home chain and one of its listed assets.',
    home_invalid_slippage: 'Choose a valid price tolerance.',
    home_quote_mismatch: 'Refresh the home quote to match this trade.',
    home_quote_expired: 'Refresh the home quote before buying.',
    home_refreshing: 'Home currency is refreshing.',
    home_gas_reserve: 'Keep enough ETH on the market chain for its network fee, then tap Finish buy.',
  };
  if (home[error?.code]) return home[error.code];
  if (/^relay_(timeout|refund|failure|fallback)/.test(error?.code || '')) return 'Relay is checking the transfer and any refund to your source wallet.';
  const list = causes(error), text = list.map(e => [e.message, e.shortMessage, e.details].filter(Boolean).join(' ')).join(' ');
  if (list.some(e => plainErrors.has(e))) return list.find(e => plainErrors.has(e)).message;
  if (hasCode(error, 4001) || /user rejected|user denied|declined|cancelled in your wallet/i.test(text)) return 'You declined the wallet request.';
  if (/popup.*block|pop-up.*block|user gesture|user activation|open.*wallet.*tap/i.test(text)) return 'Tap Finish buy to open your wallet again.';
  if (hasCode(error, -32002)) return 'Open your wallet to finish its waiting request.';
  if (/timed? out|timeout|taking too long/i.test(text)) return 'Your wallet or network took too long to answer. Try again.';
  if (/tip cap|gas price|fee too low|underpriced|priority fee|fee cap|maxFeePerGas|maxPriorityFeePerGas/i.test(text)) return 'The network fee was too low. Try again.';
  if (/insufficient funds|not enough balance/i.test(text)) return 'There is not enough balance for this trade and its network fee.';
  if (/revert|slippage|price moved/i.test(text)) return 'The trade could not complete at this price. Refresh the quote and try again.';
  if (/pending|already known|nonce too low/i.test(text)) return 'Check your wallet activity before trying this trade again.';
  if (/wallet.*changed|context changed|selection changed|reconnect|review again/i.test(text)) return 'Your wallet or token selection changed. Review the trade again.';
  if (/connect.*wallet|sign in/i.test(text)) return 'Connect your wallet and try again.';
  if (/no route|no quote|refreshing/i.test(text)) return 'No quote is available right now. Try again shortly.';
  if (/invalid params|invalid parameters|missing.*parameters/i.test(text)) return 'Your wallet could not read this request. Open it again and try.';
  return 'The request did not complete. Check your wallet activity and try again.';
}
export function debugTradeError(error, scope = 'trade') {
  if (globalThis.__qhooksDev === true || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(globalThis.location?.hostname || '')) globalThis.console?.debug?.('QHooks ' + scope, error);
}
export function asTradeError(error) {
  debugTradeError(error);
  const mapped = failure(tradeError(error), error);
  for (const key of ['code', 'mayHaveSubmitted', 'txHash', 'chainId']) if (error?.[key] !== undefined) mapped[key] = error[key];
  return mapped;
}
export function chainParams(id) {
  const c = chain(id);
  return { chainId: c.hex, chainName: c.name, nativeCurrency: { name: c.native, symbol: c.native, decimals: 18 }, rpcUrls: [c.rpc], blockExplorerUrls: [c.explorer] };
}
export async function assertWalletChain(provider, id, assert = () => {}) {
  await globalThis.__qhooksHomeCheck?.();
  assert(); const actual = await provider.request({ method: 'eth_chainId' }); assert();
  if (BigInt(actual) !== BigInt(chain(id).id)) throw failure('Switch to ' + chain(id).name + ' and try again.');
}
export async function guardWalletChain(provider, id, { assert = () => {}, onStatus = () => {}, target = globalThis.window, timeoutMs = 30000 } = {}) {
  const c = chain(id); assert();
  // Only network prompts time out here. A transaction request must retain its uncertain-send state.
  const prompt = async args => { let timer; try { return await Promise.race([provider.request(args), new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(Error('Wallet switch timed out'), {code: 'wallet_switch_timeout'})), timeoutMs); })]); } finally { clearTimeout(timer); } };
  const original = await provider.request({ method: 'eth_chainId' }); assert();
  if (BigInt(original) !== BigInt(c.id)) {
    onStatus('Switching your wallet to ' + c.name + '…');
    target?.dispatchEvent?.(new (target.CustomEvent || globalThis.CustomEvent)('qhooks:chain-switch', { detail: { chainId: c.id } }));
    try {
      assert();
      try { await prompt({ method: 'wallet_switchEthereumChain', params: [{ chainId: c.hex }] }); }
      catch (error) {
        if (!hasCode(error, 4902)) throw error;
        assert(); await prompt({ method: 'wallet_addEthereumChain', params: [chainParams(c.id)] });
        assert(); await prompt({ method: 'wallet_switchEthereumChain', params: [{ chainId: c.hex }] });
      }
      assert();
    } catch (error) {
      if (hasCode(error, 4001)) throw failure('You declined the switch to ' + c.name + '.', error);
      const before = chainById(String(Number(original)))?.name;
      throw failure(before ? 'Your wallet was on ' + before + '. Switch to ' + c.name + ' and try again.' : 'Switch to ' + c.name + ' and try again.', error);
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
  try { return await provider.request({ method: 'eth_sendTransaction', params: [{ ...request, ...fees, gas: hex((estimate * 13n + 9n) / 10n) }] }); }
  catch (cause) {
    // Explicitly rejected/blocked prompts cannot have sent; a transport failure after send can have.
    if (hasCode(cause, 4001) || /popup.*block|pop-up.*block|user gesture|user activation/i.test(causes(cause).map(e => e.message).join(' '))) throw cause;
    throw Object.assign(failure(tradeError(cause), cause), {mayHaveSubmitted: true});
  }
}
