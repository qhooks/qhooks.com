// Shared preference and routing rules for the terminal and Telegram.
import {chainById} from './chains.mjs';
export const HOME_CHAINS = Object.freeze([8453, 1, 42161, 56, 4663, 99901]);
export const DEFAULT_HOME = Object.freeze({chainId: 8453, asset: 'ETH', sellsGoHome: true});
export const ZERO = '0x' + '0'.repeat(40);
export const homeFailure = code => Object.assign(new Error(code), {code});
export const sameWallet = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
export function homeAssets(chainId) {
  const id = Number(chainId); if (!HOME_CHAINS.includes(id)) return [];
  const c = chainById(id), usdc = c.usdc || (id === 56 ? '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d' : null);
  return [
    {chainId: id, address: ZERO, symbol: c.native, decimals: 18, native: true, stable: false},
    ...(usdc ? [{chainId: id, address: usdc, symbol: 'USDC', decimals: id === 56 ? 18 : 6, native: false, stable: true}] : []),
  ];
}
export function homePref(value = DEFAULT_HOME) {
  const chainId = Number(value.chainId), asset = value.asset;
  if (!HOME_CHAINS.includes(chainId) || !homeAssets(chainId).some(token => token.symbol === asset) || (value.sellsGoHome !== undefined && typeof value.sellsGoHome !== 'boolean')) throw homeFailure('home_invalid_pref');
  return {chainId, asset, sellsGoHome: value.sellsGoHome !== false};
}
export function restoreHomePref(value) {try {return homePref(value);} catch {return {...DEFAULT_HOME};}}
export const homeName = pref => chainById(homePref(pref).chainId).name + ' ' + pref.asset;
export const homeKey = owner => 'qhooks:home:v1:' + (/^0x[0-9a-f]{40}$/i.test(owner || '') ? owner.toLowerCase() : 'signed-out');
const localStore = () => {try {return globalThis.localStorage;} catch {return null;}};
export function loadLocalHome(owner, storage = localStore()) {
  try { return restoreHomePref(JSON.parse(storage?.getItem(homeKey(owner)) || 'null')); } catch { return {...DEFAULT_HOME}; }
}
export function saveLocalHome(owner, value, storage = localStore()) {
  const pref = homePref(value); try { storage?.setItem(homeKey(owner), JSON.stringify(pref)); } catch {} return pref;
}
export function homeToken(value) {
  const pref = homePref(value);
  return homeAssets(pref.chainId).find(token => token.symbol === pref.asset);
}
export function homeSlippage(value) {
  const n = Number(value); if (!Number.isInteger(n) || n < 1 || n > 10000) throw homeFailure('home_invalid_slippage');
  return Math.min(n, 1000);
}
export function homeTicketDefault(chainId, pref = DEFAULT_HOME, enabled = true) {
  return enabled && HOME_CHAINS.includes(Number(chainId)) && Number(chainId) !== homePref(pref).chainId ? 'home' : 'native';
}
export function homeBuyPath(instant) { return instant === true ? 'instant' : 'x1'; }
export function homeReturnNeeded(chainId, pref, enabled = true) {
  const p = homePref(pref);
  return enabled && p.sellsGoHome && HOME_CHAINS.includes(Number(chainId)) && Number(chainId) !== p.chainId;
}
export function validateHomeRelay(body, owner, enabled = true) {
  if (!enabled) throw homeFailure('home_off');
  if (!/^0x[0-9a-f]{40}$/i.test(owner || '') || sameWallet(owner, ZERO)) throw homeFailure('home_sign_in');
  if (!sameWallet(body.user, owner) || !sameWallet(body.recipient, owner) || !sameWallet(body.refundTo, owner)) throw homeFailure('home_recipient');
  if (!HOME_CHAINS.includes(Number(body.originChainId)) || !HOME_CHAINS.includes(Number(body.destinationChainId))) throw homeFailure('home_invalid_pref');
  if (body.slippageTolerance === undefined) throw homeFailure('home_invalid_slippage');
  return {...body, user: owner, recipient: owner, refundTo: owner, slippageTolerance: String(homeSlippage(body.slippageTolerance))};
}
export function homePanelLine(result) {
  if (result?.landed && !result.completed) return `${result.amountText} ${result.symbol} on ${chainById(result.chainId)?.name || 'the market chain'} · Move home`;
  if (result?.status === 'refunded') return 'Refunded to your source wallet';
  if (result?.status === 'success') return 'Home transfer complete';
  if (['failure', 'fallback'].includes(result?.status)) return 'Check the transfer and refund in your source wallet.';
  return 'Refreshing transfer status';
}
