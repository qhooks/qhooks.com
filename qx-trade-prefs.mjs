// Trade confirmations, per wallet (Randall, 2026-11-04: "i had to click five times to buy something - not good").
// QHooks email/Google (Privy embedded) wallets default to ONE-CLICK: the ticket's Buy/Sell button is the confirmation.
// Every transaction of that press (fee-router setup on a fresh chain, an approval, the swap) is sent with Privy's
// screens suppressed; above capUsd the button asks once more inside the ticket ("Confirm $X"), never a pop-up.
// "popup" keeps Privy's confirm screen for every trade. External wallets always show their own prompt per transaction.
// Launches, withdrawals, claims and post-quantum key actions are never one-click.
// Shared by the account menu (qx-account-menu.mjs), the terminal ticket and the Privy bridge.
export const EMBEDDED_RDNS = 'io.qhooks.privy';
export const DEFAULT_CAP_USD = 50;
export const MAX_CAP_USD = 10000;
const key = addr => 'qhooks.trade-confirm.' + String(addr || '').toLowerCase();

export const instantCapable = entry => entry?.rdns === EMBEDDED_RDNS;
export function tradePrefs(addr) {
  let p = null;
  try { p = JSON.parse(localStorage.getItem(key(addr)) || 'null'); } catch {}
  const cap = Number(p?.capUsd);
  return { mode: p?.mode === 'popup' ? 'popup' : 'oneclick', capUsd: Number.isFinite(cap) && cap > 0 ? Math.min(cap, MAX_CAP_USD) : DEFAULT_CAP_USD };
}
export function setTradePrefs(addr, prefs) {
  const next = { ...tradePrefs(addr), ...prefs };
  next.mode = next.mode === 'popup' ? 'popup' : 'oneclick';
  next.capUsd = Math.max(1, Math.min(MAX_CAP_USD, Math.round(Number(next.capUsd) || DEFAULT_CAP_USD)));
  try { localStorage.setItem(key(addr), JSON.stringify(next)); } catch {}
  window.dispatchEvent(new CustomEvent('qhooks:trade-prefs', { detail: { address: String(addr).toLowerCase(), ...next } }));
  return next;
}
/// One-click applies: an embedded wallet that hasn't chosen pop-ups.
export const oneClick = (addr, entry) => instantCapable(entry) && tradePrefs(addr).mode === 'oneclick';
/// In one-click mode, a trade worth more than the cap (or of unknown value) needs a second, in-ticket click.
export function needsTicketConfirm(addr, usd) {
  return !(Number.isFinite(usd) && usd > 0 && usd <= tradePrefs(addr).capUsd);
}
