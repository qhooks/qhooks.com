// QLocks v2: the plain logic behind the QLocks page, trust badge, share card, alerts and launch step.
// No DOM, no network: every function here is pure, so Node tests run it as-is (site/tests/qlocks-core.test.mjs).
// Contract facts mirrored from src/QLocksV2.sol: WINDOW 7 days, MAX_NOTICE 90 days, MAX_SPAN 3650 days,
// at most 100 rows per lockMany (the site sends 50), steps 2..520, custom points end at 10000 bps.

export const DAY = 86400;
export const WINDOW = 7 * DAY;
export const MAX_NOTICE = 90 * DAY;
export const MAX_SPAN = 3650 * DAY;
export const MAX_STEPS = 520;
export const BATCH_SIZE = 50;
export const KIND = Object.freeze({ LINEAR: 0, STEPS: 1, CUSTOM: 2, LP_V3: 3, LP_V4: 4 });

/// Schedule presets offered on the page and in the launch step. `span` is the drip length (linear) or the
/// interval between tranches (steps). Monthly = 30 days, quarterly = 91 days.
export const PRESETS = Object.freeze([
  { key: 'cliff-linear', label: '6-month cliff, then 18-month drip', cliff: 180 * DAY, span: 540 * DAY, steps: 0 },
  { key: 'monthly-12', label: '12 monthly unlocks after a 6-month cliff', cliff: 180 * DAY, span: 30 * DAY, steps: 12 },
  { key: 'quarterly-8', label: '8 quarterly unlocks after a 1-year cliff', cliff: 365 * DAY, span: 91 * DAY, steps: 8 },
  { key: 'all-1y', label: 'All at once after 1 year', cliff: 365 * DAY, span: 0, steps: 0 },
  { key: 'all-2y', label: 'All at once after 2 years', cliff: 730 * DAY, span: 0, steps: 0 }
]);

/// Throws a plain-language error unless the schedule fits the contract's rules (QSchedule.check).
export function checkSchedule({ cliff, span, steps = 0 }) {
  cliff = Number(cliff); span = Number(span); steps = Number(steps);
  if (![cliff, span, steps].every(n => Number.isInteger(n) && n >= 0)) throw new TypeError('Schedule values must be whole numbers');
  if (steps === 0) { if (cliff + span > MAX_SPAN) throw new RangeError('A lock can run at most 10 years'); return; }
  if (steps < 2 || steps > MAX_STEPS) throw new RangeError('Steps must be between 2 and ' + MAX_STEPS);
  if (span === 0) throw new RangeError('Steps need a time between unlocks');
  if (cliff + span * (steps - 1) > MAX_SPAN) throw new RangeError('A lock can run at most 10 years');
}

/// Mirror of QSchedule.vested (BigInt amounts, seconds). Used for previews and charts, never for money moves.
export function vestedAt({ total, start, cliff, span, steps = 0 }, t) {
  total = BigInt(total); const open = Number(start) + Number(cliff);
  if (t < open) return 0n;
  const elapsed = t - open; span = Number(span); steps = Number(steps);
  if (steps === 0) return span === 0 || elapsed >= span ? total : total * BigInt(Math.floor(elapsed)) / BigInt(span);
  const done = Math.floor(elapsed / span) + 1;
  return done >= steps ? total : total * BigInt(done) / BigInt(steps);
}

/// Mirror of QSchedule.customVested. `points` are [{ offset, bps }] after start + cliff.
export function customVestedAt({ total, start, cliff }, points, t) {
  const open = Number(start) + Number(cliff);
  if (t < open) return 0n;
  let b = 0; for (const p of points) { if (p.offset > t - open) break; b = p.bps; }
  return b === 10000 ? BigInt(total) : BigInt(total) * BigInt(b) / 10000n;
}

/// Unpacks the contract's packed custom points (offset << 16 | bps).
export const unpackPoints = packed => packed.map(p => ({ offset: Number(BigInt(p) >> 16n), bps: Number(BigInt(p) & 0xffffn) }));

/// The release dates a person sees: [{ at, amount }] for steps, the cliff and end for linear, each point for custom.
export function unlockTimeline(lock, points = []) {
  const open = Number(lock.start) + Number(lock.cliff), total = BigInt(lock.total);
  if (Number(lock.kind) === KIND.CUSTOM) {
    let prev = 0n;
    return points.map(p => { const v = total * BigInt(p.bps) / 10000n; const out = { at: open + p.offset, amount: (p.bps === 10000 ? total : v) - prev }; prev = p.bps === 10000 ? total : v; return out; });
  }
  const steps = Number(lock.steps || 0), span = Number(lock.span || 0);
  if (steps === 0) return span === 0 ? [{ at: open, amount: total }] : [{ at: open, amount: 0n, dripUntil: open + span, dripTotal: total }];
  const out = []; let prev = 0n;
  for (let k = 0; k < steps; k++) { const v = vestedAt(lock, open + k * span); out.push({ at: open + k * span, amount: v - prev }); prev = v; }
  return out;
}

