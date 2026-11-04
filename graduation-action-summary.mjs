export function renderGraduationActions(container, state, execution = null) {
  const doc = container.ownerDocument, div = doc.createElement('div');
  if (!state) {
    div.textContent = 'Load a completed local setup to manage its liquidity.';
    container.replaceChildren(div);
    return;
  }
  const phases = {'0':'Not initialized','1':'Source pool','2':'Destination pool','3':'Closed'};
  const modes = {'0':'Net quote threshold','1':'Manual','2':'Stay'};
  const phase = String(state.phase), mode = String(state.policy?.current?.mode);
  const section = doc.createElement('section');section.className = 'build-summary';
  const h3 = doc.createElement('h3');h3.textContent = 'Your graduation position';section.appendChild(h3);
  const dl = doc.createElement('dl');
  const rows = [
    ['Phase', Object.hasOwn(phases,phase)?phases[phase]:'Unknown'],
    ['Policy', phase==='0'?'Not initialized':Object.hasOwn(modes,mode)?modes[mode]:'Not initialized'],
    ['Net quote raised (raw units)', state.observed],
    ['Source liquidity', state.sourceLiquidity],
    ['Destination liquidity', state.destinationLiquidity],
    ['Policy version', state.policy?.version],
    ['Pending policy ETA', state.policy?.eta],
    ['Next protected nonce', state.nonce]
  ];
  for (const [label,value] of rows) {
    const dt = doc.createElement('dt');dt.textContent = label;dl.appendChild(dt);
    const dd = doc.createElement('dd');dd.textContent = String(value??'—');dl.appendChild(dd);
  }
  section.appendChild(dl);div.appendChild(section);
  const note = value => {const p=doc.createElement('p');p.textContent=String(value);section.appendChild(p);};
  if (execution) {
    note('Action: '+String(execution.fields?.kind??'None')+' · '+String(execution.journal?.status??'Not sent'));
    if(execution.outcome)note('Confirmed: '+String(execution.outcome.kind));
    if(execution.attention)note(execution.attention);
    if(execution.persistenceFailed)note('Save public progress before continuing.');
  }
  container.replaceChildren(div);
}
