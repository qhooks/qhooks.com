// Hooks page (System A): launch blocks as living building blocks. Each block has a glyph, one line, how it works, and the
// launches whose pools run it, read from the public launch list (block masks). Trades on those launches light the blocks they
// ran through. Catalog, presets and built-in features come from /qx-block-catalog.mjs.
import { BLOCKS, CATEGORIES, PRESETS, BUILT_IN, presetVisible } from '/qx-block-catalog.mjs';
import { h, fmt, RM, restart, toast, sectionNav, avatar } from '/qx-a/components.mjs';
import { glyph, fillGlyphs } from '/qx-a/pages/hooks-glyphs.mjs';
import { watchLaunches, usersOf, directoryCoverage } from '/qx-a/pages/hooks-live.mjs';

const d = document, $ = (id) => d.getElementById(id);
const catName = (id) => CATEGORIES.find((c) => c.id === id)?.name || '';
const unitText = { pct: '%', supplyPct: '% of supply', sec: 'sec', min: 'min', hr: 'hours', day: 'days', quote: 'quote', raw: '', addr: '' };
const shown = (p) => p.def === 'auto' ? (p.hint || 'auto') : p.def === '' ? 'you set it' : `${p.def}${unitText[p.unit] ? ' ' + unitText[p.unit] : ''}`.replace(' %', '%');
const blockName = (id) => BLOCKS.find((b) => b.id === id)?.name || id;
// The opening auction is the holder gate pointed at the auction contract, so a launch's mask shows it as the holder gate.
const maskId = (id) => id === 'openingAuction' ? 'holderGate' : id;
const now = () => Date.now() / 1000;

let filter = 'all', query = '', markets = [];
$('hk-count').textContent = String(BLOCKS.length);
$('hk-catalog-count').textContent = String(BLOCKS.length);
fillGlyphs();

/* ---------- section nav (scroll-spy) ---------- */
const navStatic = $('hk-secnav');
if (navStatic) {
  const nav = sectionNav([...navStatic.querySelectorAll('a')].map((a) => ({ id: a.getAttribute('href').slice(1), label: a.textContent })));
  nav.el.classList.add('hk-secnav'); nav.el.id = 'hk-secnav';
  navStatic.replaceWith(nav.el);
}

/* ---------- the catalog ---------- */
function usesLine(id, el) {
  const users = usersOf(markets, maskId(id));
  el.replaceChildren();
  if (!users.length) return;
  el.append(h('span', { class: 'hk-uses__faces' }, users.slice(0, 4).map((m) => avatar(m.key.split(':')[1], '', m.logo || null))),
    h('span', null, 'Live on ', h('b', null, String(users.length)), users.length === 1 ? ' launch' : ' launches', h('span', { class: 'hk-uses__syms' }, ' · ' + users.slice(0, 3).map((m) => '$' + m.symbol).join(', '))));
}
function card(b) {
  const uses = h('span', { class: 'hk-uses', dataset: { block: b.id } });
  const el = h('article', { class: 'hk-block', 'data-cat': b.cat, id: 'block-' + b.id },
    h('span', { class: 'hl-gt hk-block__g' }, glyph(b.id)),
    h('div', { class: 'hk-block__main' },
      h('h3', { class: 'hk-block__t' }, b.name),
      h('p', { class: 'hk-block__line' }, b.line),
      h('p', { class: 'hk-block__meta' }, h('span', { class: 'qa-tag hk-cat hk-cat--' + b.cat }, catName(b.cat)), uses),
      h('details', { class: 'hl-more hk-block__how' }, h('summary', null, 'How it works'),
        h('p', null, b.how),
        b.params.length ? h('dl', { class: 'qa-kv hk-params' }, b.params.map((p) => h('div', null, h('dt', null, p.label), h('dd', null, shown(p))))) : null)));
  usesLine(b.id, uses);
  return el;
}
function renderGrid() {
  const q = query.trim().toLowerCase();
  const list = BLOCKS.filter((b) => (filter === 'all' || b.cat === filter) && (!q || (b.name + ' ' + b.line + ' ' + b.how).toLowerCase().includes(q)));
  $('hk-grid').replaceChildren(...list.map(card));
  $('hk-empty').hidden = list.length > 0;
}
$('hk-chips').append(...[{ id: 'all', name: 'All' }, ...CATEGORIES.filter((c) => c.id !== 'built')].map((c) =>
  h('button', { type: 'button', class: 'qa-tab hk-chip', 'aria-pressed': String(c.id === 'all'), 'data-cat': c.id,
    onclick: () => { filter = c.id; for (const b of $('hk-chips').children) b.setAttribute('aria-pressed', String(b.dataset.cat === filter)); renderGrid(); } },
    c.name, h('span', { class: 'qa-tab__n' }, String(c.id === 'all' ? BLOCKS.length : BLOCKS.filter((b) => b.cat === c.id).length)))));
