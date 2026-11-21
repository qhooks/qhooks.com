// Contributor round (2026-11-21): pure helpers shared by /create, /round, the token page and the Worker.
// Contract: work/qhooks-contribround-20261121 (ContributorRound.sol, RoundFactory.sol, KnownFactories.sol; signed off).
// An allowlisted group (up to 8 wallets, each with its own cap) pools quote coin; at settle the whole pot is the launch's
// in-transaction first buy, sent by the round. No DOM, wallet or network here.
import {keccak_256} from './full-launch/prototypes/qpools/client/vendor/hashes/sha3.js';

/// RoundFactory through the deterministic deployer (salt 0): the same address on every chain once Randall's
/// /chain-setup?set=round tap lands. Nothing shows anywhere until this address has code on the chain.
export const ROUND_FACTORY = '0x88d24518427333fe324561b3b985b01956e3a4b7';
/// Chains with a round deploy step. `from`: no RoundCreated log can be older than this block (the head when the
/// manifest was made, 2026-11-21; raise it to the deploy block after the tap). Log windows for the Worker's meta lookup:
/// Robinhood's public RPC answers address+topic eth_getLogs over 5M blocks (checked 2026-11-21); Base/BNB stay at 10k.
export const ROUND_CHAINS = Object.freeze({
  '4663': Object.freeze({from: 120155257, logSpan: 5_000_000, logWindows: 6}),
  '56': Object.freeze({from: 134956151, logSpan: 10_000, logWindows: 24}),
  '8453': Object.freeze({from: 60523912, logSpan: 10_000, logWindows: 24}),
});
/// Chains where RoundFactory is deployed and switched on. Empty until Randall's /chain-setup?set=round taps; each chain is
/// added (with its deploy block as `from`) in a small follow-up release. Until then every round surface (create section,
/// /round, token line, Worker routes) is inert and makes no chain reads (Alchemy CU is paid; nothing to read before code).
export const ROUND_LIVE = Object.freeze(new Set([]));
/// The chain's round settings when RoundFactory is live there, else null (fail closed).
export const roundChain = id => ROUND_LIVE.has(String(id)) ? ROUND_CHAINS[String(id)] || null : null;
/// Settings regardless of the live switch (manifest, simulations and tests only).
export const roundChainConfig = id => ROUND_CHAINS[String(id)] || null;
/// KnownFactories.sol: the launch factories a round may send its pot to.
export const KNOWN_LAUNCH = Object.freeze({
  original: '0x023623568f41c032ec2f4bba368dbafc123160cc', // 11-field LaunchParams, Robinhood Chain only
  next: '0xfb5a559886fccba6400cc52905ba3aa4658ba0cc', // pq generation
  clean: '0x34ac8c4e6ca3d5b70a5321b648d0db9451c060cc', // clean-token pq build
});
/// {known, pq} for a launch factory on a chain, as KnownFactories.check (code presence is checked on chain).
export function knownLaunch(chainId, factory) {
  const f = String(factory || '').toLowerCase();
  if (f === KNOWN_LAUNCH.next || f === KNOWN_LAUNCH.clean) return {known: true, pq: true};
  if (f === KNOWN_LAUNCH.original && String(chainId) === '4663') return {known: true, pq: false};
  return {known: false, pq: false};
}
/// ContributorRound constants.
export const ROUND = Object.freeze({maxWallets: 8, maxRoundSeconds: 30 * 86400, settleGrace: 3 * 86400, maxVesting: 4 * 365 * 86400,
  maxReserveBps: 3000, maxFee: 10000, maxShareBps: 5000, maxStartSteps: 161, maxMetaBytes: 4096, snipe: Object.freeze([0, 15, 60, 300, 600])});
export const STATUS = Object.freeze(['Open', 'Ready', 'Settled', 'Failed', 'Cancelled']);

