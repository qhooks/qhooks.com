// QHooks terminal layout helpers (System A, 2026-11-11). Presentation only: this file reads what the terminal has
// already rendered and never touches data, quotes, wallets or transactions.
//  1. Phone: the existing ticket opens as a bottom sheet (System A sheet). qx-a/pages/token-terminal.mjs draws the
//     Buy | Sell dock and calls window.qxSheet.open(side).
//  2. Official pool: one quiet linked line under the trade action.
//  3. The terminal's own scrolls to its parts land on the sheet or the top of the token page (qx-terminal-v2-plan.mjs).
import { scrollPlan } from '/qx-terminal-v2-plan.mjs';
const doc = document, root = doc.documentElement;
const $ = id => doc.getElementById(id);
const main = $('qxt-main'), ticket = $('qxt-ticket');
const phone = matchMedia('(max-width:1099px)');
const el = (tag, props = {}, ...kids) => { const n = doc.createElement(tag); for (const [k, v] of Object.entries(props)) { if (k === 'class') n.className = v; else if (k === 'hidden') n.hidden = !!v; else n.setAttribute(k, v); } n.append(...kids); return n; };
const marketOpen = () => !!main?.classList.contains('has-market');

if (main && ticket) {
  // ---- official pool: one quiet linked line (Randall, 2026-11-11: "quiet line but also 'for best routes'") ----
  const note = el('p', { class: 'qv2-poolnote', hidden: true }, el('a', { href: '/lp-proof' }));
  function syncPoolNote() {
    const sym = $('qxt-symbol')?.textContent.trim() || '';
    const box = $('qxt-pool-warning'), official = !!$('qxt-official')?.querySelector('.qxo-official');
    const on = marketOpen() && !!sym && (official || (!!box && !box.hidden));
    if (note.hidden !== !on) note.hidden = !on;
    const t = 'For the best route, trade ' + sym + ' on qhooks.com or the official pool →';
    if (on && note.firstChild.textContent !== t) note.firstChild.textContent = t;
    const after = ticket.querySelector(':scope > .qxt-followup') || ticket.querySelector(':scope > .qxt-go');
    if (after && note.previousElementSibling !== after) after.after(note);
  }
  new MutationObserver(syncPoolNote).observe($('qxt-head'), { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });

  // ---- 1. phone: the ticket as a bottom sheet ----
  const scrollIntoView = Element.prototype.scrollIntoView;
  const toToken = () => scrollTo({ top: 0 });
  const whenMarket = fn => { if (marketOpen()) { fn(); return; } let n = 0; const tick = () => { if (marketOpen()) fn(); else if (++n < 180) requestAnimationFrame(tick); }; requestAnimationFrame(tick); };
  const sideButton = side => ticket.querySelector('.qxt-side-toggle [data-side="' + side + '"]');
  const closeX = el('button', { type: 'button', class: 'qv2-sheet-x', 'aria-label': 'Close trade ticket' }, '×');
  const grip = el('span', { class: 'qa-sheet__grip qv2-grip', 'aria-hidden': 'true' });
  const backdrop = el('button', { type: 'button', class: 'qv2-backdrop', 'aria-label': 'Close trade ticket', tabindex: '-1' });
  let opener = null;
  const sheetOpen = () => root.classList.contains('qv2-sheet');
  function openSheet(side) {
    if (!phone.matches || !marketOpen()) return;
    const b = side && sideButton(side);
    if (b && b.getAttribute('aria-pressed') !== 'true') b.click();
    if (!ticket.contains(closeX)) ticket.append(closeX);
    if (ticket.firstChild !== grip) ticket.prepend(grip);
    if (sheetOpen()) return;
    opener = doc.activeElement; root.classList.add('qv2-sheet');
    ticket.setAttribute('role', 'dialog'); ticket.setAttribute('aria-modal', 'true'); ticket.setAttribute('aria-label', 'Trade'); ticket.tabIndex = -1;
    ticket.focus({ preventScroll: true });
    dispatchEvent(new CustomEvent('qx:sheet', { detail: { open: true } }));
  }
  function closeSheet() {
    if (!sheetOpen()) return;
    root.classList.remove('qv2-sheet');
    for (const a of ['role', 'aria-modal', 'aria-label', 'tabindex']) ticket.removeAttribute(a);
    if (opener && doc.contains(opener)) opener.focus({ preventScroll: true });
    opener = null;
    dispatchEvent(new CustomEvent('qx:sheet', { detail: { open: false } }));
  }
  window.qxSheet = { open: openSheet, close: closeSheet, isOpen: sheetOpen };
  closeX.addEventListener('click', closeSheet);
  backdrop.addEventListener('click', closeSheet);
  // Escape closes the sheet first; the terminal's own Escape (back to the token list) only runs when no sheet is open.
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
  doc.body.append(backdrop);
  new MutationObserver(() => { if (sheetOpen() && !ticket.contains(closeX)) ticket.append(closeX); if (!ticket.contains(note)) syncPoolNote(); }).observe(ticket, { childList: true });
  let wasOpen = marketOpen();
  new MutationObserver(() => { const open = marketOpen(); if (!open) closeSheet(); else if (!wasOpen && phone.matches && scrollY < 4) toToken(); wasOpen = open; syncPoolNote(); }).observe(main, { attributes: true, attributeFilter: ['class'] });
  syncPoolNote();

  // The terminal scrolls to a few of its own parts. On a phone the ticket is a sheet and the token page starts at the top;
  // qx-terminal-v2-plan.mjs names exactly which calls are handled here, every other call goes to the browser.
  Element.prototype.scrollIntoView = function (...args) {
    let plan = 'native';
    try {
      const isPhone = phone.matches, inMain = main.contains(this), rail = isPhone && inMain ? this.closest('.qxt-list') : null;
      plan = scrollPlan({
        phone: isPhone, marketOpen: marketOpen(), inMain, id: this.id, inTicket: ticket.contains(this), isRailRow: !!rail,
        railOnScreen: !!rail && (r => r.bottom > 0 && r.top < innerHeight)(rail.getBoundingClientRect()),
        hasBox: this.getClientRects().length > 0, inInfoGroup: false, infoOpen: false, sheetOpen: sheetOpen(),
      });
    } catch { plan = 'native'; }
    if (plan === 'token') { whenMarket(toToken); return; }
    if (plan === 'none') return;
    if (plan === 'sheet') { openSheet(); return; }
    if (plan === 'sheet-then-native') { openSheet(); requestAnimationFrame(() => scrollIntoView.apply(this, args)); return; }
    return scrollIntoView.apply(this, args);
  };

  // A link that arrives with a trade already filled in (side or amount in the address) shows the ticket at once.
  if (/[#&](side|amt|amount)=/.test(location.hash)) {
    const ready = new MutationObserver(() => { if (marketOpen()) { ready.disconnect(); openSheet(); } });
    ready.observe(main, { attributes: true, attributeFilter: ['class'] });
    if (marketOpen()) { ready.disconnect(); openSheet(); }
  }
}