/// One-line plain description of a schedule, for lists, the badge and the share card.
export function describeSchedule({ cliff, span, steps = 0, kind }, points) {
  const d = s => { s = Number(s); if (s === 0) return 'now'; if (s % (365 * DAY) === 0) return (s / (365 * DAY)) + (s === 365 * DAY ? ' year' : ' years'); if (s % (30 * DAY) === 0) return (s / (30 * DAY)) + (s === 30 * DAY ? ' month' : ' months'); if (s % DAY === 0) return (s / DAY) + (s === DAY ? ' day' : ' days'); return Math.round(s / 3600) + ' h'; };
  const every = s => Number(s) === 30 * DAY ? 'monthly' : Number(s) === 91 * DAY ? 'quarterly' : Number(s) === 7 * DAY ? 'weekly' : 'every ' + d(s);
  const c = Number(cliff) ? d(cliff).replace(/^(\d+) (\w+?)s?$/, '$1-$2') + ' cliff' : 'no cliff';
  if (Number(kind) === KIND.CUSTOM) return c + ', ' + (points?.length || 0) + ' custom unlocks';
  if (Number(steps)) return c + ', then ' + steps + ' ' + every(span) + ' unlocks';
  if (Number(span)) return c + ', then drips over ' + d(span);
  return Number(cliff) ? 'all at once after ' + d(cliff) : 'unlocked';
}

// ---- CSV batch helper --------------------------------------------------------------------------------------

const DURATION = /^(\d+(?:\.\d+)?)\s*(d|day|days|w|week|weeks|m|mo|month|months|q|quarter|quarters|y|yr|year|years|s)?$/i;
/// "6m", "90d", "1y", "2 quarters", "0" → seconds. Months are 30 days, quarters 91, years 365.
export function parseDuration(text) {
  const s = String(text ?? '').trim(); if (s === '') return 0;
  const m = DURATION.exec(s); if (!m) throw new TypeError('Unreadable duration "' + s + '"');
  const n = Number(m[1]), u = (m[2] || 'd').toLowerCase();
  const mult = u === 's' ? 1 : u[0] === 'd' ? DAY : u[0] === 'w' ? 7 * DAY : u === 'm' || u.startsWith('mo') ? 30 * DAY : u[0] === 'q' ? 91 * DAY : 365 * DAY;
  const out = Math.round(n * mult); if (!Number.isSafeInteger(out)) throw new RangeError('Duration too long');
  return out;
}
const SCHEDULE_WORDS = { monthly: 30 * DAY, quarterly: 91 * DAY, weekly: 7 * DAY, linear: null, once: 0, 'all-at-once': 0 };