// ---- hex / ABI ----
const enc = new TextEncoder(), dec = new TextDecoder();
const hexOf = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
const bytesOf = h => Uint8Array.from((String(h).replace(/^0x/, '').match(/../g) || []).map(x => parseInt(x, 16)));
export const keccakHex = h => '0x' + hexOf(keccak_256(typeof h === 'string' ? bytesOf(h) : h));
export const keccakText = s => '0x' + hexOf(keccak_256(enc.encode(String(s))));
export const sel = sig => keccakText(sig).slice(0, 10);
const W = v => BigInt.asUintN(256, BigInt(v)).toString(16).padStart(64, '0');
const isAddr = a => /^0x[0-9a-f]{40}$/.test(String(a || '').toLowerCase());
const addrWord = a => { if (!isAddr(a)) throw new TypeError('bad address'); return String(a).toLowerCase().slice(2).padStart(64, '0'); };
const strTail = s => { const b = enc.encode(s), h = hexOf(b); return W(b.length) + h.padEnd(Math.ceil(h.length / 64) * 64, '0'); };
export const ROUND_CREATED_TOPIC = keccakText('RoundCreated(address,address,address,string)');
export const SETTLED_TOPIC = keccakText('Settled(address,bytes32,uint256,uint256,uint256,uint256,bool)');
export const CREATE_ROUND_SIG = 'createRound((address,string,string,string,uint8,uint24,bytes32,uint16,uint16,uint16,address[],uint256[],uint256,uint64,uint64,uint64))';
export const SEL = Object.freeze({
  createRound: sel(CREATE_ROUND_SIG), isRound: sel('isRound(address)'),
  status: sel('status()'), wallets: sel('wallets()'), seat: sel('seat(address)'), claimable: sel('claimable(address)'), refundsOpen: sel('refundsOpen()'),
  pot: sel('pot()'), minRaise: sel('minRaise()'), maxRaise: sel('maxRaise()'), deadline: sel('deadline()'), startCap: sel('startCap()'), fee: sel('fee()'),
  reserveBps: sel('reserveBps()'), vestCliff: sel('vestCliff()'), vestDuration: sel('vestDuration()'), token: sel('token()'), poolId: sel('poolId()'),
  tokensReceived: sel('tokensReceived()'), settledAt: sel('settledAt()'), settled: sel('settled()'), cancelled: sel('cancelled()'), creator: sel('creator()'),
  launchFactory: sel('launchFactory()'), quote: sel('quote()'), nativeQuote: sel('nativeQuote()'), name: sel('name()'), symbol: sel('symbol()'),
  metaHash: sel('metaHash()'), style: sel('style()'), snipePacked: sel('snipePacked()'), walletCount: sel('walletCount()'), pq: sel('pq()'),
  contribute: sel('contribute(uint256)'), claim: sel('claim(address)'), claimFor: sel('claimFor(address)'), refund: sel('refund(address)'),
  refundAll: sel('refundAll()'), settle: sel('settle(string)'), cancel: sel('cancel()'),
  chain: '0xc763e5a1', startAt: '0xf691877e', approve: '0x095ea7b3', allowance: '0xdd62ed3e', balanceOf: '0x70a08231', decimals: '0x313ce567', totalSupply: '0x18160ddd',
});
export const call = {
  isRound: round => SEL.isRound + addrWord(round),
  seat: w => SEL.seat + addrWord(w), claimable: w => SEL.claimable + addrWord(w),
  contribute: amount => SEL.contribute + W(amount), claim: to => SEL.claim + addrWord(to), claimFor: w => SEL.claimFor + addrWord(w),
  refund: to => SEL.refund + addrWord(to), settle: meta => SEL.settle + W(32) + strTail(String(meta)),
  approve: (spender, amount) => SEL.approve + addrWord(spender) + W(amount), allowance: (owner, spender) => SEL.allowance + addrWord(owner) + addrWord(spender),
  balanceOf: a => SEL.balanceOf + addrWord(a), startAt: steps => SEL.startAt + W(steps),
};
// Decoders over a return hex string.
const words = h => String(h || '').replace(/^0x/, '').match(/.{64}/g) || [];
export const dU = (h, i = 0) => { const w = words(h)[i]; if (w === undefined) throw Error('short return'); return BigInt('0x' + w); };
export const dA = (h, i = 0) => '0x' + (words(h)[i] ?? (() => { throw Error('short return'); })()).slice(24);
export const dB = (h, i = 0) => dU(h, i) !== 0n;
export const dBytes32 = (h, i = 0) => '0x' + (words(h)[i] ?? (() => { throw Error('short return'); })());
export function dString(h) { const s = String(h).replace(/^0x/, ''), off = Number(BigInt('0x' + s.slice(0, 64))) * 2, len = Number(BigInt('0x' + s.slice(off, off + 64))); return dec.decode(bytesOf(s.slice(off + 64, off + 64 + len * 2))); }
export function dAddrs(h) { const s = String(h).replace(/^0x/, ''), off = Number(BigInt('0x' + s.slice(0, 64))) * 2, n = Number(BigInt('0x' + s.slice(off, off + 64))); if (n > 64) throw Error('too many'); return Array.from({length: n}, (_, i) => '0x' + s.slice(off + 64 + i * 64 + 24, off + 128 + i * 64)); }
export const dSeat = h => ({cap: dU(h, 0), contributed: dU(h, 1), allocation: dU(h, 2), claimed: dU(h, 3), quoteRefund: dU(h, 4), refunded: dB(h, 5)});

