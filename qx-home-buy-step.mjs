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
export function rememberHomeBuy(owner, pending, store = storage()) {
  const record = {...pending, owner, version: 1};
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
