// System A, /sale (create lane): shell and page light; after each of the page's own 5-second reads (qx-sale.mjs
// re-renders #qsa-root), your allocation, the action and the note are grouped into one side slab, and the amount raised
// flashes once when it moved. Presentation only: nodes are moved, never rebuilt, so their handlers stay attached.
import { laneShell, flash } from '/qx-a/pages/create-common.mjs';
laneShell();
const root = document.getElementById('qsa-root');
let last = null, busy = false;
const group = () => {
  if (busy || !root || root.querySelector(':scope > .sa-side')) return;
  const side = [...root.querySelectorAll(':scope > .qsa-you, :scope > .qsa-actions, :scope > .qsa-note')];
  if (!side.length || !root.querySelector(':scope > .qsa-head')) return;
  busy = true;
  const box = document.createElement('aside'); box.className = 'sa-side'; box.setAttribute('aria-label', 'Your part in this sale');
  side[0].before(box); box.append(...side);
  busy = false;
  const dd = [...root.querySelectorAll('.qsa-nums dt')].find((d) => d.textContent.trim() === 'Raised')?.nextElementSibling;
  const v = dd?.textContent.trim() ?? null;
  if (last != null && v != null && v !== last) { flash(dd); flash(root.querySelector('.qsa-bar'), 'is-bump'); }
  if (v != null) last = v;
};
if (root) { new MutationObserver(group).observe(root, { childList: true }); group(); }
