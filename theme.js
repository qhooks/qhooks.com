// Local Ollama proposal, integrated with storage and system-preference repairs.
(() => {
  'use strict';
  const system = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  let preference = null;
  try {
    const stored = window.localStorage.getItem('qhooks.theme');
    if (stored === 'light' || stored === 'dark') preference = stored;
  } catch { /* The toggle also works without persistent storage. */ }

  let buttons = [];
  function apply(theme) {
    document.documentElement.dataset.theme = theme;
    const dark = theme === 'dark';
    buttons.forEach(button => {
      button.hidden = false;
      button.setAttribute('aria-pressed', String(dark));
      button.title = `Switch to ${dark ? 'light' : 'dark'} mode`;
      button.setAttribute('aria-label', button.title);
    });
  }

  apply(preference || (system?.matches ? 'dark' : 'light'));
  system?.addEventListener?.('change', event => {
    if (preference === null) apply(event.matches ? 'dark' : 'light');
  });

  document.addEventListener('DOMContentLoaded', () => {
    buttons = document.querySelectorAll('[data-theme-toggle]');
    buttons.forEach(button => {
      const header = button.closest('.site-header');
      if (header) header.append(button);
      // Fixed local SVG, no remote icon/font and no user-provided markup.
      button.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16Z" fill="currentColor" stroke="none"/></svg>';
    });
    apply(document.documentElement.dataset.theme);
    buttons.forEach(button => button.addEventListener('click', () => {
      preference = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      apply(preference);
      try { window.localStorage.setItem('qhooks.theme', preference); }
      catch { /* Preserve the choice in memory when storage is unavailable. */ }
    }));
  }, { once: true });
})();
