// QHooks System A: the app shell. One shell for every page.
//   import { mountShell } from '/qx-a/shell.mjs';
//   const shell = mountShell({ active: 'community' });
// Returns { header, ribbon, tabbar, footer, menu, slots: { wallet, actions, search }, setActive(id), setTitle(text),
//   setMode(mode, { title, back }), setSearch(node), openMenu(), closeMenu() }.
// Converted pages (<body class="qa" data-a-shell>) call it themselves. Every other page gets the same shell from
// /qx-a/bridge.mjs, which adopts the old chrome (the wallet button, the theme, the menu). Calling mountShell() again
// returns the same shell with the new options applied, so a page and the bridge can never build two headers.
// What the old chrome did and this keeps: wallet connect + account menu (#qhc-trigger / #qhc-dialog and their modules),
// the theme switch (theme.js), every section link, Edit profile, search, the Android "Get the app" bar (never inside the
// app), Telegram mini-app mode (no tab bar), the launch-week drop line (in the ribbon) and the "Refreshing" note.
import { h, icon, RM, fmt, avatar, keeperAvatar, brandLine, setTheme as storeTheme, ensureSprite } from './components.mjs';

/* ---------- places ---------- */
// The five places. `match` lights the right tab on pages that don't say which one they belong to.
export const NAV = [
  { id: 'trade', label: 'Trade', href: '/terminal', icon: 'trade', match: /^\/(terminal|markets|perps|orders|copy|wallets|arb|elysium|pool|trade|qhooks-token)(\b|$)/ },
  { id: 'hooks', label: 'Hooks', href: '/hooks', icon: 'hook', match: /^\/(hooks?|hook-marketplace|lab|lab-hook|[a-z-]*-lab|graduation[a-z-]*|l141-[a-z-]*|discover[a-z-]*|builders[a-z-]*|integrate|inspect|contracts|lp-proof|deploy|api|pq-[a-z]*)(\b|$)/ },
  { id: 'launch', label: 'Launch', href: '/create', icon: 'plus', match: /^\/(create|qtoken-studio|launch[a-z-]*|relaunch|pricing|verify|sale|founding|token-profile|list-market|market-submit)(\b|$)/ },
  { id: 'community', label: 'Community', href: '/community', icon: 'community', match: /^\/(community|board|profile|creator|call|stake)(\b|$)/ },
  { id: 'portfolio', label: 'Portfolio', href: '/portfolio', icon: 'wallet', match: /^\/(portfolio|me|wallet|qwallets|qlocks|floor[a-z-]*|flywheel|add-liquidity|fee-share|pool-fee-share|taps|safe-drops)(\b|$)/ },
];
// Quick links shown first in the menu and in the footer.
export const MORE = [
  { label: 'Perps', href: '/perps' }, { label: 'Markets', href: '/markets' }, { label: 'Lab', href: '/lab' },
  { label: 'Hook discovery', href: '/discover' }, { label: 'My QHooks', href: '/me' }, { label: 'Apps', href: '/android' },
];
// Every section of the ecosystem: the old site menu, link for link (approved copy).
export const SECTIONS = [
  { id: 'build', title: 'Build', links: [
    ['Hook marketplace', '/hook-marketplace', 'Launch-ready hooks and external integrations'], ['Launch blocks', '/hooks', 'Trading rules and ready-made launch styles'],
    ['Post-quantum hooks', '/#pq-hooks', 'Hook controls secured by a second key'], ['Lab', '/lab', 'Configure, build and download a hook'],
    ['QGraduation Lab', '/graduation-lab', 'Design when liquidity moves on'], ['Builders marketplace', '/builders', 'Build a module, earn from launches that use it'],
    ['Builders program', '/builders-program', 'Grants and bounties for hooks and modules']] },
  { id: 'launch', title: 'Launch', links: [
    ['Create a token', '/create', 'One billion supply, all in the pool by default'], ['Expert Studio', '/qtoken-studio', 'Advanced pool configuration and every rule'],
    ['Choose a chain', '/launch', 'Robinhood Chain, Base, BNB Chain, Arbitrum, Ethereum, Elysium, Solana'], ['Relaunch', '/relaunch', 'Relaunch your token on QHooks'],
    ['Pricing', '/pricing', 'A flat launch fee and the trading fee'], ['Verify your launch', '/verify', 'Link your launch to your X account']] },
  { id: 'discover', title: 'Hooks', links: [
    ['Hook board', '/discover', 'Rank hooks by indexed activity'], ['Inspect a hook', '/discover-hook', 'Read code, permissions and evidence'],
    ['Projects', '/discover-projects', 'Explore builders and sourced deployments'], ['Hook Tape', '/discover-tape', 'Follow finalized pools and swaps'],
    ['Compare', '/discover-compare', 'Compare permissions, code and activity']] },
  { id: 'trade', title: 'Trade', links: [
    ['Terminal', '/terminal', 'Launches, EVM tokens via 0x, Solana via Jupiter'], ['Perps', '/perps', 'Hyperliquid perpetuals'],
    ['Arb', '/arb', 'Close price gaps between pools'], ['Elysium tools', '/elysium', 'Read pools, track receipts and inspect hooks'],
    ['Markets', '/markets', 'Every listed QHooks market'], ['Profiles', '/profile', 'Any wallet: launches, holdings, posts'],
    ['Boards', '/community#boards', 'Make a call and rally a token’s community'], ['Get the app', '/android', 'QHooks for Android and iPhone']] },
  { id: 'grow', title: 'Community', links: [
    ['QHOOKS', '/qhooks-token', 'The QHOOKS token and its plan'], ['Make a call', '/community#make-a-call', 'Put a token thesis on record'],
    ['Calls & callers', '/community#callers', 'See public calls and caller track records'], ['Cashback & referrals', '/me#qa-rewards', '30% of the trading fee back to you; 20% to referrers'],
    ['Portfolio', '/portfolio', 'Every holding, seven chains and Solana'], ['My QHooks', '/me', 'Your launches, stakes, rewards and claims'],
    ['Holder staking', '/stake', 'Stake for a share of a launch’s income'], ['Buyback and burn', '/hooks#block-buyback', 'Charges buy the token back and burn it'],
    ['Graduation', '/graduation', 'Choose when liquidity moves to its next pool'], ['Team locks', '/hooks#hk-beside-h', 'Cliffs, drips and a public sell notice']] },
  { id: 'protect', title: 'Protect', links: [
    ['qWallets', '/qwallets', 'Withdrawals need your wallet and your second key'], ['QLocks', '/qlocks', 'Locks traders can check'],
    ['The two-key model', '/#two-keys', 'Creator actions need both keys']] },
  { id: 'integrate', title: 'Integrate', links: [
    ['Community', '/community', 'Token calls, community boards and referral rewards'], ['Integration guide', '/integrate', 'Bring QHooks hooks, pools and discovery into your platform'],
    ['API', '/api', 'Read markets and launch data'], ['Changelog', '/changelog', 'What changed, newest first'], ['Roadmap', '/roadmap', 'What we plan to build next'],
    ['Telegram bot', 'https://t.me/qhooks_bot', 'Alerts, and the terminal inside Telegram'], ['Install the app', '/#on-your-phone', 'Add the terminal to your home screen']] },
];
const SOCIAL = [{ label: 'X', href: 'https://x.com/qHooks_', icon: 'x' }, { label: 'Telegram', href: 'https://t.me/qhooks_bot', icon: 'tg' }];

