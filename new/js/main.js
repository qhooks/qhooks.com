// main.js – Router and UI entry point for QHooks
// See SPEC.md for requirements

import { TOKENS, CHAINS as CHAIN_LIST } from './data.js';
import {
  compactUSD,
  compactAge,
  shortAddress,
  NAV_ITEMS,
  TABS,
  COLORS,
  CHAINS,
} from './ui.js';

// Import Pulse module
import { Pulse } from './pulse.js';
import { WalletPage } from './wallet-page.js';

// ── Router State ─────────────────────────────────────────────────────
let currentHash = window.location.hash || '#/pulse';
let currentParams = {};

// ── DOM Helpers ──────────────────────────────────────────────────────
function createEl(tag, props, children) {
  const el = document.createElement(tag);
  if (props) {
    if (props.className) el.className = props.className;
    if (props.id) el.id = props.id;
    if (props.textContent) el.textContent = props.textContent;
    if (props.innerHTML) el.innerHTML = props.innerHTML;
    if (props.onclick) el.onclick = props.onclick;
    if (props.href) el.href = props.href;
    if (props.type) el.type = props.type;
    if (props.placeholder) el.placeholder = props.placeholder;
    if (props.disabled !== undefined) el.disabled = props.disabled;
    if (props.value !== undefined) el.value = props.value;
  }
  if (children) {
    if (Array.isArray(children)) {
      children.forEach(function(child) {
        if (child) el.appendChild(child);
      });
    } else {
      el.appendChild(children);
    }
  }
  return el;
}

function createBtn(text, className, onclick) {
  const btn = createEl('button', { className: 'q-btn ' + (className || ''), textContent: text });
  if (onclick) btn.onclick = onclick;
  return btn;
}

function createInput(placeholder, className, oninput) {
  const input = createEl('input', {
    className: 'q-input ' + (className || ''),
    placeholder: placeholder,
    type: 'text',
  });
  if (oninput) input.oninput = oninput;
  return input;
}

function createSelect(options, value, onchange) {
  const select = createEl('select', { value: value || '' });
  options.forEach(function(opt) {
    const option = createEl('option', { value: opt.value, textContent: opt.label });
    if (opt.value === value) option.selected = true;
    select.appendChild(option);
  });
  if (onchange) select.onchange = onchange;
  return select;
}

