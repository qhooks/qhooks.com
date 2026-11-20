// ui.js – shared formatters for QHooks. No dependencies.

const COLORS = {
  '#0b0c0e':  'bg',
  '#121419':  'surface-1',
  '#171a20':  'surface-2',
  '#23262d':  'line',
  '#e8eaed':  'text',
  '#8a8f98':  'muted',
  '#2ee59d':  'up',
  '#ff4d5e':  'dn',
  '#f5b544':  'acc',
};

// Compact USD: $3.05K, $1.2M, $2.5B
function compactUSD(val) {
  if (val == null || !isFinite(val)) return '\u2014';
  if (val < 0) return '\u2212' + compactUSD(-val);
  if (val > 0 && val < 0.01) { var m = val.toExponential(3).split('e-'); var z = parseInt(m[1],10) - 1; var d = m[0].replace('.','').replace(/0+$/,''); var sub = String(z).split('').map(function(c){ return '\u2080\u2081\u2082\u2083\u2084\u2085\u2086\u2087\u2088\u2089'[+c]; }).join(''); return '$0.0' + sub + d; }
  const abs = Math.abs(val);
  if (abs >= 1000000000) {
    return '$' + (val / 1000000000).toFixed(abs >= 10000000000 ? 0 : 1) + 'B';
  }
  if (abs >= 1000000) {
    return '$' + (val / 1000000).toFixed(abs >= 100000000 ? 0 : 1) + 'M';
  }
  if (abs >= 1000) {
    return '$' + (val / 1000).toFixed(abs >= 10000 ? 1 : 2) + 'K';
  }
  return '$' + val.toFixed(2);
}

// Compact age: 4s, 1m, 9d, 2h
function compactAge(sec) {
  if (sec == null) return '0s';
  const abs = Math.abs(Math.floor(sec));
  if (abs < 60) return abs + 's';
  if (abs < 3600) return Math.floor(abs / 60) + 'm';
  if (abs < 86400) return Math.floor(abs / 3600) + 'h';
  return Math.floor(abs / 86400) + 'd';
}

// Compact number: 1.2M, 3.5K
function compactNum(val) {
  if (val == null) return '0';
  const abs = Math.abs(val);
  if (abs >= 1000000) return (val / 1000000).toFixed(1) + 'M';
  if (abs >= 1000) return (val / 1000).toFixed(abs >= 10000 ? 0 : 1) + 'K';
  return String(Math.floor(val));
}

// Short address: 0x06…f327
function shortAddress(addr) {
  if (!addr || addr.length <= 10) return addr || '';
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

// QProof chip color
function qproofColor(verdict) {
  switch (verdict) {
    case 'Clear': return '#2ee59d';
    case 'Watch': return '#f5b544';
    case 'Danger': return '#ff4d5e';
    default: return '#555a64';
  }
}

// Badge color (P1/P2/P3)
function badgeColor(badge) {
  switch (badge) {
    case 'P1': return '#3b82f6';
    case 'P2': return '#8b5cf6';
    case 'P3': return '#f59e0b';
    default: return '#8a8f98';
  }
}

// MC color by size
function mcapColor(mcap) {
  if (mcap >= 10000000) return '#2ee59d';
  if (mcap >= 1000000) return '#f5b544';
  return '#8a8f98';
}

// Stat icon color (red when high)
function statColor(val, threshold) {
  threshold = threshold || 30;
  return val > threshold ? '#ff4d5e' : '#8a8f98';
}

// Symbol tile color (deterministic from name)
function tileColor(symbol) {
  const hue = Array.from(symbol).reduce(function(a, c) {
    return a + c.charCodeAt(0);
  }, 0) % 360;
  return 'hsl(' + hue + ', 45%, 55%)';
}

// Timeframe list
const TIMEFRAMES = ['1s', '1m', '5m', '15m', '1h', '4h', '1D'];

// Chains list
const CHAINS = ['Robinhood', 'Base', 'Solana', 'BNB', 'Ethereum', 'Arbitrum', 'Elysium'];

// Nav links (desktop top bar)
const NAV_ITEMS = [
  { label: 'Trade', hash: '#/pulse' },
  { label: 'Discover', hash: '#/discover' },
  { label: 'Launch', hash: '#/launch' },
  { label: 'Perps', hash: '#/perps' },
  { label: 'Community', hash: '#/community' },
  { label: 'Agents', hash: '#/agents' },
  { label: 'Portfolio', hash: '#/portfolio' },
];

// Mobile bottom tabs (390px)
const TABS = [
  { label: 'Trade', hash: '#/pulse', icon: 'chart' },
  { label: 'Discover', hash: '#/discover', icon: 'compass' },
  { label: 'Launch', hash: '#/launch', icon: 'rocket' },
  { label: 'Portfolio', hash: '#/portfolio', icon: 'wallet' },
  { label: 'More', hash: '#/more', icon: 'dots' },
];

export {
  compactUSD,
  compactAge,
  compactNum,
  shortAddress,
  qproofColor,
  badgeColor,
  mcapColor,
  statColor,
  tileColor,
  TIMEFRAMES,
  CHAINS,
  NAV_ITEMS,
  TABS,
  COLORS,
};
