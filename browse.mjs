// Local Ollama proposal with lead normalization and URL-state corrections.
export function browseHooks(records, filters = {}, pageSize = 12) {
  if (!Array.isArray(records)) throw new Error('Records must be an array');
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new Error('Invalid page size');
  const query = typeof filters.query === 'string' ? filters.query.trim().slice(0, 120) : '';
  const needle = query.toLowerCase();
  const category = records.some(record => record.category === filters.category) ? filters.category : 'All';
  const requested = Number(filters.page);
  const page = Number.isSafeInteger(requested) && requested > 0 ? requested : 1;
  const matches = records.filter(record =>
    (category === 'All' || record.category === category) &&
    ['name', 'summary', 'action', 'category'].some(key => record[key].toLowerCase().includes(needle)));
  const total = matches.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pages);
  return { items: matches.slice((current - 1) * pageSize, current * pageSize), total, pages, page: current, query, category };
}
export function readFilters(search) {
  const params = new URLSearchParams(search);
  return { query: params.get('query') || '', category: params.get('category') || 'All', page: params.get('page') || '1' };
}
export function writeFilters({ query, category, page }) {
  const params = new URLSearchParams();
  if (query) params.set('query', query);
  if (category && category !== 'All') params.set('category', category);
  if (page > 1) params.set('page', String(page));
  const search = params.toString();
  return search ? '?' + search : '';
}
