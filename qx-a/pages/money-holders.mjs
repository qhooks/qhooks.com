// Holder economy, live (the "Holders" act): QHOOKS burned, the next buyback counting down, the latest burns dropping in,
// and the floor rising under the price. Mounts into any [data-mn-burns] and [data-mn-floor] on the page.
// Data: /api/qhooks/buybacks (read on chain by the worker; the same read the QHOOKS page's burn ticker makes, every 20 s
// while the page is in view) and the floor tracker's own on-chain read (#qft-root, qx-floor-tracker.mjs). Nothing here
// is a sample or a replay: every movement is a real burn, a real countdown second or a real floor read.
import { h, fmt, RM, keeperAvatar, countdown, toast, toastHost, sectionHead } from '/qx-a/components.mjs';

const API = '/api/qhooks/buybacks', REFRESH = 20000;
const units = (wei) => { try { return Number(BigInt(wei || 0)) / 1e18; } catch { return 0; } };
const eth = (v) => v >= 1 ? v.toFixed(3) : v >= 0.001 ? v.toFixed(4) : v >= 0.000001 ? v.toFixed(6) : v > 0 ? '<0.000001' : '0';
const qty = (v) => v >= 1 ? fmt.tok(v) : v > 0 ? '<1' : '0';

function burns(el) {
  const total = h('b', { class: 'mn-burn__n' }, '—');
  const live = h('span', { class: 'mn-live' }, h('span', { class: 'mn-live__dot', 'aria-hidden': 'true' }), h('span', null, 'Refreshing'));
  const cd = countdown({ label: 'until the next buyback', total: 900 });
  const facts = h('dl', { class: 'mn-burn__facts' });
  const list = h('ol', { class: 'mn-burn__tape', 'aria-label': 'Latest buybacks' });
  el.replaceChildren(
    sectionHead({ title: 'Holders', note: live }),
    h('div', { class: 'mn-burn' },
      h('div', { class: 'mn-burn__main' }, h('p', { class: 'mn-burn__k' }, 'QHOOKS burned, all sources'), total,
        h('p', { class: 'mn-burn__sub' }, 'Buybacks send QHOOKS to the dead address.')),
      h('div', { class: 'mn-burn__clock' }, cd, facts)),
    h('div', { class: 'mn-burn__list' }, h('h3', { class: 'mn-burn__h' }, 'Latest buybacks'), list));
  let data = null, fetchedAt = 0, shown = 0, seen = new Set(), first = true;
  const chainNow = () => (data?.blockTime || Math.floor(fetchedAt / 1000)) + Math.floor((Date.now() - fetchedAt) / 1000);
  const ageOf = (at) => fmt.age(chainNow() - at);
  function count(to) {
    if (RM || !shown || to <= shown) { shown = to; total.textContent = fmt.tok(to); return; }
    const from = shown, t0 = performance.now(), dur = 1400; shown = to;
    total.classList.add('is-tick');
    const step = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); total.textContent = fmt.tok(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); else setTimeout(() => total.classList.remove('is-tick'), 900); };
    requestAnimationFrame(step);
  }
  function row(b, enter) {
    const li = h('li', { class: 'mn-burn__row' + (enter && !RM ? ' is-enter' : '') },
      keeperAvatar(), h('span', { class: 'mn-burn__what' }, h('b', null, qty(units(b.burnedWei)) + ' QHOOKS'), h('span', null, 'for ' + eth(units(b.spentWei)) + ' WETH')),
      h('a', { class: 'mn-burn__age', href: (data.explorer || 'https://robinhoodchain.blockscout.com') + '/tx/' + b.tx, target: '_blank', rel: 'noopener', 'data-at': b.at }, ageOf(b.at)));
    return li;
  }
  function paint() {
    if (!data?.rules) return;
    const r = data.rules, left = r.nextAt ? Math.max(0, r.nextAt - chainNow()) : 0;
    cd.set(r.everRun ? left : 0);
    const s = Math.max(0, Math.round((Date.now() - fetchedAt) / 1000));
    live.lastChild.textContent = 'Live · ' + (s < 60 ? s + 's' : Math.floor(s / 60) + 'm') + ' ago';
    for (const a of list.querySelectorAll('[data-at]')) a.textContent = ageOf(+a.dataset.at);
  }
  async function load() {
    if (document.visibilityState !== 'visible') return;
    try {
      const r = await fetch(API, { cache: 'no-store' }); if (!r.ok) throw Error('read');
      const d = await r.json(); if (!d?.rules) throw Error('shape');
      data = d; fetchedAt = Date.now();
      const burned = units(d.dead?.balanceWei || d.burns?.qhooksBurnedWei);
      count(burned);
      facts.replaceChildren(
        h('div', null, h('dt', null, 'Buybacks run'), h('dd', null, (d.burns?.count ?? '—').toLocaleString?.('en-US') ?? String(d.burns?.count ?? '—'))),
        h('div', null, h('dt', null, 'WETH spent'), h('dd', null, eth(units(d.burns?.wethSpentWei)))),
        h('div', null, h('dt', null, 'Every'), h('dd', null, Math.round((d.rules.cooldown || 900) / 60) + ' min')));
      const recent = (d.burns?.recent || []).slice(0, 6);
      const fresh = recent.filter((b) => !seen.has(b.tx));
      if (first) { list.replaceChildren(...recent.map((b) => row(b, false))); }
      else for (const b of fresh.reverse()) {
        list.prepend(row(b, true)); while (list.children.length > 6) list.lastElementChild.remove();
        toast({ kind: 'burn', title: 'Buyback burned', body: qty(units(b.burnedWei)) + ' QHOOKS for ' + eth(units(b.spentWei)) + ' WETH', ava: keeperAvatar() });
      }
      recent.forEach((b) => seen.add(b.tx)); first = false;
      el.classList.remove('is-refreshing'); paint();
    } catch { el.classList.add('is-refreshing'); live.lastChild.textContent = 'Refreshing'; }
  }
  load(); setInterval(load, REFRESH); setInterval(paint, 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(); });
}

