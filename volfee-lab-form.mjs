import { buildVolfeeDraft, volfeeFields } from './volfee-draft.mjs';

export function readVolfeeForm(value) {
  const d = buildVolfeeDraft(Object.fromEntries(volfeeFields.map(k => [k, value(k)])));
  return Object.freeze(Object.fromEntries(volfeeFields.map(k => [k, d[k]])));
}

// Local-chain example: two placeholder token addresses in pool order (the first two contracts the default local account deploys).
const example = Object.freeze({
  projectName: 'Volatility fee example',
  chainId: '31337',
  currency0: '0x5fbdb2315678afecb367f032d93f642f64180aa3',
  currency1: '0xe7f1725e7734ce288f8367e1bb143e90bb3f0512',
  tickSpacing: '60',
  baseFee: '500',
  maxFee: '30000',
  feePerTickCentiPips: '100',
  halfLife: '600'
});

export function volfeeExample() { return Object.freeze({ ...example }); }

const pct = pips => (Number(pips) / 10000).toLocaleString('en-US', { maximumFractionDigits: 4 }) + '%';
export function renderVolfeeSummary(container, a) {
  if (!a || a.kind !== 'qhooks-compiled-project' || a.compiled !== true || a.deployed !== false ||
      a.configuration?.templateId !== 'qvolatility-fee-hook' || a.contracts?.hook?.name !== 'ConfiguredVolatilityFeeHook') {
    throw new Error('Invalid project configuration');
  }
  const d = container.ownerDocument, c = a.configuration;
  const section = d.createElement('section'); section.className = 'build-summary';
  const h2 = d.createElement('h2'); h2.textContent = 'Ready to integrate'; section.appendChild(h2);
  const p = d.createElement('p'); p.textContent = c.projectName; section.appendChild(p);
  const dl = d.createElement('dl');
  const rows = [
    ['Chain ID', c.chainId], ['Token 0', c.currency0], ['Token 1', c.currency1], ['Tick spacing', c.tickSpacing],
    ['Base fee', `${c.baseFee} pips (${pct(c.baseFee)})`], ['Fee cap', `${c.maxFee} pips (${pct(c.maxFee)})`],
    ['Added per tick of movement', `${Number(c.feePerTickCentiPips) / 100} pips`], ['Half-life', `${c.halfLife} s`],
    ['Hook', a.contracts.hook.name], ['Hook permission bits', '0x10c0 (afterInitialize, beforeSwap, afterSwap)'],
    ['Runtime size', `${a.contracts.hook.runtimeBytes.toLocaleString('en-US')} bytes`]
  ];
  for (const [label, value] of rows) {
    const dt = d.createElement('dt'); dt.textContent = label; dl.appendChild(dt);
    const dd = d.createElement('dd'); dd.textContent = String(value); dl.appendChild(dd);
  }
  section.appendChild(dl);
  const p2 = d.createElement('p');
  p2.textContent = 'Deploy at a CREATE2 address whose last 14 bits are 0x10c0, then initialize the one dynamic-fee pool (fee 0x800000) it accepts. Each swap pays the fee currentFee() reports.';
  section.appendChild(p2);
  container.replaceChildren(section);
}