$('hk-search').addEventListener('input', (e) => { query = e.target.value; renderGrid(); });

/* ---------- presets: blocks strung on one line ---------- */
const presetUsers = (p) => {
  const want = [...new Set(p.on.map(maskId))].sort().join();
  return markets.filter((m) => [...m.blocks].sort().join() === want);
};
function presetRow(p) {
  const users = h('span', { class: 'hk-uses', dataset: { preset: p.id } });
  const fill = () => { const u = presetUsers(p); users.replaceChildren(); if (u.length) users.append(h('span', { class: 'hk-uses__faces' }, u.slice(0, 4).map((m) => avatar(m.key.split(':')[1], '', m.logo || null))), h('span', null, 'Live on ', h('b', null, String(u.length)), u.length === 1 ? ' launch' : ' launches', ' · ' + u.slice(0, 3).map((m) => '$' + m.symbol).join(', '))); };
  fill(); users.refill = fill;
  return h('article', { class: 'hk-preset', id: 'preset-' + p.id },
    h('div', { class: 'hk-preset__head' }, h('h3', { class: 'hk-preset__t' }, p.name), users),
    h('p', { class: 'hk-preset__line' }, p.line),
    h('ol', { class: 'hk-rail', 'aria-label': p.name + ' blocks' }, p.on.map((id) => h('li', null, h('a', { href: '#block-' + id, class: 'hk-node' }, h('span', { class: 'hl-gt hl-gt--sm' }, glyph(id)), h('span', null, blockName(id)))))),
    h('a', { class: 'qa-link hk-preset__go', href: '/qtoken-studio?blocks=' + p.id }, 'Launch with this', h('span', { 'aria-hidden': 'true' }, '→')));
}
$('hk-presets').append(...PRESETS.filter((p) => p.id !== 'none' && presetVisible(p)).map(presetRow));

/* ---------- built in ---------- */
const BUILT_GLYPH = { 'Liquidity lock': 'lock', QGraduation: 'graduation', 'Two-key fee claims': 'keys', 'Notice period': 'bell', 'Creator LP fee': 'fee' };   // the chains row carries its own glyph (its name follows the live count)
$('hk-built').append(...BUILT_IN.map((b) => h('div', { class: 'hk-built-item' }, h('span', { class: 'hl-gt hl-gt--sm' }, glyph(BUILT_GLYPH[b.name] || b.glyph || 'shield')), h('div', null, h('h3', { class: 'hl-h3' }, b.name), h('p', null, b.line)))));

renderGrid();
if (location.hash.startsWith('#block-')) { const t = d.getElementById(location.hash.slice(1)); t?.querySelector('details')?.setAttribute('open', ''); requestAnimationFrame(() => t?.scrollIntoView()); }

