// Launch blocks as creators see them. Settings map onto the QLaunchBlocks constructor
// fields; units: 'pct' (percent, stored as bps), 'min'/'hr'/'day'/'sec' (stored as seconds),
// 'quote' (quote asset, stored in its base units), 'raw' (plain number), 'addr', 'supplyPct'.
import {chainMap} from './chains.mjs';
export const CATEGORIES = [
  { id: 'protect', name: 'Protection', line: 'Keep bots and whales from taking the launch.' },
  { id: 'fees', name: 'Fees', line: 'Charges that follow the market, the clock or the trade.' },
  { id: 'income', name: 'Creator income', line: 'What the launch pays you and your team.' },
  { id: 'rewards', name: 'Rewards and games', line: 'Burns, pots and points that give traders a reason to stay.' },
  { id: 'built', name: 'Built into every launch', line: 'No setup. Every QHooks launch has these.' }
];

// The opening auction is the holder gate pointed at this ownerless contract (same address on every
// chain; full-launch/extras.json). Blocks that would charge or credit the batch as one trader are off.
export const AUCTION_ADDRESS = '0xf58ba3c363a3d067fb05f404e3ecbee44e48b2f4';
export const AUCTION_CONFLICTS = ['openDelay', 'antiSnipe', 'walletCap', 'maxTrade', 'cooldown', 'holderGate', 'impactFee', 'sizeTiers', 'king', 'clockPot', 'points'];