/// The launch factory's chain() result: {quote, wrapsNative, launchFee, startCap}.
export function decodeLaunchChain(h) { return {manager: dA(h, 0), quote: dA(h, 1), wrapsNative: dB(h, 2), launchFee: dU(h, 3), platform: dA(h, 4), startCap: dU(h, 6)}; }

/// RoundFactory.createRound(Config) calldata. Checks every rule the constructor checks that needs no chain read.
export function encodeCreateRound(c, opts = {}) {
  const t = checkConfig(c, opts);
  const dyn = [strTail(t.name), strTail(t.symbol), strTail(t.meta), W(t.wallets.length) + t.wallets.map(addrWord).join(''), W(t.caps.length) + t.caps.map(W).join('')];
  const head = 16 * 32, off = []; let at = head; for (const d of dyn) { off.push(at); at += d.length / 2; }
  const tuple = addrWord(t.launchFactory) + W(off[0]) + W(off[1]) + W(off[2]) + W(t.style) + W(t.fee) + t.salt.slice(2) + W(t.snipeSeconds) + W(t.startSteps) +
    W(t.reserveBps) + W(off[3]) + W(off[4]) + W(t.minRaise) + W(t.deadline) + W(t.vestCliff) + W(t.vestDuration) + dyn.join('');
  return SEL.createRound + W(32) + tuple;
}
const bad = m => { throw Object.assign(new TypeError(m), {code: 'round_invalid'}); };
/// Normalized Config or a plain sentence. `now` (seconds) bounds the deadline as the contract does at creation.
export function checkConfig(c, {now = Math.floor(Date.now() / 1000)} = {}) {
  const {known, pq} = knownLaunch(c.chainId ?? '4663', c.launchFactory);
  if (!known) bad('Contributor rounds launch through the standard QHooks launch contract on this chain.');
  const name = String(c.name ?? ''), symbol = String(c.symbol ?? ''), meta = String(c.meta ?? '');
  if (!name || enc.encode(name).length > 64 || !symbol || enc.encode(symbol).length > 16) bad('Enter a token name and ticker first.');
  if (enc.encode(meta).length > ROUND.maxMetaBytes) bad('Choose a smaller image.');
  const style = Number(c.style), fee = Number(c.fee ?? ROUND.maxFee), snipe = Number(c.snipeSeconds ?? 0), steps = Number(c.startSteps ?? 0), reserveBps = Number(c.reserveBps ?? 0);
  if (!Number.isInteger(style) || style < 0 || style > 6) bad('Choose a launch idea.');
  if (!Number.isInteger(fee) || fee < 1 || fee > ROUND.maxFee) bad('A round launches with a pool fee of at most 1%.');
  if (!ROUND.snipe.includes(snipe)) bad('Choose a supported anti-snipe length.');
  if (!Number.isInteger(steps) || steps < 0 || steps > ROUND.maxStartSteps || (steps && !pq)) bad('This starting market cap needs the newer launch contract on this chain.');
  if (!Number.isInteger(reserveBps) || reserveBps < 0 || reserveBps > ROUND.maxReserveBps) bad('Keep the reserve between 0% and 30%.');
  if (!/^0x[0-9a-f]{64}$/i.test(c.salt || '')) bad('Missing launch salt.');
  const wallets = (c.wallets || []).map(w => String(w).trim().toLowerCase()), caps = (c.caps || []).map(x => BigInt(x));
  if (!wallets.length) bad('Add at least one contributor wallet.');
  if (wallets.length > ROUND.maxWallets) bad('Add at most 8 contributor wallets.');
  if (caps.length !== wallets.length) bad('Give every wallet a cap.');
  const seen = new Set();
  wallets.forEach((w, i) => { if (!isAddr(w) || BigInt(w) === 0n) bad('Check wallet ' + (i + 1) + ': it is not an EVM address.'); if (seen.has(w)) bad('Each wallet can appear once.'); seen.add(w); if (caps[i] <= 0n || caps[i] >= 1n << 128n) bad('Give wallet ' + (i + 1) + ' a cap above 0.'); });
  const sum = caps.reduce((n, x) => n + x, 0n), minRaise = BigInt(c.minRaise ?? 0);
  if (minRaise <= 0n) bad('Set a minimum above 0.');
  if (minRaise > sum) bad('The minimum can’t be more than the caps add up to.');
  if (c.startCap != null && sum > maxRaiseFor(BigInt(c.startCap), reserveBps)) bad('The caps add up to more than this start allows.');
  const deadline = Number(c.deadline), cliff = Number(c.vestCliff ?? 0), duration = Number(c.vestDuration ?? 0);
  if (!Number.isSafeInteger(deadline) || deadline <= now || deadline > now + ROUND.maxRoundSeconds) bad('Set a deadline within the next 30 days.');
  if (!Number.isSafeInteger(cliff) || !Number.isSafeInteger(duration) || cliff < 0 || cliff > duration || duration > ROUND.maxVesting) bad('The cliff can’t be longer than the vesting, and vesting is at most 4 years.');
  return {launchFactory: String(c.launchFactory).toLowerCase(), pq, name, symbol, meta, style, fee, salt: String(c.salt).toLowerCase(), snipeSeconds: snipe, startSteps: steps, reserveBps,
    wallets, caps, minRaise, maxRaise: sum, deadline, vestCliff: cliff, vestDuration: duration};
}

