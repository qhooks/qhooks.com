// Money lane (portfolio, My QHooks, wallets, holder pages, one-tap signing pages): mounts the System A shell and hands the
// site's wallet button (#qhc-trigger, bound by wallet-early.js and wallet-site.mjs) to the shell's wallet slot.
// The page says how it sits in the shell with data attributes on <body data-a-shell>:
//   data-a-active="portfolio|community|…"   which nav item lights up
//   data-a-mode="detail" data-a-title="…" data-a-back="/taps"   one-tap pages: back button + title, no tab bar
//   data-a-wallet="none"   pages whose own card carries the wallet step (fee share) or that only redirect (stake)
import { mountShell } from '/qx-a/shell.mjs';

const body = document.body, d = body.dataset;
const trigger = document.getElementById('qhc-trigger');
export const shell = mountShell({
  active: d.aActive || '',
  mode: d.aMode === 'detail' ? 'detail' : 'app',
  title: d.aTitle || '',
  back: d.aBack || '/me',
  logo: '/qhooks-logo.jpg',
  wallet: trigger || (d.aWallet === 'none' ? document.createElement('span') : undefined),
});
// The legacy chrome steps aside on System A pages; nothing else on these pages needs it.
body.classList.add('mn');
