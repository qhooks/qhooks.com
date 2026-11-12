// QDrops per-chain config (2026-11-08). Shared by the scorer cron (server/qdrops.mjs) and the claim card.
// INERT until a chain has `address`: the cron skips it and the card says drops start once the distributor is live.
// Randall approves the deploy, the Safe deposit and every amount below before any of it goes live.
//
// tokens: same order as QDrops.tokens() (the order the Safe lists them). Every source names one of them.
// drop: holders + stakers in one pot per window (launch week, then weekly), time-weighted over the window.
// callouts: poolBps of the day's terminal fees on this chain (fees counted in any feeCurrencies), split by callout
//   points earned on this chain's markets that day. 1000 = 10% (Randall, 2026-11-07: "Start at 10").
// referrals: phase 3 tier top-ups. Off.
export const QHOOKS = '0x20429af7ca3b0ce4d99edbaa0693f26c5df05195';
export const SAFE = '0x2b1cf7c4071a98a59709166dfa73c7acb7e83e71';
export const ROUTER = '0x79d211f5137d22b0fe3bfda81fbb8b7f53248bff';
const ZERO = '0x0000000000000000000000000000000000000000';

export const DROPS = {
  '4663': {
    name: 'Robinhood Chain',
    address: '0x89eb481a2ea221e62647c113c88de67e7b9a5a70', // QDrops, deployed + funded by Safe tx 0x535e39e7…0496 (2026-11-09)
    fromBlock: 110112373, // its deploy block
    tokens: [
      {address: QHOOKS, symbol: 'QHOOKS', decimals: 18},
      {address: '0x0bd7d308f8e1639fab988df18a8011f41eacad73', symbol: 'WETH', decimals: 18},
    ],
    // One pot for holders and stakers, scored over a window (Randall approved 2026-11-09: a launch-week drop of 1M
    // QHOOKS from the Safe's marketing tranche, then weekly drops from the community-rewards lock as it releases).
    // Rules confirmed by Randall 2026-11-09 (minimum raised to 100,000).
    drop: {
      token: QHOOKS,
      held: {kind: 'erc20', address: QHOOKS, fromBlock: 108872832},
      staked: {kind: 'vault', address: '0x6248098bfa019b9035a21722a86bdee3f6e9b934', fromBlock: 108872832},
      locks: {address: '0xb43356e71c56d07ffe825791b60eea257a4fbc7e'}, // QLocks v2 lockedOf(token, wallet): self-locks; grants never count
      // QStakeLock timed staking (live 2026-11-09): holds every timed lock's QHOOKS staked in the vault as one address.
      // Each lock's amount is credited to its owner at every day-end it's open (from Locked/Withdrawn events), scored at
      // max(stakeMultiplier, lockMultiplier), so moving stake into a timed lock never earns less (main thread 2026-11-10).
      stakeLocks: {address: '0x807390f11e52e8508636bac3c54b47b17a66dae3', fromBlock: 110600000},
      windows: [
        {id: 'launch', start: '2026-11-08', end: '2026-11-14', pot: '1000000000000000000000000', callouts: false}, // 1M QHOOKS; publishes right after the window, without waiting a day for callout points
        {id: 'bridge', start: '2026-11-14', end: '2026-11-17', pot: '0', calloutsFrom: '2026-11-08'}, // also pays launch-week calls (11-08..11-13; the launch window skips callouts) — main thread 2026-11-12 // no holder drop; lines the weekly drops up to start Nov 17 (main thread 2026-11-09)
      ],
      // 250,000 QHOOKS a week from the community-rewards lock (QLocks v1 #4), Randall approved 2026-11-09. First week
      // Nov 17 → Nov 24. Funded each week through /safe-drops-fund (withdraw + deposit + announce next week).
      weekly: {days: 7, pot: '250000000000000000000000'},
      minAverage: '100000000000000000000000', // 100,000 QHOOKS average (held + staked + self-locked); Randall 2026-11-09, matches the 100K cashback tier
      minDays: 4, // and at least that much at 4 day-ends (launch week: 4 of 6, QHOOKS went live Nov 8 02:03 UTC; weekly: 4 of 7)
      stakeMultiplier: 1.5, lockMultiplier: 1.5,
      shareCap: 0.02, // at most 2% per first-sender cluster (single wallets keep the same cap)
    },
    callouts: [{token: '0x0bd7d308f8e1639fab988df18a8011f41eacad73', feeCurrencies: [ZERO, '0x0bd7d308f8e1639fab988df18a8011f41eacad73'], poolBps: 1000, shareCap: 0.25}],
    referrals: null,
    // Never counted as holders: the pool, locks, Safe, flywheel, vaults, burn. Any address with contract code is also
    // skipped (EIP-7702 delegated wallets still count), and so are wallets that buy and sell in the same block
    // three or more times in a day.
    exclude: [
      '0x8366a39cc670b4001a1121b8f6a443a643e40951', // Uniswap v4 PoolManager (holds the pool's QHOOKS)
      '0xd921e59e25f6bc283d60ec92799dc35fc40ce02a', // QLocks
      SAFE,
      '0xb85e67cf7728572033a9d36aee3218dadf85baa2', // QFlywheel
      '0x6248098bfa019b9035a21722a86bdee3f6e9b934', // QHOOKS stakers vault (stakers are scored separately)
      '0x807390f11e52e8508636bac3c54b47b17a66dae3', // QStakeLock timed locks (lock owners are scored separately)
      ROUTER,
      ZERO, '0x000000000000000000000000000000000000dead',
      // Team wallets (Randall 2026-11-11): launch wallet, fomo wallet, Safe owners, keepers.
      '0xaf48a5ab32ef96ee7a72ed6ed4534be1bc928c73', // launch wallet
      '0xa393e27ddf15d08d5f719a43c0a5c2a92dba2ae5', // fomo wallet
      '0x88db60586866294409e47bbbb0b436104f09c1b5', // Safe owner Qhooks1
      '0x9b13398df547c18e68d1cfe086ff1cb5f1a84127', // Safe owner Qhooks2
      '0x9f57ea4801259f12ad68564615a7ddf5a1c820e5', // keeper (QDrops rooter)
      '0x38d0d70da8ca00bf60e1175f607fac7662dd31ac', // keeper (arb)
    ],
    bots: [],
  },
  '8453': {
    name: 'Base',
    address: null,
    fromBlock: null,
    tokens: [
      {address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', decimals: 18},
      {address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', symbol: 'USDC', decimals: 6},
    ],
    drop: null,
    callouts: [
      {token: '0x4200000000000000000000000000000000000006', feeCurrencies: [ZERO, '0x4200000000000000000000000000000000000006'], poolBps: 1000, shareCap: 0.25},
      {token: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', feeCurrencies: ['0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'], poolBps: 1000, shareCap: 0.25},
    ],
    referrals: null,
    exclude: [],
    bots: [],
  },
};
export const liveChains = (config = DROPS) => Object.entries(config).filter(([, c]) => c.address).map(([id]) => id);
export const tokenInfo = (chainId, token, config = DROPS) => config[chainId]?.tokens.find(t => t.address === String(token).toLowerCase()) || null;
