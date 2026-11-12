// Public form projections only. Never read key, password, backup, wallet or file controls.
export function pips(value) {
  if (!/^\d+$/.test(String(value || ''))) return '—';
  const n = BigInt(value), whole = n / 10000n, fraction = (n % 10000n).toString().padStart(4, '0').replace(/0+$/, '');
  return whole + (fraction ? '.' + fraction : '') + '%';
}
export function exact(value, suffix = '') {
  const s = String(value ?? '').trim();
  if (!s) return '—';
  return s + suffix;
}
export function projectReadout(kind, v = {}) {
  const raw = (key, suffix = '') => exact(v[key], suffix);
  const fee = key => pips(v[key]);
  const row = (label, value) => ({label, value});
  const common = [row('Pool fee', fee('poolFee')), row('Tick spacing', raw('tickSpacing'))];
  const modes = {'0': 'Net quote target', '1': 'Owner approval', '2': 'Keep source pool'};
  const defs = {
    catalog: {name: v.family || 'Choose your hook', rows: [row('Chain', v.chain || 'Choose a chain'), row('Project', v.projectName || 'Choose a name'), row('Next', 'Prepare build')]},
    creator: {name: v.template === 'split' ? 'Revenue Split' : 'Creator Revenue', rows: [row('Creator fee', /^\d+$/.test(v.feeBps || '') ? pips(String(BigInt(v.feeBps) * 100n)) : '—'), ...common]},
    fee: {name: v.template === 'directional' ? 'Directional Fees' : 'Dynamic Fees', rows: v.template === 'directional' ? [row('Token 0 → 1', fee('initialFee0For1')), row('Token 1 → 0', fee('initialFee1For0')), row('Fee ceiling', fee('maxLpFee'))] : [row('Initial LP fee', fee('initialLpFee')), row('Fee ceiling', fee('maxLpFee')), row('Tick spacing', raw('tickSpacing'))]},
    circuit: {name: 'Circuit Recovery', rows: [row('Recovery cooldown', raw('cooldownSeconds', ' s')), row('Token 0 threshold', raw('initialThreshold0For1')), row('Token 1 threshold', raw('initialThreshold1For0'))]},
    band: {name: 'Price Bands', rows: [row('Minimum sqrtPriceX96', raw('minSqrtPriceX96')), row('Maximum sqrtPriceX96', raw('maxSqrtPriceX96')), row('Pool fee', fee('poolFee'))]},
    twap: {name: 'TWAP Oracle', rows: [row('Truncation', v.maxTickMove === '0' ? 'Off' : raw('maxTickMove', ' ticks/s')), row('History', raw('cardinality', ' slots')), row('Pool fee', fee('poolFee'))]},
    volfee: {name: 'Volatility Fee', rows: [row('Base fee', fee('baseFee')), row('Fee cap', fee('maxFee')), row('Movement half-life', raw('halfLife', ' s'))]},
    epoch: {name: 'Volume Epochs', rows: [row('Epoch duration', raw('epochSeconds', ' s')), row('Token 0 budget', raw('initialBudget0For1')), row('Token 1 budget', raw('initialBudget1For0'))]},
    graduation: {name: 'QGraduation', rows: [row('Graduation', modes[v.mode] || 'Choose a policy'), row('Policy notice', raw('notice', ' s')), row('Destination fee', v.destinationFee ? exact(v.destinationFee, '%') : fee('destinationFeePips'))]},
    actions: {name: 'QGraduation', rows: [row('Action', v.action || 'Load a setup'), row('Authorization', 'Wallet + quantum key'), row('Workspace', 'Local chain 31337')]},
    local: {name: 'QGraduation', rows: [row('Workspace', 'Local chain 31337'), row('Policy notice', raw('notice', ' s')), row('Token', v.symbol || 'Choose your token')]},
    export: {name: v.family || 'Choose your hook', rows: [row('Chain selection', v.chain || 'Choose a chain'), row('Next', 'Configure your hook')]},
    overview: {name: 'QGraduation', rows: [row('Quote target', 'Net quote inflow'), row('Approval', 'Wallet + quantum key'), row('Migration', 'On the selected chain')]},
    deployed: {name: v.title || 'Deployed hook', rows: [row('Deployment', v.title === 'No deployment in this link' ? 'Open a share link' : 'See contract checks'), row('Owner actions', 'Review with both keys')]},
    setup: {name: 'Creator Keys', rows: [row('Verifier', 'SLH-DSA'), row('Key contract', 'QPQCreator'), row('Cost', 'Network gas only')]},
    upgrade: {name: 'Creator Keys', rows: [row('Role', 'Creator LP fees'), row('Authorization', 'Wallet + quantum key'), row('Recovery delay', '30 days')]},
  };
  return defs[kind] || defs.creator;
}