function splitCsvLine(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ',' || ch === ';' || ch === '\t') { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/// Parses a lock sheet. Columns (header row optional, any order when present):
///   address, amount, cliff, schedule, length, steps, notice, label
/// schedule: linear | monthly | quarterly | weekly | once | a duration (custom interval). length = drip length for
/// linear. steps = number of unlocks for monthly/quarterly/custom-interval. Durations accept 90d, 6m, 1y, 2q, 3w.
/// `parseAmount(text)` turns an amount into base units (the page passes parseUnits with the token's decimals).
/// Returns { rows, errors } where every error names its line; rows are ready for lockMany/grantMany.
export function parseLockSheet(text, parseAmount, defaults = {}) {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/).map((l, i) => ({ n: i + 1, l })).filter(x => x.l.trim() && !x.l.trim().startsWith('#'));
  const rows = [], errors = [];
  if (!lines.length) return { rows, errors: [{ line: 0, error: 'The sheet is empty' }] };
  let cols = ['address', 'amount', 'cliff', 'schedule', 'length', 'steps', 'notice', 'label'];
  const first = splitCsvLine(lines[0].l).map(c => c.toLowerCase());
  if (first.includes('address') || first.includes('wallet') || first.includes('beneficiary')) {
    cols = first.map(c => c === 'wallet' || c === 'beneficiary' || c === 'recipient' ? 'address' : c === 'drip' || c === 'duration' ? 'length' : c === 'name' ? 'label' : c);
    lines.shift();
  }
  const seen = new Map();
  for (const { n, l } of lines) {
    const cells = splitCsvLine(l), get = k => { const i = cols.indexOf(k); return i < 0 ? undefined : cells[i]; };
    try {
      const address = String(get('address') || '').toLowerCase();
      if (!/^0x[0-9a-f]{40}$/.test(address)) throw new TypeError('Not a wallet address');
      if (address === '0x0000000000000000000000000000000000000000') throw new TypeError('The zero address cannot hold a lock');
      const amount = parseAmount(String(get('amount') || '').replace(/[_\s]/g, '').replace(/,(?=\d{3}(\D|$))/g, ''));
      if (amount <= 0n) throw new RangeError('Amount must be above zero');
      if (amount >= 1n << 128n) throw new RangeError('Amount too large');
      const cliff = parseDuration(get('cliff') ?? defaults.cliff ?? 0);
      const sched = String(get('schedule') ?? defaults.schedule ?? 'linear').trim().toLowerCase() || 'linear';
      let span, steps;
      if (sched in SCHEDULE_WORDS && SCHEDULE_WORDS[sched] === null) { span = parseDuration(get('length') ?? defaults.length ?? 0); steps = 0; }
      else if (sched === 'once' || sched === 'all-at-once') { span = 0; steps = 0; }
      else {
        span = sched in SCHEDULE_WORDS ? SCHEDULE_WORDS[sched] : parseDuration(sched);
        steps = Number(get('steps') ?? defaults.steps ?? 0);
        if (!Number.isInteger(steps)) throw new TypeError('Steps must be a whole number');
      }
      checkSchedule({ cliff, span, steps });
      const notice = parseDuration(get('notice') ?? defaults.notice ?? '3d');
      if (notice > MAX_NOTICE) throw new RangeError('Notice can be at most 90 days');
      const key = address + ':' + cliff + ':' + span + ':' + steps;
      if (seen.has(key)) errors.push({ line: n, warning: true, error: 'Same wallet and schedule as line ' + seen.get(key) + ' (kept as a separate lock)' });
      seen.set(key, n);
      rows.push({ line: n, beneficiary: address, amount, start: 0, cliff, span, steps, notice, label: get('label') || '' });
    } catch (e) { errors.push({ line: n, error: e.message }); }
  }
  if (!rows.length && !errors.length) errors.push({ line: 0, error: 'No rows found' });
  return { rows, errors };
}

/// Splits rows into transactions of at most `size` (contract cap is 100; 50 keeps each well under block limits).
export function chunkRows(rows, size = BATCH_SIZE) {
  const out = []; for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size)); return out;
}
export const sumRows = rows => rows.reduce((s, r) => s + BigInt(r.amount), 0n);

/// ABI shape for QLocksV2.lockMany(token, Row[]) and QGrants.grantMany(token, Row[]).
export const LOCK_ROW_T = '(address,uint128,uint64,uint32,uint32,uint16,uint32)[]';
export const GRANT_ROW_T = '(address,uint128,uint64,uint32,uint32,uint16)[]';
export const lockRowValues = rows => rows.map(r => [r.beneficiary, BigInt(r.amount), BigInt(r.start || 0), BigInt(r.cliff), BigInt(r.span), BigInt(r.steps), BigInt(r.notice)]);
export const grantRowValues = rows => rows.map(r => [r.beneficiary, BigInt(r.amount), BigInt(r.start || 0), BigInt(r.cliff), BigInt(r.span), BigInt(r.steps)]);

/// A starter sheet people can download and fill in.
export const SAMPLE_SHEET = [
  'address,amount,cliff,schedule,length,steps,notice,label',
  '0x1111111111111111111111111111111111111111,1000000,6m,monthly,,12,3d,Founder',
  '0x2222222222222222222222222222222222222222,250000,1y,quarterly,,8,7d,Advisor',
  '0x3333333333333333333333333333333333333333,500000,90d,linear,1y,,3d,Early team'
].join('\n') + '\n';

// ---- Trust badge + share card ------------------------------------------------------------------------------

const pct = (n, supply) => { if (!supply) return 0; return Number(BigInt(n) * 1000000n / BigInt(supply)) / 10000; };
export const fmtPct = p => (p === 0 ? '0' : p < 1 ? p.toFixed(2) : p.toFixed(1).replace(/\.0$/, '')) + '%';