/* ---------- live: launches and the blocks their trades run through ---------- */
const live = $('hk-live'), rows = new Map();
let lastAny = 0, primed = false;
function marketRow(m) {
  const glyphs = h('span', { class: 'hk-run' }, m.blocks.length ? m.blocks.map((id) => h('a', { class: 'hk-run__g', href: '#block-' + id, title: blockName(id), dataset: { id } }, glyph(id))) : h('span', { class: 'hk-run__none' }, 'Open trading, no blocks'));
  const age = h('b', { class: 'hk-row__age' }), trades = h('small');
  const el = h('a', { class: 'qa-row hk-row', href: m.href, dataset: { key: m.key } },
    h('span', { class: 'hk-row__coin' }, m.logo ? h('img', { src: m.logo, alt: '', width: 40, height: 40, loading: 'lazy', decoding: 'async' }) : h('span', null, (m.symbol || '?')[0])),
    h('span', { class: 'qa-row__main' }, h('span', { class: 'qa-row__t' }, '$' + m.symbol, h('span', { class: 'hk-row__chain' }, m.chain)), glyphs),
    h('span', { class: 'qa-row__v' }, age, trades));
  el.paint = (mm) => {
    age.textContent = mm.lastTradeAt ? fmt.age(now() - mm.lastTradeAt) : '–';
    age.title = mm.lastTradeAt ? 'Last trade ' + fmt.age(now() - mm.lastTradeAt) + ' ago' : 'No trades yet';
    trades.textContent = mm.trades24 ? mm.trades24.toLocaleString('en-US') + ' trades 24h' : 'No trades 24h';
  };
  el.paint(m);
  return el;
}
function drawLive(list) {
  const shown = list.slice().sort((a, b) => b.lastTradeAt - a.lastTradeAt).slice(0, 8);
  const first = new Map([...live.children].map((c) => [c.dataset.key, c.getBoundingClientRect().top]));
  const kids = shown.map((m) => { let r = rows.get(m.key); if (!r) { r = marketRow(m); rows.set(m.key, r); } else r.paint(m); return r; });
  live.replaceChildren(...kids);
  if (RM) return;
  for (const r of kids) { const was = first.get(r.dataset.key); if (was == null) continue; const dy = was - r.getBoundingClientRect().top; if (Math.abs(dy) > 2) r.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 450, easing: 'cubic-bezier(.05,.7,.1,1)' }); }
}
// A trade lights its pool's blocks in order: the swap passing through each hook.
function runThrough(m, side) {
  const r = rows.get(m.key); if (!r) return;
  r.classList.remove('is-buy', 'is-sell'); r.classList.add(side === 'sell' ? 'is-sell' : 'is-buy');
  if (!RM) restart(r, 'is-hit');
  [...r.querySelectorAll('.hk-run__g')].forEach((g, i) => { if (RM) return; setTimeout(() => restart(g, 'is-lit'), 120 + i * 110); });
  for (const id of m.blocks) {
    const tile = d.querySelector(`#block-${id === 'holderGate' ? 'holderGate' : id} .hk-block__g`);
    if (tile && !RM) restart(tile, 'is-lit');
  }
}
function pulseLine(m, side) {
  const p = $('hk-pulse'); if (!p) return;
  const verb = side === 'sell' ? 'Sell' : side === 'buy' ? 'Buy' : 'Trade';
  p.replaceChildren(h('span', { class: 'hk-pulse__dot is-' + side }), h('b', null, verb + ' on $' + m.symbol), ...(m.blocks.length ? [' ran through ', h('b', null, m.blocks.length + (m.blocks.length === 1 ? ' block' : ' blocks'))] : [' · open trading, no blocks']), ' · just now');
  if (!RM) restart(p, 'is-on');
}
function paintAges() {
  for (const m of markets) rows.get(m.key)?.paint(m);
  if (lastAny && $('hk-pulse') && !$('hk-pulse').classList.contains('is-fresh')) {
    const p = $('hk-pulse');
    if (!p.dataset.manual) { const m = markets.find((x) => x.lastTradeAt === lastAny); if (m) p.replaceChildren(h('span', { class: 'hk-pulse__dot' }), 'Last trade ', h('b', null, fmt.age(now() - lastAny) + ' ago'), ' on $' + m.symbol); }
  }
}
setInterval(paintAges, 1000);