/* ---------- environment ---------- */
const doc = document, root = doc.documentElement;
const path = () => location.pathname.replace(/\.html$/, '').replace(/\/+$/, '') || '/';
export const inTelegram = () => root.dataset.tg === '1' || /[?&]tg=1\b/.test(location.search) || !!globalThis.TelegramWebviewProxy;
const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { return null; } };
const session = (k, v) => { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch { return null; } };
// The Android app opens qhooks.com with ?source=app; later pages in that window keep the mark (same keys as before).
export function inApp() {
  if (new URLSearchParams(location.search).get('source') === 'app' || String(doc.referrer).startsWith('android-app://com.qhooks.app')) { session('qx-in-app', '1'); return true; }
  return session('qx-in-app') === '1' || !!globalThis.matchMedia?.('(display-mode: standalone)').matches;
}
const isAndroid = () => /Android/i.test(navigator.userAgent);
const getAppPage = () => /^\/(index)?$|^\/terminal$/.test(path());

/* ---------- theme: theme.js owns it; this only asks it ---------- */
const theme = () => (root.dataset.theme === 'light' ? 'light' : 'dark');
function switchTheme() { const next = theme() === 'light' ? 'dark' : 'light'; if (globalThis.qhooksTheme?.set) globalThis.qhooksTheme.set(next); else storeTheme(next); }

/* ---------- a few shell-only icons, added to the System A sprite ---------- */
const NS = 'http://www.w3.org/2000/svg';
const EXTRA = {
  menu: '<path d="M4 7.5h16M4 12h16M4 16.5h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  close: '<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>',
  gift: '<rect x="4" y="9" width="16" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 9h17M12 9v11M12 9c-1.6-3.4-5.2-3.6-5.2-1.4C6.8 9 12 9 12 9zm0 0c1.6-3.4 5.2-3.6 5.2-1.4C17.2 9 12 9 12 9z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  go: '<path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  phone: '<rect x="7" y="2.8" width="10" height="18.4" rx="2.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10.5 18h3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
};
function ensureShellIcons() {
  ensureSprite();
  const sprite = doc.getElementById('qa-sprite');
  if (!sprite || sprite.querySelector('#qa-menu-i')) return;
  for (const [k, v] of Object.entries(EXTRA)) {
    const s = doc.createElementNS(NS, 'symbol'); s.id = 'qa-' + k + (k === 'menu' ? '-i' : ''); s.setAttribute('viewBox', '0 0 24 24'); s.innerHTML = v; sprite.append(s);
  }
}
const ico = (id, cls) => icon(id === 'menu' ? 'menu-i' : id, cls);

/* ---------- state ---------- */
let S = null;
export const getShell = () => S?.api || null;

/**
 * @param {object} o
 * @param {string} o.active        trade | hooks | launch | community | portfolio (default: read from the address)
 * @param {'app'|'detail'} o.mode  app: brand + tab bar. detail: back + title, no tab bar (the page shows its own dock).
 * @param {string} o.title         detail title
 * @param {string} o.back          back href for detail mode
 * @param {boolean} o.overArt      header is transparent over the page's art stage until scrolled
 * @param {boolean|object} o.ribbon  the live ribbon. true: the ecosystem feed fills it. { feed: false }: the page fills it.
 * @param {boolean} o.footer       the footer with the brand line (default true)
 * @param {boolean} o.tabbar       the phone tab bar (default true; setup and signing pages pass false)
 * @param {Node}   o.wallet        an existing wallet control for the wallet slot (default: the site wallet button)
 * @param {string} o.logo          brand mark image
 * @param {object} o.links         override nav hrefs: { trade: '/terminal.html' }
 * @param {boolean|Node} o.search header search (default true). false hides it; a Node takes the slot (setSearch)
 */
