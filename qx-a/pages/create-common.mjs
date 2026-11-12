// System A, create lane: one shell mount for the lane's pages (create, launch, launch-options, sale, founding, token-profile).
// Presentation only. The page's own wallet button (#qhc-trigger, driven by wallet-site.mjs) moves into the shell's wallet slot,
// so connect, the account menu and copy-address keep working unchanged.
import { mountShell } from '/qx-a/shell.mjs';
import { ambient, setArt, RM } from '/qx-a/components.mjs';

export const QHOOKS_BLUR = '/qx-a/img/qhooks-banner-blur.jpg';

export function laneShell(opts = {}) {
  const { art = true, ...rest } = opts;
  const trigger = document.getElementById('qhc-trigger');
  if (trigger) trigger.classList.add('qa-btn', 'qa-btn--secondary', 'qa-wallet__btn');
  const shell = mountShell({ active: 'launch', logo: '/qhooks-logo.jpg', ...(trigger ? { wallet: trigger } : {}), ...rest });
  if (art) { document.body.prepend(ambient()); setArt({ blur: QHOOKS_BLUR }); }
  return shell;
}

// Run fn whenever anything under root changes (debounced to one call per frame). Returns the observer.
export function watch(root, fn, opts = { childList: true, subtree: true, attributes: true, characterData: true }) {
  if (!root) return null;
  let queued = false;
  const run = () => { queued = false; fn(); };
  const mo = new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(run); } });
  mo.observe(root, opts);
  return mo;
}

// Flash a class for one real change (a value that moved). No-op under reduced motion.
export function flash(el, cls = 'cx-flash') {
  if (!el || RM) return;
  el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
}

// Chain marks: the site's own chain icons.
const ICON = { '4663': 'robinhood', '8453': 'base', '56': 'bnb', '42161': 'arbitrum', '1': 'ethereum', '99901': 'elysium', '5042': 'arc', '143': 'monad', solana: 'solana' };
export const chainIcon = (id) => ICON[String(id)] ? '/chain-symbol-icons/' + ICON[String(id)] + '.svg' : null;