// ── Header / Top Bar ────────────────────────────────────────────────
function renderTopBar() {
  const container = createEl('div', { className: 'q-topbar' });
  
  // Left: Logo + Nav
  const left = createEl('div', { className: 'q-topbar-left' });
  
  // Logo
  // QH mark + wordmark (Fable): the name is on every page.
  const logo = createEl('div', { className: 'q-logo', title: 'QHooks' });
  logo.innerHTML = '<img class="q-mark" src="brand/qh-mark.jpg" alt="" width="30" height="30"><span class="q-word">QHooks</span>';
  logo.onclick = function() { navigateTo('#/pulse'); };
  
  // Nav links
  const nav = createEl('div', { className: 'q-nav' });
  NAV_ITEMS.forEach(function(item) {
    const link = createEl('a', {
      className: 'q-nav-link' + ((window.location.hash || '#/pulse').indexOf(item.hash) === 0 || (item.hash === '#/pulse' && window.location.hash.indexOf('#/token/') === 0) ? ' active' : ''),
      textContent: item.label,
      href: item.hash,
    });
    link.onclick = function(e) {
      e.preventDefault();
      navigateTo(item.hash);
    };
    nav.appendChild(link);
  });
  
  left.appendChild(logo);
  left.appendChild(nav);
  
  // Right: Chain selector + Connect
  const right = createEl('div', { className: 'q-topbar-right' });
  
  // Chain selector
  /* The chain selector really filters now (Fable): "All chains" by default, the choice is remembered, and Pulse
     listens for the "qh-chain" event. It used to show "Robinhood" while listing every chain. */
  const chainSelect = createEl('select', { className: 'q-chain-select', title: 'Chain' });
  chainSelect.setAttribute('aria-label', 'Chain');
  ['All chains'].concat(CHAIN_LIST).forEach(function(chain, i) {
    const opt = createEl('option', { value: i ? chain : '', textContent: chain });
    chainSelect.appendChild(opt);
  });
  try { window.QH_CHAIN = localStorage.getItem('qh-chain') || ''; } catch (e) { window.QH_CHAIN = ''; }
  chainSelect.value = window.QH_CHAIN;
  if (chainSelect.value !== window.QH_CHAIN) { window.QH_CHAIN = ''; chainSelect.value = ''; }
  chainSelect.onchange = function() {
    window.QH_CHAIN = chainSelect.value;
    try { localStorage.setItem('qh-chain', window.QH_CHAIN); } catch (e) {}
    window.dispatchEvent(new CustomEvent('qh-chain', { detail: window.QH_CHAIN }));
  };
  window.addEventListener('qh-chain', function(e) { if (chainSelect.value !== e.detail) chainSelect.value = e.detail || ''; });
  
  // Connect button
  const connectBtn = createBtn('Connect', 'q-connect-btn', function() {
    alert('Connect wallet placeholder');
  });
  
  right.appendChild(chainSelect);
  // Unified balance across chains + Earned chip (contract 1.3.2 / v1.7 rule 3, Claude)
  const BAL = [['Robinhood', 4120.55], ['Solana', 3388.10], ['Base', 2210.42], ['BNB', 1140.00], ['Ethereum', 980.31], ['Arbitrum', 412.20], ['Elysium', 96.25]];
  const total = BAL.reduce(function(a, b){ return a + b[1]; }, 0);
  const earned = createEl('a', { className: 'q-earned', href: '#/rewards' });
  earned.innerHTML = 'Earned <b>$48.12</b>';
  const bal = createEl('div', { className: 'q-balance' });
  bal.innerHTML = '<button class="q-balance-btn">$' + total.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' <span class="q-caret">\u25be</span></button>' +
    '<div class="q-balance-menu">' + BAL.map(function(r){ return '<div class="q-balance-row"><span>' + r[0] + '</span><b>$' + r[1].toFixed(2) + '</b></div>'; }).join('') +
    '<a class="q-balance-move" href="#/portfolio">Move funds</a></div>';
  bal.querySelector('.q-balance-btn').onclick = function(e){ e.stopPropagation(); bal.classList.toggle('open'); };
  document.addEventListener('click', function(){ bal.classList.remove('open'); });
  right.appendChild(earned);
  right.appendChild(bal);
  right.appendChild(connectBtn);
  if (window.QHAccount) window.QHAccount.fillTop(earned, bal, connectBtn);
  
  // Search
  const search = createEl('div', { className: 'q-search' });
  const searchInput = createEl('input', {
    className: 'q-search-input',
    placeholder: 'Search tokens...',
    type: 'text',
  });
  search.appendChild(searchInput);
  window.QH_TOKENS = TOKENS;
  if (window.Search) window.Search.attach(searchInput);
  if (window.LiveSearch) window.LiveSearch.attach(searchInput);
  document.addEventListener('keydown', function(e){ if (e.key === '/' && document.activeElement !== searchInput) { e.preventDefault(); searchInput.focus(); } });
  
  // Phone search (contract section 2): an icon opens the same search field across the top bar. (Fable)
  const searchBtn = createEl('button', { className: 'q-search-toggle', type: 'button', title: 'Search' });
  searchBtn.setAttribute('aria-label', 'Search');
  searchBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square"><path d="M7.5 2.5a5 5 0 1 0 0 10a5 5 0 0 0 0-10zM11.3 11.3L15.5 15.5"/></svg>';
  searchBtn.onclick = function() { container.classList.add('q-search-open'); searchInput.focus(); };
  searchInput.addEventListener('blur', function() { setTimeout(function() { container.classList.remove('q-search-open'); }, 200); });
  right.insertBefore(searchBtn, right.firstChild);

  container.appendChild(left);
  container.appendChild(search);
  container.appendChild(right);
  
  return container;
}

// ── Bottom Tab Bar (Mobile) ─────────────────────────────────────────
function renderBottomTabBar() {
  const container = createEl('div', { className: 'q-bottom-nav' });
  
  TABS.forEach(function(tab) {
    const item = createEl('a', {
      className: 'q-bottom-nav-item',
      href: tab.hash,
    });
    
    const icon = createEl('span', {
      className: 'q-bottom-nav-icon',
      textContent: getTabIcon(tab.hash),
    });
    
    const label = createEl('span', {
      className: 'q-bottom-nav-label',
      textContent: tab.label,
    });
    
    item.appendChild(icon);
    item.appendChild(label);
    
    item.onclick = function(e) {
      e.preventDefault();
      navigateTo(tab.hash);
    };
    
    container.appendChild(item);
  });
  
  return container;
}

function getTabIcon(hash) {
  const icons = {
    '#/pulse': '⇅',
    '#/discover': '▦',
    '#/launch': '+',
    '#/portfolio': '▤',
    '#/more': '⋯',
  };
  return icons[hash] || '•';
}

// ── Navigation ───────────────────────────────────────────────────────
function navigateTo(hash) {
  window.location.hash = hash;
}

function initRouter() {
  function handleHashChange() {
    const hash = window.location.hash || '#/pulse';
    renderPage(hash);
  }
  
  window.addEventListener('hashchange', handleHashChange);
  handleHashChange();
}