// ---- the round's share of supply and the pot's average price (SPEC "Lead review changes") ----
/// ContributorRound.maxRaiseFor, exactly: (1 - 2r)(1 - r) S with r in bps.
export function maxRaiseFor(startCap, reserveBps) {
  const r = BigInt(reserveBps), S = BigInt(startCap);
  if (2n * r >= 10000n) return 0n;
  return S * (10000n - 2n * r) * (10000n - r) / 100000000n;
}
/// Projection for a pot Q at start market cap S with reserve r (both amounts in the same quote units).
/// The launch position runs from the start price up, so the pot buys (1-r)Q/((1-r)S+Q) of the supply; the round also gets
/// the reserve r. share = r + (1-r)Q/((1-r)S+Q). Average price paid for the bought part / start price = 1 + Q/((1-r)S).
/// Constant-product model, LP fee ignored (the fee only lowers the share): Q = S, no reserve -> 50% and 2.0x.
export function projectRound({pot, startCap, reserveBps = 0}) {
  const S = BigInt(startCap), Q = BigInt(pot); if (S <= 0n || Q < 0n) return null;
  const r = Number(reserveBps) / 10000, x = Number(Q * 1_000_000_000n / S) / 1e9, a = 1 - r;
  const bought = a * x / (a + x), share = r + bought;
  return {x, reserve: r, bought, share, shareBps: Math.round(share * 10000), avgRatio: 1 + x / a};
}

