import {homeToken, homeSlippage, homeReturnNeeded, homeBuyPath, homeFailure, sameWallet} from './qx-home-core.mjs';
import {homeFetch, assertHomeOn, rememberHomeTransfer, withHomeRails} from './qx-home-currency.mjs';
import {requestFunding, runCrossChainBuy, readAssetBalance} from './qx-xchain.mjs';
import {execute, summarize} from './qx-relay.mjs';
import {assertSelfQuote, formatAmount} from './qx-move-funds.mjs';
export function homeCostLine(quote, {lpBps = null} = {}) {
  const s = summarize(quote), fee = s.feeTotalUsd;
  const input = quote.details?.currencyIn, amount = input?.amountFormatted || (input?.amount && Number.isInteger(input?.currency?.decimals) ? formatAmount(input.amount, input.currency.decimals) : 'Refreshing');
  return 'All-in: ' + amount + ' ' + (input?.currency?.symbol || '') + ' · Relay ' + (fee === null ? 'Refreshing' : '$' + fee) + ' + 1% QHooks + LP ' + (Number.isFinite(lpBps) ? lpBps / 100 + '%' : 'included in swap quote') + ' · ETA ' + (s.timeSeconds === null ? 'Refreshing' : s.timeSeconds + ' s');
}
export async function quoteHomeBuy({owner, pref, chainId, asset, amountNeeded, estimatedGasCost, slippageBps, instant = false, data}, {fetchImpl = globalThis.fetch, readBalance = readAssetBalance, request = requestFunding} = {}) {
  await assertHomeOn(fetchImpl);
  const from = homeToken(pref), slippageTolerance = String(homeSlippage(slippageBps));
  if (Number(chainId) === pref.chainId) return {path: 'native'};
  const path = homeBuyPath(instant && !!data);
  const relayQuote = async params => (await homeFetch(owner, '/api/relay/' + (path === 'instant' ? 'xbuy' : 'quote'), {method: 'POST', body: JSON.stringify({...params, homeCurrency: true, user: owner, recipient: owner, refundTo: owner, slippageTolerance})}, fetchImpl)).json();
  let q;
  if (path === 'instant') q = await relayQuote({originChainId: pref.chainId, destinationChainId: Number(chainId), originCurrency: from.address, amount: String(amountNeeded), data});
  else {
    from.balance = await readBalance(owner, {chainId: from.chainId, asset: from});
    // Keep gas for the buy and the enabled sell/return flow in the user's market wallet.
    const gasReserve = estimatedGasCost == null ? undefined : BigInt(estimatedGasCost) * (pref.sellsGoHome ? 2n : 1n);
    q = await request({owner, from, to: {chainId: Number(chainId), asset}, amountNeeded, estimatedGasCost: gasReserve}, {quote: relayQuote, readBalance});
  }
  assertSelfQuote(q, owner);
  if (path === 'instant' && (Number(q.details?.currencyIn?.currency?.chainId) !== pref.chainId || !sameWallet(q.details?.currencyIn?.currency?.address, from.address) || Number(q.details?.currencyOut?.currency?.chainId) !== Number(chainId) || !sameWallet(q.details?.currencyOut?.currency?.address, '0x' + '0'.repeat(40)) || BigInt(q.details?.currencyOut?.amount || 0) !== BigInt(amountNeeded))) throw homeFailure('home_quote_mismatch');
  return {...q, home: {path, owner, pref, slippageBps: Number(slippageTolerance), quotedAt: Date.now()}};
}
export async function executeHomeBuy({quote, wallet, swap, onStep, currentOwner = () => wallet.address}, {fetchImpl = globalThis.fetch, runX1 = runCrossChainBuy, executeRelay = execute, readBalance} = {}) {
  const context = quote.home; if (!context || !sameWallet(context.owner, wallet.address)) throw homeFailure('home_sign_in');
  if (Date.now() - context.quotedAt > 30000) throw homeFailure('home_quote_expired');
  return withHomeRails(context.owner, async () => {
    let settlement;
    const relay = async (q,w,o) => {const result = await executeRelay(q,w,{...o,fetchImpl}); settlement = result; return result;};
    try {
      const result = context.path === 'instant' ? await relay(quote, wallet, {fetchImpl, onUpdate: onStep}) : await runX1({quote, wallet, swap: async a => { await assertHomeOn(fetchImpl); return swap(a); }, readBalance, execute: relay, onStep});
      if (result.landed && !result.completed) rememberHomeTransfer(context.owner, {...result, amountText: formatAmount(result.amount, result.asset.decimals), symbol: result.asset.symbol, address: result.asset.address});
      return result;
    } catch (e) { if (e.requestId || settlement?.requestId) rememberHomeTransfer(context.owner, {requestId: e.requestId || settlement.requestId, status: 'pending', needsSwap: context.path === 'x1', chainId: quote.funding?.to.chainId, asset: quote.funding?.to.asset}); throw e; }
  }, {fetchImpl, currentOwner});
}
export async function settleHome({owner, pref, chainId, asset, amount, slippageBps, wallet}, {fetchImpl = globalThis.fetch, quote: getQuote, executeRelay = execute} = {}) {
  if (!homeReturnNeeded(chainId, pref)) return {skipped: true};
  try { return await withHomeRails(owner, async () => {
    if (!sameWallet(owner, wallet.address)) throw homeFailure('home_sign_in');
    const destination = homeToken(pref);
    const params = {homeCurrency: true, user: owner, recipient: owner, refundTo: owner, originChainId: Number(chainId), destinationChainId: pref.chainId, originCurrency: asset.address, destinationCurrency: destination.address, amount: String(amount), tradeType: 'EXACT_INPUT', slippageTolerance: String(homeSlippage(slippageBps))};
    const q = getQuote ? await getQuote(params) : await (await homeFetch(owner, '/api/relay/quote', {method: 'POST', body: JSON.stringify(params)}, fetchImpl)).json();
    assertSelfQuote(q, owner, {from: {...asset, chainId: Number(chainId)}, to: destination, amount});
    const result = await executeRelay(q, wallet, {fetchImpl}); rememberHomeTransfer(owner, result); return result;
  }, {fetchImpl}); }
  catch (e) {
    rememberHomeTransfer(owner, {requestId: e.requestId, status: e.code === 'relay_refunded' ? 'refunded' : 'pending', landed: !e.requestId && !e.mayHaveSubmitted, completed: false, chainId, amountText: formatAmount(amount, asset.decimals), symbol: asset.symbol, address: asset.address});
    throw e;
  }
}
