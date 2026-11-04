export function renderLaunchBuildSummary(container, artifact) {
  if (!artifact || artifact.kind !== 'qhooks-compiled-launch' || artifact.compiled !== true ||
      artifact.deployed !== false || artifact.configuration?.chainId !== '31337')
    throw new TypeError('Invalid artifact');
  const requiredContracts = ['wallet', 'token', 'manager', 'quote', 'claimVault', 'router', 'factory', 'hook'];
  const contracts = artifact.contracts;
  for (const name of requiredContracts) {
    if (!contracts?.[name] || typeof contracts[name].name !== 'string') throw new TypeError('Invalid contracts');
  }
  const section = document.createElement('section');section.className = 'build-summary';
  const h2 = document.createElement('h2');h2.textContent = 'Your launch toolkit';section.appendChild(h2);
  const title = document.createElement('p');title.textContent = artifact.configuration.projectName;section.appendChild(title);
  const dl = document.createElement('dl');
  for (const [label,value] of [['QWallet',contracts.wallet.name],['Token',contracts.token.name],['Hook',contracts.hook.name],['Creator fee',`${artifact.configuration.feeBps} bps`]]) {
    const dt = document.createElement('dt');dt.textContent = label;
    const dd = document.createElement('dd');dd.textContent = value;
    dl.appendChild(dt);dl.appendChild(dd);
  }
  section.appendChild(dl);
  const note = document.createElement('p');
  note.textContent = 'Includes ABI, bytecode, source and licenses. Deploy and test on your local development chain; the included quote token and router are test fixtures.';
  section.appendChild(note);container.replaceChildren(section);
}