// ---- vesting ----
/// ContributorRound.vestedAt for display: nothing before the cliff, linear from settle to settle + duration.
export function vestedAt(allocation, t, {settled, settledAt, vestCliff, vestDuration}) {
  if (!settled) return 0n;
  const a = BigInt(allocation), el = Math.max(0, Number(t) - Number(settledAt));
  if (el >= Number(vestDuration)) return a;
  if (el < Number(vestCliff)) return 0n;
  return a * BigInt(el) / BigInt(vestDuration);
}

// ---- amounts ----
/// "1.25" -> 1250000 for 6 decimals; null when not a plain positive decimal with at most `decimals` places.
export function toUnits(text, decimals) {
  const v = String(text ?? '').trim().replace(',', '.'), d = Number(decimals);
  if (!new RegExp('^(?:0|[1-9]\\d{0,12})(?:\\.\\d{1,' + d + '})?$').test(v)) return null;
  const [w, f = ''] = v.split('.'); return BigInt(w) * 10n ** BigInt(d) + BigInt((f + '0'.repeat(d)).slice(0, d) || '0');
}
/// 1250000n, 6 -> "1.25" (at most `digits` significant decimals).
export function fromUnits(v, decimals, digits = 6) {
  const n = BigInt(v), d = Number(decimals), neg = n < 0n, a = neg ? -n : n, s = a.toString().padStart(d + 1, '0'), whole = s.slice(0, s.length - d), frac = s.slice(s.length - d);
  const lead = frac.match(/^0*/)[0].length, keep = whole !== '0' ? digits : Math.min(d, lead + 3), f = frac.slice(0, Math.max(keep, 1)).replace(/0+$/, '');
  return (neg ? '-' : '') + Number(whole).toLocaleString('en-US') + (f ? '.' + f : '');
}
export const pct = (v, digits = 1) => (Math.round(v * 100 * 10 ** digits) / 10 ** digits).toFixed(digits).replace(/\.0+$/, '') + '%';

/// RoundCreated(round indexed, creator indexed, launchFactory indexed, string meta) from a factory log.
export function parseRoundCreated(log, factory = ROUND_FACTORY) {
  if (!log || String(log.address).toLowerCase() !== String(factory).toLowerCase() || String(log.topics?.[0]).toLowerCase() !== ROUND_CREATED_TOPIC || log.topics.length !== 4) return null;
  return {round: '0x' + log.topics[1].slice(26).toLowerCase(), creator: '0x' + log.topics[2].slice(26).toLowerCase(), launchFactory: '0x' + log.topics[3].slice(26).toLowerCase(),
    meta: dString(log.data), block: log.blockNumber != null ? Number(BigInt(log.blockNumber)) : null, tx: log.transactionHash || null};
}
export const roundPath = (chainId, round, block = null) => '/round?chain=' + encodeURIComponent(String(chainId)) + '&round=' + String(round).toLowerCase() + (block ? '&b=' + Number(block) : '');

