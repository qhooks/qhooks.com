// "Get the app" (2026-11-11): a link to /android in the site menu and footer on every page that loads the shell or the
// phone tab bar, and on Android browsers a slim dismissible bar on home and the terminal. Never inside the app itself.
// Links only: no data, no wallet, no network.
const KEY = 'qx-getapp-dismissed', APP = 'qx-in-app';
const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } };
const session = (k, v) => { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch { return null; } };

// The Android app opens /terminal.html?source=app; later pages in the same window keep the mark via sessionStorage.
export function inApp({search = location.search, referrer = document.referrer, standalone = matchMedia?.('(display-mode: standalone)').matches} = {}) {
  if (new URLSearchParams(search).get('source') === 'app' || String(referrer).startsWith('android-app://com.qhooks.app')) { session(APP, '1'); return true; }
  return session(APP) === '1' || !!standalone;
}
export const isAndroid = (ua = navigator.userAgent) => /Android/i.test(ua);
export const bannerPage = (path = location.pathname) => /^\/(index\.html)?$|^\/terminal(\.html)?\/?$/.test(path);

function addLinks() {
  if (location.pathname.replace(/\.html$/, '') === '/android') return;
  const panel = document.querySelector('.site-nav .qn-g[data-qn="trade"] .qn-panel ul');
  if (panel && !panel.querySelector('a[href="/android"]')) {
    const li = document.createElement('li'), a = document.createElement('a');
    a.href = '/android'; a.innerHTML = '<strong>Get the app</strong><span>QHooks for Android and iPhone</span>';
    li.append(a); panel.append(li);
  }
  const col = [...document.querySelectorAll('.qx-footer .qx-footer-cols > div')].find(d => /Trade$/.test(d.querySelector('h2')?.textContent?.trim() || ''));
  const ul = col?.querySelector('ul');
  if (ul && !ul.querySelector('a[href="/android"]')) {
    const li = document.createElement('li'), a = document.createElement('a');
    a.href = '/android'; a.textContent = 'Get the app'; li.append(a); ul.append(li);
  }
}

function addBanner() {
  if (!isAndroid() || !bannerPage() || inApp() || store(KEY) === '1' || document.querySelector('.qx-getapp')) return;
  const bar = document.createElement('aside');
  bar.className = 'qx-getapp'; bar.setAttribute('aria-label', 'Get the QHooks app');
  bar.innerHTML = '<img src="/app-icons/icon-192.png" alt="" width="28" height="28"><span>Get the QHooks app</span><a href="/android">Get it</a><button type="button" aria-label="Dismiss">×</button>';
  bar.querySelector('button').addEventListener('click', () => { store(KEY, '1'); bar.remove(); });
  // Floats just above the phone tab bar (the site header is an overlay, so a top bar would sit under it).
  const tabbar = document.querySelector('.q-tabbar'), h = tabbar && getComputedStyle(tabbar).display !== 'none' ? tabbar.getBoundingClientRect().height : 0;
  bar.style.bottom = 'calc(' + Math.round(h + 10) + 'px + env(safe-area-inset-bottom, 0px))';
  document.body.append(bar);
}

if (!document.querySelector('link[href="/qx-getapp.css"]')) { const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/qx-getapp.css'; document.head.append(css); }

// One tick later: this module is imported by qx-appbar.mjs, whose body (the tab bar) runs after this one.
const run = () => setTimeout(() => { try { addLinks(); addBanner(); } catch {} }, 0);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, {once: true}); else run();
