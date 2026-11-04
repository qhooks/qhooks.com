import { buildCircuitDraft, circuitFields } from './circuit-lab-draft.mjs';

export function readCircuitForm(value) {
  const d = buildCircuitDraft(
    Object.fromEntries(circuitFields.map(k => [k, value(k)]))
  );
  return Object.freeze(
    Object.fromEntries(circuitFields.map(k => [k, d[k]]))
  );
}

// callback exactly once per field

export function circuitExample() {
  return Object.freeze({
    projectName: 'Circuit recovery example',
    chainId: '31337',
    poolFee: '3000',
    tickSpacing: '60',
    cooldownSeconds: '3600',
    initialThreshold0For1: '1000000000000000000000',
    initialThreshold1For0: '2000000000'
  });
}

export function renderCircuitSummary(container, a) {
  if (!a || a.kind !== 'qhooks-compiled-project' || a.compiled !== true || a.deployed !== false || a.configuration?.templateId !== 'qcircuit-recovery-pq-resume' || a.contracts?.controller?.name !== 'ConfiguredCircuitRecoveryController' || a.contracts?.hook?.name !== 'GovernedCircuitRecoveryHook') {
    throw new Error('Invalid project state');
  }

  const section = container.ownerDocument.createElement('section');
  section.className = 'build-summary';

  const h2 = container.ownerDocument.createElement('h2');
  h2.textContent = 'Ready to integrate';
  section.appendChild(h2);

  const p = container.ownerDocument.createElement('p');
  p.textContent = a.configuration.projectName;
  section.appendChild(p);

  const dl = container.ownerDocument.createElement('dl');
  const rows = [
    ['Profile', 'ML-DSA-65'],
    ['Chain ID', a.configuration.chainId],
    ['Pool fee', a.configuration.poolFee + ' pips'],
    ['Tick spacing', a.configuration.tickSpacing],
    ['Cooldown', a.configuration.cooldownSeconds + ' seconds'],
    ['Token 0 input threshold', a.configuration.initialThreshold0For1],
    ['Token 1 input threshold', a.configuration.initialThreshold1For0],
    ['Controller', a.contracts?.controller?.name],
    ['Hook', a.contracts?.hook?.name]
  ];

  rows.forEach(([dtText, ddText]) => {
    const dt = container.ownerDocument.createElement('dt');
    dt.textContent = dtText;
    dl.appendChild(dt);
    const dd = container.ownerDocument.createElement('dd');
    dd.textContent = ddText;
    dl.appendChild(dd);
  });

  section.appendChild(dl);

  const finalp = container.ownerDocument.createElement('p');
  finalp.textContent = 'The triggering trade completes, then later swaps pause. Time alone never resumes trading; recovery requires both authorizations.';
  section.appendChild(finalp);

  container.replaceChildren(section);
}
