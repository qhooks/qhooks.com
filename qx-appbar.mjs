// QHooks app bar (2026-11 redesign). Not the sitewide shell (qx-shell.mjs, the header menu): this is the phone tab bar. On a phone, one bottom bar holds the same five places on every page, so
// trading, launching, hooks, the community and your holdings are always one tap apart. Links only: no data, no wallet.
const TABS = [
  { label: 'Trade', href: '/terminal', match: /^\/(terminal|markets|perps|orders|copy|wallets|arb)\b/, icon: '<path d="M7 3.5v3M7 15v5.5M17 3.5v6M17 16v4.5"/><rect x="4.75" y="6.5" width="4.5" height="8.5" rx="1.2"/><rect x="14.75" y="9.5" width="4.5" height="6.5" rx="1.2"/>' },
  { label: 'Hooks', href: '/hook-marketplace', match: /^\/(hook-marketplace|hooks|lab|graduation-lab|discover|builders|integrate)/, icon: '<circle cx="9" cy="4.6" r="1.7"/><path d="M9 6.3V14a5 5 0 0 0 10 0v-2.2"/><path d="M19 11.8l-3 2.6"/>' },
  { label: 'Launch', href: '/create', primary: true, match: /^\/(create|qtoken-studio|launch|relaunch|pricing|verify)\b/, icon: '<path d="M12 5.5v13M5.5 12h13"/>' },
  { label: 'Community', href: '/community', match: /^\/(community|board|profile|qhooks-token|founding|stake|call)\b/, icon: '<circle cx="9" cy="9" r="3.1"/><path d="M3.2 19.2a5.8 5.8 0 0 1 11.6 0"/><circle cx="17.2" cy="8.2" r="2.4"/><path d="M16.6 13.9a4.7 4.7 0 0 1 4.3 4.7"/>' },
  { label: 'Portfolio', href: '/portfolio', match: /^\/(portfolio|me)\b/, icon: '<rect x="3.5" y="6" width="17" height="13" rx="3.2"/><path d="M3.5 10.4h17"/><circle cx="16.4" cy="14.7" r="1.1"/>' },
];
const root = document.documentElement;
const inTelegram = root.dataset.tg != null || /[?&]tg=1\b/.test(location.search) || !!globalThis.TelegramWebviewProxy;
if (!inTelegram && !document.querySelector('.q-tabbar')) {
  const here = location.pathname.replace(/\.html$/, '') || '/';
  const nav = document.createElement('nav');
  nav.className = 'q-tabbar'; nav.setAttribute('aria-label', 'QHooks');
  for (const t of TABS) {
    const a = document.createElement('a');
    a.href = t.href; a.className = 'q-tab' + (t.primary ? ' q-tab--primary' : '');
    if (t.match.test(here)) a.setAttribute('aria-current', 'page');
    a.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + t.icon + '</svg><span></span>';
    a.lastChild.textContent = t.label;
    nav.append(a);
  }
  // On the terminal, "Trade" from a token page goes back to the token list the way the page's own back button does.
  nav.addEventListener('click', e => {
    const a = e.target.closest('a.q-tab'); if (!a || a.getAttribute('href') !== '/terminal') return;
    const back = document.querySelector('main.has-market .qxfd-back');
    if (back) { e.preventDefault(); back.click(); scrollTo({ top: 0 }); }
  });
  document.body.append(nav);
  root.classList.add('q-has-tabbar');
}
import '/qx-getapp.mjs';
