export function renderPoolSetup(container, state) {
  const doc = container.ownerDocument;
  if (!state) {
    const p = doc.createElement('p');
    p.textContent = 'Connect a local development wallet to begin.';
    container.replaceChildren(p);
    return;
  }

  const section = doc.createElement('section');
  section.className = 'build-summary';

  const h3 = doc.createElement('h3');
  h3.textContent = 'Pool setup';
  section.appendChild(h3);

  const dl = doc.createElement('dl');

  const addRow = (dtText, ddText) => {
    const dt = doc.createElement('dt');
    dt.textContent = dtText;
    const dd = doc.createElement('dd');
    dd.textContent = ddText;
    dl.appendChild(dt);
    dl.appendChild(dd);
  };

  addRow('Wallet', String(state.owner));
  addRow('Shared verifier', String(state.graph.verifier));
  addRow('Custody pool', String(state.graph.pool));
  addRow('Verifier transaction', String(state.stages.verifier?.status || 'not started'));
  addRow('Pool transaction', String(state.stages.pool?.status || 'not started'));
  addRow('Supported ERC20s', String(state.tokens.length));
  addRow('Binding', String(state.binding ? 'Receipt and full runtime checked' : 'Not yet confirmed'));

  section.appendChild(dl);

  if (state.attention) {
    const p = doc.createElement('p');
    p.textContent = state.attention;
    section.appendChild(p);
  }

  container.replaceChildren(section);
}