export const BLOCKS = [
  { id: 'openingAuction', cat: 'protect', name: 'Opening auction', line: 'The first minutes clear at one price for everyone.',
    how: 'While the auction runs, the pool takes no direct buys. Anyone deposits; in the last two minutes anyone settles, and every deposit buys in the same single trade at the same price. Then trading opens. If nobody settles in time, every deposit can be taken back in full. Snipers and bundlers get exactly the price everyone else gets.',
    params: [{ k: 'auctionMin', label: 'Auction runs for', unit: 'min', def: 30, min: 5, max: 1440 }] },
  { id: 'openDelay', cat: 'protect', name: 'Opening bell', line: 'Trading opens a set time after the pool goes live.',
    how: 'Nobody can buy or sell until the delay ends, so you can share the pool before anyone can trade it. Up to 7 days.',
    params: [{ k: 'openDelay', label: 'Opens after', unit: 'min', def: 10, min: 1, max: 10080 }] },
  { id: 'antiSnipe', cat: 'protect', name: 'Anti-snipe', line: 'A falling launch tax and a per-block buy cap.',
    how: 'Buys pay the snipe tax at launch, falling to the floor over the decay. While the guard lasts, each block’s buys are capped; the cap widens as the tax falls and lifts when the decay ends.',
    params: [{ k: 'snipeBps', label: 'Snipe tax at launch', unit: 'pct', def: 25, min: 0, max: 50 },
      { k: 'snipeFloorBps', label: 'Tax after the decay', unit: 'pct', def: 0, min: 0, max: 50 },
      { k: 'snipeDecay', label: 'Falls over', unit: 'min', def: 5, min: 0, max: 10080 },
      { k: 'maxBuyPerBlock', label: 'Buys per block at launch', unit: 'quote', def: 'auto', hint: '0.5% of your starting quote' }],
    guard: true },
  { id: 'walletCap', cat: 'protect', name: 'Wallet cap', line: 'No wallet can buy more than a share of supply during the guard.',
    how: 'Each wallet’s buys add up against the cap until the launch guard ends.',
    params: [{ k: 'walletCapBps', label: 'Most one wallet can buy', unit: 'supplyPct', def: 1, min: 0.01, max: 100 }], guard: true },
  { id: 'maxTrade', cat: 'protect', name: 'Max trade', line: 'A ceiling on any single buy or sell.',
    how: 'One swap can move at most this share of supply, for the window you pick or for good.',
    params: [{ k: 'maxTradeBps', label: 'Largest trade', unit: 'supplyPct', def: 0.5, min: 0.01, max: 100 },
      { k: 'maxTradeSeconds', label: 'For', unit: 'hr', def: 24, min: 0, max: 720, hint: '0 keeps it for good' }] },
  { id: 'cooldown', cat: 'protect', name: 'Cooldown', line: 'One buy per wallet every few seconds during the guard.',
    how: 'A wallet that just bought waits before buying again until the launch guard ends.',
    params: [{ k: 'cooldownSeconds', label: 'Wait between buys', unit: 'sec', def: 30, min: 1, max: 3600 }], guard: true },
  { id: 'holderGate', cat: 'protect', name: 'Holder gate', line: 'Only holders of a token or NFT can buy at first.',
    how: 'For the first window, buyers must hold a minimum of the token you name. Selling is never gated.',
    params: [{ k: 'gateToken', label: 'Token or NFT address', unit: 'addr', def: '' },
      { k: 'gateMin', label: 'Minimum held (base units)', unit: 'raw', def: 1, min: 1 },
      { k: 'gateSeconds', label: 'Holders-only window', unit: 'min', def: 30, min: 1, max: 10080 }] },
  { id: 'sandwich', cat: 'protect', name: 'Sandwich guard', line: 'A trade that undoes this block’s move pays for it.',
    how: 'A swap that moves the price back toward where its block opened pays that move, up to the maximum, so a sandwich around a trade loses money.',
    params: [{ k: 'sandwichMaxBps', label: 'Most it can charge', unit: 'pct', def: 8, min: 1, max: 15 }] },
  { id: 'exitClock', cat: 'fees', name: 'Exit clock', line: 'Quick flips pay more; holders pay less.',
    how: 'Sells pay a fee that falls from the top rate to the floor over the horizon, counted from the wallet’s last buy.',
    params: [{ k: 'exitTopBps', label: 'Sell fee right after buying', unit: 'pct', def: 10, min: 0, max: 25 },
      { k: 'exitFloorBps', label: 'Sell fee after the horizon', unit: 'pct', def: 0, min: 0, max: 25 },
      { k: 'exitHorizon', label: 'Horizon', unit: 'day', def: 3, min: 0.01, max: 30 }] },
  { id: 'impactFee', cat: 'fees', name: 'Impact fee', line: 'Big price moves pay more; moving it back is free.',
    how: 'The fee rises with how far a swap pushes the price away from where its block opened, up to the ceiling.',
    params: [{ k: 'impactCeilBps', label: 'Ceiling', unit: 'pct', def: 3, min: 0.01, max: 10 },
      { k: 'impactSlope', label: 'Fee per 1% of price move', unit: 'pct', def: 1, min: 0.01, max: 10 }] },
  { id: 'stormFee', cat: 'fees', name: 'Storm fee', line: 'Fees rise when the price swings, then fade.',
    how: 'At each interval the pool measures its price move; the fee jumps toward a level set by that move, then fades back to the floor.',
    params: [{ k: 'stormFloorBps', label: 'Floor', unit: 'pct', def: 0, min: 0, max: 10 },
      { k: 'stormCeilBps', label: 'Ceiling', unit: 'pct', def: 3, min: 0, max: 10 },
      { k: 'stormMult', label: 'Fee per 1% of price move', unit: 'pct', def: 0.5, min: 0.01, max: 10 },
      { k: 'stormInterval', label: 'Measured every', unit: 'min', def: 5, min: 1, max: 1440 },
      { k: 'stormDecay', label: 'Fades over', unit: 'min', def: 60, min: 1, max: 10080 }] },
  { id: 'sessionFee', cat: 'fees', name: 'Market hours', line: 'Fees that follow US stock market sessions.',
    how: 'Each swap pays the rate for the current US session: regular hours, pre-market and after hours, overnight, or the weekend. Daylight saving is handled on chain.',
    params: [{ k: 'regularBps', label: 'Regular hours', unit: 'pct', def: 0, min: 0, max: 10 },
      { k: 'extendedBps', label: 'Pre-market and after hours', unit: 'pct', def: 0.3, min: 0, max: 10 },
      { k: 'overnightBps', label: 'Overnight', unit: 'pct', def: 0.5, min: 0, max: 10 },
      { k: 'closedBps', label: 'Weekend', unit: 'pct', def: 1, min: 0, max: 10 }] },
  { id: 'sizeTiers', cat: 'fees', name: 'Whale tiers', line: 'Bigger trades pay a higher rate.',
    how: 'Trades at or above each size pay that tier’s rate on top of everything else.',
    params: [{ k: 'tier1', label: 'Tier 1 from', unit: 'quote', def: 1000 }, { k: 'tier1Bps', label: 'Tier 1 rate', unit: 'pct', def: 1, min: 0, max: 10 },
      { k: 'tier2', label: 'Tier 2 from', unit: 'quote', def: 10000 }, { k: 'tier2Bps', label: 'Tier 2 rate', unit: 'pct', def: 3, min: 0, max: 10 }] },
  { id: 'tax', cat: 'income', name: 'Buy and sell tax', line: 'A cut of every trade, with an optional launch rate.',
    how: 'Buys and sells each pay their own rate in the quote asset, up to 10%. A higher launch rate can fall to the normal rate over time.',
    params: [{ k: 'buyTaxBps', label: 'Buy tax', unit: 'pct', def: 3, min: 0, max: 10 },
      { k: 'sellTaxBps', label: 'Sell tax', unit: 'pct', def: 3, min: 0, max: 10 },
      { k: 'launchTaxBps', label: 'Launch rate', unit: 'pct', def: 0, min: 0, max: 30, hint: '0 for none' },
      { k: 'taxDecay', label: 'Launch rate falls over', unit: 'min', def: 30, min: 0, max: 10080 }] },
  { id: 'payees', cat: 'income', name: 'Revenue split', line: 'Send block income to up to 8 wallets by fixed shares.',
    how: 'Whatever the blocks earn for the creator goes to the payees you set at launch. Anyone can trigger the payout; nobody can change the split. Add stakers to pay holders who stake the token: their share streams to stakers over a day, in the token and the pair currency. Any payee can vest instead of being paid at once: its share goes to a public vesting stream that pays the wallet evenly over 30 days to a year, so holders can see the creator\u2019s income arrives slowly.',
    params: [], always: true },
  { id: 'referrals', cat: 'income', name: 'Referrals', line: 'Traders who bring traders earn a share.',
    how: 'A trade made through a referral link credits a share of its block charges to the referrer, who claims it any time.',
    params: [{ k: 'referralShareBps', label: 'Referrer’s share of charges', unit: 'pct', def: 10, min: 1, max: 100 }] },
  { id: 'autoBurn', cat: 'rewards', name: 'Auto burn', line: 'A slice of every buy is burned.',
    how: 'Each buy sends this share of the tokens it receives to the dead address, on the spot.',
    params: [{ k: 'burnBps', label: 'Burned from each buy', unit: 'pct', def: 1, min: 0.01, max: 10 }] },
  { id: 'buyback', cat: 'rewards', name: 'Buyback and burn', line: 'Charges buy the token back and burn it.',
    how: 'A share of block charges fills a pot. Anyone can run a buyback once the cooldown passes; it buys the token within a price limit and burns it.',
    params: [{ k: 'buybackShareBps', label: 'Share of charges', unit: 'pct', def: 30, min: 1, max: 100 },
      { k: 'buybackMax', label: 'Most per buyback', unit: 'quote', def: 'auto', hint: '1% of your starting quote' },
      { k: 'buybackCooldown', label: 'Cooldown', unit: 'min', def: 10, min: 1, max: 1440 },
      { k: 'buybackSlipBps', label: 'Price limit', unit: 'pct', def: 3, min: 0.1, max: 10 }] },
  { id: 'king', cat: 'rewards', name: 'King of the pool', line: 'The biggest buy of each round takes the pot.',
    how: 'A share of block charges fills each round’s pot. The wallet with the largest single buy when the round ends claims it. Rounds with no buys roll over.',
    params: [{ k: 'kingShareBps', label: 'Share of charges', unit: 'pct', def: 20, min: 1, max: 100 },
      { k: 'kingRound', label: 'Round length', unit: 'min', def: 60, min: 5, max: 10080 }] },
  { id: 'clockPot', cat: 'rewards', name: 'Last buyer wins', line: 'Every buy resets the clock. When it runs out, the last buyer wins.',
    how: 'A share of block charges fills the pot. Each buy over the minimum restarts the timer; when it runs out, the last qualifying buyer claims the pot and a new game starts.',
    params: [{ k: 'clockShareBps', label: 'Share of charges', unit: 'pct', def: 20, min: 1, max: 100 },
      { k: 'clockTimer', label: 'Timer', unit: 'min', def: 10, min: 1, max: 1440 },
      { k: 'clockMinBuy', label: 'Smallest buy that counts', unit: 'quote', def: 'auto', hint: '0.1% of your starting quote' }] },
  { id: 'points', cat: 'rewards', name: 'Volume points', line: 'An on-chain record of every wallet’s volume.',
    how: 'Every trade adds its quote volume to the trader’s points, readable by anyone for drops and rewards.',
    params: [] }
];

