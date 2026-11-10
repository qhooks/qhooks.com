// Founding Launchers campaign (approved by Randall 2026-11-10: "Down for everything except #5 and #7").
// Shared by the server (server/founding.mjs, the QDrops scorer), the /founding page and the Safe page. Pure: no DOM,
// no network.
//
// Who: the first 50 QHooks launches (one-tap or Studio, any chain) made at or after `start`, one per creator wallet,
// QHooks' own wallets and test launches excluded.
// 1. Creator share: for 90 days, on trades of the token that name no referrer, the creator earns the 20% referral
//    share of the QHooks fee. The router keeps that share when there is no referrer, so it is paid back out of it as a
//    QDrops top-up. The router's referrer field is not used: it would bind each trader to the creator for good, on
//    every token.
// 2. Milestone grant: 50,000 QHOOKS, vested over 30 days (QGrants on Robinhood Chain), when the token reaches 100
//    holders and $5,000 of trading volume through QHooks within 14 days of launch. Budget 2.5M QHOOKS.
// 6. Boosted cashback: for the token's first 7 days, its traders get another 20% of the fee on top of the router's
//    30%, as a QDrops top-up.
// Top-ups for every chain are paid in WETH on Robinhood Chain through the weekly QDrops claim (QDrops only exists
// there). Fees taken in ETH or WETH count one to one. Fees in USDC, USDG, BNB/WBNB or HYPE/WHYPE are converted at that
// day's closing price. Fees taken in stock tokens are not counted.
// Entry: the creator holds 100,000 QHOOKS on Robinhood Chain (wallet + vault stake + timed locks) when they launch.
// Bounty: the first founding token to hold a $150,000 market cap for 24 hours straight wins $1,000.
export const QHOOKS = '0x20429af7ca3b0ce4d99edbaa0693f26c5df05195';
export const WETH_RH = '0x0bd7d308f8e1639fab988df18a8011f41eacad73';
export const SAFE = '0x2b1cf7c4071a98a59709166dfa73c7acb7e83e71';
export const ROUTER = '0x79d211f5137d22b0fe3bfda81fbb8b7f53248bff';
const DAY = 86400;

export const FOUNDING = {
  // Opens 2026-11-10 23:00 UTC (5:00 PM CT), Randall via the main thread. Launches before it don't count; until then
  // the page shows the rules, a countdown and "50 of 50 spots open".
  start: 1794351600,
  // Entry (Randall's team 2026-11-10: "all have to hold qhooks to enter"): the creator wallet holds at least 100,000
  // QHOOKS on Robinhood Chain (wallet + staked in the vault + timed locks) at the launch's time, or the launch doesn't
  // take a spot. Payouts also need it at payout time (that week is skipped, not forfeited).
  entry: {min: (100000n * 10n ** 18n).toString(), chain: '4663', vault: '0x6248098bfa019b9035a21722a86bdee3f6e9b934',
    stakeLock: '0x807390f11e52e8508636bac3c54b47b17a66dae3', stakeLockFrom: 110600000, from: 108872832},
  // Bounty ("first coin to 150k gets 1k usd"): first founding token to hold a $150,000 market cap for 24 hours straight
  // wins $1,000 in WETH on Robinhood Chain. Tracking ships with the payout tree; until then the page shows it open.
  bounty: {mcapUsd: 150000, holdHours: 24, prizeUsd: 1000, maxGapS: 1800}, // a sampling gap over 30 min restarts the 24 hours
  // Payouts on (2026-11-10 payout tree): each drop list pays the extra cashback, and pays the creator share and the
  // bounty only to creators holding the entry minimum at that moment (else it waits for a later list).
  payouts: true,
  spots: 50,
  // QHooks' own wallets: never founding creators, never paid a top-up.
  exclude: [
    SAFE,
    '0x88db60586866294409e47bbbb0b436104f09c1b5', // Safe owner Qhooks 1
    '0x9b13398df547c18e68d1cfe086ff1cb5f1a84127', // Safe owner Qhooks2
    '0xaf48a5ab32ef96ee7a72ed6ed4534be1bc928c73', // QHooks test launches (Clean Test, qAngel, QCAT)
    '0x0000000000000000000000000000000000000000', '0x000000000000000000000000000000000000dead',
  ],
  excludeTokens: [QHOOKS], // test launches by other wallets go here as chainId:token or token
  creatorShare: {days: 90, bps: 2000},
  boost: {days: 7, bps: 2000},
  grant: {
    chain: '4663', token: QHOOKS, qgrants: '0xf042b3624ddf632e9e320a4c697565de4dea664d', grantor: SAFE,
    amount: (50000n * 10n ** 18n).toString(), budget: (2500000n * 10n ** 18n).toString(),
    holders: 100, volumeUsd: 5000, perTraderShare: 0.25, withinDays: 14, vestDays: 30,
  },
  pay: {chain: '4663', token: WETH_RH, drops: '0x89eb481a2ea221e62647c113c88de67e7b9a5a70'},
  router: ROUTER,
  // Chains whose QHooks trades go through a fee router (same Swapped/Referral events). Elysium has its own router.
  routerChains: ['4663', '8453', '42161', '56', '1', '99901'],
  routers: {'99901': '0xff208831ed6f0c4e3e3224effa45fae7906dc6c2'},
  // Qualifying chains (Randall 2026-11-10). A chain with `gate` opens by itself once one of those launch contracts has
  // code there (Ethereum: the clean launch contract, deploying before 5 PM CT); until then the page says "opening soon".
  chains: [{id: '4663', name: 'Robinhood Chain'}, {id: '8453', name: 'Base'}, {id: '56', name: 'BNB Chain'}, {id: '42161', name: 'Arbitrum'}, {id: '99901', name: 'Elysium'},
    {id: '1', name: 'Ethereum', gate: ['0x34ac8c4e6ca3d5b70a5321b648d0db9451c060cc', '0xfb5a559886fccba6400cc52905ba3aa4658ba0cc']}],
};