// The floor under the price: lifted from the floor tracker's own read once it lands (it stays hidden until the floor exists).
function floor(el) {
  const src = document.getElementById('qft-root'); if (!src) return;
  const num = (t) => { const m = /([\d,.]+)\s*WETH/.exec(t || ''); return m ? Number(m[1].replace(/,/g, '')) : null; };
  const lift = () => {
    if (src.hidden) return;
    const facts = {}; const dts = src.querySelectorAll('dt');
    for (const dt of dts) facts[dt.textContent.trim()] = dt.nextElementSibling?.textContent.trim() || '';
    const fl = num(facts['Floor']), px = num(facts['Price now']);
    if (!(fl > 0 && px > 0)) return;
    const pct = Math.max(2, Math.min(100, fl / px * 100));
    const bar = h('div', { class: 'mn-floor__bar', role: 'img', 'aria-label': `The floor is ${pct.toFixed(0)}% of the price` }, h('span', { class: 'mn-floor__fill' }), h('span', { class: 'mn-floor__line' }));
    bar.style.setProperty('--floor', pct.toFixed(2) + '%');
    el.replaceChildren(
      h('div', { class: 'mn-floor__nums' },
        h('div', null, h('span', null, 'Floor'), h('b', { class: 'qa-gold-t' }, facts['Floor'].replace(' market cap', '')), h('small', null, 'market cap')),
        h('div', null, h('span', null, 'Price now'), h('b', null, facts['Price now'].replace(' market cap', '')), h('small', null, 'market cap'))),
      bar,
      h('p', { class: 'mn-floor__note' }, 'The floor sits at ' + pct.toFixed(0) + '% of the price. It only moves up.'));
    el.hidden = false;
  };
  new MutationObserver(lift).observe(src, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  lift();
}

toastHost(document.body);
for (const el of document.querySelectorAll('[data-mn-burns]')) burns(el);
for (const el of document.querySelectorAll('[data-mn-floor]')) floor(el);
