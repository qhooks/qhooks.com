// Local Ollama proposal, lead-corrected named imports and catalog field ownership.
import { quantumCatalog } from './catalog.mjs';
import { productCopy } from './product.mjs';

const main = document.getElementById('hook-page');

function createElementWithText(tag, text) {
  const element = document.createElement(tag);
  element.textContent = text;
  return element;
}

const params = new URLSearchParams(location.search);
const id = params.get('id');

const hook = quantumCatalog.find(item => item.id === id);

if (!hook) {
  const h1 = createElementWithText('h1', 'Hook not found');
  const p = createElementWithText('p', 'Choose a hook from the collection.');
  const a = document.createElement('a');
  a.href = 'hooks.html';
  a.textContent = 'Browse hooks';
  main.append(h1, p, a);
} else {
  const eyebrow = createElementWithText('p', hook.category);
  eyebrow.className = 'eyebrow green';
  const h1 = createElementWithText('h1', productCopy[hook.id].name);
  const summary = createElementWithText('p', productCopy[hook.id].summary);
  const notice = document.createElement('p');
  notice.className = 'product-action';
  notice.textContent = 'Wallet + post-quantum authorization for the protected action.';
  const whatDoes = createElementWithText('h2', 'What it does');
  const protectedAction = createElementWithText('p', hook.protectedAction);
  const whereStops = createElementWithText('h2', 'Where it stops');
  const unprotectedActions = createElementWithText('p', hook.unprotectedActions.join(' '));
  const links = document.createElement('p');
  links.className = 'product-actions';
  const allHooks = document.createElement('a');
  allHooks.href = 'hooks.html';
  allHooks.textContent = 'All hooks';
  const lab = document.createElement('a');
  lab.href = hook.id === 'qgraduation-pq-liquidity-migration' ? 'graduation-lab.html' : hook.id === 'qrevenue-split-pq-vaults' ? 'lab.html?template=split' : 'lab.html';
  lab.textContent = 'Build in the Lab';
  if (hook.id === 'qprice-band-pq-governance') lab.href = 'price-band-lab.html';
  if (hook.id === 'qvolume-epochs-pq-renewal') lab.href = 'volume-epoch-lab.html';
  if (hook.id === 'qcircuit-recovery-pq-resume') lab.href = 'circuit-lab.html';
  const feeBundle = ['qdynamic-fee-pq-governance', 'qdirectional-fees-pq-schedules'].includes(hook.id);
  if (feeBundle) lab.href = 'fee-lab.html?template=' + (hook.id === 'qdynamic-fee-pq-governance' ? 'dynamic' : 'directional');
  const integrate = document.createElement('a');
  integrate.href = 'integrate.html';
  integrate.textContent = 'Creator Revenue reference';
  links.append(allHooks, ' · ', lab, ' · ', integrate);

  const details = document.createElement('details');
  const summaryDetails = document.createElement('summary');
  summaryDetails.textContent = 'Technical details';
  const detail = createElementWithText('p', hook.detail);
  const limitations = createElementWithText('p', hook.limitations.join(' '));
  details.append(summaryDetails, detail, limitations);

  main.append(eyebrow, h1, summary, notice, whatDoes, protectedAction, whereStops, unprotectedActions, links, details);
  if (feeBundle) {
    main.insertBefore(createElementWithText('p', 'Configure initial fees and a permanent ceiling in the Lab, then download source and compiled contracts for local integration. Connected fee-governance wallet controls are a separate workflow.'), links);
  }
  if (hook.id === 'qgraduation-pq-liquidity-migration') {
    const launch = createElementWithText('a', 'Open graduation setup');
    launch.href = 'graduation.html';
    links.append(' · ', launch);
    const manage = createElementWithText('a', 'Manage graduation liquidity');
    manage.href = 'graduation-actions.html';
    links.append(' · ', manage);
    const availability = createElementWithText('p', 'Create a local token-pair and controller setup, then open the liquidity workspace to initialize, manage policy, migrate and claim payouts. The graduation threshold measures net raw quote-token inflow, not market cap.');
    main.insertBefore(availability, links);
  }
  document.title = `${productCopy[hook.id].name} | QHooks`;
}
