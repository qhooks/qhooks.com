// Local Ollama proposal, lead-reviewed: exports, own-key lookup and concise copy corrected.
import {circuitRecoveryCopy} from './circuit-recovery-copy.mjs';
import {graduationCopy} from './graduation-copy.mjs';
import {dynamicFeeCopy} from './dynamic-fee-copy.mjs';
import {directionalFeeCopy} from './directional-fee-copy.mjs';
export const productCopy = Object.freeze({
  'qcreator-fee-pq-vault': Object.freeze({
    name: 'Creator Revenue',
    summary: 'Earn fees from swaps directly into your vault. Authorize withdrawals with your wallet and a post-quantum key.',
    action: 'Creator-fee withdrawals'
  }),
  'qrevenue-split-pq-vaults': Object.freeze({
    name: 'Revenue Split',
    summary: 'Share swap fees with a collaborator. Each beneficiary controls an independent vault and its own withdrawals.',
    action: 'Each beneficiary’s fee withdrawals'
  }),
  'qprice-band-pq-governance': Object.freeze({
    name: 'Price Bands',
    summary: 'Set the price range in which your pool can trade. Require both wallet and post-quantum approval to change the bounds.',
    action: 'Price-band updates'
  }),
  'qvolume-epochs-pq-renewal': Object.freeze({
    name: 'Volume Epochs',
    summary: 'Give your pool a raw-token volume budget for a fixed window. Renew expired windows with dual authorization.',
    action: 'Expired volume-window renewal'
  }),
  'qcircuit-recovery-pq-resume':Object.freeze({
    name:circuitRecoveryCopy.name,
    summary:circuitRecoveryCopy.summary,
    action:circuitRecoveryCopy.action
  }),
  'qgraduation-pq-liquidity-migration':Object.freeze({
    name:graduationCopy.name,
    summary:graduationCopy.summary,
    action:graduationCopy.action
  }),
  'qdynamic-fee-pq-governance':Object.freeze({
    name:dynamicFeeCopy.name,
    summary:dynamicFeeCopy.summary,
    action:dynamicFeeCopy.action
  }),
  'qdirectional-fees-pq-schedules':Object.freeze({
    name:directionalFeeCopy.name,
    summary:directionalFeeCopy.summary,
    action:directionalFeeCopy.action
  })
});

export function renderProductCard(item) {
  if (!Object.hasOwn(productCopy, item.id)) throw new Error('Unknown product ID');
  const copy = productCopy[item.id];
  const article = document.createElement('article');
  article.className = 'listing';
  article.setAttribute('data-listing-id', item.id);
  const meta = document.createElement('div');
  meta.className = 'listing-meta';
  const category = document.createElement('span');
  category.textContent = item.category;
  const status = document.createElement('span');
  status.className = 'status';
  status.textContent = 'Post-quantum';
  meta.append(category, status);
  article.appendChild(meta);
  const h3 = document.createElement('h3');
  h3.textContent = copy.name;
  article.appendChild(h3);
  const summary = document.createElement('p');
  summary.textContent = copy.summary;
  article.appendChild(summary);
  const action = document.createElement('p');
  action.className = 'product-action';
  action.textContent = 'PQ-protected: ' + copy.action;
  article.appendChild(action);
  const button = document.createElement('a');
  button.className = 'hook-link';
  button.setAttribute('href', '/hook?id=' + encodeURIComponent(item.id));
  button.textContent = 'Explore hook →';
  button.setAttribute('aria-label', 'Explore ' + copy.name);
  article.appendChild(button);
  return article;
}
