import {homePicker} from './qx-home-currency.mjs';
import {loadLocalHome, homeToken} from './qx-home-core.mjs';
// The shared wallet dialog does one job per state (Randall, 2026-11-04: "this should just be a static connect page").
//  - Connected → Account: short address, wallet type and chain, Balances on every chain (native + USDC/USDG, dollar
//    values, a total; tap a chain to switch the wallet there), Copy address / View on explorer (qx-wallet-copy.mjs),
//    links to Portfolio, Rewards and My launches, the trade-confirmation setting, Disconnect (and "Sign out of QHooks
//    login" for the email wallet).
//  - Not connected → Connect: email or Google first, then browser wallets, then one "Phone wallet" button that opens
//    WalletConnect and MetaMask Mobile. No network select up front.
// Runtime layer only: every id the wallet scripts, the terminal and the fork harness use stays in place.
import { getWalletHub } from '/wallet-hub.mjs';
import { tradePrefs, setTradePrefs, instantCapable, DEFAULT_CAP_USD } from '/qx-trade-prefs.mjs';
import { chainById, visibleChains } from '/chains.mjs';
import { cachedBalances, refreshBalances } from '/qx-balances.mjs';
import { walletActions } from '/qx-wallet-actions.mjs';

const homeStyle = document.createElement('link'); homeStyle.rel = 'stylesheet'; homeStyle.href = '/qx-home-currency.css'; document.head.append(homeStyle);
const hub = getWalletHub(window);
const $ = id => document.getElementById(id);
const dialog = $('qhc-dialog');
const chainName = id => chainById(String(id))?.name || 'chain ' + id;
const fmtAmt = v => v == null ? '—' : v === 0 ? '0' : v < 0.0001 ? '< 0.0001' : v.toLocaleString('en-US', { maximumFractionDigits: v < 1 ? 5 : 4 });
const fmtUsd = v => v == null ? '' : v > 0 && v < 0.01 ? '< $0.01' : '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TYPE = { 'io.qhooks.privy': 'QHooks email wallet', 'io.qhooks.walletconnect': 'WalletConnect', 'io.qhooks.metamask-mobile': 'MetaMask Mobile' };
const short = a => a.slice(0, 6) + '…' + a.slice(-4);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
let cur = null, portfolio = '/me', render = () => {};
const ONE_CLICK_LIVE = true; // the Trades setting; ships together with the Privy bridge and the ticket's one-click
// Cash total + "Move to another chain" come from the terminal's Relay module once it ships (lab-public-deploys):
// openMoveFunds({ from, to }) and cashTotal(owner) → { usd, byChain }. Until then the row stays hidden.
// Moves between chains carry no QHooks fee, only Relay's own (Randall, 2026-11-04); the row says so.
let moveFunds = null, probed = false;
// Checked the first time the account menu opens (not on every page load): Portfolio (builder-marketplace) once
// /portfolio answers, My QHooks until then; the move-funds row once its module exists.
function probe() {
  if (probed) return; probed = true;
  fetch('/portfolio', { method: 'HEAD', cache: 'no-store' }).then(r => { if (r.ok) { portfolio = '/portfolio'; render(); } }).catch(() => {});
  fetch('/qx-move-funds.mjs', { method: 'HEAD', cache: 'no-store' }).then(r => r.ok ? import('/qx-move-funds.mjs') : null).then(m => { if (m?.openMoveFunds) { moveFunds = m; render(); } }).catch(() => {});
}

