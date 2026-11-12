// Official-pool warning text, shared by the site and @qhooks_bot (2026-11-08). Third parties create other v4 pools for
// QHooks launch tokens (QHOOKS: hookless pools at 20–87% LP fees) that wallets and outside apps may route through.
export const feePctOf = name => { const m = /(\d+(?:\.\d+)?)%\s*$/.exec(String(name || '')); return m ? Number(m[1]) : null; };
export function feeRange(pools = []) {
  const fees = pools.map(p => p.feePct).filter(v => Number.isFinite(v));
  return fees.length ? [Math.min(...fees), Math.max(...fees)] : null;
}
const pct = v => (Math.round(v * 100) / 100).toString() + '%';
/// "Only trade QHOOKS through qhooks.com or the official pool 0x…. Other QHOOKS pools were created by third parties with 20–87% fees."
export function warningText(symbol, officialPool, range, {unknown = false} = {}) {
  const s = String(symbol || 'this token');
  if (unknown) return 'Only trade ' + s + ' through qhooks.com or the official pool ' + officialPool + '. Other ' + s + ' pools may exist with very high fees.';
  const fees = !range ? '' : range[0] === range[1] ? ' with a ' + pct(range[0]) + ' fee' : ' with ' + (Math.round(range[0] * 100) / 100) + '–' + pct(range[1]) + ' fees';
  return 'Only trade ' + s + ' through qhooks.com or the official pool ' + officialPool + '. Other ' + s + ' pools were created by third parties' + fees + '.';
}
export const unofficialTag = p => 'Unofficial' + (Number.isFinite(p?.feePct) ? ' · ' + pct(p.feePct) : '');
/// Site-only trap line (2026-11-12) for third-party pools whose fee is over 10%: what a trade there loses.
export const TRAP_PCT = 10;
export function trapText(pools = []) {
  const bad = pools.map(p => p?.feePct).filter(v => Number.isFinite(v) && v > TRAP_PCT);
  if (!bad.length) return '';
  const top = Math.max(...bad), n = bad.length;
  return n + (n === 1 ? ' pool charges' : ' pools charge') + ' more than ' + TRAP_PCT + '% per trade (up to ' + pct(top) + '). A swap routed there loses that share of every trade.';
}
export const trapTag = p => Number.isFinite(p?.feePct) && p.feePct > TRAP_PCT ? 'Trap · ' + pct(p.feePct) : unofficialTag(p);