export function mountShell(o = {}) {
  if (S) { S.apply(o); return S.api; }
  ensureShellIcons();
  // The site wallet dialog's System A sheet (its connect/account state rules included), on every page.
  if (!doc.querySelector('link[href$="/qx-a/wallet.css"]')) doc.head.append(h('link', { rel: 'stylesheet', href: new URL('./wallet.css', import.meta.url).pathname }));
  // theme.js sets the theme before the first paint; a page without it still gets the stored choice (dark otherwise).
  if (!/^(dark|light)$/.test(root.dataset.theme || '')) root.dataset.theme = [store('qa-theme'), store('qhooks.theme')].find((t) => t === 'light' || t === 'dark') || 'dark';
  const body = doc.body;
  const bridge = !!o.bridge, adopt = o.adopt || null;
  const cls = (c, on) => body.classList.toggle(c, !!on);
  body.classList.add('qa-shell');
  if (!bridge) body.classList.add('qa');
  else body.classList.add('qa-bridged');
  const st = { active: '', mode: 'app', title: '', back: '/', links: {} };
  const href = (n) => st.links[n.id] || n.href;

  /* wallet slot: the site's own wallet button moves in, so wallet-site.mjs keeps driving it */
  const walletSlot = adopt ? (adopt.querySelector('.qxt-wallet') || h('div')) : h('div', { class: 'qa-wallet', id: 'qa-wallet', 'data-qa-slot': 'wallet' });
  const actionsSlot = h('div', { class: 'qa-hdr__actions', 'data-qa-slot': 'actions' });
  const titleEl = h('span', { class: 'qa-hdr__title' });
  const backEl = h('a', { class: 'qa-btn qa-btn--icon qa-hdr__back', href: '/', 'aria-label': 'Back' }, ico('back'));
  const brand = () => h('a', { class: 'qa-brand', href: '/', 'aria-label': 'QHooks home' }, h('span', { class: 'qa-brand__mark', 'aria-hidden': 'true' }), h('span', null, 'QHooks'));
  const menuBtn = h('button', { class: 'qa-btn qa-btn--icon qa-menu-btn', type: 'button', 'aria-label': 'Menu', 'aria-haspopup': 'dialog', 'aria-controls': 'qa-menu', 'aria-expanded': 'false', onclick: () => openMenu() }, ico('menu'));
  const moreBtn = h('button', { class: 'qa-nav-more', type: 'button', 'aria-haspopup': 'dialog', 'aria-controls': 'qa-menu', 'aria-expanded': 'false', onclick: () => openMenu() }, 'More');
  const navLinks = h('nav', { class: 'qa-nav-links', 'aria-label': 'Main' }, NAV.map((n) => h('a', { href: n.href, dataset: { id: n.id } }, n.label)), moreBtn);
  const themeBtn = h('button', { class: 'qa-btn qa-btn--icon qa-theme-btn', type: 'button', onclick: switchTheme });
  const paintTheme = () => { const light = theme() === 'light'; themeBtn.replaceChildren(ico(light ? 'moon' : 'sun')); themeBtn.setAttribute('aria-label', light ? 'Switch to dark mode' : 'Switch to light mode'); themeBtn.title = themeBtn.getAttribute('aria-label'); };
  paintTheme(); addEventListener('qa:theme', paintTheme);
  const search = makeSearch('hdr');
  // The header search slot: a page with its own search (the terminal's #qxt-search) can take it over (setSearch).
  const searchSlot = h('div', { class: 'qa-hdr__search', 'data-qa-slot': 'search' }, search.el);

  let header;
  if (adopt) {
    // Pages with their own trading header (terminal, perps): it stays, as the shell's header, and gains the shell menu.
    header = adopt; header.classList.add('qa-adopted');
    header.append(menuBtn);
    body.classList.add('qa-shell--adopt');
  } else {
    header = h('header', { class: 'qa-hdr', id: 'qa-hdr' }, backEl, brand(), titleEl, navLinks, searchSlot, h('div', { class: 'qa-hdr__end' }, actionsSlot, themeBtn, walletSlot, menuBtn));
    body.prepend(header);
  }

  /* tab bar */
  const tabbar = h('nav', { class: 'qa-tabbar', 'aria-label': 'Places' }, NAV.map((n) => n.id === 'launch'
    ? h('a', { class: 'qa-tabbar__a qa-tabbar__launch', href: n.href, dataset: { id: n.id } }, h('span', { class: 'qa-tabbar__plus' }, ico('plus')), n.label)
    : h('a', { class: 'qa-tabbar__a', href: n.href, dataset: { id: n.id } }, ico(n.icon), n.label)));
  // From a token on the old terminal, Trade goes back to the token list the way the page's own back button does.
  tabbar.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-id="trade"]'); if (!a || !/^\/terminal$/.test(path())) return;
    const back = doc.querySelector('main.has-market .qxfd-back'); if (back) { e.preventDefault(); back.click(); scrollTo({ top: 0 }); }
  });
  body.append(tabbar);

  /* the menu: every section, the account, the theme, the apps */
  const menu = makeMenu();
  body.append(menu.el);
  function openMenu() { menu.open(); [menuBtn, moreBtn].forEach((b) => b.setAttribute('aria-expanded', 'true')); }
  function closeMenu() { menu.close(); }
  menu.el.addEventListener('close', () => [menuBtn, moreBtn].forEach((b) => b.setAttribute('aria-expanded', 'false')));

  /* footer */
  let foot = null;
  const makeFoot = () => {
    const line = brandLine({ play: 'inview' });
    return h('footer', { class: 'qa-foot' }, line.el,
      h('nav', { class: 'qa-foot__links', 'aria-label': 'QHooks' }, [...NAV.map((n) => ({ label: n.label, href: href(n) })), ...MORE].map((n) => h('a', { href: n.href }, n.label))),
      h('nav', { class: 'qa-foot__groups', 'aria-label': 'Every section' }, SECTIONS.map((g) => h('div', { class: 'qa-foot__g' }, h('h2', null, g.title),
        h('ul', null, g.links.map(([t, u]) => h('li', null, h('a', linkProps(u), t))))))),
      h('div', { class: 'qa-foot__base' }, brand(), h('span', { class: 'qa-foot__tag' }, 'For the next generation.'),
        h('nav', { class: 'qa-foot__legal', 'aria-label': 'Legal' }, h('a', { href: '/terms' }, 'Terms'), h('a', { href: '/privacy' }, 'Privacy')),
        h('div', { class: 'qa-foot__social' }, SOCIAL.map((s) => h('a', { href: s.href, 'aria-label': s.label, target: '_blank', rel: 'noopener noreferrer' }, ico(s.icon))))));
  };

  /* ribbon */
  let rib = null;
  const addRibbon = (opt) => {
    if (rib || adopt) return;
    rib = makeRibbon(); header.after(rib.el); cls('qa-shell--ribbon', true);
    if (!(opt && typeof opt === 'object' && opt.feed === false)) import('./live.mjs').then((m) => m.startLive(rib)).catch(() => {});
  };

  /* Android: get the app (never inside the app, never inside Telegram); attached above the tab bar, never floating */
  // qx-getapp.mjs is still loaded (qx-shell.mjs, qx-appbar.mjs) for its links; this bar carries its class, so it never
  // adds its own floating one, and a floating one it added before the shell mounted is replaced here.
  doc.querySelectorAll('.qx-getapp:not(.qa-getapp)').forEach((n) => n.remove());
  let getapp = null;
  if (isAndroid() && getAppPage() && !inApp() && !inTelegram() && store('qx-getapp-dismissed') !== '1') {
    getapp = h('aside', { class: 'qa-getapp qx-getapp', 'aria-label': 'Get the QHooks app' },
      h('img', { src: '/app-icons/icon-192.png', alt: '', width: 28, height: 28 }), h('span', null, 'Get the QHooks app'),
      h('a', { class: 'qa-btn qa-btn--primary qa-btn--sm', href: '/android' }, 'Get it'),
      h('button', { class: 'qa-getapp__x', type: 'button', 'aria-label': 'Dismiss', onclick: () => { store('qx-getapp-dismissed', '1'); getapp.remove(); cls('qa-shell--getapp', false); } }, ico('close')));
    tabbar.before(getapp); cls('qa-shell--getapp', true);
  }
  if (inTelegram()) cls('qa-shell--tg', true);

  /* scrolled state (header turns solid over art; detail title appears) */
  const onScroll = () => header.classList.toggle('is-scrolled', scrollY > (innerWidth >= 1100 ? 160 : 70));
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  /* apply options (first mount and every later call) */
  function apply(p = {}) {
    if (p.links) Object.assign(st.links, p.links);
    for (const a of [...navLinks.querySelectorAll('a[data-id]'), ...tabbar.querySelectorAll('a[data-id]')]) { const n = NAV.find((x) => x.id === a.dataset.id); a.href = href(n); }
    if (p.mode) st.mode = p.mode;
    if (p.title != null) st.title = p.title;
    if (p.back) st.back = p.back;
    cls('qa-shell--detail', st.mode === 'detail');
    titleEl.textContent = st.title; backEl.href = st.back;
    if (p.overArt != null) cls('qa-shell--over-art', p.overArt);
    if (p.tabbar != null) cls('qa-shell--notabs', !p.tabbar);
    if (p.search === false) searchSlot.hidden = true;
    if (p.search && typeof p.search === 'object' && p.search.nodeType) setSearch(p.search);
    if (p.logo) root.style.setProperty('--qa-brand-mark', `url("${new URL(p.logo, location.href).href}")`);
    if (p.ribbon) addRibbon(p.ribbon);
    if (p.footer === false && foot) { foot.remove(); foot = null; }
    else if (p.footer === true && !foot) { foot = makeFoot(); (getapp || tabbar).before(foot); }
    if (p.wallet) walletSlot.replaceChildren(p.wallet);
    setActive(p.active || st.active || NAV.find((n) => n.match.test(path()))?.id || '');
  }
  function setSearch(node) { searchSlot.hidden = false; searchSlot.classList.toggle('is-page', !!node); searchSlot.replaceChildren(node || search.el); }
  function setActive(id) {
    st.active = id;
    for (const a of [...navLinks.querySelectorAll('a[data-id]'), ...tabbar.querySelectorAll('a[data-id]')]) {
      const on = a.dataset.id === id; a.classList.toggle('is-on', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    }
  }

  const api = {
    header, tabbar, menu: menu.el, get footer() { return foot; }, get ribbon() { return rib; },
    slots: { wallet: walletSlot, actions: actionsSlot, search: searchSlot },
    setActive, setTitle(t) { st.title = t; titleEl.textContent = t; }, openMenu, closeMenu, setSearch,
    // Switch between list and detail in place (the terminal does this on #t= / #m= hash changes, without a reload).
    setMode(mode, { title, back } = {}) { apply({ mode, title, back }); },
  };
  // the connected wallet's balance beside the wallet button, on every page (qx-a/balance.mjs)
  if (!adopt) import('./balance.mjs').then((m) => m.mountBalance(header.querySelector('.qa-hdr__end'), walletSlot)).catch(() => {});
  // the connected wallet's balance beside the wallet button, on every page (qx-a/balance.mjs)
  if (!adopt) import('./balance.mjs').then((m) => m.mountBalance(header.querySelector('.qa-hdr__end'), walletSlot)).catch(() => {});
  S = { api, apply };
  apply({ ...o, footer: o.footer !== false && !(adopt && o.footer == null) });
  if (!adopt && !o.wallet) adoptWallet(walletSlot);
  root.classList.add('qa-mounted');
  pickUpSearch();
  dispatchEvent(new CustomEvent('qa:shell', { detail: api }));
  return api;
}

