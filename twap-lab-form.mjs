import { buildTwapDraft, twapFields } from './twap-draft.mjs';

export function readTwapForm(value) {
  const d = buildTwapDraft(Object.fromEntries(twapFields.map(k => [k, value(k)])));
  return Object.freeze(Object.fromEntries(twapFields.map(k => [k, d[k]])));
}

// Local-chain example: two placeholder token addresses in pool order (replace with the tokens you deploy).
const example = Object.freeze({
  projectName: 'TWAP oracle example',
  chainId: '31337',
  currency0: '0x5fbdb2315678afecb367f032d93f642f64180aa3',
  currency1: '0xe7f1725e7734ce288f8367e1bb143e90bb3f0512',
  poolFee: '3000',
  tickSpacing: '60',
  maxTickMove: '25',
  cardinality: '64'
});

export function twapExample() { return Object.freeze({ ...example }); }

export function renderTwapSummary(container, a) {
  if (!a || a.kind !== 'qhooks-compiled-project' || a.compiled !== true || a.deployed !== false ||
      a.configuration?.templateId !== 'qtwap-oracle-hook' || a.contracts?.hook?.name !== 'ConfiguredTwapOracleHook') {
    throw new Error('Invalid project configuration');
  }
  const d = container.ownerDocument, c = a.configuration;
  const section = d.createElement('section'); section.className = 'build-summary';
  const h2 = d.createElement('h2'); h2.textContent = 'Ready to integrate'; section.appendChild(h2);
  const p = d.createElement('p'); p.textContent = c.projectName; section.appendChild(p);
  const dl = d.createElement('dl');
  const rows = [
    ['Chain ID', c.chainId],
    ['Token 0', c.currency0],
    ['Token 1', c.currency1],
    ['Pool fee', `${c.poolFee} pips`],
    ['Tick spacing', c.tickSpacing],
    ['Truncation', c.maxTickMove === '0' ? 'off (records the pool tick as it is)' : `at most ${c.maxTickMove} ticks per second per observation`],
    ['History slots at start', c.cardinality],
    ['Hook', a.contracts.hook.name],
    ['Hook permission bits', '0x1080 (afterInitialize, beforeSwap)'],
    ['Runtime size', `${a.contracts.hook.runtimeBytes.toLocaleString('en-US')} bytes`]
  ];
  for (const [label, value] of rows) {
    const dt = d.createElement('dt'); dt.textContent = label; dl.appendChild(dt);
    const dd = d.createElement('dd'); dd.textContent = String(value); dl.appendChild(dd);
  }
  section.appendChild(dl);
  const p2 = d.createElement('p');
  p2.textContent = 'Deploy at a CREATE2 address whose last 14 bits are 0x1080, then initialize the one pool it accepts. consult(seconds) reads the average tick once that much history exists.';
  section.appendChild(p2);
  container.replaceChildren(section);
}
