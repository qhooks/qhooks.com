export function renderBuildSummary(container, artifact) {
  if (!artifact || artifact.kind !== 'qhooks-compiled-project' ||
      artifact.compiled !== true || artifact.deployed !== false ||
      !artifact.contracts?.hook || !artifact.contracts?.claimVault || !artifact.configuration) {
    throw new TypeError('Invalid artifact');
  }
  const section = document.createElement('section');
  section.className = 'build-summary';
  const h2 = document.createElement('h2');
  h2.textContent = 'Ready to integrate';
  section.appendChild(h2);
  const title = document.createElement('p');
  title.textContent = artifact.configuration.projectName;
  section.appendChild(title);
  const dl = document.createElement('dl');
  const split=artifact.configuration.templateId==='qrevenue-split-pq-vaults';
  for (const [label,value] of [
    ['Chain ID',artifact.configuration.chainId],
    [split?'Revenue fee':'Creator fee',`${artifact.configuration.feeBps} bps`],
    ...(split?[
      ['Split',`${artifact.configuration.shareBps} / ${artifact.configuration.secondShareBps} bps`],
      ['Vault setup','Two independently owned ML-DSA fee vaults'],
      ['First beneficiary',artifact.configuration.owner],
      ['Second beneficiary',artifact.configuration.ownerB]
    ]:[]),
    ['Hook',artifact.contracts.hook.name],
    ['Fee vault',artifact.contracts.claimVault.name]
  ]) {
    const dt = document.createElement('dt');dt.textContent = label;
    const dd = document.createElement('dd');dd.textContent = value;
    dl.appendChild(dt);dl.appendChild(dd);
  }
  section.appendChild(dl);
  const note = document.createElement('p');
  note.textContent = split?'Your contracts are compiled. Verify both vault identities and review enrollment costs before deploying.':'Your contracts are compiled. Deployment is a separate step.';
  section.appendChild(note);
  container.replaceChildren(section);
}