const linkProps = (u) => (/^https?:/.test(u) ? { href: u, target: '_blank', rel: 'noopener noreferrer' } : { href: u });

/* ---------- wallet ---------- */
// The site wallet (wallet-site.mjs, wallet-login.mjs, l121-mobile-login.mjs, the account menu in qx-wallet-copy.mjs) is
// bound to #qhc-trigger and #qhc-dialog by id. The trigger moves into the slot; a page without the wallet gets it loaded.
function adoptWallet(slot) {
  const take = (t) => {
    t.hidden = false; t.removeAttribute('hidden'); t.classList.add('qa-btn', 'qa-wallet__btn');
    const paint = () => { const on = /^Wallet /.test(t.getAttribute('aria-label') || '') || /^0x[0-9a-f]{4}/i.test(t.textContent.trim()); t.classList.toggle('qa-btn--secondary', on); t.classList.toggle('qa-btn--primary', !on); };
    paint(); new MutationObserver(paint).observe(t, { attributes: true, attributeFilter: ['aria-label'], childList: true, characterData: true, subtree: true });
    slot.replaceChildren(t);
  };
  const t = doc.getElementById('qhc-trigger');
  if (t) { take(t); return; }
  // No site wallet on this page yet: a plain Connect wallet button (fires qa:wallet), then load the wallet when idle.
  const btn = h('button', { class: 'qa-btn qa-btn--primary qa-wallet__btn', type: 'button', onclick: () => dispatchEvent(new CustomEvent('qa:wallet', { cancelable: true })) }, 'Connect wallet');
  slot.replaceChildren(btn);
  const later = globalThis.requestIdleCallback || ((f) => setTimeout(f, 1200));
  later(() => ensureWalletStack().then((trig) => { if (trig && slot.contains(btn)) take(trig); }).catch(() => {}));
}
// qa:wallet is cancelable: a page that opens its own wallet flow calls preventDefault(); otherwise the site wallet opens.
addEventListener('qa:wallet', (e) => setTimeout(() => { if (!e.defaultPrevented && !doc.querySelector('dialog[open]')) openWallet(); }, 0));
export function openWallet() {
  const t = doc.getElementById('qhc-trigger');
  if (t && t.isConnected) { t.click(); return; }
  ensureWalletStack().then((trig) => trig?.click()).catch(() => {});
}
let walletStack = null;
export function ensureWalletStack() {
  if (walletStack) return walletStack;
  walletStack = (async () => {
    if (doc.readyState === 'loading') await new Promise((r) => doc.addEventListener('DOMContentLoaded', r, { once: true }));
    const inserted = !doc.getElementById('qhc-dialog');
    if (inserted) doc.body.insertAdjacentHTML('beforeend', WALLET_DIALOG);
    let t = doc.getElementById('qhc-trigger');
    if (!t) { t = h('button', { type: 'button', id: 'qhc-trigger', class: 'qhc-trigger', 'aria-haspopup': 'dialog', hidden: true }, 'Connect wallet'); doc.body.append(t); }
    // Referral capture (?ref=), the fast first tap and the offline worker come with the wallet's early script.
    if (!doc.querySelector('script[src$="wallet-early.js"]')) doc.head.append(h('script', { src: '/wallet-early.js' }));
    for (const [u, bind] of [['/wallet-site.mjs', 'bindSiteWallet'], ['/wallet-login.mjs', 'bindWalletLogin'], ['/l121-mobile-login.mjs', 'bindMetaMaskMobile']]) {
      const ranBefore = !!doc.querySelector(`script[src$="${u}"]`);
      const m = await import(u).catch(() => null);
      // A module that already ran found no dialog and bound nothing; bind it now. A module this import ran binds itself.
      if (inserted && ranBefore) try { m?.[bind]?.(); } catch {}
    }
    await import('/qx-wallet-copy.mjs').catch(() => {});
    return t;
  })();
  return walletStack;
}
// The site's wallet dialog, exactly as the pages carry it (used only on a page that has none).
const WALLET_DIALOG = `<dialog id="qhc-dialog" class="qhc-dialog" aria-labelledby="qhc-title">
 <div class="qhc-heading"><h2 id="qhc-title">Your wallet</h2><button id="qhc-close" type="button" aria-label="Close wallet dialog">×</button></div>
 <section class="qhc-login"><button id="qhc-email-login" type="button" class="qhc-choice">Continue with email or Google</button><p>No wallet extension needed. Your QWallet quantum key stays separate.</p><button id="qhc-email-logout" type="button" class="qhc-secondary" hidden>Sign out of QHooks login</button><p id="qhc-login-status" role="status" aria-live="polite"></p></section><section class="qhc-mobile">
 <label for="qhc-mobile-chain">Mobile wallet network</label><select id="qhc-mobile-chain"></select>
 <button id="qhc-mobile-login" type="button" class="qhc-choice">MetaMask Mobile</button>
 <p id="qhc-mobile-status" role="status" aria-live="polite">Connect your phone with a QR code.</p>
 <button id="qhc-mobile-disconnect" type="button" class="qhc-secondary" hidden>Disconnect mobile session</button>
 <p class="qhc-sdk-notice">Uses MetaMask Connect, copyright ConsenSys. <a href="/metamask/LICENSE.txt" target="_blank" rel="noopener">License</a></p>
</section>
<div id="qhc-choices">
  <p>Choose an EVM wallet.</p>
  <div id="qhc-wallets" class="qhc-wallets"></div>
  <div id="qhc-empty"><p>No wallet detected in this browser.</p><p>Open <strong>qhooks.com</strong> in Chrome with your wallet extension enabled, or in your wallet app’s built-in browser.</p><p>The in-app preview cannot access Chrome’s wallet extensions. Use MetaMask Mobile above to pair your phone.</p></div>
  <button id="qhc-rescan" type="button" class="qhc-secondary">Detect wallets again</button>
 </div>
 <div id="qhc-account" hidden><p id="qhc-address" class="qhc-address"></p><p id="qhc-chain"></p><p id="qhc-remembered"></p><button id="qhc-forget" type="button" class="qhc-secondary">Disconnect and forget</button></div>
 <div id="qhc-email-network" hidden><label for="qhc-embedded-chain">Embedded wallet network</label><select id="qhc-embedded-chain"></select><button id="qhc-embedded-switch" type="button" class="qhc-secondary">Switch network</button></div><p id="qhc-status" role="status" aria-live="polite"></p>
 <p class="qhc-footnote">Connecting does not authorize spending. Every signature and transaction needs your approval. Never enter your recovery phrase here.</p>
</dialog>`;

