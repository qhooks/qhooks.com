// Builders page: the reviewed module list (/market/modules.json, the same list Studio's Modules picker offers).
// System A rows: glyph, name, what holders get, the builder and their share. Each listed module keeps
// article.mk-card#module-<slug> so the holder-signal widget (qx-market-signal.mjs) attaches to it.
const grid = document.getElementById('mk-modules');
const h = (t, a = {}, ...kids) => { const n = document.createElement(t); for (const [k, v] of Object.entries(a)) { if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else n.setAttribute(k, v); } for (const c of kids.flat()) if (c != null) n.append(c); return n; };
const short = a => a.slice(0, 6) + '…' + a.slice(-4);
const ZERO = '0x' + '0'.repeat(40);
const NS = 'http://www.w3.org/2000/svg';
const glyph = id => { const s = document.createElementNS(NS, 'svg'); s.setAttribute('class', 'hl-g'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); const u = document.createElementNS(NS, 'use'); u.setAttribute('href', '#hl-g-' + id); s.append(u); return s; };
const GLYPH = { stake: 'stake', raffle: 'raffle' };

async function show() {
  try {
    const list = await fetch('/market/modules.json', { cache: 'no-store' }).then(r => r.json());
    const count = document.getElementById('mk-count');
    if (count) count.textContent = String(list.modules.filter(m => m.status === 'listed').length);
    const cards = list.modules.map(m => h('article', { class: 'mk-card' + (m.status === 'listed' ? '' : ' mk-paused'), id: 'module-' + m.slug },
      h('span', { class: 'hl-gt mk-card__g' }, glyph(GLYPH[m.slug] || 'module')),
      h('div', { class: 'mk-card__main' },
        h('header', {}, h('h3', { text: m.name }), h('span', { class: 'qa-tag mk-tag' + (m.status === 'listed' ? ' is-listed' : ''), text: m.status === 'listed' ? 'Listed' : 'Paused' })),
        h('p', { class: 'mk-sum', text: m.summary }),
        h('dl', { class: 'mk-facts' },
          h('div', {}, h('dt', { text: 'Builder' }), h('dd', { text: m.builderName + (m.builder !== ZERO ? ' · ' + short(m.builder) : '') })),
          h('div', {}, h('dt', { text: 'Builder share' }), h('dd', { text: m.builderBps ? (m.builderBps / 100) + '% of what it receives' : 'None' })),
          h('div', {}, h('dt', { text: 'Reviewed' }), h('dd', { text: m.review?.date || '' })),
          h('div', {}, h('dt', { text: 'Code hash' }), h('dd', { class: 'mk-hash', title: m.creationHash, text: short(m.creationHash) }))),
        h('details', { class: 'hl-more mk-more' }, h('summary', { text: 'How it works' }),
          h('p', { class: 'mk-detail', text: m.detail }),
          h('p', { class: 'mk-note', text: m.review?.notes || '' })))));
    grid.replaceChildren(...cards, h('a', { class: 'mk-card mk-card-new', href: '/market-submit' },
      h('span', { class: 'hl-gt mk-card__g mk-plus' }, glyph('module')),
      h('div', { class: 'mk-card__main' }, h('h3', { text: 'Your module here' }), h('p', { class: 'mk-sum', text: 'Submit it for review. Approved modules appear in Studio for every launch.' }))));
  } catch { grid.replaceChildren(h('p', { class: 'mk-empty', text: 'The module list could not load. Try again in a moment.' })); }
}
show();
