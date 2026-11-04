import { normalizeLaunchRecipe } from './l124-launch-recipe.mjs';
import { recipeChain } from './l124-launch-recipe.mjs';
import { launchDraftSummary } from './l124-draft-summary.mjs';
import { formatRecipeUnits } from './l124-draft-summary.mjs';

export function fillRecipeForm(document, recipe) {
  const normalized = normalizeLaunchRecipe(recipe);
  const chainId = normalized.chainId;
  const fields = normalized.fields;

  const suffixes = [
    'chain', 'name', 'symbol', 'decimals', 'supply', 'notice', 'fee',
    'token-funding', 'quote-funding', 'mode', 'threshold', 'destination-fee'
  ];

  for (const suffix of suffixes) {
    const el = document.getElementById('ql-' + suffix);
    if (!el) {
      throw new TypeError(`Missing form element: ql-${suffix}`);
    }
  }

  document.getElementById('ql-chain').value = chainId;
  document.getElementById('ql-name').value = fields.tokenName;
  document.getElementById('ql-symbol').value = fields.symbol;
  document.getElementById('ql-decimals').value = fields.decimals;
  document.getElementById('ql-supply').value = formatRecipeUnits(fields.totalSupply, Number(fields.decimals));
  document.getElementById('ql-notice').value = fields.notice;
  document.getElementById('ql-fee').value = formatRecipeUnits(fields.lpFeePpm, 4);
  document.getElementById('ql-token-funding').value = fields.tokenAmount;
  document.getElementById('ql-quote-funding').value = fields.quoteAmount;
  document.getElementById('ql-mode').value = fields.graduationMode;
  document.getElementById('ql-threshold').value = fields.threshold;
  document.getElementById('ql-destination-fee').value = formatRecipeUnits(fields.destinationFeePpm, 4);

  const thresholdLabel = document.getElementById('ql-threshold-label');
  if (thresholdLabel) {
    thresholdLabel.hidden = fields.graduationMode !== '0';
  }

  return normalized;
}

export function renderRecipeSummary(document, container, recipe) {
  const normalized = normalizeLaunchRecipe(recipe);
  const rows = launchDraftSummary(normalized, recipeChain(normalized.chainId));

  const nodes = [];
  for (const row of rows) {
    const dt = document.createElement('dt');
    dt.textContent = row.label;
    const dd = document.createElement('dd');
    dd.textContent = row.value;
    nodes.push(dt, dd);
  }

  container.replaceChildren(...nodes);
  return rows.length;
}