watchLaunches((list, evts, err) => {
  let events = evts;
  if (err || !list) {
    if (!markets.length) live.replaceChildren(h('p', { class: 'hl-small hk-live-empty' }, 'Refreshing the launch list…'));
    return;
  }
  markets = list.filter((m) => m.live);
  lastAny = Math.max(0, ...markets.map((m) => m.lastTradeAt));
  const running = markets.filter((m) => m.blocks.length).length;
  const cnt = $('hk-live-count');
  if (cnt.textContent !== String(running)) { cnt.textContent = String(running); if (!RM && events.length) restart(cnt, 'is-tick'); }
  drawLive(markets);
  for (const el of d.querySelectorAll('.hk-uses[data-block]')) usesLine(el.dataset.block, el);
  for (const el of d.querySelectorAll('.hk-uses[data-preset]')) el.refill?.();
  paintAges();
  // On the first read, a trade from the last 90 seconds lights its blocks too: it just happened.
  if (!primed) { primed = true; const fresh = markets.filter((m) => m.lastTradeAt && now() - m.lastTradeAt < 90).sort((x, y) => y.lastTradeAt - x.lastTradeAt)[0]; if (fresh && !events.length) events = [{ market: fresh, side: 'trade' }]; }
  let manualTimer = 0;
  events = events.slice().sort((x, y) => y.market.lastTradeAt - x.market.lastTradeAt);
  for (const [i, e] of events.slice(0, 3).entries()) {
    setTimeout(() => {
      runThrough(e.market, e.side); pulseLine(e.market, e.side); $('hk-pulse').dataset.manual = '1';
      clearTimeout(manualTimer); manualTimer = setTimeout(() => { delete $('hk-pulse').dataset.manual; }, 6000);
      // one toast per read: the newest trade that ran through blocks
      if (i === 0 && e.market.blocks.length) toast({ kind: 'holder', title: (e.side === 'sell' ? 'Sell' : e.side === 'buy' ? 'Buy' : 'Trade') + ' on $' + e.market.symbol, body: 'Ran through ' + e.market.blocks.map(blockName).slice(0, 3).join(', ') + (e.market.blocks.length > 3 ? ' and ' + (e.market.blocks.length - 3) + ' more' : ''), ava: avatar(e.market.key.split(':')[1], '', e.market.logo || null), badge: e.side === 'sell' ? 'down' : e.side === 'buy' ? 'up' : 'trade' })?.style.setProperty('--c', e.side === 'sell' ? 'var(--qa-sell)' : e.side === 'buy' ? 'var(--qa-buy)' : 'var(--qa-gold)');
    }, i * 1400);
  }
});

/* ---------- the wider hook directory ---------- */
directoryCoverage().then((c) => {
  const cells = $('hk-dir').children;
  cells[0].firstChild.textContent = c.hooks.toLocaleString('en-US');
  cells[1].firstChild.textContent = String(c.chains);
  cells[2].firstChild.textContent = c.swaps >= 1e6 ? (c.swaps / 1e6).toFixed(1) + 'M' : c.swaps.toLocaleString('en-US');
}).catch(() => { $('hk-dir').hidden = true; });

/* ---------- Builders: modules in the marketplace (the reviewed list Create offers) ---------- */
(async () => {
  const box = $('hk-modules'); if (!box) return;
  try {
    const r = await fetch('/market/modules.json', { headers: { accept: 'application/json' } }); if (!r.ok) throw new Error();
    const list = (await r.json()).modules.filter((m) => m.status === 'listed');
    if (!list.length) { box.replaceChildren(h('p', { class: 'hl-small' }, 'No modules listed yet. Yours could be the first.')); return; }
    box.replaceChildren(...list.map((m) => h('a', { class: 'qa-row hk-mod', href: '/builders#module-' + m.slug },
      h('span', { class: 'hl-gt hl-gt--sm', dataset: { hlGlyph: m.panel === 'raffle' ? 'raffle' : m.panel === 'stake' ? 'stake' : 'module' } }),
      h('span', { class: 'qa-row__main' }, h('span', { class: 'qa-row__t' }, m.name), h('span', { class: 'hk-mod__s' }, m.summary)),
      h('span', { class: 'qa-row__v' }, h('b', null, m.builderBps ? (m.builderBps / 100) + '% to builder' : 'No builder share'), h('small', null, 'Built by ' + m.builderName)))));
    fillGlyphs(box);
  } catch { box.replaceChildren(h('p', { class: 'hl-small' }, 'Refreshing the module list.')); }
})();
// Copy the MCP address.
$('hk-mcp-copy')?.addEventListener('click', async (e) => {
  const b = e.currentTarget, text = b.dataset.copy, was = b.textContent;
  try { await navigator.clipboard.writeText(text); b.textContent = 'Copied'; } catch { b.textContent = text; }
  setTimeout(() => { b.textContent = was; }, 1800);
});