if (dialog) {
  // ---------- Connect layout: email first, browser wallets, then one Phone wallet button. ----------
  const login = dialog.querySelector('.qhc-login'), mobile = dialog.querySelector('.qhc-mobile'), choices = $('qhc-choices');
  const loginNote = login?.querySelector('p:not([id])'); if (loginNote) loginNote.textContent = 'A QHooks wallet. No extension needed.';
  const chooseLine = choices?.querySelector(':scope > p'); if (chooseLine) { chooseLine.textContent = 'Browser wallet'; chooseLine.className = 'qwm-label'; }
  const phone = el('button', 'qhc-choice qwm-phone', 'Phone wallet'); phone.type = 'button'; phone.setAttribute('aria-expanded', 'false');
  phone.addEventListener('click', () => { const open = !mobile.classList.contains('is-open'); mobile.classList.toggle('is-open', open); phone.setAttribute('aria-expanded', String(open)); });
  if (mobile && choices) { choices.after(phone); phone.after(mobile); }
  // WalletConnect (added by the email-login script) goes first inside the phone section.
  new MutationObserver(() => { const wc = $('qhc-phone-login'); if (wc && mobile && mobile.firstElementChild !== wc && !mobile.dataset.ordered) { mobile.dataset.ordered = '1'; mobile.prepend(wc); } }).observe(dialog, { childList: true, subtree: true });

  // ---------- Account layout ----------
  const card = el('section', 'qwm-card');
  card.innerHTML = '<div class="qwm-id"><span class="qwm-avatar" aria-hidden="true"></span><div><b class="qwm-short"></b><span class="qwm-type"><span class="qwm-wtype"></span><span aria-hidden="true">·</span>'
    + '<label class="qwm-net"><select aria-label="Network: switch your wallet to another chain"></select></label></span></div></div>'
    + '<div class="qwm-cash" hidden><span class="qwm-cash-total"></span><button type="button" class="qwm-move">Move funds between chains</button>'
    + '<p class="qwm-move-note">No QHooks fee on moves. Only Relay’s own fee.</p></div>'
    + '<section class="qwm-bals" aria-label="Balances on every chain"><div class="qwm-total"><b></b><span></span></div>'
    + '<ul class="qwm-chains"></ul><button type="button" class="qwm-more" hidden></button><p class="qwm-bal-status" role="status" aria-live="polite"></p></section>';
  card.querySelector('.qwm-move').addEventListener('click', () => { if (cur && moveFunds) { dialog.close(); moveFunds.openMoveFunds({ from: Number(cur.chainId) }); } });
  const home = homePicker({getOwner: () => cur?.owner, getUsd: pref => {
    const rows = cur && cachedBalances(cur.owner).data?.rows;
    const r = rows?.find(r => Number(r.chainId) === pref.chainId);
    return pref.asset === r?.native?.symbol ? r.native.usd : pref.asset === 'USDC' && r?.stable?.symbol === 'USDC' ? r.stable.usd : null;
  }});
  card.prepend(home.element);
  window.addEventListener('qhooks:home-transfer', () => home.refresh());
  window.addEventListener('qhooks:home', () => {home.refresh(); renderBalances();});
  const links = el('nav', 'qwm-links'); links.setAttribute('aria-label', 'Your QHooks');
  const trades = el('section', 'qwm-trades');
  trades.innerHTML = '<h3>Trades</h3><div class="qwm-seg" role="radiogroup" aria-label="How trades confirm">'
    + '<button type="button" role="radio" data-mode="oneclick">One-click</button><button type="button" role="radio" data-mode="popup">Ask in a pop-up</button></div>'
    + '<label class="qwm-cap">Confirm in the ticket above $<input type="number" inputmode="numeric" min="1" max="10000" step="1"></label><p class="qwm-note"></p>';
  const foot = el('div', 'qwm-foot');
  const account = $('qhc-account');
  if (account) { account.before(card); account.after(links); links.after(trades); trades.after(foot); }
  for (const b of trades.querySelectorAll('[data-mode]')) b.addEventListener('click', () => { if (cur && instantCapable(cur.entry)) { setTradePrefs(cur.owner, { mode: b.dataset.mode }); renderTrades(); } });
  const capInput = trades.querySelector('input');
  capInput.addEventListener('change', () => { if (cur) { setTradePrefs(cur.owner, { capUsd: capInput.value }); renderTrades(); } });

  function renderTrades() {
    trades.hidden = !ONE_CLICK_LIVE;
    if (!cur || !ONE_CLICK_LIVE) return;
    const capable = instantCapable(cur.entry), p = tradePrefs(cur.owner), one = capable && p.mode === 'oneclick';
    trades.classList.toggle('is-off', !capable);
    for (const b of trades.querySelectorAll('[data-mode]')) { const on = (b.dataset.mode === 'oneclick') === one; b.setAttribute('aria-checked', String(on)); b.disabled = !capable; }
    capInput.value = String(p.capUsd); capInput.disabled = !one; trades.querySelector('.qwm-cap').hidden = !one;
    trades.querySelector('.qwm-note').textContent = !capable
      ? 'Your wallet asks before every transaction. One-click works with the QHooks email wallet.'
      : one ? `Buy and Sell send straight from the ticket. Above $${p.capUsd} the button asks once more. Launches, withdrawals and claims still ask.`
      : 'Your wallet shows its confirm screen for every trade.';
  }
  // ---------- Balances on every chain (qx-balances.mjs), read when the menu opens; cached a minute ----------
  const bals = card.querySelector('.qwm-bals'), list = bals.querySelector('.qwm-chains'), more = bals.querySelector('.qwm-more'), balStatus = bals.querySelector('.qwm-bal-status');
  let showAll = false, switching = null; // switching: { chainId, uuid, until } while the wallet changes network
  more.addEventListener('click', () => { showAll = !showAll; renderBalances(); });
  // Compact switcher beside the wallet type: works for any chain, including ones with nothing on them yet.
  const netSel = card.querySelector('.qwm-net select');
  netSel.addEventListener('change', () => { if (cur && netSel.value && netSel.value !== String(cur.chainId)) switchTo(netSel.value); });
  function renderSwitcher() {
    if (!cur) return;
    const here = String(cur.chainId), list = visibleChains();
    const opts = list.map(c => { const o = el('option', null, c.name); o.value = c.id; return o; });
    if (!list.some(c => c.id === here)) { const o = el('option', null, chainName(here)); o.value = here; o.disabled = true; opts.unshift(o); }
    netSel.replaceChildren(...opts); netSel.value = switching ? switching.chainId : here; netSel.disabled = !!switching;
  }
  const value = r => (r.native.usd ?? (r.native.amount > 0 ? 1e-9 : 0)) + (r.stable?.usd || 0) + (r.tokens || []).reduce((a, t) => a + (t.usd ?? (t.amount > 0 ? 1e-9 : 0)), 0);
  const empty = r => !r.error && !(r.native.amount > 0) && !(r.stable?.amount > 0) && !(r.tokens || []).some(t => t.amount > 0);
  function chainRow(r, here) {
    const b = el('button', 'qwm-chain'); b.type = 'button'; b.dataset.chain = r.chainId;
    const img = el('img'); img.src = '/chain-symbol-icons/' + r.icon + '.svg'; img.alt = ''; img.width = img.height = 18;
    const name = el('span', 'qwm-chain-name', r.name); if (here) name.append(el('span', 'qwm-here', 'Current'));
    const amts = el('span', 'qwm-amts'), line = (a, sym, usd) => { const s = el('span', 'qwm-amt'); s.append(el('b', null, fmtAmt(a) + ' ' + sym), el('small', null, fmtUsd(usd))); return s; };
    amts.append(line(r.native.amount, r.native.symbol, r.native.usd));
    if (r.stable?.amount > 0) amts.append(line(r.stable.amount, r.stable.symbol, r.stable.usd));
    for (const t of r.tokens || []) if (t.amount > 0) amts.append(line(t.amount, t.symbol, t.usd));
    if (r.error) amts.append(el('small', 'qwm-err', 'Didn’t answer'));
    if (here) { b.setAttribute('aria-current', 'true'); b.title = 'Your wallet is on ' + r.name; }
    else { b.title = 'Switch your wallet to ' + r.name; b.disabled = !!switching; b.addEventListener('click', () => switchTo(r.chainId)); }
    b.append(img, name, amts); const li = el('li'); li.append(b);
    // Send / Unwrap for this chain's balances (the wallet confirms each one).
    const acts = walletActions(r, { explorer: chainById(String(r.chainId))?.explorer || null, onDone: () => { if (cur) { renderBalances(); refreshBalances(cur.owner).then(renderBalances, () => {}); } },
      wallet: cur && { provider: cur.entry?.provider, from: cur.owner, here, switchTo } });
    if (acts) li.append(acts);
    // One-tap Move from this chain (pro terminal phase A, 2026-11-10): opens the Relay move sheet with this chain as the
    // source; the sheet picks the row's largest coin or stablecoin and asks the wallet to sign. Funded Relay chains only.
    if (moveFunds && !r.error && (r.native.amount > 0 || r.stable?.amount > 0) &&(moveFunds.MOVE_CHAINS || []).some(c => c && String(c.id) === String(r.chainId))) {
      const mv = el('button', 'qwm-act qwm-row-move', 'Move'); mv.type = 'button'; mv.setAttribute('aria-label', 'Move to another chain'); mv.title = 'Move from ' + r.name + ' to another chain';
      mv.addEventListener('click', () => { if (cur) { dialog.close(); moveFunds.openMoveFunds({ from: { chainId: Number(r.chainId) } }); } });
      const bar = acts?.querySelector('.qwm-act-bar');
      if (bar) bar.append(mv); else { const box = el('div', 'qwm-acts'), b = el('div', 'qwm-act-bar'); b.append(mv); box.append(b); li.append(box); }
    }
    const pref = loadLocalHome(cur?.owner);
    if (moveFunds && Number(r.chainId) !== pref.chainId && !r.error && r.native.amount > 0) {
      const back = el('button', 'qwm-act', fmtAmt(r.native.amount) + ' ' + r.native.symbol + ' on ' + r.name + ' · Move home'); back.type = 'button';
      back.addEventListener('click', async () => { try { const token = homeToken(pref); dialog.close(); await moveFunds.openMoveFunds({homeCurrency: true, from: {chainId: Number(r.chainId), token: moveFunds.NATIVE_TOKEN}, to: {chainId: pref.chainId, token: token.address}}); } catch { balStatus.textContent = 'Home asset is refreshing.'; } });
      li.append(back);
    }
    return li;
  }
  // An open Send/Unwrap form is never rebuilt under the user: a refresh that lands meanwhile waits until it closes.
  let heldRender = false;
  list.addEventListener('qwm:panel', () => { if (heldRender && !list.querySelector('.qwm-act-panel:not([hidden])')) { heldRender = false; renderBalances(); } });
  function renderBalances() {
    if (!cur) return;
    if (list.querySelector('.qwm-act-panel:not([hidden])')) { heldRender = true; return; }
    const { data } = cachedBalances(cur.owner), total = bals.querySelector('.qwm-total');
    if (!data) { total.firstChild.textContent = '…'; total.lastChild.textContent = 'Reading your balances on every chain'; list.replaceChildren(); more.hidden = true; return; }
    home.repaint();
    const here = String(cur.chainId), rows = [...data.rows].sort((a, b) => value(b) - value(a));
    const shown = rows.filter(r => showAll || !empty(r) || r.chainId === here), hidden = rows.length - rows.filter(r => !empty(r) || r.chainId === here).length;
    const held = rows.filter(r => !empty(r) && !r.error).length;
    total.firstChild.textContent = fmtUsd(data.total) || '$0.00';
    total.lastChild.textContent = (held ? 'across ' + held + (held === 1 ? ' chain' : ' chains') : 'on every chain') + (data.partial ? ' · some values missing' : '');
    list.replaceChildren(...shown.map(r => chainRow(r, r.chainId === here)));
    more.hidden = !hidden; more.textContent = showAll ? 'Hide empty chains' : 'Show all (' + hidden + ' empty)';
  }
  function loadBalances() {
    if (!cur || !dialog.open) return;
    const owner = cur.owner, { fresh } = cachedBalances(owner); renderBalances();
    if (!fresh) refreshBalances(owner).then(() => { if (cur?.owner === owner) renderBalances(); }, () => { if (cur?.owner === owner && !cachedBalances(owner).data) { balStatus.textContent = 'Balances didn’t load. Close and reopen to retry.'; } });
  }
  // Tapping a chain switches the wallet there. The hub treats a network change as a new connection, so (like the
  // terminal and My QHooks) the page is told first and the same wallet is rejoined instead of shown disconnected.
  async function switchTo(id) {
    if (!cur || switching) return;
    const entry = cur.entry, name = chainName(id);
    switching = { chainId: String(id), uuid: entry.uuid, until: Date.now() + 20000 };
    balStatus.textContent = 'Switching your wallet to ' + name + '…'; renderBalances(); renderSwitcher();
    window.dispatchEvent(new CustomEvent('qhooks:chain-switch', { detail: { chainId: String(id) } }));
    try { await entry.provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x' + Number(id).toString(16) }] }); }
    catch (e) { switching = null; balStatus.textContent = e?.code === 4001 ? 'Switch cancelled.' : 'Your wallet couldn’t switch to ' + name + '.'; renderBalances(); renderSwitcher(); }
  }
  function rejoin() {
    setTimeout(async () => {
      const s = hub.snapshot();
      if (s.current || !switching) return;
      if (s.busy) return rejoin();
      try { await hub.connect(switching.uuid); } catch {}
      if (hub.snapshot().current || !switching) return;
      if (Date.now() < switching.until) rejoin(); else { switching = null; balStatus.textContent = ''; cur = null; render(); }
    }, 400);
  }
  let cashKey = '';
  async function renderCash() {
    const row = card.querySelector('.qwm-cash'), out = row.querySelector('.qwm-cash-total');
    row.hidden = !(cur && moveFunds); if (row.hidden) return;
    if (typeof moveFunds.cashTotal !== 'function' || cashKey === cur.owner) return;
    const k = cashKey = cur.owner; out.textContent = '';
    try {
      const v = await moveFunds.cashTotal(cur.owner), usd = Number(typeof v === 'object' ? v?.usd : v);
      if (k === cashKey && Number.isFinite(usd)) out.textContent = 'Cash $' + usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } catch { if (k === cashKey) cashKey = ''; }
  }
  function moveIntoFoot() {
    for (const id of ['qhc-fund', 'qhc-email-logout', 'qhc-forget']) { const n = $(id); if (n && n.parentElement !== foot) foot.append(n); }
    const forget = $('qhc-forget'); if (forget) forget.textContent = 'Disconnect';
  }
  function moveBackForConnect() { const out = $('qhc-email-logout'); if (out && login && out.parentElement !== login) login.querySelector('#qhc-login-status')?.before(out); }

  render = function () {
    const mode = cur ? 'account' : 'connect';
    dialog.dataset.qwm = mode;
    const title = $('qhc-title'); if (title) title.textContent = cur ? 'Account' : 'Connect a wallet';
    if (!cur) { moveBackForConnect(); return; }
    moveIntoFoot();
    card.querySelector('.qwm-short').textContent = short(cur.owner);
    card.querySelector('.qwm-wtype').textContent = TYPE[cur.entry?.rdns] || cur.entry?.name || 'Browser wallet';
    renderSwitcher();
    links.replaceChildren(...[['My QHooks', '/me'], ['Portfolio', portfolio], ['Rewards', '/me#qa-rewards'], ['My launches', '/me#qa-launches'], ['Wallets', '/wallets']].map(([t, h]) => { const a = el('a', null, t); a.href = h; a.addEventListener('click', () => dialog.close()); return a; }));
    renderTrades(); loadBalances(); renderCash(); home.refresh();
  };
  // The fund button arrives later (email-login script); keep the footer complete whenever the dialog changes.
  new MutationObserver(() => { if (cur && $('qhc-fund') && $('qhc-fund').parentElement !== foot) foot.prepend($('qhc-fund')); }).observe(dialog, { childList: true, subtree: true });
  window.addEventListener('qhooks:trade-prefs', renderTrades);
  new MutationObserver(() => { if (dialog.open && cur) { if (!switching) balStatus.textContent = ''; probe(); loadBalances(); home.refresh(); } }).observe(dialog, { attributes: true, attributeFilter: ['open'] });
  hub.subscribe(s => {
    const c = s.current;
    if (c) {
      cur = { owner: c.owner, chainId: c.chainId, entry: c.entry };
      if (switching && String(c.chainId) === switching.chainId) { switching = null; balStatus.textContent = 'Your wallet is on ' + chainName(c.chainId) + '.'; }
      render(); return;
    }
    // Mid-switch the hub briefly has no wallet: keep the Account view and rejoin the same wallet.
    if (switching && Date.now() < switching.until) { rejoin(); return; }
    switching = null; cur = null; render();
  });
  render();
}
