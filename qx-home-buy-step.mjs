// A delivered Home buy belongs to this wallet until completed or explicitly dismissed.
// Persist market inputs and raw amounts, never a signed transaction or an expiring quote.
import {sameWallet, homeFailure, HOME_CHAINS, ZERO} from './qx-home-core.mjs';
import {withHomeRails, rememberHomeTransfer} from './qx-home-currency.mjs';
import {chainById} from './chains.mjs';
import {tradeError, debugTradeError} from './qx-chain-guard.mjs';
const storage = () => {try {return globalThis.localStorage;} catch {return null;}};
const key = owner => 'qhooks:home:buy:v1:' + owner.toLowerCase();
const min = (a, b) => a < b ? a : b;
const inFlight = new Set();
export const HOME_BUY_OFFER_MAX_AGE_MS = 30 * 60 * 1000;
const address = value => typeof value === 'string' && /^0x[0-9a-f]{40}$/i.test(value) ? value.toLowerCase() : null;
const chainIdOf = value => {
  if (typeof value !== 'number' && !(typeof value === 'string' && /^(?:[1-9][0-9]*|0x[0-9a-f]+)$/i.test(value))) return null;
  const id = Number(value); return Number.isSafeInteger(id) && HOME_CHAINS.includes(id) ? id : null;
};
const safeDate = value => {
  if (typeof value !== 'number' && !(typeof value === 'string' && /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value))) return null;
  const at = typeof value === 'number' ? value : Date.parse(value);
  return Number.isSafeInteger(at) && at > 0 && at <= 8640000000000000 ? at : null;
};
const clockOf = now => { try { return safeDate(typeof now === 'function' ? now() : now); } catch { return null; } };
const positiveAmount = value => { try { return (typeof value === 'string' && /^(?:0|[1-9][0-9]{0,77})$/.test(value) || typeof value === 'bigint' || typeof value === 'number' && Number.isSafeInteger(value)) && BigInt(value) > 0n && BigInt(value) < 2n ** 256n; } catch { return false; } };
// Age is an offer label, never permission to discard delivered funds or uncertain receipts.
export function pendingHomeBuyAge(pending, {now = Date.now, maxAgeMs = HOME_BUY_OFFER_MAX_AGE_MS} = {}) {
  const stamp = clockOf(now), createdAt = safeDate(pending?.createdAt), updatedAt = safeDate(pending?.updatedAt);
  const legacy = createdAt === null, ageMs = stamp !== null && createdAt !== null && stamp >= createdAt ? stamp - createdAt : null;
  const limit = Number.isSafeInteger(maxAgeMs) && maxAgeMs >= 0 ? maxAgeMs : null;
  const aged = ageMs !== null && limit !== null && ageMs >= limit;
  const unsigned = pending?.stage === 'pre-sign' && pending.funded !== true && pending.landed !== true && pending.retryable !== false && !pending.mayHaveSubmitted && !pending.receipt && !pending.transactionHash && !pending.txHash && !pending.requestId;
  const invalidClock = stamp === null || createdAt !== null && stamp < createdAt || limit === null;
  return {createdAt, updatedAt, ageMs, legacy, aged, expired: unsigned && !legacy && (aged || invalidClock)};
}
export function pendingHomeBuyMatches(pending, {owner, chainId, token} = {}, options = {}) {
  const wallet = address(owner), target = address(token), chain = chainIdOf(chainId), state = pending?.market?.state;
  if (!wallet || wallet === ZERO || !target || target === ZERO || chain === null || !pending || pending.version !== 1 || address(pending.owner) !== wallet || chainIdOf(pending.chainId) !== chain || !address(pending.asset?.address) || !positiveAmount(pending.amount) || !positiveAmount(pending.amountNeeded) || !state || state.sol || chainIdOf(state.chainId) !== chain || address(state.token) !== target) return false;
  if (pending.asset.chainId !== undefined && chainIdOf(pending.asset.chainId) !== chain) return false;
  if (pending.market.chainId !== undefined && chainIdOf(pending.market.chainId) !== chain) return false;
  const marketChain = pending.market.chain;
  if (marketChain !== undefined && chainIdOf(typeof marketChain === 'object' && marketChain !== null ? marketChain.chainId ?? marketChain.id : marketChain) !== chain) return false;
  return !pendingHomeBuyAge(pending, options).expired;
}
export function rememberHomeBuy(owner, pending, store = storage(), {now = Date.now} = {}) {
  const stamp = clockOf(now) ?? Date.now(); let prior = null;
  try { prior = JSON.parse(store?.getItem(key(owner)) || 'null'); } catch {}
  const sameTarget = prior?.version === 1 && sameWallet(prior.owner, owner) && chainIdOf(prior.chainId) === chainIdOf(pending.chainId) && address(prior.market?.state?.token) !== null && address(prior.market.state.token) === address(pending.market?.state?.token);
  const validCreated = value => { const at = safeDate(value); return at !== null && at <= stamp; };
  const original = sameTarget && validCreated(prior.createdAt) ? prior.createdAt : validCreated(pending.createdAt) ? pending.createdAt : null;
  const legacy = sameTarget && !validCreated(prior.createdAt) || pending.version === 1 && sameWallet(pending.owner, owner) && !validCreated(pending.createdAt);
  const record = {...pending, owner, version: 1, createdAt: original ?? (legacy ? null : stamp), updatedAt: stamp};
  try {store?.setItem(key(owner), JSON.stringify(record, (_, v) => typeof v === 'bigint' ? String(v) : v));} catch {}
  return record;
}
export function pendingHomeBuy(owner, store = storage()) {
  try {
    const p = JSON.parse(store?.getItem(key(owner)) || 'null');
    return p?.version === 1 && sameWallet(p.owner, owner) && HOME_CHAINS.includes(Number(p.chainId)) &&
      /^0x[0-9a-f]{40}$/i.test(p.asset?.address || '') && BigInt(p.amount) > 0n && BigInt(p.amountNeeded) > 0n ? p : null;
  } catch {return null;}
}
export function dismissHomeBuy(owner, store = storage()) {try {store?.removeItem(key(owner));} catch {}}
export function homeBuyNotice(pending) {
  return 'Your ' + pending.asset.symbol + ' is on ' + chainById(pending.chainId).name +
    (pending.retryable === false ? '. Check the pending buy in your wallet.' : '. Tap Finish buy.');
}
export function homeBuyRecoveryView(h, pending, {finish, dismiss, moveBack} = {}) {
  const finishButton = h('button', {type: 'button', class: 'qhome-finish', disabled: pending.retryable === false}, 'Finish buy');
  finishButton.addEventListener('click', finish);
  const dismissButton = h('button', {type: 'button', class: 'qxt-mini'}, 'Dismiss');
  dismissButton.addEventListener('click', dismiss);
  const controls = [finishButton];
  if (moveBack) {const back = h('button', {type: 'button', class: 'qxt-mini', disabled: pending.retryable === false}, 'Move back'); back.addEventListener('click', moveBack); controls.push(back);}
  controls.push(dismissButton);
  return h('div', {class: 'qxc-recovery qhome-buy-recovery', role: 'status'}, h('p', {}, homeBuyNotice(pending)), ...controls);
}
export async function finishHomeBuy({pending, wallet, swap, onStep = () => {}, currentOwner = () => wallet.address}, {
  fetchImpl = globalThis.fetch, readBalance, estimateCosts, store = storage(),
} = {}) {
  const owner = pending?.owner;
  if (!sameWallet(owner, wallet.address) || !sameWallet(currentOwner(), owner)) throw homeFailure('home_sign_in');
  if (pending.retryable === false || inFlight.has(owner.toLowerCase())) throw Object.assign(Error('Check the pending buy in your wallet.'), {code: 'swap_pending'});
  inFlight.add(owner.toLowerCase());
  let latest = pending;
  try {
    // relayWallet.switchChain awaits the shared chain guard, including its verified chain read.
    await wallet.switchChain(Number(pending.chainId));
    return await withHomeRails(owner, async () => {
      if (!readBalance || !estimateCosts) {const adapters = await import('./qx-xchain.mjs'); readBalance ||= adapters.readAssetBalance; estimateCosts ||= adapters.destinationCosts;}
      if (!sameWallet(currentOwner(), owner)) throw homeFailure('home_sign_in');
      const balance = BigInt(await readBalance(owner, {chainId: Number(pending.chainId), asset: pending.asset}));
      const costs = await estimateCosts({owner, chainId: Number(pending.chainId), asset: pending.asset,
        amountNeeded: pending.amountNeeded, spender: pending.spender || ZERO, setup: pending.setup || 0});
      const reserve = BigInt(costs.estimatedGasCost) * BigInt(pending.reserveMultiplier || 1);
      if (reserve <= 0n) throw homeFailure('home_gas_reserve');
      const available = pending.asset.native ? min(balance, BigInt(pending.amount)) - reserve : balance;
      if (!pending.asset.native) {
        const nativeBalance = BigInt(await readBalance(owner, {chainId: Number(pending.chainId), asset: {address: ZERO, native: true, symbol: 'ETH', decimals: 18}}));
        if (nativeBalance < reserve) throw homeFailure('home_gas_reserve');
      }
      // Existing destination funds are never added to the authorized token purchase.
      const amount = min(available, min(BigInt(pending.amount), BigInt(pending.amountNeeded)));
      if (amount <= 0n) throw homeFailure('home_gas_reserve');
      latest = rememberHomeBuy(owner, {...pending, reserve: String(reserve), spendAmount: String(amount), retryable: false}, store);
      onStep({step: 'swap', message: '2/2 · Refreshing the buy quote…', amount});
      // The ticket rebuilds every route/minimum/deadline here, after switching and sizing.
      const receipt = await swap(amount);
      dismissHomeBuy(owner, store);
      rememberHomeTransfer(owner, {landed: true, completed: true, status: 'success'}, store);
      return {landed: true, completed: true, chainId: Number(pending.chainId), asset: pending.asset, amount: BigInt(pending.amount), spent: amount, receipt};
    }, {fetchImpl, currentOwner});
  } catch (error) {
    debugTradeError(error, 'Home step 2');
    rememberHomeBuy(owner, {...latest, error: tradeError(error), retryable: !error?.mayHaveSubmitted && !/pending|receipt_unknown|send_unknown/.test(String(error?.code || '') + ' ' + String(error?.message || '').toLowerCase())}, store);
    throw error;
  } finally {inFlight.delete(owner.toLowerCase());}
}
