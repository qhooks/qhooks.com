// Portfolio holdings: current price per token with its age (ux-pricemc 2026-11-18).
// A column at desktop width, a small line under the value on phones. Pure view + one DOM pass over rendered rows, so the
// portfolio module only calls paintHoldingPrices() after it paints the list.
import {priceState} from './qx-price-state.mjs';
import {priceDigits} from './qx-price.mjs';
// f0e34600 resolution: root's portfolio pricing quarantines impostor USDG on Robinhood Chain; the Price cell follows it.
import {portfolioPriceQuarantined} from './qx-portfolio-pricing.mjs';

const finite = (n) => typeof n === 'number' && Number.isFinite(n);
export function priceAge(ms) {
  if (!finite(ms) || ms < 0) return '';
  const s = Math.floor(ms / 1000);
  return s < 60 ? s + 's' : s < 3600 ? Math.floor(s / 60) + 'm' : s < 86400 ? Math.floor(s / 3600) + 'h' : Math.floor(s / 86400) + 'd';
}
// {price:'$0.0₅1234'|'—', age:'12s'|'', status:'12s ago'|'Refreshing'|'', refreshing:boolean}
// "Refreshing" once the price is past the refresh window (or the read says it is refreshing); never another word.
export function holdingPriceView(row, now = Date.now()) {
  if (row && portfolioPriceQuarantined(row, {chainId: row.chainId, token: row.address})) return {price: '—', age: '', status: '', refreshing: false};
  const p = finite(row?.priceUsd) && row.priceUsd > 0 ? row.priceUsd : finite(row?.lastKnownPriceUsd) && row.lastKnownPriceUsd > 0 ? row.lastKnownPriceUsd : null;
  if (p == null) return {price: '—', age: '', status: '', refreshing: false};
  const at = row.priceStatus === 'last-known' && finite(row.lastKnownPriceAt) ? row.lastKnownPriceAt : row.priceAt;
  const st = priceState(at, now), age = st.age == null ? '' : priceAge(st.age);
  const refreshing = !!row.pricesRefreshing || row.priceStatus === 'last-known' || (st.at != null && st.refreshing);
  return {price: '$' + (priceDigits(p) ?? '—'), age, status: refreshing ? 'Refreshing' : age ? age + ' ago' : '', refreshing};
}
export function holdingPriceCell(h, row, now = Date.now()) {
  const v = holdingPriceView(row, now);
  return h('div', {class: 'pf-holding__price' + (v.refreshing ? ' is-refreshing' : '') + (v.price === '—' ? ' is-empty' : ''), title: v.price === '—' ? 'No price' : 'Price ' + v.price + (v.status ? ' · ' + v.status : ''), 'data-ux': 'pricemc'},
    h('b', {}, v.price), v.status ? h('small', {}, v.status) : null);
}

const STYLE = new URL('./qx-portfolio-price-col.css', import.meta.url).href;
function ensureStyle(doc) {
  if (!doc?.head || doc.querySelector('link[data-qx-price-col]')) return;
  const link = doc.createElement('link'); link.rel = 'stylesheet'; link.href = STYLE; link.dataset.qxPriceCol = ''; doc.head.append(link);
}
// Adds the price cell to every rendered holding row (including rows inside the ETH group). key(row) must give the same
// string the rows carry in data-key. Works on nodes before they are attached.
function paintRows(els, rows, {h, key, now}) {
  const byKey = new Map((rows || []).map((r) => [key(r), r]));
  let n = 0;
  for (const el of els) {
    const row = byKey.get(el.dataset.key); if (!row) continue;
    el.querySelector(':scope > .pf-holding__price')?.remove();
    const cell = holdingPriceCell(h, row, now), name = el.querySelector(':scope > .pf-holding__name');
    if (name) name.after(cell); else el.append(cell);
    if (holdingPriceView(row, now).price !== '—') el.classList.add('has-price'); // phones: no extra line without a price
    n++;
  }
  return n;
}
const rowsIn = (node) => node?.matches?.('.pf-holding[data-key]') ? [node] : [...(node?.querySelectorAll?.('.pf-holding[data-key]') || [])];
// renderHoldingRows() hook: returns the same nodes, each holding row with its price cell.
export function withHoldingPrices(nodes, rows, {h, key, now = Date.now()} = {}) {
  if (!h || !key || !Array.isArray(nodes)) return nodes;
  ensureStyle(nodes[0]?.ownerDocument || globalThis.document);
  paintRows(nodes.flatMap(rowsIn), rows, {h, key, now});
  return nodes;
}
export function paintHoldingPrices(container, rows, {h, key, now = Date.now()} = {}) {
  if (!container || !h || !key) return 0;
  ensureStyle(container.ownerDocument);
  return paintRows([...container.querySelectorAll('.pf-holding[data-key]')], rows, {h, key, now});
}
