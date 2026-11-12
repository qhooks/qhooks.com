// QHOOKS launch record on System A: the QHOOKS art opens the page (banner, coin, chain), then the record.
import { bootStudio, QHOOKS_ART } from '/qx-a/pages/studio-common.mjs';
import { h, artStage } from '/qx-a/components.mjs';

bootStudio({ active: 'launch' });
const main = document.getElementById('main');
const stage = artStage({
  banner: QHOOKS_ART.banner, icon: QHOOKS_ART.icon, name: 'QHOOKS', official: true, wide: true,
  meta: [h('span', null, h('span', { class: 'qa-chain-dot', 'aria-hidden': 'true' }), 'Robinhood Chain'), h('span', null, 'Launched Nov 7, 2026')],
});
// the page title stays the record's own heading; the stage name is a label, not a second h1
const sym = stage.el.querySelector('h1.qa-sym');
if (sym) { const p = h('p', { class: 'qa-sym' }); p.append(...sym.childNodes); sym.replaceWith(p); }
main.prepend(h('div', { class: 'qa-bleed qst-day__stage' }, stage.el));
