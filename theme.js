// Theme and the System A shell boot. A classic script, first in <head> on every page, before any stylesheet.
// 1. Theme: <html data-theme="dark|light"> is set before the first paint. The stored choice wins: 'qa-theme' (what
//    System A pages read), else a returning visitor's 'qhooks.theme', mapped into 'qa-theme' once; otherwise dark,
//    System A's default. Both keys are written on every change. window.qhooksTheme = { get, set, toggle };
//    every change fires 'qa:theme' on window, updates the old [data-theme-toggle] buttons and the theme-color, and
//    reaches other open tabs. components.mjs setTheme() changes are picked up and stored the same way.
// 2. The one shell: marks <html class="qa-bridge">, loads /qx-a/tokens.css and /qx-a/bridge.css (whose rules only
//    touch pages without body[data-a-shell]) and /qx-a/bridge.mjs, which mounts the shared System A shell on pages
//    that are not converted yet. If the shell cannot load (offline, a blocked file), the old chrome comes back.
(() => {
  'use strict';
  const root = document.documentElement, KEY = 'qhooks.theme', A_KEY = 'qa-theme';
  const valid = (t) => t === 'light' || t === 'dark';
  const read = (k) => { try { return window.localStorage.getItem(k); } catch { return null; } };
  const write = (k, v) => { try { window.localStorage.setItem(k, v); } catch { /* the choice still holds for this page */ } };
  // One choice, two keys: System A pages read 'qa-theme' (components.mjs); older code reads 'qhooks.theme'.
  // A returning visitor's 'qhooks.theme' is mapped into 'qa-theme' once; after that both are written together.
  let preference = valid(read(A_KEY)) ? read(A_KEY) : valid(read(KEY)) ? read(KEY) : null;
  if (preference) { if (read(A_KEY) !== preference) write(A_KEY, preference); if (read(KEY) !== preference) write(KEY, preference); }
  let buttons = [];

  function paint(theme) {
    const dark = theme === 'dark';
    buttons.forEach((button) => {
      button.hidden = false;
      button.setAttribute('aria-pressed', String(dark));
      button.title = `Switch to ${dark ? 'light' : 'dark'} mode`;
      button.setAttribute('aria-label', button.title);
    });
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#090B0A' : '#F2F3F1');
  }
  function apply(theme, persist) {
    const before = root.dataset.theme;
    root.dataset.theme = theme;
    if (persist) { preference = theme; write(KEY, theme); write(A_KEY, theme); }
    paint(theme);
    if (before && before !== theme) window.dispatchEvent(new CustomEvent('qa:theme', { detail: theme }));
  }
  apply(preference || 'dark', false);

  window.qhooksTheme = Object.freeze({
    get: () => root.dataset.theme,
    set: (t) => apply(t === 'light' ? 'light' : 'dark', true),
    toggle: () => apply(root.dataset.theme === 'dark' ? 'light' : 'dark', true),
  });
  // System A pages may call components.mjs setTheme(), which sets data-theme itself and fires qa:theme.
  window.addEventListener('qa:theme', (e) => {
    const t = e.detail;
    if (valid(t) && root.dataset.theme === t && t !== preference) { preference = t; write(KEY, t); write(A_KEY, t); paint(t); }
  });
  // Another tab switched: follow it.
  window.addEventListener('storage', (e) => { if ((e.key === KEY || e.key === A_KEY) && valid(e.newValue) && e.newValue !== root.dataset.theme) { preference = e.newValue; apply(e.newValue, false); } });

  document.addEventListener('DOMContentLoaded', () => {
    buttons = document.querySelectorAll('[data-theme-toggle]');
    buttons.forEach((button) => {
      const header = button.closest('.site-header');
      if (header) header.append(button);
      // Fixed local SVG, no remote icon/font and no user-provided markup.
      button.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16Z" fill="currentColor" stroke="none"/></svg>';
      button.addEventListener('click', () => window.qhooksTheme.toggle());
    });
    paint(root.dataset.theme);
  }, { once: true });

  // ---- System A shell ----
  root.classList.add('qa-bridge');
  const head = document.head || root;
  const add = (tag, attrs) => { const el = document.createElement(tag); for (const k in attrs) el.setAttribute(k, attrs[k]); head.appendChild(el); return el; };
  add('link', { rel: 'stylesheet', href: '/qx-a/tokens.css', blocking: 'render' });
  add('link', { rel: 'stylesheet', href: '/qx-a/bridge.css', blocking: 'render' });
  add('script', { type: 'module', src: '/qx-a/bridge.mjs' });
  window.addEventListener('load', () => {
    setTimeout(() => { if (!root.classList.contains('qa-mounted')) root.classList.add('qa-bridge-off'); }, 4000);
  }, { once: true });
})();
