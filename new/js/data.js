// data.js – shared fixture data. No dependencies.
// WARNING: No template literals (backticks) used - they break the editor.

// Helpers
const CHAINS = [
  'Robinhood', 'Base', 'Solana', 'BNB', 'Ethereum', 'Arbitrum', 'Elysium',
];
const STAGES = ['new', 'final', 'migrated'];
const QPROOF_VERDICTS = ['Clear', 'Watch', 'Danger', 'Not checked'];
const SYM_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function rand(min, max) {
  return min + Math.random() * (max - min);
}
function randInt(min, max) {
  return Math.floor(rand(min, max));
}
function pad(n, w) {
  return String(n).padStart(w || 2, '0');
}

// Generate a realistic Ethereum-style address (shortened format for display)
function makeAddress() {
  const hex = Array.from({length: 64}, function() {
    return Math.floor(rand(0, 16)).toString(16);
  }).join('');
  return '0x' + hex.slice(0, 4) + '...' + hex.slice(-4);
}

// Generate a full 40-char address for token data lookup
function makeLongAddress() {
  return '0x' + Array.from({length: 40}, function() {
    return ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f'][Math.floor(rand(0, 16))];
  }).join('');
}

// 40 token names
const TOKEN_NAMES = [
  'Quantum Hook Token', 'Pulse Bond', 'Anchor Curve', 'Rocket Bond',
  'Swift Pool', 'Nova Yield', 'Zenith Hook', 'Fusion Curve',
  'Atlas Pool', 'Beacon Hook', 'Core Bond', 'Delta Curve',
  'Echo Pool', 'Flux Bond', 'Genesis Hook', 'Horizon Pool',
  'Impulse Curve', 'Jupiter Bond', 'Kernel Pool', 'Link Hook',
  'Meta Curve', 'Nexus Bond', 'Orbit Pool', 'Prism Hook',
  'Quasar Curve', 'Radius Bond', 'Spark Pool', 'Titan Hook',
  'Ultracurve', 'Vertex Bond', 'Warp Pool', 'Xenon Hook',
  'Yield Curve', 'Zephyr Pool', 'Apex Bond', 'Breeze Hook',
  'Coral Pool', 'Drift Curve', 'Ember Bond', 'Fjord Pool',
];

function generateCandles(count) {
  count = count || 200;
  const candles = [];
  let price = rand(0.01, 5);
  const now = Date.now();
  const interval = 60000;
  const baseTime = now - count * interval;
  for (let i = 0; i < count; i++) {
    const open = price;
    const change = rand(-0.12, 0.14) * price;
    const close = +(open + change).toFixed(6);
    const high = Math.max(open, close) * rand(1, 1.08);
    const low = Math.min(open, close) * rand(0.92, 1);
    const vol = rand(10, 5000);
    candles.push({
      time: baseTime + i * interval,
      open: +open.toFixed(6),
      high: +high.toFixed(6),
      low: +low.toFixed(6),
      close: close,
      volume: Math.round(vol),
    });
    price = close;
  }
  return candles;
}

function generateTrades(count, price) {
  count = count || 60;
  const trades = [];
  const now = Date.now();
  const types = ['buy', 'sell'];
  for (let i = 0; i < count; i++) {
    const type = pick(types);
    const amt = rand(0.001, 50);
    const p = price * rand(0.95, 1.05);
    trades.push({
      time: now - i * rand(1000, 60000),
      type: type,
      price: +p.toFixed(6),
      amount: +amt.toFixed(4),
      usd: +(amt * p).toFixed(2),
      trader: makeAddress(),
    });
  }
  return trades;
}

function generateTokens(count) {
  count = count || 40;
  const tokens = [];
  const usedSyms = new Set();
  for (let i = 0; i < count; i++) {
    let sym;
    do {
      sym = SYM_CHARS[i % 26] +
        SYM_CHARS[Math.floor(rand(0, 26))] +
        SYM_CHARS[Math.floor(rand(0, 26))] +
        (i > 9 ? String(i) : '');
    } while (usedSyms.has(sym));
    usedSyms.add(sym);

    const ageSec = randInt(10, 90 * 24 * 3600);
    const mcap = rand(500, 50000000);
    const liquidity = mcap * rand(0.05, 0.4);
    const price = rand(0.0001, 15);
    const volume = mcap * rand(0.1, 2.0);
    const holders = randInt(50, 15000);

    const top10 = rand(5, 65);
    const dev = rand(2, 30);
    const sniper = rand(0, 25);
    const insider = rand(3, 40);
    const bundler = rand(1, 20);

    const v = pick(QPROOF_VERDICTS);
    const badge = pick(['P1', 'P2', 'P3', '']);

    tokens.push({
      id: i,
      symbol: sym,
      name: TOKEN_NAMES[i % TOKEN_NAMES.length],
      address: makeLongAddress(),
      ageSec: ageSec,
      holders: holders,
      volume: Math.round(volume),
      mcap: Math.round(mcap),
      liquidity: Math.round(liquidity),
      price: price,
      top10: Math.round(top10 * 100) / 100,
      dev: Math.round(dev * 100) / 100,
      sniper: Math.round(sniper * 100) / 100,
      insider: Math.round(insider * 100) / 100,
      bundler: Math.round(bundler * 100) / 100,
      qProof: v,
      badge: badge,
      chain: pick(CHAINS),
      stage: pick(STAGES),
      candles: generateCandles(200),
      trades: generateTrades(60, price),
    });
  }
  return tokens;
}

// Export the data
const TOKENS = generateTokens(40);

const TOKEN_MAP = {};
TOKENS.forEach(function(t) {
  TOKEN_MAP[t.address] = t;
});

const NEW_TOKENS = TOKENS.filter(function(t) {
  return t.stage === 'new';
});
const FINAL_TOKENS = TOKENS.filter(function(t) {
  return t.stage === 'final';
});
const MIGRATED = TOKENS.filter(function(t) {
  return t.stage === 'migrated';
});

// PULSE_TOKENS - organized by pulse column keys
const PULSE_TOKENS = {
  new: NEW_TOKENS,
  finalStretch: FINAL_TOKENS,
  migrated: MIGRATED,
};

const PRESET_AMOUNTS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5];

const CHAIN_PRICES = {
  SOL: rand(140, 210),
  ETH: rand(2200, 3200),
};

export {
  TOKENS,
  TOKEN_MAP,
  NEW_TOKENS,
  FINAL_TOKENS,
  MIGRATED,
  PULSE_TOKENS,
  PRESET_AMOUNTS,
  CHAIN_PRICES,
  generateTokens,
  generateCandles,
  generateTrades,
  CHAINS,
  QPROOF_VERDICTS,
};