export const BUILT_IN = [
  { name: 'Liquidity lock', line: 'Your starting liquidity sits in an escrow nobody can pull from. It only moves to graduate.' },
  { name: 'QGraduation', line: 'Move liquidity to a new pool on a published rule: a volume target, your approval, or never.' },
  { name: 'Two-key fee claims', line: 'Creator LP fees and graduation need your wallet and your post-quantum key together.' },
  { name: 'Notice period', line: 'Graduation policy changes wait out a public notice before they apply.' },
  { name: 'Creator LP fee', line: 'Pick the pool fee you earn, from 0.01% to 10%.' },
  { name: 'Six chains', line: 'Base, Ethereum, Arbitrum, BNB Chain, Robinhood Chain and Arc, with the same contracts.' }
];

export const PRESETS = [
  { id: 'none', name: 'No blocks', line: 'A plain protected pool.', on: [] },
  { id: 'fair', name: 'Fair launch', line: 'Stops snipers and whales for the first ten minutes.',
    on: ['antiSnipe', 'walletCap', 'cooldown', 'sandwich'], guardMin: 10 },
  { id: 'degen', name: 'Degen', line: 'Launch tax, burns, a king pot, a last-buyer clock and referrals.',
    on: ['antiSnipe', 'tax', 'autoBurn', 'king', 'clockPot', 'referrals', 'points'], guardMin: 5,
    set: { launchTaxBps: 15, buyTaxBps: 3, sellTaxBps: 3, taxDecay: 30, snipeBps: 10, kingShareBps: 20, clockShareBps: 20, referralShareBps: 10 } },
  { id: 'community', name: 'Community', line: 'Rewards holders, punishes flips, buys back.',
    on: ['exitClock', 'tax', 'buyback', 'referrals', 'points'], set: { buyTaxBps: 2, sellTaxBps: 2, buybackShareBps: 40, referralShareBps: 20 } },
  { id: 'hours', name: 'Market hours', line: 'Stock-style sessions and a storm fee for wild swings.',
    on: ['sessionFee', 'stormFee', 'sandwich'] },
  { id: 'auction', name: 'Opening auction', line: 'One opening price for everyone, then a small tax that buys back and burns.',
    on: ['openingAuction', 'tax', 'autoBurn', 'buyback', 'sandwich'], set: { auctionMin: 30, buyTaxBps: 2, sellTaxBps: 2, burnBps: 1, buybackShareBps: 50 } },
  { id: 'burn', name: 'Burn engine', line: 'Every buy burns, and charges buy back and burn more.',
    on: ['autoBurn', 'tax', 'buyback'], set: { burnBps: 2, buyTaxBps: 2, sellTaxBps: 2, buybackShareBps: 100 } },
  // 2% tax: 0.75% buyback and burn every 15 minutes, 0.25% referrals, and the creator's 1% split 75/25 with stakers
  // (Quick launch preselects the 25% stakers share; in Studio add "Stakers" to the revenue split).
  { id: 'flywheel', name: 'Holder engine', line: '2% tax: 0.75% buys back and burns every 15 minutes, 0.25% to stakers, 0.25% to referrers, 0.75% to you. Fair-launch guards for ten minutes.',
    on: ['antiSnipe', 'walletCap', 'cooldown', 'sandwich', 'tax', 'buyback', 'referrals', 'points'], guardMin: 10, stakers: 25,
    set: { buyTaxBps: 2, sellTaxBps: 2, launchTaxBps: 0, buybackShareBps: 37.5, referralShareBps: 12.5, buybackCooldown: 15, buybackSlipBps: 1 } }
];
/// Hidden presets show only when the page is opened with ?style=<id>.
export const presetVisible = p => !p.hidden || new URLSearchParams(location.search).get('style') === p.id;

// Which block covers each of hookr.fun's swap-path blocks, for the Hooks page comparison.
export const QUOTE_ASSETS = chainMap(c => [c.quote.symbol, c.quote.decimals]);
