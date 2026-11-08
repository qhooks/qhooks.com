// Hooks page: the launch-blocks catalog, presets and built-in features.
import { BLOCKS, CATEGORIES, PRESETS, BUILT_IN, presetVisible } from '/qx-block-catalog.mjs';

const d = document, $ = id => d.getElementById(id);
const el = (tag, attrs = {}, ...kids) => {
  const n = d.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v != null && v !== false) n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null) n.append(c);
  return n;
};
const catName = id => CATEGORIES.find(c => c.id === id)?.name || '';
const unitText = { pct: '%', supplyPct: '% of supply', sec: 'sec', min: 'min', hr: 'hours', day: 'days', quote: 'quote', raw: '', addr: '' };
const shown = p => p.def === 'auto' ? (p.hint || 'auto') : p.def === '' ? 'you set it' : `${p.def}${unitText[p.unit] ? ' ' + unitText[p.unit] : ''}`.replace(' %', '%');

let filter = 'all', query = '';
$('hk-count').textContent = String(BLOCKS.length);

function card(b) {
  return el('article', { class: 'hk-card', 'data-cat': b.cat, id: 'block-' + b.id },
    el('header', {}, el('span', { class: 'hk-tag', text: catName(b.cat) })),
    el('h3', { text: b.name }),
    el('p', { class: 'hk-line', text: b.line }),
    el('details', {}, el('summary', { text: 'How it works' }),
      el('p', { text: b.how }),
      b.params.length ? el('dl', { class: 'hk-params' }, b.params.map(p => el('div', {}, el('dt', { text: p.label }), el('dd', { text: shown(p) })))) : null));
}

function renderGrid() {
  const q = query.trim().toLowerCase();
  const list = BLOCKS.filter(b => (filter === 'all' || b.cat === filter) && (!q || (b.name + ' ' + b.line + ' ' + b.how).toLowerCase().includes(q)));
  $('hk-grid').replaceChildren(...list.map(card));
  $('hk-empty').hidden = list.length > 0;
}

$('hk-chips').append(...[{ id: 'all', name: 'All' }, ...CATEGORIES.filter(c => c.id !== 'built')].map(c =>
  el('button', { type: 'button', class: 'hk-chip', 'aria-pressed': String(c.id === 'all'), 'data-cat': c.id,
    onclick: e => { filter = c.id; for (const b of $('hk-chips').children) b.setAttribute('aria-pressed', String(b.dataset.cat === filter)); renderGrid(); } },
    c.name, el('span', { text: String(c.id === 'all' ? BLOCKS.length : BLOCKS.filter(b => b.cat === c.id).length) }))));
$('hk-search').addEventListener('input', e => { query = e.target.value; renderGrid(); });

$('hk-presets').append(...PRESETS.filter(p => p.id !== 'none' && presetVisible(p)).map(p => el('article', { class: 'hk-preset' },
  el('h3', { text: p.name }), el('p', { text: p.line }),
  el('ul', {}, p.on.map(id => el('li', {}, el('a', { href: '#block-' + id, text: BLOCKS.find(b => b.id === id)?.name || id })))),
  el('a', { class: 'qx-btn qx-btn-ghost', href: '/qtoken-studio?blocks=' + p.id }, 'Launch with this'))));

$('hk-built').append(...BUILT_IN.map(b => el('div', { class: 'hk-built-item' }, el('h3', { text: b.name }), el('p', { text: b.line }))));

renderGrid();
if (location.hash.startsWith('#block-')) d.getElementById(location.hash.slice(1))?.querySelector('details')?.setAttribute('open', '');