/* ---------- menu: a sheet on the phone, a panel under the nav on desktop ---------- */
function makeMenu() {
  const msearch = makeSearch('menu');
  const me = h('div', { class: 'qa-menu__me' });
  const themeRow = h('button', { class: 'qa-menu__row', type: 'button', onclick: () => switchTheme() });
  const paintRow = () => themeRow.replaceChildren(ico(theme() === 'light' ? 'moon' : 'sun'), h('span', null, theme() === 'light' ? 'Dark mode' : 'Light mode'));
  paintRow(); addEventListener('qa:theme', paintRow);
  const appRow = !inApp() ? h('a', { class: 'qa-menu__row', href: '/android' }, ico('phone'), h('span', null, 'Get the app')) : null;
  const close = h('button', { class: 'qa-btn qa-btn--icon qa-menu__x', type: 'button', 'aria-label': 'Close menu', onclick: () => el.close() }, ico('close'));
  const el = h('dialog', { class: 'qa-menu', id: 'qa-menu', 'aria-label': 'QHooks menu' },
    h('div', { class: 'qa-menu__in' },
      h('div', { class: 'qa-menu__top' }, h('span', { class: 'qa-menu__t' }, 'QHooks'), close),
      msearch.el,
      h('div', { class: 'qa-menu__quick' }, NAV.map((n) => h('a', { href: n.href }, ico(n.icon), n.label))),
      me,
      h('div', { class: 'qa-menu__groups' }, SECTIONS.map((g) => h('section', { class: 'qa-menu__g' }, h('h2', null, g.title),
        h('ul', null, g.links.map(([t, u, sub]) => h('li', null, h('a', linkProps(u), h('b', null, t), h('span', null, sub)))))))),
      h('div', { class: 'qa-menu__foot' }, themeRow, appRow, SOCIAL.map((s) => h('a', { class: 'qa-menu__row', ...linkProps(s.href) }, ico(s.icon), h('span', null, s.label === 'X' ? 'X @qHooks_' : 'Telegram @qhooks_bot'))))));
  el.addEventListener('click', (e) => { if (e.target === el) el.close(); else if (e.target.closest('a[href]')) el.close(); });
  return {
    el,
    open() { if (el.open) return; paintMe(me); try { el.showModal(); } catch { el.setAttribute('open', ''); } if (matchMedia('(min-width: 1100px)').matches) el.querySelector('.qa-menu__g a')?.focus({ preventScroll: true }); },
    close() { if (el.open) el.close(); },
  };
}
// The account part of the menu: Edit profile and your places when a wallet is connected, otherwise Connect wallet.
async function paintMe(box) {
  const connect = () => h('button', { class: 'qa-btn qa-btn--primary qa-btn--block', type: 'button', onclick: () => { doc.getElementById('qa-menu')?.close(); openWallet(); } }, 'Connect wallet');
  if (!doc.getElementById('qhc-dialog')) { box.replaceChildren(connect()); return; }
  try {
    const [{ getWalletHub }, { profileUrl }] = await Promise.all([import('/wallet-hub.mjs'), import('/qx-profile-address.mjs')]);
    const cur = getWalletHub(window).snapshot().current;
    if (!cur) { box.replaceChildren(connect()); return; }
    box.replaceChildren(
      h('div', { class: 'qa-menu__who' }, avatar(cur.owner, 'md'), h('b', null, fmt.short(cur.owner))),
      h('div', { class: 'qa-menu__mine' }, [['Edit profile', profileUrl({ wallet: cur.owner, edit: true })], ['My QHooks', '/me'], ['Portfolio', '/portfolio'], ['Rewards', '/me#qa-rewards']].map(([t, u]) => h('a', { href: u }, t))));
  } catch { box.replaceChildren(connect()); }
}

