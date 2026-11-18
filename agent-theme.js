// Standalone agents pages: existing shared theme controls without a second site shell.
// Generated from public/theme.js through its System A shell boundary by build-guides.mjs.
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
  // Batch G (2026-11-18): light theme hidden until every page passes WCAG AA in it. LOCK pins dark, hides the toggles and
  // leaves the stored choice untouched (it comes back when LOCK is null). Same constant as THEME_LOCK in qx-a/components.mjs.
  const LOCK = 'dark';
  if (LOCK) root.dataset.themeLocked = LOCK;

  function paint(theme) {
    const dark = theme === 'dark';
    buttons.forEach((button) => {
      button.hidden = !!LOCK;
      button.setAttribute('aria-pressed', String(dark));
      button.title = `Switch to ${dark ? 'light' : 'dark'} mode`;
      button.setAttribute('aria-label', button.title);
    });
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#090B0A' : '#F2F3F1');
  }
  function apply(theme, persist) {
    if (LOCK) { theme = LOCK; persist = false; }
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
    if (LOCK) return;
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

})();
