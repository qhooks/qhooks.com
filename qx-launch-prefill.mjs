// Shared launch-link validation for Telegram, agents and the browser.
import {visibleChains} from './chains.mjs';
import {ideaCards,ideaCard} from './qx-quick-launch-core.mjs';

export const launchChains = () => visibleChains(false).filter(c => ideaCards(c.id).length);
export function launchChain(value) {
  const chains = launchChains();
  if (value === undefined || value === null || value === '') return chains.find(c => c.id === '4663') || chains.find(c => c.id === '8453') || null;
  const s = String(value).trim().toLowerCase();
  return chains.find(c => c.id === s || c.key.toLowerCase() === s || c.name.toLowerCase() === s) || null;
}
export function launchName(value) {
  if (typeof value !== 'string' || /[\p{C}<>\u2028\u2029]/u.test(value)) throw new TypeError('Use 1–32 printable characters for the name, without angle brackets.');
  const name = value.trim();
  if (!name || Array.from(name).length > 32) throw new TypeError('Use 1–32 printable characters for the name, without angle brackets.');
  return name;
}
export function launchTicker(value) {
  if (typeof value !== 'string') throw new TypeError('Use 1–10 letters or digits for the ticker.');
  const raw = value.trim(), ticker = raw.toUpperCase();
  if (!/^[A-Za-z0-9]{1,10}$/.test(raw)) throw new TypeError('Use 1–10 letters or digits for the ticker.');
  return ticker;
}
export function normalizeLaunch({name,ticker,chain,style = 'fair'} = {}) {
  const c = launchChain(chain);
  if (!c) throw new TypeError('Choose a supported one-tap launch chain.');
  const card = ideaCard(c.id,style);
  if (!card) throw new TypeError('Choose a launch idea from the one-tap cards.');
  return {name:launchName(name),ticker:launchTicker(ticker),chain:c.id,style:card.id,chainName:c.name,styleLabel:card.name};
}
export function launchLink(input) {
  const v = normalizeLaunch(input);
  return 'https://qhooks.com/create?chain=' + encodeURIComponent(v.chain) + '&name=' + encodeURIComponent(v.name) + '&ticker=' + encodeURIComponent(v.ticker) + '#quick-' + encodeURIComponent(v.style);
}
// Invalid external text is left blank so the person can enter it before review.
export function sanitizePrefill({name,ticker} = {}) {
  const clean = (value,validate) => { if (value === undefined || value === null) return undefined; try { return validate(value); } catch { return ''; } };
  return {name:clean(name,launchName),ticker:clean(ticker,launchTicker)};
}
export function readLaunchPrefill(loc = globalThis.location) {
  const params = new URLSearchParams(loc?.search || '');
  if (!params.has('name') && !params.has('ticker')) return null;
  const fields = sanitizePrefill({name:params.has('name') ? params.get('name') : undefined,ticker:params.has('ticker') ? params.get('ticker') : undefined});
  const c = launchChain(params.get('chain')) || launchChain();
  const hash = /^#quick(?:-([a-z-]+))?$/.exec(loc?.hash || '');
  const style = hash?.[1] && ideaCard(c?.id,hash[1]) ? hash[1] : 'fair';
  return {...fields,chain:c?.id,style};
}
// Free "launch by post" on X: after a launch confirms, the creator posts the trade link from their own account.
// No X API: this only opens X's compose screen with the text filled in.
export function launchPostLink({name,ticker,chainName,chainId,token} = {}) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(token || '')) || !/^[0-9]+$/.test(String(chainId || ''))) return null;
  let label = '';
  try { label = launchName(name) + ' $' + launchTicker(ticker); } catch { label = 'My token'; }
  const text = label + ' is live on QHooks' + (chainName ? ' (' + String(chainName).replace(/[\p{C}<>]/gu, '') + ')' : '') + '.';
  const url = 'https://qhooks.com/l/' + chainId + '/' + String(token).toLowerCase();
  return 'https://x.com/intent/post?text=' + encodeURIComponent(text) + '&url=' + encodeURIComponent(url);
}
