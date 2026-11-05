// Community page: the changelog card appears once the trust layer's /changelog.html is live.
const card = document.getElementById('cx-changelog');
if (card) fetch('/changelog.html', { method: 'HEAD', cache: 'no-store' }).then(r => { if (r.ok) card.hidden = false; }).catch(() => {});
// Boards with posts, most recent first (/api/community/boards). Real counts only; nothing shows until a board has posts.
const list = document.getElementById('cx-board-list');
if (list) {
  if (!document.querySelector('link[href="/qx-board.css"]')) document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: '/qx-board.css' }));
  import('/qx-board-rows.mjs').then(m => list.replaceWith(m.boardTabs({ limit: 6 })))
    .catch(() => { list.replaceChildren(Object.assign(document.createElement('p'), { className: 'qa-empty', textContent: 'The boards didn’t answer. Try again in a moment.' })); });
}
// Keep the existing generated page useful until the source template is rebuilt.
let callers = document.getElementById('cx-caller-list');
if (!callers && list) {
  const make = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls, ...(text ? { textContent: text } : {}) });
  const section = make('section', 'cx-sec'), head = make('div', 'cx-sec-head'), title = make('h2', 'cx-h2', 'Callers.');
  section.id = 'callers'; section.setAttribute('aria-labelledby', 'cx-callers'); title.id = 'cx-callers';
  head.append(title, make('p', '', "Ranked by hit rate over at least 5 calls. Creator calls, linked wallets and sells after calling don't count."));
  callers = make('div', 'qb-callers'); callers.id = 'cx-caller-list'; callers.append(make('p', 'qa-empty', 'Reading callers…'));
  section.append(head, callers); list.closest('section').after(section);
}
if (callers) {
  if (!document.querySelector('link[href="/qx-board.css"]')) document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: '/qx-board.css' }));
  Promise.all([fetch('/api/community/callers', { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error('callers'); return r.json(); }), import('/qx-board-rows.mjs')])
    .then(([j, m]) => { const rows = (j?.callers || []).slice(0, 50); callers.replaceChildren(...(rows.length ? rows.map((c, i) => m.callerRow(c, i + 1)) : [m.emptyNote('No caller has 5 counted calls yet.')])); })
    .catch(() => callers.replaceChildren(Object.assign(document.createElement('p'), { className: 'qa-empty', textContent: 'The callers didn’t answer. Try again in a moment.' })));
}
// Links to community.html#boards or #callers land on the section once it has filled in (it loads after the page).
if (/^#(boards|callers)$/.test(location.hash)) addEventListener('load', () => setTimeout(() => document.querySelector(location.hash)?.scrollIntoView({ block: 'start' }), 600));
