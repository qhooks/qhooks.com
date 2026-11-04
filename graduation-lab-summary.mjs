export function renderGraduationLabSummary(container, draft, ready = false) {
  const doc=container.ownerDocument,div=doc.createElement('div');div.className='build-summary';
  if (!draft) div.appendChild(doc.createElement('p')).textContent='Configure your launch to see its summary.';
  else {
    const h3=doc.createElement('h3');h3.textContent=`${draft.setup.tokenName} (${draft.setup.symbol})`;div.appendChild(h3);
    const dl=doc.createElement('dl');
    const addRow=(label,value)=>{const dt=doc.createElement('dt'),dd=doc.createElement('dd');dt.textContent=label;dd.textContent=String(value??'—');dl.appendChild(dt);dl.appendChild(dd);};
    const modes={'0':'Net quote threshold','1':'Manual','2':'Stay'},mode=String(draft.bootstrap.mode);
    addRow('Token supply',draft.setup.totalSupply);addRow('Local quote supply',draft.setup.quoteSupply);
    addRow('Policy mode',Object.hasOwn(modes,mode)?modes[mode]:'Unknown');addRow('Threshold',draft.bootstrap.threshold??'None');
    addRow('Source pool fee (pips)',draft.bootstrap['source-fee']);addRow('Liquidity',draft.bootstrap.liquidity);addRow('Policy notice (seconds)',draft.setup.notice);div.appendChild(dl);
    const note=doc.createElement('p');note.textContent=ready?'Toolkit ready. Download it or continue to setup.':'Configuration validated. Export the toolkit or continue to setup.';div.appendChild(note);
    const noWallet=doc.createElement('p');noWallet.textContent='No wallet connected and no transaction authorized by this draft.';div.appendChild(noWallet);
  }
  container.replaceChildren(div);
}
