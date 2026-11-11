// QHooks terminal v2 layout helpers (2026-11 redesign). Presentation only: this file reads what the terminal has
// already rendered and never touches data, quotes, wallets or transactions.
//  1. Price line: mirrors the "Price" and "24h" stats as the large headline above the stat strip.
//  2. Info tab: one extra tab beside Trades / Holders / Top traders / Positions for the secondary panels.
//  3. Phone: a sticky Buy | Sell bar that opens the existing ticket as a bottom sheet.
import { scrollPlan } from '/qx-terminal-v2-plan.mjs';
const doc = document, root = doc.documentElement;
const $ = id => doc.getElementById(id);
const main = $('qxt-main'), stats = $('qxt-stats'), tabs = $('qxt-data-tabs'), ticket = $('qxt-ticket');
const phone = matchMedia('(max-width:760px)');
const el = (tag, props = {}, ...kids) => { const n = doc.createElement(tag); for (const [k, v] of Object.entries(props)) { if (k === 'class') n.className = v; else if (k === 'hidden') n.hidden = !!v; else n.setAttribute(k, v); } n.append(...kids); return n; };
const marketOpen = () => !!main?.classList.contains('has-market');

if (main && stats && tabs && ticket) {
  // ---- 1. price line ----
  const now = el('span', { class: 'qv2-price-now' }), chg = el('span', { class: 'qv2-price-chg' }), sub = el('span', { class: 'qv2-price-sub' });
  // This line is the page's one readable price: the two stat cells it mirrors are hidden, so it is not aria-hidden.
  const price = el('div', { class: 'qv2-price', hidden: true, role: 'group', 'aria-label': 'Price and 24 hour change' }, now, chg, sub);
  stats.before(price);
  const cell = label => [...stats.children].find(c => c.querySelector('dt')?.textContent.trim().toLowerCase() === label);
  const set = (node, text) => { if (node.textContent !== text) node.textContent = text; };
  function syncPrice() {
    const p = cell('price'), c = cell('24h'), value = p?.querySelector('dd')?.textContent.trim();
    if (!value) { price.hidden = true; stats.classList.remove('qv2-mirrored'); return; }
    const [first, ...rest] = value.split(' · ');
    tick(first); set(now, first); set(sub, rest.join(' · '));
    ratio();
    const dd = c?.querySelector('dd'), change = dd?.textContent.trim() || '';
    chg.className = 'qv2-price-chg' + (dd?.classList.contains('up') ? ' up' : dd?.classList.contains('down') ? ' down' : '');
    if (chg.dataset.v !== change) { chg.dataset.v = change; chg.replaceChildren(...(change ? [change, el('small', {}, '24h')] : [])); }
    p.classList.add('qv2-m'); c?.classList.add('qv2-m');
    for (const dd of stats.querySelectorAll('dd')) {
      if (dd.firstElementChild || !dd.textContent.includes(' · ') || dd.closest('.qv2-m')) continue;
      const [lead, ...more] = dd.textContent.split(' · '); if (!/^[<~≈]?\s*\$/.test(lead.trim())) continue;
      if (!dd.title) dd.title = dd.textContent;
      dd.replaceChildren(lead, el('span', { class: 'qv2-sec' }, ' · ' + more.join(' · ')));
    }
    stats.classList.add('qv2-mirrored'); price.hidden = false;
  }
  // A changed price flashes in the move's colour for a moment (only when both prices read as plain numbers).
  const plain = t => /^\$[\d,]*\.?\d+$/.test(t) ? Number(t.slice(1).replace(/,/g, '')) : NaN;
  let tickTimer = 0;
  function tick(next) {
    const a = plain(now.textContent), b = plain(next);
    if (!(a > 0) || !(b > 0) || a === b) return;
    now.classList.remove('tick-up', 'tick-down'); now.classList.add(b > a ? 'tick-up' : 'tick-down');
    clearTimeout(tickTimer); tickTimer = setTimeout(() => now.classList.remove('tick-up', 'tick-down'), 90);
  }
  // "Buys / sells" also shows as a small two-colour meter.
  function ratio() {
    const c = [...stats.children].find(n => /^buys \/ sells/i.test(n.querySelector('dt')?.textContent.trim() || ''));
    const m = c?.querySelector('dd')?.textContent.match(/^\s*([\d,]+)\s*\/\s*([\d,]+)/);
    const buys = m ? Number(m[1].replace(/,/g, '')) : 0, sells = m ? Number(m[2].replace(/,/g, '')) : 0;
    if (!c) return;
    if (!(buys + sells > 0)) { c.classList.remove('qv2-ratio'); c.style.removeProperty('--qv2-buys'); return; }
    c.style.setProperty('--qv2-buys', (100 * buys / (buys + sells)).toFixed(1) + '%'); c.classList.add('qv2-ratio');
  }
  new MutationObserver(syncPrice).observe(stats, { childList: true, subtree: true, characterData: true });
  syncPrice();

  // ---- the token's own light: its image (or its colour) glows behind the header ----
  const av = $('qxt-av') || main.querySelector('.qxt-av');
  function syncArt() {
    const node = $('qxt-av'), img = node?.querySelector('img.qxt-av-logo'), src = img && !img.hidden && img.getAttribute('data-avatar-state') === 'image' ? img.currentSrc || img.src : '';
    if (src) root.style.setProperty('--qv2-art', 'url("' + src.replace(/["\\\n]/g, '') + '")'); else root.style.removeProperty('--qv2-art');
    const hue = node?.style.getPropertyValue('--h').trim(); if (hue) root.style.setProperty('--qv2-hue', hue);
    const sym = $('qxt-symbol')?.textContent.trim() || '', name = $('qxt-name')?.textContent.trim() || '';
    main.querySelector('.qxt-id')?.classList.toggle('qv2-same-name', !!sym && sym.toLowerCase() === name.toLowerCase());
    syncPoolNote(sym);
  }
  // Official pool: one quiet linked line under the trade action and in the Info tab (Randall, 2026-11-11: "quiet line
  // but also 'for best routes' or something instead of Only trade"). The terminal's own notice stays in the page but is
  // no longer drawn as a box.
  const poolNote = () => { const a = el('a', { href: '/lp-proof' }); return el('p', { class: 'qv2-poolnote', hidden: true }, a); };
  const noteTicket = poolNote(), noteInfo = poolNote();
  function syncPoolNote(sym) {
    // On for the official token (the terminal's own "Official" mark, which does not wait for any scan), and for any
    // other token whenever the terminal shows its unofficial-pools notice.
    const box = $('qxt-pool-warning'), official = !!$('qxt-official')?.querySelector('.qxo-official');
    const on = !!sym && (official || (!!box && !box.hidden));
    // Only write what changed: this runs inside the head's observer, and a repeated write would call it again.
    for (const n of [noteTicket, noteInfo]) { if (n.hidden !== !on) n.hidden = !on; const t = 'For the best route, trade ' + sym + ' on qhooks.com or the official pool →'; if (on && n.firstChild.textContent !== t) n.firstChild.textContent = t; }
    const after = ticket.querySelector(':scope > .qxt-followup') || ticket.querySelector(':scope > .qxt-go');
    if (after && noteTicket.previousElementSibling !== after) after.after(noteTicket);
    if (noteInfo.parentElement !== $('qxt-head')) $('qxt-head').append(noteInfo);
  }
  new MutationObserver(syncArt).observe($('qxt-head'), { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'hidden', 'data-avatar-state', 'style'] });
  syncArt();

  // ---- the tape shows size: a bar behind each trade, as long as its value ----
  const pane = $('qxt-pane');
  const usd = t => { const m = /\$\s*([\d,]*\.?\d+)\s*([KMB])?/.exec(t || ''); return m ? Number(m[1].replace(/,/g, '')) * ({ K: 1e3, M: 1e6, B: 1e9 }[m[2]] || 1) : NaN; };
  let sizing = 0;
  function sizeTape() {
    sizing = 0;
    const table = pane?.querySelector('table.qxt-table'); if (!table) return;
    const heads = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim().toLowerCase());
    const vi = heads.indexOf('value'), si = heads.indexOf('side'); if (vi < 0 || si < 0) return;
    const rows = [...table.querySelectorAll('tbody tr')].map(tr => ({ tr, v: usd(tr.cells[vi]?.textContent), side: tr.cells[si]?.textContent.trim().toLowerCase() })).filter(r => r.v > 0 && (r.side === 'buy' || r.side === 'sell'));
    if (!rows.length) return;
    // Linear: a trade twice the value gets a bar twice as long, up to the 95th-percentile trade in view (full width).
    const sorted = rows.map(r => r.v).sort((a, b) => a - b), top = Math.max(sorted[Math.floor((sorted.length - 1) * 0.95)] || 0, 0.01);
    for (const { tr, v, side } of rows) {
      tr.style.setProperty('--qv2-w', Math.max(1, Math.min(100, 100 * v / top)).toFixed(1) + '%');
      tr.classList.add('qv2-sized', side === 'buy' ? 'qv2-buy' : 'qv2-sell'); tr.classList.toggle('qv2-big', v >= top);
    }
  }
  if (pane) { new MutationObserver(() => { if (!sizing) sizing = requestAnimationFrame(sizeTape); }).observe(pane, { childList: true, subtree: true }); sizeTape(); }

  // ---- 2. Info tab ----
  // Info is a tab like its neighbours. Its click stops here, so the terminal's own tab handler (which reads a pane
  // name the Info tab does not have) never runs for it; choosing any other tab hands the state back to the terminal.
  const info = el('button', { type: 'button', role: 'tab', class: 'qv2-info-tab', 'aria-selected': 'false' }, 'Info');
  tabs.insertBefore(info, $('qxt-trade-filters'));
  const setInfo = on => {
    main.classList.toggle('qv2-info', on); info.setAttribute('aria-selected', String(on));
    if (on) for (const b of tabs.querySelectorAll('button[role="tab"][data-pane]')) b.setAttribute('aria-selected', 'false');
  };
  info.addEventListener('click', e => { e.stopPropagation(); setInfo(true); });
  tabs.addEventListener('click', e => { if (e.target.closest('button[role="tab"][data-pane]')) setInfo(false); }, true);

  // ---- 3. phone: Buy | Sell bar and the ticket sheet ----
  const scrollIntoView = Element.prototype.scrollIntoView;
  // Opening a token on a phone puts its header at the top of the screen. The page above it settles in steps (the
  // drop line, the top bar once the wallet has loaded), so for a few seconds the position follows those changes,
  // unless the reader has scrolled meanwhile.
  let placedAt = -1, placedUntil = 0;
  const place = () => { const id = main.querySelector('.qxt-id'); placedAt = id ? Math.max(0, Math.round(id.getBoundingClientRect().top + scrollY - 12)) : 0; scrollTo({ top: placedAt }); };
  const settle = () => { if (Date.now() < placedUntil && marketOpen() && phone.matches && Math.abs(scrollY - placedAt) < 4) place(); };
  const whenMarket = fn => { if (marketOpen()) { fn(); return; } let n = 0; const tick = () => { if (marketOpen()) fn(); else if (++n < 180) requestAnimationFrame(tick); }; requestAnimationFrame(tick); };
  function toToken() { placedUntil = Date.now() + 8000; place(); for (const ms of [350, 1200, 3000]) setTimeout(settle, ms); }
  if ('ResizeObserver' in globalThis) { const above = new ResizeObserver(settle); for (const n of doc.querySelectorAll('.qxt-top, .qx-drop')) above.observe(n); }
  const limit = $('qx-pro-limit');
  const sideButton = side => ticket.querySelector('.qxt-side-toggle [data-side="' + side + '"]');
  const closeX = el('button', { type: 'button', class: 'qv2-sheet-x', 'aria-label': 'Close trade ticket' }, '×');
  const backdrop = el('button', { type: 'button', class: 'qv2-backdrop', 'aria-label': 'Close trade ticket', tabindex: '-1' });
  const bList = el('button', { type: 'button', class: 'qv2-bar-list', 'aria-label': 'Watchlist and recent markets' }, 'Watchlist');
  const bBuy = el('button', { type: 'button', class: 'qv2-bar-buy' }, 'Buy');
  const bSell = el('button', { type: 'button', class: 'qv2-bar-sell' }, 'Sell');
  const bLimit = el('button', { type: 'button', class: 'qv2-bar-limit', hidden: true }, 'Limit');
  const bar = el('nav', { class: 'qv2-bar', 'aria-label': 'Trade' }, bList, bBuy, bSell, bLimit);
  let opener = null;
  const sheetOpen = () => root.classList.contains('qv2-sheet');
  function openSheet(side) {
    if (!phone.matches || !marketOpen()) return;
    const b = side && sideButton(side);
    if (b && b.getAttribute('aria-pressed') !== 'true') b.click();
    if (!ticket.contains(closeX)) ticket.append(closeX);
    if (sheetOpen()) return;
    opener = doc.activeElement; root.classList.add('qv2-sheet');
    ticket.setAttribute('role', 'dialog'); ticket.setAttribute('aria-modal', 'true'); ticket.setAttribute('aria-label', 'Trade'); ticket.tabIndex = -1;
    ticket.focus({ preventScroll: true });
  }
  function closeSheet() {
    if (!sheetOpen()) return;
    root.classList.remove('qv2-sheet');
    for (const a of ['role', 'aria-modal', 'aria-label', 'tabindex']) ticket.removeAttribute(a);
    if (opener && doc.contains(opener)) opener.focus({ preventScroll: true });
    opener = null;
  }
  bBuy.addEventListener('click', () => openSheet('buy'));
  bSell.addEventListener('click', () => openSheet('sell'));
  bLimit.addEventListener('click', () => limit?.click());
  bList.addEventListener('click', () => { const feed = doc.querySelector('.qxt-feed'); if (feed) scrollIntoView.call(feed, { block: 'start' }); });
  closeX.addEventListener('click', closeSheet);
  backdrop.addEventListener('click', closeSheet);
  // Escape closes the sheet first; the terminal's own Escape (back to the token list) only runs when no sheet is open.
  // An open menu, dialog or settings panel still closes first, exactly as before.
  const innerOverlay = e => doc.fullscreenElement || doc.querySelector('dialog[open], [role="dialog"]:not(#qxt-ticket), [aria-modal="true"]:not(#qxt-ticket), .qxt-layer-list:not([hidden]), .qxt-ticket-settings[open], .qxt-settings[open]') || e.target?.closest?.('details[open]');
  // Tab stays inside the open sheet (wallet and sign-in dialogs that open above it are left alone).
  addEventListener('keydown', e => {
    if (e.key !== 'Tab' || !sheetOpen() || doc.querySelector('dialog[open], [role="dialog"]:not(#qxt-ticket)')) return;
    const f = [...ticket.querySelectorAll('button, [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])')].filter(n => !n.disabled && n.getClientRects().length);
    if (!f.length) return; const first = f[0], last = f[f.length - 1], at = doc.activeElement;
    if (!ticket.contains(at) || at === ticket) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
    else if (e.shiftKey && at === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
  }, true);
  // "Skip to trading" reaches the ticket on a phone too.
  doc.querySelector('.skip-link')?.addEventListener('click', e => { if (phone.matches && marketOpen()) { e.preventDefault(); openSheet(); } });
  addEventListener('keydown', e => { if (e.key === 'Escape' && sheetOpen() && !innerOverlay(e)) { e.stopImmediatePropagation(); e.preventDefault(); closeSheet(); } }, true);
  phone.addEventListener('change', closeSheet);
  doc.body.append(backdrop, bar);
  new MutationObserver(() => { if (sheetOpen() && !ticket.contains(closeX)) ticket.append(closeX); if (!ticket.contains(noteTicket)) syncPoolNote($('qxt-symbol')?.textContent.trim() || ''); }).observe(ticket, { childList: true });
  if (limit) { const syncLimit = () => { bLimit.hidden = limit.hidden; }; new MutationObserver(syncLimit).observe(limit, { attributes: true, attributeFilter: ['hidden'] }); syncLimit(); }
  let wasOpen = marketOpen();
  new MutationObserver(() => { const open = marketOpen(); if (!open) { closeSheet(); setInfo(false); } else if (!wasOpen && phone.matches && scrollY < 4) toToken(); wasOpen = open; }).observe(main, { attributes: true, attributeFilter: ['class'] });

  // The terminal scrolls to a few of its own parts. With the new layout those parts are a sheet, a tab or the top of
  // the page. qx-terminal-v2-plan.mjs names exactly which calls are handled here; every other call on the page goes
  // straight to the browser's own scrollIntoView.
  Element.prototype.scrollIntoView = function (...args) {
    let plan = 'native';
    try {
      const isPhone = phone.matches, inMain = main.contains(this), rail = isPhone && inMain ? this.closest('.qxt-list') : null;
      plan = scrollPlan({
        phone: isPhone, marketOpen: marketOpen(), inMain, id: this.id, inTicket: ticket.contains(this), isRailRow: !!rail,
        railOnScreen: !!rail && (r => r.bottom > 0 && r.top < innerHeight)(rail.getBoundingClientRect()),
        hasBox: this.getClientRects().length > 0,
        inInfoGroup: !!this.closest('#qxt-head, #qxt-token-profile, .qxt-workspace-context, .qxt-side') && !this.closest('#qxt-ticket, [hidden]'),
        infoOpen: main.classList.contains('qv2-info'), sheetOpen: sheetOpen(),
      });
    } catch { plan = 'native'; }
    if (plan === 'token') { whenMarket(toToken); return; }
    if (plan === 'none') return;
    if (plan === 'sheet') { openSheet(); return; }
    if (plan === 'sheet-then-native') { openSheet(); requestAnimationFrame(() => scrollIntoView.apply(this, args)); return; }
    if (plan === 'info-then-native') setInfo(true);
    return scrollIntoView.apply(this, args);
  };

  // A link that arrives with a trade already filled in (side or amount in the address) shows the ticket at once.
  if (/[#&](side|amt|amount)=/.test(location.hash)) {
    const ready = new MutationObserver(() => { if (marketOpen()) { ready.disconnect(); openSheet(); } });
    ready.observe(main, { attributes: true, attributeFilter: ['class'] });
    if (marketOpen()) { ready.disconnect(); openSheet(); }
  }
}
