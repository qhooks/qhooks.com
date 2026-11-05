// One-click trades: the shared switch between a trade press and the Privy bridge.
// A trade flow (terminal ticket, quick buy, cross-chain buy) wraps its whole press in withOneClick(); while it runs,
// the Privy bridge (privy/entry.js) sends eth_sendTransaction and signTypedData without Privy's confirm or
// "All Done" screens. Outside a press, or for external wallets, or when the wallet chose "Ask in a pop-up", nothing
// changes: wallets prompt as usual and we never add a step of our own.
// Launches, withdrawals, claims and post-quantum key actions must NOT be wrapped.
//
// Usage (callers):  import { oneClickPlan, withOneClick } from '/qx-instant-bridge.mjs';
//   const plan = oneClickPlan(address, walletEntry, usd);   // { silent, ticketConfirm, capUsd }
//   if (plan.ticketConfirm) { …second, in-ticket click "Confirm $X"… }
//   await withOneClick(plan, async () => { …setup if needed, approve if needed, swap… });
// Bridge side:      globalThis.__qhooksSilent?.active() → true while a one-click press is running.
import { oneClick, needsTicketConfirm, tradePrefs } from './qx-trade-prefs.mjs';

const MAX_PRESS_MS = 180000; // a press that hangs can never leave silent sends switched on (setup + approve + swap fit well inside)
let depth = 0, until = 0;
const state = globalThis.__qhooksSilent ||= { active: () => depth > 0 && Date.now() < until };

/// What a trade press for `usd` should do for this wallet.
export function oneClickPlan(address, entry, usd) {
  const silent = !!address && oneClick(address, entry);
  return { silent, ticketConfirm: silent && needsTicketConfirm(address, usd), capUsd: address ? tradePrefs(address).capUsd : null };
}
export function pressGate({ plan, armedAt, now }) {
  return plan?.ticketConfirm && !(Number.isFinite(armedAt) && now >= armedAt && now - armedAt < 15000) ? 'arm' : 'send';
}
/// Runs one trade press. With plan.silent, every wallet request made during `fn` skips Privy's screens.
export async function withOneClick(plan, fn) {
  if (!plan?.silent) return fn();
  depth++; until = Date.now() + MAX_PRESS_MS;
  try { return await fn(); } finally { depth = Math.max(0, depth - 1); }
}
export const silentActive = () => state.active();
