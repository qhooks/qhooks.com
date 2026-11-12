// System A on pages that are not converted yet. theme.js loads this on every page (qx-shell.mjs and qx-appbar.mjs
// import it too); it runs once. Converted pages (body[data-a-shell]) mount the shell themselves and this steps aside.
// Everywhere else it calls the same mountShell() and hands it the old chrome:
//  - .site-header / .qfs-header: hidden; its wallet button (#qhc-trigger) moves into the shell's wallet slot, so
//    wallet-site.mjs, wallet-login.mjs, l121-mobile-login.mjs and the account menu keep working unchanged;
//  - .qxt-top (terminal, perps): kept as the header (the trading page reads its controls by id), with the shell menu;
//  - the old phone tab bar: replaced by the shell's (pages that load qx-appbar.mjs keep a tab bar, the rest don't);
//  - the old footer: replaced by the shell footer with the brand line and every section link.
// bridge.css (scoped to body:not([data-a-shell])) restyles the rest of the old page.
import { mountShell, getShell } from './shell.mjs';

const doc = document, root = doc.documentElement;
const ready = (fn) => (doc.readyState === 'loading' ? doc.addEventListener('DOMContentLoaded', fn, { once: true }) : fn());
const sheet = (href) => new Promise((resolve) => {
  let l = doc.querySelector(`link[rel="stylesheet"][href="${href}"]`);
  if (l) return l.sheet ? resolve() : (l.addEventListener('load', resolve, { once: true }), l.addEventListener('error', resolve, { once: true }), setTimeout(resolve, 2500));
  l = doc.createElement('link'); l.rel = 'stylesheet'; l.href = href;
  l.addEventListener('load', resolve, { once: true }); l.addEventListener('error', resolve, { once: true }); setTimeout(resolve, 2500);
  doc.head.append(l);
});

async function boot() {
  const body = doc.body;
  if (!body || getShell()) return;
  if (body.hasAttribute('data-a-shell')) {
    // Converted page: it mounts the shell itself. If it hasn't by the time the page has loaded, mount with defaults.
    const fallback = () => { if (!getShell()) mountShell({}); };
    if (doc.readyState === 'complete') setTimeout(fallback, 0); else addEventListener('load', () => setTimeout(fallback, 0), { once: true });
    return;
  }
  if (root.classList.contains('qa-bridge-off')) return;
  await Promise.all([sheet('/qx-a/tokens.css'), sheet('/qx-a/shell.css'), sheet('/qx-a/bridge.css')]);
  if (getShell() || root.classList.contains('qa-bridge-off')) return;
  const qxt = doc.querySelector('header.qxt-top');
  const tabs = !!doc.querySelector('script[src*="qx-appbar.mjs"]');
  const opts = { bridge: true, tabbar: tabs, ribbon: tabs && !qxt, footer: !qxt };
  if (qxt) opts.adopt = qxt;
  mountShell(opts);
  if (qxt) body.classList.add('qa-shell--tabs-narrow');
}
ready(() => { boot().catch(() => root.classList.add('qa-bridge-off')); });
