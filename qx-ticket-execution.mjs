// Execution shared by the visible ticket and its local fork regression runner.
// Quotes, minimum received and the fee-router route come from the reviewed ticket.
import { send, ensureAllowance } from './qx-chain.mjs';
import { feeSwapCall, nativeHops, assertHookReferralsCurrent } from './qx-swap.mjs';
export async function executeTicketSwap({ chainId, key, token, quote, nativePool, router, trade, deadline, onStatus, assertContext = () => {} }) {
  const c = trade; assertContext();
  const hops=c.side==='buy'&&c.payAsset?c.route.hops:c.side==='buy'&&nativePool?[{key,zeroForOne:BigInt(key.currency0)===0n}]:c.side==='buy'&&c.pay==='native'?nativeHops(chainId,key,quote,c.route).hops:[{key,zeroForOne:key.currency0===(c.side==='buy'?quote:token)}];
  // Selected partner contexts are rechecked before an allowance can open.
  await assertHookReferralsCurrent(chainId,hops);assertContext();
  let tx;
  if (c.side === 'buy' && c.payAsset) {
    await ensureAllowance(chainId,c.payAsset.address,router,c.a,onStatus,assertContext); assertContext();
    await assertHookReferralsCurrent(chainId,hops);assertContext();
    tx = {to:router,data:feeSwapCall(chainId,c.route.hops,c.a,c.minOut,null,true,deadline)};
  } else if (c.side === 'buy' && nativePool) {
    tx = { to: router, data: feeSwapCall(chainId, [{ key, zeroForOne: BigInt(key.currency0) === 0n }], c.a, c.minOut, null, true, deadline), value: c.a };
  } else if (c.side === 'buy' && c.pay === 'native') {
    const { hops, wrap } = nativeHops(chainId, key, quote, c.route);
    tx = { to: router, data: feeSwapCall(chainId, hops, c.a, c.minOut, wrap, true, deadline), value: c.a };
  } else {
    const tokenIn = c.side === 'buy' ? quote : token;
    await ensureAllowance(chainId, tokenIn, router, c.a, onStatus, assertContext); assertContext();
    await assertHookReferralsCurrent(chainId,hops);assertContext();
    tx = { to: router, data: feeSwapCall(chainId, [{ key, zeroForOne: key.currency0 === tokenIn }], c.a, c.minOut, null, c.side === 'buy', deadline) };
  }
  assertContext();
  return send(chainId, tx, onStatus, assertContext);
}