// Draft user-facing strings (Contributor round). Money and fee wording goes to Randall through the lead before release.
export const ROUND_TEXT = Object.freeze({
  toggle: 'Contributor round',
  intro: 'Up to 8 wallets put in before launch, each up to its own cap. At settle the whole pot is the launch’s first buy, in the same transaction, so nothing can trade ahead of it. Tokens are shared in proportion to what each wallet put in.',
  replaces: 'This creates the round instead of launching now. The token launches when the round is settled.',
  wallet: 'Contributor wallet',
  cap: unit => 'Cap, ' + unit,
  add: 'Add a wallet',
  remove: 'Remove',
  minField: unit => 'Minimum to launch, ' + unit,
  minNote: 'Under the minimum at the deadline, everyone can take back exactly what they put in.',
  deadline: 'Deadline',
  deadlineNote: 'Up to 30 days. Settle opens at the deadline, or as soon as every cap is filled, and stays open for 3 days.',
  reserve: 'Reserve for contributors, % of supply (optional, up to 30%)',
  reserveNote: 'Tokens you give up from the supply. They go to the contributors with the bought tokens; you get none of them.',
  vest: 'Vesting (optional)',
  cliff: 'Cliff, days',
  duration: 'Vesting length, days',
  vestNote: 'Nothing can be claimed before the cliff, then tokens unlock in a straight line until the end. Counted from settle.',
  fee: 'Pool fee 1%. The pot’s first buy pays it too, to your payout, like every trade.',
  total: (sum, unit) => 'Caps add up to ' + sum + ' ' + unit + '. This is the largest possible pot.',
  limit: (max, unit) => 'Largest pot this start allows: ' + max + ' ' + unit + ' (the round may hold at most half the supply).',
  overLimit: (max, unit) => 'The caps add up to more than this start allows. Keep them at ' + max + ' ' + unit + ' or less, raise the starting market cap, or lower the reserve.',
  projectFull: (avg, share) => 'If every cap is filled: average price about ' + avg + 'x the start price, and the round holds about ' + share + ' of supply.',
  pqNote: 'A post-quantum key can’t be set through a round. You can add it after the launch.',
  create: 'Create the round',
  creating: 'Confirm the round in your wallet…',
  created: 'Round created.',
  open: 'Open the round',
  unavailable: 'Contributor rounds aren’t available for this launch.',
  // /round
  title: 'Contributor round',
  lede: 'An allowlisted group pools the launch’s first buy. Everything here is read from the chain.',
  statusLine: {Open: 'Open: listed wallets can put in up to their caps.', Ready: 'Ready: anyone can settle it now, which launches the token with the whole pot as the first buy.',
    Settled: 'Settled: the token launched. Contributors claim their tokens.', Failed: 'Refunds open: everyone can take back exactly what they put in.', Cancelled: 'Cancelled before anyone put anything in.'},
  pot: 'Pot', min: 'Minimum', max: 'Maximum (caps added up)', grace: 'Settle by', poolFee: 'Pool fee',
  feeLine: f => (f / 10000) + '%, to the creator’s payout, the pot’s first buy included',
  reserveLine: r => r ? (r / 100) + '% of supply, to the contributors' : 'None',
  vestLine: (cliffDays, days) => days ? cliffDays + '-day cliff, then linear over ' + days + ' days from settle' : 'None: everything is claimable at settle',
  projTitle: 'Projected for the current pot',
  projAvg: v => 'Average price about ' + v + 'x the start price',
  projShare: v => 'The round would hold about ' + v + ' of supply',
  projAfter: (avg, share) => 'After this: average price about ' + avg + 'x the start price; the round would hold about ' + share + ' of supply.',
  projExplain: 'The pot is the launch’s first buy, from the start price up, in the same transaction as the launch. The bigger the pot, the higher its average price and the more of the supply it buys. A reserve adds that share of supply on top and thins the pool, so the same pot moves the price further. Estimate from the pool’s price curve, before the 1% pool fee.',
  wallets: 'Wallets', seatLine: (c, cap, unit) => c + ' of ' + cap + ' ' + unit,
  contribute: 'Put in', contributeLabel: unit => 'Amount, ' + unit, approve: unit => 'Approve ' + unit, left: (v, unit) => 'You can put in up to ' + v + ' ' + unit + ' more.',
  settle: 'Settle and launch', settleNote: fee => 'Anyone can settle. You pay the launch fee (' + fee + ') and network gas; the pot pays for the first buy.',
  settleNeedsMeta: 'Settle needs the round’s launch details. Open the round from the link its creator shared.',
  claim: 'Claim', claimFor: 'Send to this wallet', claimTo: 'Send to (optional)', claimable: 'Claimable now', claimed: 'Claimed', allocation: 'Your tokens',
  schedule: 'Unlocks', refund: 'Take back my contribution', refundAll: 'Refund every wallet', cancel: 'Cancel the round',
  notShown: 'This round can’t be shown. It is not a QHooks contributor round on this chain, or the chain read failed. Refresh to try again.',
  badge: (n, share) => 'Contributor round · ' + n + (n === 1 ? ' wallet' : ' wallets') + ' · ' + share + ' of supply',
});
