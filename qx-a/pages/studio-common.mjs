// Studio lane (launch tools): one boot for every page in the lane. Mounts the System A shell, moves the page's own
// wallet button (#qhc-trigger, which the wallet scripts drive) into the shell's wallet slot, and lights the page with
// the QHooks art (pages here have no token of their own until the person adds one).
import { mountShell } from '/qx-a/shell.mjs';
import { h, setArt, ambient } from '/qx-a/components.mjs';

export const QHOOKS_ART = { banner: '/qx-a/img/qhooks-banner.jpg', blur: '/qx-a/img/qhooks-banner-blur.jpg', icon: '/qx-a/img/qhooks-icon.jpg' };

export function bootStudio({ active = 'launch', mode = 'app', title = '', back = '/create', art = QHOOKS_ART } = {}) {
  setArt(art);
  if (!document.querySelector('.qa-ambient')) document.body.prepend(ambient());
  // The wallet scripts find this button by id and keep its label current; it only changes place and look.
  // A page without the wallet dialog (no wallet scripts) gets a link to My QHooks instead of a button that does nothing.
  let wallet = document.getElementById('qhc-trigger');
  if (wallet && document.getElementById('qhc-dialog')) wallet.className = 'qa-btn qa-btn--primary qa-wallet__btn qhc-trigger';
  else { wallet?.remove(); wallet = h('a', { class: 'qa-btn qa-btn--secondary qa-wallet__btn', href: '/me' }, 'My QHooks'); }
  return mountShell({ active, mode, title, back, wallet, logo: '/qhooks-logo.jpg' });
}

// Batches DOM-driven repaints to one per frame.
export function frameBatch(fn) {
  let queued = false;
  return () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; fn(); }); };
}