/* ---------- search: tokens on QHooks, pages, profiles; anything else goes to the terminal's search ---------- */
let searchSeq = 0;
function makeSearch(kind) {
  const id = 'qa-search-' + kind + '-' + (++searchSeq);
  const input = h('input', { type: 'search', name: 'q', placeholder: 'Search tokens, callers, hooks', 'aria-label': 'Search', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'search', role: 'combobox', 'aria-expanded': 'false', 'aria-controls': id, 'aria-autocomplete': 'list' });
  const list = h('ul', { class: 'qa-search__list', id, role: 'listbox', hidden: true });
  const el = h('form', { class: 'qa-search qa-search--' + kind, role: 'search', action: '/terminal', method: 'get' }, h('label', { class: 'qa-search__box' }, ico('search'), input), list);
  let items = [], cur = -1, seq = 0;
  const show = (on) => { list.hidden = !on; input.setAttribute('aria-expanded', String(on)); };
  const paint = () => {
    list.replaceChildren(...items.map((r, i) => h('li', { role: 'option', id: id + '-' + i, 'aria-selected': String(i === cur), class: i === cur ? 'is-on' : '' },
      h('a', { href: r.href || '#', onclick: (e) => { if (r.go) { e.preventDefault(); r.go(); } close(); } },
        r.img ? h('span', { class: 'qa-search__img', style: { 'background-image': `url("${r.img}")` } }) : h('span', { class: 'qa-search__k', 'aria-hidden': 'true' }, r.k === 'Token' ? r.t.replace(/^\$/, '').slice(0, 1) : ico(r.k === 'Profile' ? 'person' : r.k === 'Search' ? 'search' : 'go')),
        h('span', { class: 'qa-search__t' }, h('b', null, r.t), r.sub ? h('small', null, r.sub) : null), h('span', { class: 'qa-search__kind' }, r.k)))));
    if (cur >= 0) input.setAttribute('aria-activedescendant', id + '-' + cur); else input.removeAttribute('aria-activedescendant');
    show(items.length > 0 && doc.activeElement === input);
  };
  const close = () => { show(false); cur = -1; };
  const run = async () => {
    const q = input.value.trim(), n = ++seq;
    items = q ? await results(q) : []; if (n !== seq) return; cur = -1; paint();
  };
  input.addEventListener('input', run);
  input.addEventListener('focus', () => { import('./live.mjs').then((m) => m.loadEco(10 * 60e3)).catch(() => {}); if (input.value.trim()) run(); });
  input.addEventListener('blur', () => setTimeout(close, 160));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { if (!items.length) return; e.preventDefault(); cur = (cur + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; paint(); }
    else if (e.key === 'Escape') { close(); }
  });
  el.addEventListener('submit', (e) => {
    e.preventDefault(); const q = input.value.trim(); if (!q) return;
    const r = cur >= 0 ? items[cur] : null; close();
    if (r?.go) r.go(); else if (r?.href) location.href = r.href; else terminalSearch(q);
  });
  return { el, input };
}
const ALL_LINKS = () => {
  const seen = new Set(), out = [];
  for (const g of SECTIONS) for (const [t, u, sub] of g.links) if (!seen.has(t + u)) { seen.add(t + u); out.push({ t, href: u, sub, k: 'Page' }); }
  for (const n of [...NAV, ...MORE]) if (!out.some((x) => x.href === n.href)) out.push({ t: n.label, href: n.href, k: 'Page' });
  return out;
};
async function results(q) {
  const lq = q.toLowerCase().replace(/^\$/, ''), out = [];
  if (/^0x[0-9a-f]{40}$/i.test(q)) return [{ k: 'Token', t: 'Find ' + fmt.short(q) + ' in the terminal', go: () => terminalSearch(q) }, { k: 'Profile', t: fmt.short(q), sub: 'Profile', href: '/profile/' + q.toLowerCase() }];
  let eco = null;
  try { eco = await (await import('./live.mjs')).loadEco(10 * 60e3); } catch {}
  const names = await chainNames();
  for (const m of eco?.m || []) {
    if (out.length >= 4) break;
    if ((m.s || '').toLowerCase().includes(lq) || (m.n || '').toLowerCase().includes(lq)) out.push({ k: 'Token', t: '$' + m.s, sub: [m.n, names[m.c]].filter(Boolean).join(' · '), img: m.i, href: '/terminal#m=' + m.c + ':' + m.k });
  }
  for (const p of ALL_LINKS()) { if (out.length >= 8) break; if (p.t.toLowerCase().includes(lq)) out.push(p); }
  const handle = lq.replace(/^@/, '');
  if (/^[a-z0-9_]{3,24}$/.test(handle)) out.push({ k: 'Profile', t: '@' + handle, sub: 'Profile', href: '/profile/' + handle });
  out.push({ k: 'Search', t: 'Search tokens for “' + q + '”', go: () => terminalSearch(q) });
  return out;
}
let chainNameMap = null;
async function chainNames() {
  if (chainNameMap) return chainNameMap;
  try { const m = await import('/chains.mjs'); chainNameMap = Object.fromEntries((m.BUILT || []).map((c) => [String(c.id), c.name])); } catch { chainNameMap = {}; }
  return chainNameMap;
}
// The terminal's own search does the token lookup (names, symbols, contract addresses on every chain).
export function terminalSearch(q) {
  const box = doc.getElementById('qxt-search');
  if (box) { doc.getElementById('qa-menu')?.close(); box.value = q; box.dispatchEvent(new Event('input', { bubbles: true })); box.focus(); return; }
  session('qa:search', q); location.href = '/terminal';
}
function pickUpSearch() {
  const q = session('qa:search'); if (!q) return;
  const go = () => { const box = doc.getElementById('qxt-search'); if (!box) return; session('qa:search', null); box.value = q; box.dispatchEvent(new Event('input', { bubbles: true })); };
  if (doc.readyState === 'complete') setTimeout(go, 0); else addEventListener('load', go, { once: true });
}

