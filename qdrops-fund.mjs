// Weekly drop funding from the community-rewards lock (2026-11-09; Randall approved 250,000 QHOOKS a week).
// QLocks v1 lock 4 (30M QHOOKS, drips over 720 days from Nov 8 2026, about 291,667 a week; beneficiary the QHooks
// Safe; 7-day public notice; an announcement must be used within 7 days of becoming ready).
// The cycle is one Safe transaction a week:
//   first time (or after an announcement expired): announce(4, 250,000)
//   each week after: delegatecall MultiSendCallOnly 1.4.1 with four calls, all from the Safe:
//     withdraw(4) → QHOOKS.approve(QDrops, A) → QDrops.deposit(QHOOKS, A) → announce(4, 250,000)
//   where A is the amount announced. That last call starts next week's 7-day notice in the same transaction.
// Every value is read from the chain or fixed here, so both owners' pages build byte-identical transactions and the
// approve-then-execute hash matches. Pure: no DOM, no network. Shared by /safe-drops-fund and its tests.
export const FUND = {
  chain: '4663',
  safe: '0x2b1cf7c4071a98a59709166dfa73c7acb7e83e71',
  qlocks: '0xd921e59e25f6bc283d60ec92799dc35fc40ce02a',
  lockId: 4,
  qhooks: '0x20429af7ca3b0ce4d99edbaa0693f26c5df05195',
  drops: '0x89eb481a2ea221e62647c113c88de67e7b9a5a70',
  multisend: '0x9641d764fc13c8b624c04430c7356c1c7c8102e2', // MultiSendCallOnly 1.4.1
  weekly: (250000n * 10n ** 18n).toString(),
  window: 7 * 86400, // QLocks v1 WINDOW: an announcement can be used for 7 days after it is ready
};
const hex = s => String(s).replace(/^0x/, '');
const W = v => BigInt(v).toString(16).padStart(64, '0');
const A = a => hex(a).toLowerCase().padStart(64, '0');
export const SEL = {announce: 'cf530b0d', withdraw: '2e1a7d4d', approve: '095ea7b3', deposit: '47e7ef24', vested: '968fb8ba', get: '9507d39a', multiSend: '8d80ff0a', balanceOf: '70a08231', funded: '45f9fc78'};

export const announceData = (f, amount) => '0x' + SEL.announce + W(f.lockId) + W(amount);
export function multiSendData(calls) {
  const packed = calls.map(([to, data]) => '00' + hex(to).toLowerCase() + W(0) + W(hex(data).length / 2) + hex(data)).join('');
  return '0x' + SEL.multiSend + W(32) + W(packed.length / 2) + packed + '0'.repeat((64 - (packed.length % 64)) % 64);
}
/// The Safe transaction for each step. `amount` is the announced amount being withdrawn (release only).
export function announceTx(f = FUND) {
  return {to: f.qlocks, value: 0, operation: 0, data: announceData(f, f.weekly)};
}
export function releaseTx(amount, f = FUND) {
  const calls = [
    [f.qlocks, '0x' + SEL.withdraw + W(f.lockId)],
    [f.qhooks, '0x' + SEL.approve + A(f.drops) + W(amount)],
    [f.drops, '0x' + SEL.deposit + A(f.qhooks) + W(amount)],
    [f.qlocks, announceData(f, f.weekly)],
  ];
  return {to: f.multisend, value: 0, operation: 1, data: multiSendData(calls), calls};
}

/// Decodes QLocks.get(id) (a static 10-word tuple).
export function decodeLock(h) {
  const s = hex(h), w = i => BigInt('0x' + s.slice(i * 64, (i + 1) * 64));
  return {token: '0x' + s.slice(24, 64), start: Number(w(1)), cliff: Number(w(2)), beneficiary: '0x' + s.slice(3 * 64 + 24, 4 * 64),
    duration: Number(w(4)), notice: Number(w(5)), total: w(6), claimed: w(7), announced: w(8), readyAt: Number(w(9))};
}
/// Vested at time t (seconds), same formula as QLocks.vested.
export function vestedAt(l, t) {
  const open = l.start + l.cliff;
  let v = 0n;
  if (t < open) v = 0n;
  else if (l.duration === 0) v = l.total;
  else { const e = BigInt(t - open); v = e >= BigInt(l.duration) ? l.total : l.total * e / BigInt(l.duration); }
  return v < l.claimed ? l.claimed : v;
}
/// What the page should offer now. free = vested − claimed, read from the chain.
///   announce: nothing live (none yet, or the last one expired unused)
///   wait:     announced, notice running until readyAt
///   release:  ready and fully covered: withdraw, deposit, announce next week
///   short:    ready but less is vested than announced (only if someone announced more by hand); re-announce
export function fundStep(l, nowSec, free, f = FUND) {
  if (l.beneficiary.toLowerCase() !== f.safe) return {step: 'not_safe'};
  if (l.announced === 0n || nowSec > l.readyAt + f.window) return {step: 'announce', expired: l.announced !== 0n};
  if (nowSec < l.readyAt) return {step: 'wait', readyAt: l.readyAt, amount: l.announced};
  if (free < l.announced) return {step: 'short', amount: l.announced, free};
  return {step: 'release', amount: l.announced, expiresAt: l.readyAt + f.window};
}
