// QHooks create v2 helpers (2026-11 redesign). Presentation only: reads what the page has rendered and marks it up.
//  1. The idea whose quick launch is open is marked on its tile.
//  2. The total the page shows is repeated beside the Launch button, which is pinned in reach on a phone.
const $ = id => document.getElementById(id);
const quick = $('qq-quick'), cards = $('qq-cards'), styleName = $('qq-style-name'), cost = $('qq-cost');
if (quick && cards && styleName) {
  const mark = () => {
    const open = !quick.hidden && getComputedStyle(quick).display !== 'none', name = styleName.textContent.trim().toLowerCase();
    for (const c of cards.querySelectorAll('.qq-card')) {
      const on = open && !!name && c.querySelector('h3')?.textContent.trim().toLowerCase() === name;
      if (c.classList.contains('qv2-picked') !== on) c.classList.toggle('qv2-picked', on);
    }
  };
  new MutationObserver(mark).observe(styleName, { childList: true, characterData: true, subtree: true });
  new MutationObserver(mark).observe(quick, { attributes: true, attributeFilter: ['hidden', 'style', 'class'] });
  new MutationObserver(mark).observe(cards, { childList: true });
  mark();
}
if (quick && cost) {
  const actions = quick.querySelector('.qxc-actions');
  const total = () => {
    const t = cost.querySelector('.qq-total')?.textContent.trim() || '';
    if (!actions) return;
    if (t) { if (actions.dataset.total !== t) actions.dataset.total = t; } else if ('total' in actions.dataset) delete actions.dataset.total;
  };
  new MutationObserver(total).observe(cost, { childList: true, characterData: true, subtree: true });
  total();
}
