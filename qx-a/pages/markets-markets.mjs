// Markets in System A: the shell, a band of live launches, and live numbers on every directory row.
// The directory search, paging, validation and Open market flow stay in /qx-market-browser.mjs; this fills each row's
// price, 24h change, market cap and last trade from the public launch feed, matched by chain and controller.
import { laneShell, visiblePoll } from './markets-shell.mjs';
import { launchFeed, coinEl, priceText, capText, changeText, tick, ageClock } from './markets-live.mjs';
import { chainById } from '/chains.mjs';

laneShell({ active: 'trade' });
const $ = (id) => document.getElementById(id);
const make = (tag, cls, ...kids) => { const n = document.createElement(tag); if (cls) n.className = cls; for (const k of kids.flat()) if (k != null && k !== false) n.append(k.nodeType ? k : String(k)); return n; };
let feed = new Map(), prev = new Map();

function fillRows() {
  for (const card of document.querySelectorAll('#qm-results [data-market]')) {
    const r = feed.get(card.dataset.market.toLowerCase()); if (!r) continue;
    const k = card.dataset.market, px = card.querySelector('.mk-card__px');
    tick(px, priceText(r.priceUsd), r.priceUsd, prev.get(k)); prev.set(k, r.priceUsd);
    const chg = card.querySelector('.mk-card__chg'); chg.textContent = changeText(r.change); chg.className = 'mk-card__chg ' + (r.change > 0 ? 'qa-up' : r.change < 0 ? 'qa-down' : 'qa-muted');
    card.querySelector('.mk-card__mc').textContent = 'MC ' + capText(r.mcapUsd);
    const age = card.querySelector('.mk-card__age'); if (r.lastTradeAt) age.dataset.ts = r.lastTradeAt;
    card.classList.add('has-live');
  }
}

/* the band: live launches by 24h volume, scrolling; their prices tick in place */
let bandKey = '';
function paintBand(rows) {
  const band = $('mkm-band'); if (!band) return;
  const live = rows.filter((r) => r.live && r.priceUsd != null).sort((a, b) => (b.volUsd || 0) - (a.volUsd || 0));
  if (!live.length) { band.hidden = true; return; }
  const key = live.map((r) => r.key).join(',');
  if (key !== bandKey) {
    bandKey = key;
    const track = make('div', 'mkm-band__track');
    for (let copy = 0; copy < 3; copy++) for (const r of live) {
      const a = make('a', 'mkm-band__item', coinEl(r, 'mk-coin mkm-band__coin'), make('b', null, r.symbol), make('span', 'mkm-band__px'), make('span', 'mkm-band__chg'), make('small', null, chainById(r.chainId)?.short || ''));
      a.href = '/terminal.html#m=' + r.chainId + ':' + r.controller; a.dataset.key = r.key;
      if (copy) { a.setAttribute('aria-hidden', 'true'); a.tabIndex = -1; }
      track.append(a);
    }
    band.replaceChildren(track); band.hidden = false;
  }
  for (const a of band.querySelectorAll('[data-key]')) {
    const r = live.find((x) => x.key === a.dataset.key); if (!r) continue;
    tick(a.querySelector('.mkm-band__px'), priceText(r.priceUsd), r.priceUsd, a.hasAttribute('aria-hidden') ? null : prev.get('band:' + r.key));
    const c = a.querySelector('.mkm-band__chg'); c.textContent = changeText(r.change); c.className = 'mkm-band__chg ' + (r.change > 0 ? 'qa-up' : r.change < 0 ? 'qa-down' : 'qa-muted');
  }
  for (const r of live) prev.set('band:' + r.key, r.priceUsd);
}

visiblePoll(async () => {
  const rows = await launchFeed();
  feed = new Map(rows.map((r) => [r.key, r]));
  paintBand(rows); fillRows();
}, 15e3);
// rows re-render on search and paging: fill them as soon as they land
new MutationObserver(fillRows).observe($('qm-results'), { childList: true });
ageClock($('qm-results'));
