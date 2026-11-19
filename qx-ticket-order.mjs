// G3 (2026-11-18, GMGN/Axiom-style ticket): Buy|Sell with its presets and the holding/available line sit at the very
// top of the trade ticket, and the QProof summary moves below the trade controls (the page's QProof chip still opens the
// full sheet). Only the order of nodes the ticket already rendered changes: same elements, same listeners, same quote,
// amounts, signer and submit path. Idempotent (no move when already in place), so a MutationObserver may call it freely.
const direct = (card, cls) => [...(card?.children || [])].find(n => String(n.className || '').split(/\s+/).includes(cls)) || null;
export function orderTicketTop(card) {
  if (!card) return 0;
  const toggle = direct(card, 'qxt-side-toggle'), presets = direct(card, 'qxt-presets');
  if (!toggle || !presets) return 0;
  let moved = 0, at = toggle;
  for (const n of [presets, direct(card, 'qxt-avail'), direct(card, 'qxt-avail-more')].filter(Boolean)) {
    const kids = [...card.children];
    if (kids[kids.indexOf(at) + 1] !== n) { at.after(n); moved++; }
    at = n;
  }
  const proof = direct(card, 'qxt-qproof-summary');
  if (proof) { const kids = [...card.children]; if (kids.at(-1) !== proof) { card.append(proof); moved++; } }
  return moved;
}
// G3b: the desktop trade column scrolls inside itself, and opens at its top with the ticket first. Cards that mount or
// grow after load (position, alerts, tape) must not move it: scroll anchoring is off in CSS (overflow-anchor:none), and
// until the person scrolls or steps through the column themselves (wheel, touch, pointer on the scrollbar, a key), any
// non-zero scrollTop is put back to 0. After that first interaction the column is theirs and this stops listening.
export function pinColumnTop(column, {maxMs = 20000, schedule = setTimeout, observe = (el, fn) => { const o = new MutationObserver(fn); o.observe(el, {childList: true, subtree: true}); return () => o.disconnect(); }} = {}) {
  if (!column) return () => {};
  let done = false;
  const keep = () => { if (!done && column.scrollTop !== 0) column.scrollTop = 0; };
  const events = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
  const stopObserving = observe(column, keep);
  const release = () => { if (done) return; done = true; stopObserving?.(); column.removeEventListener('scroll', keep); for (const e of events) column.removeEventListener(e, release); };
  for (const e of events) column.addEventListener(e, release, {passive: true});
  column.addEventListener('scroll', keep, {passive: true});
  keep();
  // Load settles well inside this window; after it nothing more is watched, interaction or not.
  schedule(release, maxMs);
  return release;
}