/// What the trust badge says, from one token's summary + lpSummary reads. `level` drives the colour only.
/// Grants (QGrants) are never passed in here: they are not locks.
export function badgeModel({ supply, summary, lp, now }) {
  const locked = BigInt(summary?.locked || 0), announced = BigInt(summary?.announced || 0);
  const nextReady = Number(summary?.nextReady || 0), lockedPct = pct(locked, supply);
  const lpPositions = Number(lp?.positions || 0), lpPermanent = Number(lp?.permanent || 0), lpReady = Number(lp?.nextReady || 0);
  const lines = [];
  if (locked) lines.push(fmtPct(lockedPct) + ' of supply locked');
  if (lpPositions) lines.push(lpPermanent === lpPositions ? (lpPositions === 1 ? 'LP locked for good' : lpPositions + ' LP positions locked for good') : lpPositions + ' LP position' + (lpPositions === 1 ? '' : 's') + ' locked' + (lpPermanent ? ', ' + lpPermanent + ' for good' : ''));
  const notices = [];
  if (announced) notices.push({ kind: 'tokens', amount: announced, readyAt: nextReady, ready: nextReady <= now });
  if (lpReady) notices.push({ kind: 'lp', readyAt: lpReady, ready: lpReady <= now });
  const any = locked > 0n || lpPositions > 0;
  return {
    any, lockedPct, lines, notices,
    level: !any ? 'none' : notices.length ? 'notice' : 'locked',
    title: !any ? 'Nothing locked with QLocks' : notices.length ? 'Locked with QLocks · sell notice open' : 'Locked with QLocks'
  };
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/// "Locked with QLocks" share card as a 1200×630 SVG string (rendered to PNG in the page for download/X).
/// Only facts read from chain go on it; `chainName`, `symbol`, `contract` and `url` come from the page.
export function shareCardSvg({ symbol, chainName, model, schedule, contract, url }) {
  const big = model.any ? (model.lockedPct ? fmtPct(model.lockedPct) : 'LP') : '0%';
  const sub = model.any ? (model.lockedPct ? 'of supply locked' : 'locked for good') : 'nothing locked yet';
  const rows = [...model.lines.slice(model.lockedPct ? 1 : 0), schedule ? 'Schedule: ' + schedule : null,
    model.notices.length ? 'Sell notice open, shown on chain before any sale' : 'Any sale needs a public notice first'].filter(Boolean).slice(0, 3);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="#111311"/>
<rect x="40" y="40" width="1120" height="550" rx="28" fill="#181a17" stroke="#2c2f2a" stroke-width="2"/>
<g font-family="Inter, Helvetica, Arial, sans-serif" fill="#f1eee3">
<text x="96" y="132" font-size="34" font-weight="600" fill="#a7aea3">Locked with QLocks</text>
<text x="96" y="196" font-size="44" font-weight="700">${esc(symbol)} on ${esc(chainName)}</text>
<text x="96" y="340" font-size="140" font-weight="800" fill="${model.level === 'notice' ? '#d2ad72' : '#a9bc9b'}">${esc(big)}</text>
<text x="100" y="388" font-size="34" fill="#d8d4c8">${esc(sub)}</text>
${rows.map((r, i) => `<text x="100" y="${446 + i * 38}" font-size="26" fill="#a7aea3">${esc(r)}</text>`).join('\n')}
<text x="1104" y="132" font-size="24" text-anchor="end" fill="#6f776c">Nobody can cancel or shorten it</text>
<text x="1104" y="568" font-size="21" text-anchor="end" fill="#6f776c">${esc(url || '')}${contract ? ' · ' + esc(contract.slice(0, 6) + '…' + contract.slice(-4)) : ''}</text>
</g></svg>`;
}

// ---- Sell-notice alerts --------------------------------------------------------------------------------------

/// Normalizes an Announced / LpAnnounced log (eth_getLogs shape) using the artifact's event topics.
export function decodeNotice(log, topics) {
  const t0 = log.topics?.[0];
  const data = String(log.data || '0x').slice(2), w = i => BigInt('0x' + (data.slice(i * 64, i * 64 + 64) || '0'));
  const base = { block: Number(BigInt(log.blockNumber)), tx: log.transactionHash, contract: String(log.address).toLowerCase() };
  if (t0 === topics.Announced) return { ...base, type: 'tokens', id: BigInt(log.topics[1]), token: '0x' + log.topics[2].slice(26).toLowerCase(), amount: w(0), readyAt: Number(w(1)) };
  if (t0 === topics.LpAnnounced) return { ...base, type: 'lp', id: BigInt(log.topics[1]), readyAt: Number(w(0)) };
  return null;
}

/// One alert line, the same words on the board, @qhooks_bot and the pre-buy proof.
/// `fmt(amount)` formats token units; `when(ts)` formats a time. Pass `now` in seconds.
export function noticeText(n, { symbol = 'tokens', fmt = a => String(a), when = ts => new Date(ts * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC', now }) {
  const at = n.readyAt <= now ? 'can be sold now' : 'can be sold from ' + when(n.readyAt);
  const until = when(n.readyAt + WINDOW);
  if (n.type === 'tokens') return 'Sell notice: ' + fmt(n.amount) + ' ' + symbol + ' from QLocks lock #' + n.id + ' ' + at + ' (the notice ends ' + until + ').';
  return 'LP notice: QLocks LP lock #' + n.id + ' ' + at + ' (the notice ends ' + until + ').';
}

/// A notice is live from its announcement until readyAt + WINDOW; after that it lapsed unused.
export const noticeLive = (n, now) => now <= n.readyAt + WINDOW;
