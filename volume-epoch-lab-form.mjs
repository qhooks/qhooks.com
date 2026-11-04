import { buildVolumeEpochDraft, volumeEpochFields } from './volume-epoch-draft.mjs';

export function readVolumeEpochForm(value) {
  const d = buildVolumeEpochDraft(
    Object.fromEntries(volumeEpochFields.map(k => [k, value(k)]))
  );
  return Object.freeze(
    Object.fromEntries(volumeEpochFields.map(k => [k, d[k]]))
  );
}

const example = Object.freeze({
  projectName: 'Volume epochs example',
  chainId: '31337',
  poolFee: '3000',
  tickSpacing: '60',
  epochSeconds: '3600',
  initialStartsAt: '2000000000',
  initialEndsAt: '2000003600',
  initialCap0For1: '1000000000000000000000',
  initialCap1For0: '2000000000'
});

export function volumeEpochExample(){return Object.freeze({...example});}

export function renderVolumeEpochSummary(container, a) {
  if (
    !a ||
    a.kind !== 'qhooks-compiled-project' ||
    a.compiled !== true ||
    a.deployed !== false ||
    a.configuration?.templateId !== 'qvolume-epochs-pq-renewal' ||
    a.contracts?.controller?.name !== 'ConfiguredVolumeEpochController' ||
    a.contracts?.hook?.name !== 'GovernedVolumeEpochHook'
  ) {
    throw new Error('Invalid project configuration');
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
    ['Pool fee', `${a.configuration.poolFee} pips`],
    ['Tick spacing', a.configuration.tickSpacing],
    ['Epoch duration', `${a.configuration.epochSeconds} seconds`],
    ['Starts at', a.configuration.initialStartsAt],
    ['Ends before', a.configuration.initialEndsAt],
    ['Token 0 input cap', a.configuration.initialCap0For1],
    ['Token 1 input cap', a.configuration.initialCap1For0],
    ['Controller', a.contracts.controller.name],
    ['Hook', a.contracts.hook.name]
  ];

  rows.forEach(([label, value]) => {
    const dt = container.ownerDocument.createElement('dt');
    dt.textContent = label;
    dl.appendChild(dt);

    const dd = container.ownerDocument.createElement('dd');
    dd.textContent = String(value);
    dl.appendChild(dd);
  });

  section.appendChild(dl);

  const p2 = container.ownerDocument.createElement('p');
  p2.textContent = 'Raw token-unit budgets. Swaps require a local chain timestamp inside the configured window; renewal is not automatic.';
  section.appendChild(p2);

  container.replaceChildren(section);
}
