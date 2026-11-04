export function renderGraduationSetup(container, state) {
  const doc = container.ownerDocument;
  const div = doc.createElement('div');
  
  if (!state) {
    const p = doc.createElement('p');
    p.textContent = 'Connect a local development wallet and prepare your launch setup.';
    div.appendChild(p);
    container.replaceChildren(div);
    return;
  }

  const section = doc.createElement('section');
  section.className = 'build-summary';
  
  const h3 = doc.createElement('h3');
  h3.textContent = 'Graduation setup';
  section.appendChild(h3);

  const dl = doc.createElement('dl');
  
  const rows = [
    ['Token', state.profile.fields.tokenName],
    ['Symbol', state.profile.fields.symbol],
    ['Wallet', state.profile.owner],
    ['Quantum public key', state.profile.publicKey],
    ['Token address', state.graph.token],
    ['Local quote address', state.graph.quote],
    ['Controller', state.graph.controller]
  ];

  rows.forEach(([label, value]) => {
    const dt = doc.createElement('dt');
    dt.textContent = label;
    dl.appendChild(dt);
    const dd = doc.createElement('dd');
    dd.textContent = String(value);
    dl.appendChild(dd);
  });

  const stageIds = ['manager', 'verifier', 'token', 'quote', 'controller'];
  stageIds.forEach(id => {
    const dt = doc.createElement('dt');
    dt.textContent = `${id} deployment`;
    dl.appendChild(dt);
    const dd = doc.createElement('dd');
    dd.textContent = String(state.stages[id]?.status || 'not started');
    dl.appendChild(dd);
  });

  const dt = doc.createElement('dt');
  dt.textContent = 'Setup';
  dl.appendChild(dt);
  const dd = doc.createElement('dd');
  dd.textContent = state.ready ? 'Ready for protected pool initialization' : 'Deployment sequence incomplete';
  dl.appendChild(dd);

  section.appendChild(dl);
  div.appendChild(section);

  if (state.attention) {
    const p = doc.createElement('p');
    p.textContent = String(state.attention);
    div.appendChild(p);
  }

  if (state.persistenceFailed) {
    const p = doc.createElement('p');
    p.textContent = 'Save public progress before continuing.';
    div.appendChild(p);
  }

  container.replaceChildren(div);
}
