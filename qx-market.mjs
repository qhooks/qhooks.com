// Builders page: the reviewed module list (/market/modules.json, the same list Studio's Modules picker offers).
const grid = document.getElementById('mk-modules');
const h = (t, a = {}, ...kids) => { const n = document.createElement(t); for (const [k, v] of Object.entries(a)) { if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else n.setAttribute(k, v); } for (const c of kids.flat()) if (c != null) n.append(c); return n; };
const short = a => a.slice(0, 6) + '…' + a.slice(-4);
const ZERO = '0x' + '0'.repeat(40);

async function show() {
  try {
    const list = await fetch('/market/modules.json', { cache: 'no-store' }).then(r => r.json());
    const cards = list.modules.map(m => h('article', { class: 'mk-card' + (m.status === 'listed' ? '' : ' mk-paused'), id: 'module-' + m.slug },
      h('header', {}, h('span', { class: 'mk-tag', text: m.status === 'listed' ? 'Listed' : 'Paused' }), h('span', { class: 'mk-kind', text: m.slug })),
      h('h3', { text: m.name }),
      h('p', { class: 'mk-sum', text: m.summary }),
      h('p', { class: 'mk-detail', text: m.detail }),
      h('dl', { class: 'mk-facts' },
        h('div', {}, h('dt', { text: 'Builder' }), h('dd', { text: m.builderName + (m.builder !== ZERO ? ' · ' + short(m.builder) : '') })),
        h('div', {}, h('dt', { text: 'Builder share' }), h('dd', { text: m.builderBps ? (m.builderBps / 100) + '% of what it receives' : 'None' })),
        h('div', {}, h('dt', { text: 'Reviewed' }), h('dd', { text: m.review?.date || '' })),
        h('div', {}, h('dt', { text: 'Code hash' }), h('dd', { class: 'mk-mono', title: m.creationHash, text: short(m.creationHash) }))),
      h('p', { class: 'mk-note', text: m.review?.notes || '' })));
    grid.replaceChildren(...cards, h('a', { class: 'mk-card mk-card-new', href: '/market-submit' }, h('span', { class: 'mk-plus', text: '+' }), h('h3', { text: 'Your module here' }), h('p', { class: 'mk-sum', text: 'Submit it for review. Approved modules appear in Studio for every launch.' })));
  } catch { grid.replaceChildren(h('p', { class: 'mk-empty', text: 'The module list could not load. Try again in a moment.' })); }
}
show();
