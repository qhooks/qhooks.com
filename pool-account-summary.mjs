export function renderPoolAccount(container, state) {
  const doc = container.ownerDocument;
  const p = doc.createElement('p');
  p.textContent = 'Open an account workspace after pool setup.';
  if (!state) { container.replaceChildren(p); return; }

  const section = doc.createElement('section');
  section.className = 'build-summary';
  const h3 = doc.createElement('h3');
  h3.textContent = 'Protected account';
  section.appendChild(h3);

  const dl = doc.createElement('dl');
  const entries = [
    ['Wallet', state.connected?.owner || 'Disconnected'],
    ['Quantum key', state.publicKeyHex || 'Not created'],
    ['Key status', state.locked ? 'Locked' : 'Unlocked'],
    ['Backup', state.backupVerified ? 'Verified' : 'Not verified'],
    ['Account', state.account?.accountId || 'Not loaded'],
    ['Enrollment at last refresh', state.account ? (state.account.registered ? 'Yes' : 'No') : 'Not loaded'],
    ['Last loaded balance (base units)', state.account?.balance ?? 'Not loaded'],
    ['Action', state.fields?.kind || (state.execution?.recoveryOnly ? 'Receipt recovery' : 'Not prepared')],
    ['Transaction', state.execution?.journal?.status || 'Not broadcast'],
    ['Outcome', state.execution?.outcome?.kind || 'Not confirmed']
  ];

  entries.forEach(([label, value]) => {
    const dt = doc.createElement('dt');
    dt.textContent = label;
    dl.appendChild(dt);
    const dd = doc.createElement('dd');
    dd.textContent = String(value);
    dl.appendChild(dd);
  });

  section.appendChild(dl);

  if (state.execution?.attention) {
    const attention = doc.createElement('p');
    attention.textContent = String(state.execution.attention);
    section.appendChild(attention);
  }
  container.replaceChildren(section);
}
