// Founding Launchers Safe transactions (pure; shared by /safe-founding-fund and its tests).
//   grants: MultiSendCallOnly delegatecall: QHOOKS.approve(QGrants, total) → QGrants.grantMany(QHOOKS, rows)
//   top-up: MultiSendCallOnly delegatecall: WETH.approve(QDrops, amount) → QDrops.deposit(WETH, amount)
import {FOUNDING, QHOOKS, SAFE} from './founding-config.mjs';
import {multiSendData} from './qdrops-fund.mjs';
export const MULTISEND = '0x9641d764fc13c8b624c04430c7356c1c7c8102e2';
const W = v => BigInt(v).toString(16).padStart(64, '0'), A = a => String(a).toLowerCase().replace(/^0x/, '').padStart(64, '0');
export const SEL = {approve: '095ea7b3', grantMany: 'a210dbb2', deposit: '47e7ef24', grantsBy: 'a45c119e', get: '9507d39a', balanceOf: '70a08231'};
export function grantManyData(token, rows) {
  const body = rows.map(r => A(r.beneficiary) + W(r.amount) + W(r.start || 0) + W(r.cliff || 0) + W(r.span) + W(r.steps || 0)).join('');
  return '0x' + SEL.grantMany + A(token) + W(64) + W(rows.length) + body;
}
export function grantsTx(rows, f = FOUNDING) {
  const total = rows.reduce((t, r) => t + BigInt(r.amount), 0n);
  const calls = [[f.grant.token, '0x' + SEL.approve + A(f.grant.qgrants) + W(total)], [f.grant.qgrants, grantManyData(f.grant.token, rows)]];
  return {to: MULTISEND, value: 0, operation: 1, data: multiSendData(calls), calls, total};
}
/// Top-ups are rounded up to 0.0001 WETH so the amount (and the Safe hash) only moves when a drop list adds awards.
export const roundUp = v => { const q = 10n ** 14n, x = BigInt(v); return (x + q - 1n) / q * q; };
export function topUpTx(amount, f = FOUNDING) {
  const a = roundUp(amount), calls = [[f.pay.token, '0x' + SEL.approve + A(f.pay.drops) + W(a)], [f.pay.drops, '0x' + SEL.deposit + A(f.pay.token) + W(a)]];
  return {to: MULTISEND, value: 0, operation: 1, data: multiSendData(calls), calls, amount: a};
}
/// QGrants.get(id) is a static 10-word tuple: token, start, cliff, grantor, span, steps, revoked, recipient, total, claimed.
export function decodeGrant(h) {
  const s = String(h).replace(/^0x/, ''), w = i => s.slice(i * 64, (i + 1) * 64), a = i => '0x' + w(i).slice(24);
  return {token: a(0), grantor: a(3), revoked: BigInt('0x' + w(6)) !== 0n, recipient: a(7), total: BigInt('0x' + w(8))};
}
/// Creators who already have a founding grant from the Safe (revoked ones included: never granted twice).
export const grantedSet = (grants, f = FOUNDING) => new Set(grants.filter(g => g.token === f.grant.token && g.grantor === f.grant.grantor && g.total > 0n).map(g => g.recipient));
export {QHOOKS, SAFE};
/// The top-up amount field (main thread 2026-11-12: prefilled 0.05 WETH). Plain decimal WETH → wei; null when not a number.
export const DEFAULT_WETH = '0.05';
export function parseWeth(text) {
  const m = /^\s*(\d{0,3})(?:\.(\d{0,18}))?\s*$/.exec(String(text ?? ''));
  if (!m || (!m[1] && !m[2])) return null;
  return BigInt(m[1] || '0') * 10n ** 18n + BigInt((m[2] || '').padEnd(18, '0'));
}
