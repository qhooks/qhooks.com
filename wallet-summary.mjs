export function renderWalletSummary(container, state) {
  if (typeof state !== 'object' || state === null) throw new TypeError('State must be an object');
  const section=document.createElement('section');section.className='build-summary';
  const h2=document.createElement('h2');h2.textContent='Your QWallet workspace';section.appendChild(h2);
  const dl=document.createElement('dl');
  const rows=[['Account',state.connected?.owner||'Not connected'],['Network',state.connected?.chainId||'Choose a wallet'],['Quantum key',state.keyId||'No key loaded'],['Backup',state.backupVerified?'Restore verified':'Not verified'],['Enrollment',state.approval?'Signed — not submitted':'Not signed']];
  for(const [label,value]of rows){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;dl.appendChild(dt);dl.appendChild(dd);}
  section.appendChild(dl);const p=document.createElement('p');p.textContent='Keys stay in this browser session. Lock when you are done.';section.appendChild(p);container.replaceChildren(section);
}
