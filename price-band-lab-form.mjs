import { buildPriceBandDraft, priceBandFields } from './price-band-draft.mjs';

export function readPriceBandForm(value) {
  const d=buildPriceBandDraft(Object.fromEntries(priceBandFields.map(k=>[k,value(k)])));
  return Object.freeze(Object.fromEntries(priceBandFields.map(k=>[k,d[k]])));
}

export function priceBandExample() {
  return Object.freeze({
    projectName: 'Price bands example',
    chainId: '31337',
    poolFee: '3000',
    tickSpacing: '60',
    minSqrtPriceX96: '39614081257132168796771975168',
    maxSqrtPriceX96: '158456325028528675187087900672'
  });
}

export function renderPriceBandSummary(container, a) {
  if (!a || a.kind !== 'qhooks-compiled-project' || a.compiled !== true || a.deployed !== false || a.configuration?.templateId !== 'qprice-band-pq-governance' || a.contracts?.controller?.name !== 'ConfiguredPriceBandController' || a.contracts?.hook?.name !== 'GovernedPriceBandHook') {
    throw new Error('Invalid project configuration');
  }

  const section = container.ownerDocument.createElement('section');
  section.className = 'build-summary';

  const h2 = container.ownerDocument.createElement('h2');
  h2.textContent = 'Ready to integrate';
  section.appendChild(h2);

  const p1 = container.ownerDocument.createElement('p');
  p1.textContent = a.configuration.projectName;
  section.appendChild(p1);

  const dl = container.ownerDocument.createElement('dl');
  const rows = [
    ['Profile', 'ML-DSA-65'],
    ['Chain ID', a.configuration.chainId],
    ['Pool fee', a.configuration.poolFee + ' pips'],
    ['Tick spacing', a.configuration.tickSpacing],
    ['Minimum sqrtPriceX96', a.configuration.minSqrtPriceX96],
    ['Maximum sqrtPriceX96', a.configuration.maxSqrtPriceX96],
    ['Controller name', a.contracts.controller.name],
    ['Hook name', a.contracts.hook.name]
  ];

  rows.forEach(([label, value]) => {
    const dt = container.ownerDocument.createElement('dt');
    dt.textContent = label;
    dl.appendChild(dt);
    const dd = container.ownerDocument.createElement('dd');
    dd.textContent = value;
    dl.appendChild(dd);
  });

  section.appendChild(dl);

  const p2 = container.ownerDocument.createElement('p');
  p2.textContent = 'Raw token-unit price bounds, not dollar prices. Deployment and wallet enrollment are separate steps.';
  section.appendChild(p2);

  container.replaceChildren(section);
}