/* ---------- live ribbon: latest trades scroll by; news drops on and holds ---------- */
// ribbon.push({ symbol, img, side: 'buy'|'sell'|'burn', usd, w, label, change, href })   a trade or a market anywhere on QHooks
// ribbon.news({ kind: 'call'|'holder'|'buy'|'launch'|'burn'|'drop', label, text, w, img, href, hold })   holds ~3.5 s
// ribbon.set(items)  replaces the resting list (the ecosystem feed uses it for the markets)
export function makeRibbon({ speed = 38 } = {}) {
  const track = h('div', { class: 'qa-ribbon__track' });
  const newsEl = h('a', { class: 'qa-ribbon__news', role: 'status', 'aria-live': 'polite', href: '#', tabindex: '-1' });
  const el = h('div', { class: 'qa-ribbon', role: 'region', 'aria-label': 'Live across QHooks' }, track, newsEl);
  track.append(h('span', { class: 'qa-ribbon__item qa-ribbon__idle' }, h('span', { class: 'qa-ribbon__dot', 'aria-hidden': 'true' }), h('b', null, 'Live across QHooks'), h('span', null, 'Refreshing…')));
  let x = 0, last = 0, paused = false, hover = false, recent = [], raf = 0, queue = [], newsTimer = 0;
  // ribbonwords (2026-11-12): each item reads as what happened ("0x3ce8… bought $121 QWERTY"), never a bare "$0.18"
  // next to a symbol, which reads as a price.
  const words = (t) => {
    const sym = h('b', null, t.symbol), usd = t.usd != null ? h('span', { class: 'qa-ribbon__usd' }, fmt.usdExact(t.usd)) : null;
    if (t.side === 'burn') return t.label ? [sym, h('span', null, t.label)] : [h('span', null, 'Buyback burned'), usd, usd ? h('span', null, 'of') : null, sym];
    if (t.change != null) return [sym, h('span', { class: t.change >= 0 ? 'qa-ribbon__up' : 'qa-ribbon__down' }, fmt.pct(t.change) + ' 24h'), t.label ? h('span', null, t.label) : null];
    if (t.label) return [sym, h('span', null, t.label), usd];
    const sell = t.side === 'sell';
    if (t.count > 1) return [h('span', null, t.count + (sell ? ' sells on' : ' buys on')), sym];
    if (t.w) return [h('span', null, fmt.short(t.w)), h('span', null, sell ? 'sold' : 'bought'), usd, sym];
    return [h('span', null, sell ? 'Sold' : 'Bought'), usd, sym];
  };
  const item = (t, fresh) => {
    const kids = [ico(t.side === 'burn' ? 'flame' : t.side === 'drop' ? 'gift' : t.side === 'sell' ? 'down' : 'up', 'qa-glyph'),
      t.img ? h('i', { style: { 'background-image': `url("${t.img}")` } }) : null, ...words(t)];
    return h(t.href ? 'a' : 'span', { class: `qa-ribbon__item is-${t.side || 'buy'}${fresh && !RM ? ' is-fresh' : ''}`, href: t.href || null, tabindex: t.href ? '-1' : null }, kids);
  };
  const fill = () => { if (!recent.length || RM) return; let guard = 0; while (track.scrollWidth < el.clientWidth * 2.2 && guard++ < 60) track.append(item(recent[guard % recent.length], false)); };
  const frame = (now) => {
    raf = 0; const dt = Math.min(64, now - (last || now)); last = now;
    if (!paused && !hover && !doc.hidden) {
      x -= speed * dt / 1000;
      const first = track.firstElementChild;
      if (first && -x > first.offsetWidth) { x += first.offsetWidth; first.remove(); fill(); }
      track.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`;
    }
    if (track.firstElementChild) raf = requestAnimationFrame(frame);
  };
  const go = () => { if (!RM && !raf && recent.length && track.firstElementChild) { last = 0; raf = requestAnimationFrame(frame); } };
  el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') hover = true; });
  el.addEventListener('pointerleave', () => { hover = false; });
  doc.addEventListener('visibilitychange', () => { if (!doc.hidden) go(); });
  const showNews = () => {
    if (newsTimer || !queue.length) return;
    const { kind = 'call', label, text, w, img, href, keeper = false, hold = 3500 } = queue.shift();
    const c = { call: 'var(--qa-gold-hi)', holder: 'var(--qa-buy)', buy: 'var(--qa-buy)', launch: 'var(--qa-gold-hi)', burn: 'var(--qa-fire)', drop: 'var(--qa-gold-hi)' }[kind];
    newsEl.textContent = ''; newsEl.style.setProperty('--c', c); newsEl.href = href || '#'; newsEl.tabIndex = href ? 0 : -1;
    newsEl.append(keeper || kind === 'burn' ? keeperAvatar() : kind === 'drop' ? h('span', { class: 'qa-ribbon__gift' }, ico('gift')) : avatar(w, '', img), h('b', null, label), h('span', null, text));
    newsEl.classList.add('is-on'); paused = true;
    newsTimer = setTimeout(() => { newsEl.classList.remove('is-on'); paused = false; newsTimer = setTimeout(() => { newsTimer = 0; showNews(); }, 700); }, RM ? Math.max(hold, 5000) : hold);
  };
  return {
    el,
    push(t) {
      recent.unshift(t); recent = recent.slice(0, 24);
      track.querySelector('.qa-ribbon__idle')?.remove();
      const node = item(t, true);
      if (RM) { track.prepend(node); while (track.children.length > 10) track.lastElementChild.remove(); return; }
      // a new trade enters at the right edge of what is visible
      const vis = [...track.children].find((c) => c.offsetLeft + x > el.clientWidth);
      if (vis) track.insertBefore(node, vis); else track.append(node);
      fill(); go();
    },
    set(list) {
      recent = list.slice(0, 24); track.replaceChildren(...recent.map((t) => item(t, false))); x = 0; track.style.transform = '';
      if (!RM) fill(); go();
    },
    news(n) { queue.push(n); if (queue.length > 4) queue.splice(0, queue.length - 4); showNews(); },
  };
}
