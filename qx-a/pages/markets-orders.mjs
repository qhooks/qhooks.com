// Limit orders in System A: the shell, the chosen token with its live price, and the live list of QHooks launches to set
// a price on. Orders themselves (forms, signatures, keeper fills) stay in /qx-pro-orders.mjs.
import { laneShell, quietWhenConnected, visiblePoll } from './markets-shell.mjs';
import { launchFeed, coinEl, priceText, capText, changeText, tick, ageClock } from './markets-live.mjs';
import { chainById } from '/chains.mjs';

laneShell({ active: 'trade' });
quietWhenConnected(document.querySelector('[data-qa-connect]'));

const $ = (id) => document.getElementById(id);
const make = (tag, cls, ...kids) => { const n = document.createElement(tag); if (cls) n.className = cls; for (const k of kids.flat()) if (k != null && k !== false) n.append(k.nodeType ? k : String(k)); return n; };
const m = /^(\d+):(0x[0-9a-fA-F]{40})$/.exec(new URLSearchParams(location.search).get('m') || '');
const want = m ? m[1] + ':' + m[2].toLowerCase() : null;
if (want) document.body.classList.add('mko--market');
const prev = new Map();

function paintToken(row) {
  const box = $('mko-token'); if (!box || !row) return;
  if (!box.childElementCount) {
    box.append(coinEl(row, 'mk-coin mko-token__coin'), make('div', 'mko-token__id', make('b', null, row.symbol), make('span', null, chainById(row.chainId)?.name || row.chainId)),
      make('p', 'mko-token__px qa-price', ''), make('p', 'mko-token__chg', ''), make('p', 'mko-token__meta', make('span', null, 'MC ', make('b', 'mko-token__mc')), make('span', null, 'Last trade ', make('b', 'mko-token__age'))));
    box.hidden = false;
  }
  const p = prev.get('token');
  tick(box.querySelector('.mko-token__px'), priceText(row.priceUsd), row.priceUsd, p);
  prev.set('token', row.priceUsd);
  const chg = box.querySelector('.mko-token__chg'); chg.textContent = changeText(row.change) + ' 24h'; chg.className = 'mko-token__chg ' + (row.change > 0 ? 'qa-up' : row.change < 0 ? 'qa-down' : 'qa-muted');
  box.querySelector('.mko-token__mc').textContent = capText(row.mcapUsd);
  const age = box.querySelector('.mko-token__age'); age.dataset.ts = row.lastTradeAt || '';
}

function paintList(rows) {
  const list = $('mko-list');
  const live = rows.filter((r) => r.live).sort((a, b) => (b.volUsd || 0) - (a.volUsd || 0) || (b.lastTradeAt || 0) - (a.lastTradeAt || 0));
  $('mko-markets-note').textContent = live.length ? live.length + ' live' : '';
  if (!live.length) { list.replaceChildren(make('li', 'mk-mlist__empty', 'Live launches show here as they open.')); return; }
  const have = new Map([...list.querySelectorAll('[data-key]')].map((n) => [n.dataset.key, n]));
  const next = live.map((r) => {
    let li = have.get(r.key);
    if (!li) {
      li = make('li', 'mk-mrow' + (r.key === want ? ' is-on' : '')); li.dataset.key = r.key;
      const a = make('a', 'mk-mrow__a'); a.href = '/orders?m=' + r.chainId + ':' + r.controller;
      a.append(coinEl(r), make('span', 'mk-mrow__id', make('b', null, r.symbol), make('small', null, chainById(r.chainId)?.short || chainById(r.chainId)?.name || r.chainId)),
        make('span', 'mk-mrow__px'), make('span', 'mk-mrow__chg'), make('span', 'mk-mrow__mc'), make('span', 'mk-mrow__age'));
      if (r.key === want) a.setAttribute('aria-current', 'page');
      li.append(a);
    }
    const p = prev.get(r.key);
    tick(li.querySelector('.mk-mrow__px'), priceText(r.priceUsd), r.priceUsd, p);
    prev.set(r.key, r.priceUsd);
    const chg = li.querySelector('.mk-mrow__chg'); chg.textContent = changeText(r.change); chg.className = 'mk-mrow__chg ' + (r.change > 0 ? 'qa-up' : r.change < 0 ? 'qa-down' : 'qa-muted');
    li.querySelector('.mk-mrow__mc').textContent = 'MC ' + capText(r.mcapUsd);
    li.querySelector('.mk-mrow__age').dataset.ts = r.lastTradeAt || '';
    return li;
  });
  list.replaceChildren(...next);
}

visiblePoll(async () => {
  try {
    const rows = await launchFeed();
    paintList(rows);
    if (want) paintToken(rows.find((r) => r.key === want));
  } catch { if (!$('mko-list').childElementCount) $('mko-markets-note').textContent = 'Refreshing'; }
}, 15e3);
ageClock(document.body);
