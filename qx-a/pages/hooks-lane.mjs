// HOOKS lane (System A): one boot for every page in the lane. Mounts the shell, moves the site wallet button into the
// shell's wallet slot and lights the page with the QHooks art. Page options come from <body> data attributes:
//   data-qa-active="hooks|launch|trade|community|portfolio|"   data-qa-mode="app|detail"   data-qa-back="/hooks"   data-qa-title="…"
import { mountShell } from '/qx-a/shell.mjs';
import { setArt, ambient } from '/qx-a/components.mjs';
import { ensureGlyphs, fillGlyphs } from '/qx-a/pages/hooks-glyphs.mjs';

const body = document.body, opt = body.dataset;
const trigger = document.getElementById('qhc-trigger');
// The wallet modules keep driving this button (id qhc-trigger); it only changes place and look.
if (trigger) trigger.classList.add('qa-btn', 'qa-btn--primary', 'qa-wallet__btn');

export const shell = mountShell({
  active: opt.qaActive ?? 'hooks',
  mode: opt.qaMode || 'app',
  title: opt.qaTitle || '',
  back: opt.qaBack || '/hooks',
  wallet: trigger || undefined,
  logo: '/qx-a/img/qhooks-icon.jpg',
});
setArt({ banner: '/qx-a/img/qhooks-banner.jpg', blur: '/qx-a/img/qhooks-banner-blur.jpg', icon: '/qx-a/img/qhooks-icon.jpg' });
if (!document.querySelector('.qa-ambient')) body.prepend(ambient());
ensureGlyphs(); fillGlyphs();

// Family sub-navigation scrolls sideways on a phone: keep the current page's tab in view.
for (const nav of document.querySelectorAll('.hl-subnav')) {
  const on = nav.querySelector('[aria-current="page"]');
  if (on && on.offsetLeft + on.offsetWidth > nav.clientWidth) nav.scrollLeft = on.offsetLeft - 18;
}
