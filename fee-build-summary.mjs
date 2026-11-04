export function renderFeeBuildSummary(container, a) {
  if (!a || a.kind !== 'qhooks-compiled-project' || a.compiled !== true || a.deployed !== false ||
      !a.contracts?.controller || !a.contracts?.hook ||
      !['dynamic', 'directional'].includes(a.configuration?.template)) throw new TypeError('Invalid fee project');
  const { configuration: c, contracts } = a;
  const element = (tag, text) => { const n = container.ownerDocument.createElement(tag); n.textContent = text; return n; };
  const section = element('section', ''); section.className = 'build-summary';
  section.appendChild(element('h2', 'Ready to integrate'));
  section.appendChild(element('p', c.projectName));
  const dl = element('dl', '');
  const rows = [
    ['Profile', 'ML-DSA-65'], ['Chain ID', c.chainId], ['Tick spacing', c.tickSpacing],
    ['Fee ceiling', c.maxLpFee + ' pips'],
    ...(c.template === 'dynamic' ? [['Initial LP fee', c.initialLpFee + ' pips']] :
      [['Token 0 → token 1', c.initialFee0For1 + ' pips'], ['Token 1 → token 0', c.initialFee1For0 + ' pips']]),
    ['Controller', contracts.controller.name], ['Hook', contracts.hook.name]
  ];
  rows.forEach(([label, value]) => { dl.appendChild(element('dt', label)); dl.appendChild(element('dd', value)); });
  section.appendChild(dl);
  section.appendChild(element('p', 'Compiled for local chain 31337. Deployment and wallet enrollment are separate steps.'));
  container.replaceChildren(section);
}
