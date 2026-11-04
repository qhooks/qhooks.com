// Local Ollama proposal with lead DOM-ID, pagination and safe-option integration.
import { quantumCatalog } from './catalog.mjs';
import { productCopy, renderProductCard } from './product.mjs';
import { browseHooks, readFilters, writeFilters } from './browse.mjs';

const records = quantumCatalog.map(item => ({ ...item, ...productCopy[item.id] }));
const { queryInput, categorySelect, grid, count, empty, prev, next, pageNumber } = {
  queryInput: document.getElementById('catalog-query'),
  categorySelect: document.getElementById('catalog-category'),
  grid: document.getElementById('catalog-results'),
  count: document.getElementById('catalog-count'),
  empty: document.getElementById('catalog-empty'),
  prev: document.getElementById('catalog-prev'),
  next: document.getElementById('catalog-next'),
  pageNumber: document.getElementById('catalog-page-number')
};

for (const category of new Set(records.map(record => record.category))) {
  const option = document.createElement('option');
  option.value = category;
  option.textContent = category;
  categorySelect.append(option);
}

let state;

function render(filters) {
  const result = browseHooks(records, filters);
  state = result;
  queryInput.value = result.query;
  categorySelect.value = result.category;
  grid.replaceChildren(...result.items.map(renderProductCard));
  count.textContent = `${result.total} ${result.total === 1 ? 'hook' : 'hooks'}`;
  empty.hidden = result.total !== 0;
  prev.disabled = result.page <= 1;
  next.disabled = result.page >= result.pages;
  pageNumber.textContent = `Page ${result.page} of ${result.pages}`;
  history.replaceState(null, '', location.pathname + writeFilters(result));
}

function fromInputs() {
  return {
    query: queryInput.value,
    category: categorySelect.value,
    page: 1
  };
}

queryInput.addEventListener('input', () => render(fromInputs()));
categorySelect.addEventListener('change', () => render(fromInputs()));
document.getElementById('catalog-filters').addEventListener('submit', e => {
  e.preventDefault();
  render(fromInputs());
});

prev.addEventListener('click', () => render({ ...state, page: state.page - 1 }));
next.addEventListener('click', () => render({ ...state, page: state.page + 1 }));

window.addEventListener('popstate', () => render(readFilters(location.search)));

render(readFilters(location.search));
