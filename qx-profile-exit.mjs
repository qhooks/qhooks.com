// Profile TP/SL after a buy (ordersready, 2026-11-13). A saved profile can ask the terminal to set its take-profit and stop
// on what each buy just bought. The exit is the current signed-order bracket (qx-pro-orders.mjs placeBracket): two sells on
// ONE Permit2 nonce, filled by the QHooks keeper through QOrderExecutor 0x5500…2500, so whichever fills first makes the
// other unfillable (no double sell). Nothing is placed without the trader's signature. Pure helpers; no DOM, no network.
export const EXIT_CHAINS = Object.freeze(['4663', '8453', '42161', '56', '99901', '1']); // = server/order-keeper.mjs ORDER_CHAINS
const CONSENT_KEY = 'qhooks:exit-after-buy:v2';
// A separate opt-in, so an "auto" flag saved by the retired QTriggerOrders panel never starts asking for signatures by itself.
export function consentRead(storage, chain) { try { return (JSON.parse(storage?.getItem(CONSENT_KEY) || '{}') || {})[String(chain)] === true; } catch { return false; } }
export function consentWrite(storage, chain, on) {
  let m = {}; try { m = JSON.parse(storage?.getItem(CONSENT_KEY) || '{}') || {}; } catch {}
  if (on) m[String(chain)] = true; else delete m[String(chain)];
  try { storage?.setItem(CONSENT_KEY, JSON.stringify(m)); } catch {}
}
const plain = v => { if (!Number.isFinite(v) || v <= 0) return ''; const s = v.toPrecision(6); return s.includes('e') ? v.toFixed(18).replace(/0+$/, '') : String(Number(s)); };
/// The bracket a profile asks for at `price` (quote per token), or null when it asks for none here.
export function exitPlan({ exit, consent, chainId, price, days = 7 }) {
  if (!consent || exit?.autoAfterBuy !== true || !EXIT_CHAINS.includes(String(chainId)) || !(price > 0)) return null;
  const tpPct = Number(exit.takeProfitPct) || 0, slPct = Number(exit.stopLossPct) || 0;
  const tp = tpPct > 0 ? plain(price * (1 + tpPct / 100)) : '', sl = slPct > 0 && slPct < 100 ? plain(price * (1 - slPct / 100)) : '';
  if (!tp && !sl) return null;
  const floorPct = Number(exit.minimumBps) / 100;
  return { tp, sl, floorPct: floorPct > 0 && floorPct <= 50 ? floorPct : 10, days };
}