const lower = s => String(s || '').toLowerCase();
const tokenKey = l => String(l.chainId) + ':' + lower(l.token);
export const isOwnWallet = (a, cfg = FOUNDING) => cfg.exclude.includes(lower(a));

/// The founding list from every QHooks launch: [{chainId, token, creator, launchedAt (s), kind, ...}] → the first
/// `spots` launches at or after start, one per creator (their earliest), ties broken by chain then token. Each gets
/// its slot number and its reward end times.
export function pickFounding(launches, cfg = FOUNDING) {
  if (!cfg.start) return [];
  const skipTok = new Set(cfg.excludeTokens.map(lower));
  // Entry rule: only launches whose creator held the minimum take a spot. Slots are given in launch order, so the list
  // stops at the first launch not checked yet (checks run oldest first, within minutes).
  let pool = launches;
  if (cfg.entry) {
    const sorted = [...launches].filter(l => Number(l.launchedAt) >= cfg.start).sort((a, b) => Number(a.launchedAt) - Number(b.launchedAt));
    const firstOpen = sorted.findIndex(l => l.entry == null);
    pool = (firstOpen < 0 ? sorted : sorted.slice(0, firstOpen)).filter(l => l.entry === true);
  }
  const chainIds = new Set((cfg.chains || []).map(c => c.id));
  const ok = pool.filter(l => (!chainIds.size || chainIds.has(String(l.chainId))) && Number(l.launchedAt) >= cfg.start && /^0x[0-9a-f]{40}$/.test(lower(l.creator)) && !isOwnWallet(l.creator, cfg)
    && !skipTok.has(lower(l.token)) && !skipTok.has(tokenKey(l)));
  ok.sort((a, b) => Number(a.launchedAt) - Number(b.launchedAt) || String(a.chainId).localeCompare(String(b.chainId)) || lower(a.token).localeCompare(lower(b.token)));
  const seen = new Set(), out = [];
  for (const l of ok) {
    const c = lower(l.creator); if (seen.has(c)) continue;
    seen.add(c);
    const t = Number(l.launchedAt);
    out.push({...l, chainId: String(l.chainId), token: lower(l.token), creator: c, launchedAt: t, slot: out.length + 1,
      creatorShareUntil: t + cfg.creatorShare.days * DAY, boostUntil: t + cfg.boost.days * DAY, grantBy: t + cfg.grant.withinDays * DAY});
    if (out.length >= cfg.spots) break;
  }
  return out;
}

/// What one router trade of a founding token earns, in its fee currency (bigint base units).
/// trade: {trader, fee, referred, ts}. launch: a pickFounding row.
export function tradeRewards(trade, launch, cfg = FOUNDING) {
  const fee = BigInt(trade.fee), ts = Number(trade.ts), out = [];
  if (fee <= 0n || ts < launch.launchedAt) return out;
  const trader = lower(trade.trader);
  if (!trade.referred && ts < launch.creatorShareUntil && trader !== launch.creator && !isOwnWallet(trader, cfg))
    out.push({account: launch.creator, kind: 'founding-creator', amount: fee * BigInt(cfg.creatorShare.bps) / 10000n});
  if (ts < launch.boostUntil && !isOwnWallet(trader, cfg))
    out.push({account: trader, kind: 'founding-cashback', amount: fee * BigInt(cfg.boost.bps) / 10000n});
  return out;
}

/// Milestone volume: USD per trader, the creator and QHooks wallets left out, each trader counted up to
/// perTraderShare of the bar, so one wallet trading back and forth can't make it alone.
export function milestoneVolume(perTraderUsd, launch, cfg = FOUNDING) {
  const cap = cfg.grant.volumeUsd * cfg.grant.perTraderShare;
  let total = 0;
  for (const [trader, usd] of perTraderUsd) if (trader !== launch.creator && !isOwnWallet(trader, cfg)) total += Math.min(Number(usd) || 0, cap);
  return total;
}
export const milestoneMet = (holders, volumeUsd, cfg = FOUNDING) => Number(holders) >= cfg.grant.holders && volumeUsd >= cfg.grant.volumeUsd;

/// UTC midnight at or before t (s). Grant batches only include milestones reached before it, so both Safe owners
/// build the same batch all day.
export const dayCut = t => Math.floor(Number(t) / DAY) * DAY;

/// The grant batch for the Safe: creators who qualified before `cut`, minus those already granted (from QGrants), in
/// slot order, within what's left of the budget.
export function grantBatch(launches, granted, cut, cfg = FOUNDING) {
  const g = cfg.grant, have = new Set([...granted].map(lower));
  let left = BigInt(g.budget) - BigInt(have.size) * BigInt(g.amount);
  const rows = [];
  for (const l of [...launches].sort((a, b) => a.slot - b.slot)) {
    if (!l.qualifiedAt || l.qualifiedAt >= cut || have.has(l.creator) || isOwnWallet(l.creator, cfg)) continue;
    if (left < BigInt(g.amount)) break;
    rows.push({beneficiary: l.creator, amount: g.amount, start: 0, cliff: 0, span: g.vestDays * DAY, steps: 0, slot: l.slot, token: l.token, chainId: l.chainId});
    left -= BigInt(g.amount); have.add(l.creator);
  }
  return {rows, left};
}
