export function hasNewsQuote(row, now = Date.now()) {
  return Number.isFinite(row?.price) && row.price > 0 && Number.isSafeInteger(row.observedAt) && row.observedAt > 0 && row.observedAt <= now + 30000 && now-row.observedAt <= 300000;
}
export function newsMarketRows(markets, now = Date.now()) {
  return [...(markets?.prices || []), ...(markets?.stocks || []).filter(row => hasNewsQuote(row, now)).map(row => ({...row, stockToken: true}))];
}
export function newsSignal(list) {
  return typeof list?.url === 'string' && /^https:\/\/(?:www\.)?(?:x|twitter)\.com\/i\/lists\/\d+(?:\?.*)?$/.test(list.url) ? list.url : null;
}