// ── Page Renderers ───────────────────────────────────────────────────
function renderPage(hash) {
  const app = document.getElementById('app');
  if (!app) return;
  
  // Clear app
  while (app.firstChild) app.removeChild(app.firstChild);
  
  // Render header
  app.appendChild(renderTopBar());
  
  // Render main content based on hash
  const main = createEl('main', { className: 'q-main' });
  
  if (hash.indexOf('#/token/') === 0 && window.LiveToken && window.QHLive) {
    const wrapL = createEl('div', { className: 'q-token-wrap' }); window.LiveToken.render(wrapL, hash.slice(8), (TOKENS || []).concat(window.QH_DRAFTS || [])); main.appendChild(wrapL); app.appendChild(main); app.appendChild(renderBottomTabBar()); return;
  }
  if (hash.indexOf('#/token/') === 0 && window.Token) {
    const addr = hash.slice(8).toLowerCase();
    const tok = (TOKENS || []).concat(window.QH_DRAFTS || []).find(function(t){ return (t.address || '').toLowerCase() === addr; });
    if (tok) { const wrap = createEl('div', { className: 'q-token-wrap' }); window.Token.render(wrap, tok); if (window.TradeEstimate) window.TradeEstimate.attach(wrap, tok); main.appendChild(wrap); app.appendChild(main); if (typeof renderBottomTabBar === 'function') app.appendChild(renderBottomTabBar()); return; }
  }
  if (hash.indexOf('#/wallet/') === 0) {
    const wrapW = createEl('div', { className: 'q-wallet-page' }); if (window.QHProfile) window.QHProfile.render(wrapW, decodeURIComponent(hash.slice(9).split('?')[0])); else if (window.QHWalletView) window.QHWalletView.render(wrapW, decodeURIComponent(hash.slice(9).split('?')[0])); else WalletPage.render(wrapW, hash.slice(9)); main.appendChild(wrapW); app.appendChild(main); app.appendChild(renderBottomTabBar()); return;
  }
  if (hash.indexOf('#/hook/') === 0 && window.HookPage) { const hp = createEl('div'); window.HookPage.render(hp, decodeURIComponent(hash.slice(7))); main.appendChild(hp); app.appendChild(main); app.appendChild(renderBottomTabBar()); return; }
  if (hash === '#/rewards' && window.Rewards) { const rw = createEl('div'); window.Rewards.render(rw); main.appendChild(rw); app.appendChild(main); app.appendChild(renderBottomTabBar()); return; }
  if (hash === '#/perps' && window.Perps) { const pp = createEl('div'); window.Perps.render(pp); main.appendChild(pp); app.appendChild(main); app.appendChild(renderBottomTabBar()); return; }
  if (hash.split('?')[0] === '#/hooks/studio' && window.Studio) { const st = createEl('div'); window.Studio.render(st); main.appendChild(st); app.appendChild(main); app.appendChild(renderBottomTabBar()); return; }
  if (hash === '#/community' && window.Community) { const cm = createEl('div'); window.Community.render(cm); main.appendChild(cm); app.appendChild(main); app.appendChild(renderBottomTabBar()); return; }
  if (hash === '#/agents' && window.Agents) { const ag = createEl('div'); window.Agents.render(ag); main.appendChild(ag); app.appendChild(main); app.appendChild(renderBottomTabBar()); return; }
  switch (hash.split('?')[0]) {
    case '#/pulse':
      main.appendChild(renderPulsePage());
      break;
    case '#/discover':
      main.appendChild(renderDiscoverPage());
      break;
    case '#/launch':
      main.appendChild(renderLaunchPage());
      break;
    case '#/portfolio':
      main.appendChild(renderPortfolioPage());
      break;
    case '#/more':
      main.appendChild(renderMorePage());
      break;
    default:
      main.appendChild(renderPulsePage());
  }
  
  app.appendChild(main);
  
  // Render bottom nav (hidden on desktop)
  const bottomNav = renderBottomTabBar();
  bottomNav.classList.add('q-bottom-nav-hidden');
  app.appendChild(bottomNav);
}

function renderPulsePage() {
  const container = createEl('div', { className: 'q-pulse-container' });
  Pulse.mount(container);
  if (window.LivePulse) window.LivePulse.attach(container);
  return container;
}

function renderDiscoverPage() {
  const container = createEl('div', { className: 'q-discover' });
  if (window.Discover) window.Discover.render(container);
  return container;
}

function renderLaunchPage() {
  const container = createEl('div', { className: 'q-launch' });
  if (window.Launch) window.Launch.render(container);
  return container;
}

function renderPortfolioPage() {
  const container = createEl('div', { className: 'q-portfolio' });
  if (window.Portfolio) { const pf = createEl('div'); window.Portfolio.render(pf); container.appendChild(pf); return container; }
  if (window.QHAccount) { const cp = createEl('div'); window.QHAccount.portfolio(cp); container.appendChild(cp); }
  return container;
}

function renderMorePage() {
  const container = createEl('div', { className: 'q-page' });
  // Claude: More lists every screen that isn't in the phone tab bar (contract 1.2.2: nothing phone-missing).
  const links = [['#/community', 'Community', 'Calls, callers and tracked wallets'], ['#/perps', 'Perps', 'Leverage on majors'], ['#/agents', 'Agents', 'Run an agent on any token'], ['#/rewards', 'Rewards', 'Cashback, referrals and claims'], ['#/hooks/studio', 'Hook Studio', 'Build and test hooks']];
  container.innerHTML = '<h1 class="q-more-h">MORE</h1>' + links.map(function(l){ return '<a class="q-more-link" href="' + l[0] + '"><b>' + l[1] + '</b><span>' + l[2] + '</span></a>'; }).join('');
  return container;
}

// ── Initialization ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  initRouter();
});

export { navigateTo, renderPage, initRouter };
