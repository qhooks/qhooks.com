// Wallet confirms always sit on top (Randall, 2026-11-07 and 2026-11-10: "the confirm transaction was under the wallet + bridge popover").
// Our wallet menu and the move/bridge dialog open with showModal(), which puts them in the browser's top layer: above
// every z-index, and the rest of the page goes inert. The email wallet's confirm (Privy) is an ordinary fixed overlay,
// so an open modal dialog covered it and the press sat waiting. While a Privy dialog is on screen:
//  - the wallet menu (#qhc-dialog) closes;
//  - any other modal dialog (move funds, etc.) steps down to a plain dialog under the confirm, keeping its progress,
//    and goes back to modal once the confirm is gone.
// Dialogs that step down carry data-qx-under while it lasts; their own 'close' handlers skip clean-up while it is set.
const PRIVY = ['privy-dialog', 'privy-dialog-backdrop', 'privy-modal-content'];
const under = new Set();
let started = false;
// confirmhold (2026-11-12): while a signing request to the email/Google wallet is pending, the confirm counts as shown
// even before (or without) Privy's markup being recognised. The wallet menu then steps down too instead of closing,
// so a Send/Unwrap panel keeps its place under the confirm.
let held = 0;
export async function whileWalletConfirms(run) {
  held++; syncConfirmTop();
  try { return await run(); }
  finally { held = Math.max(0, held - 1); setTimeout(() => syncConfirmTop(), 0); }
}
if (typeof globalThis !== 'undefined') globalThis.qhooksConfirmTop = Object.freeze({ hold: whileWalletConfirms });

// Privy's confirm is a Headless UI dialog in a portal at the end of <body> (not a top-layer <dialog>): match its ids, or any
// Headless UI portal dialog in case the ids change.
function confirmShown(d) {
  if (PRIVY.some(id => { const e = d.getElementById(id); return !!e && e.getClientRects().length > 0; })) return true;
  for (const e of d.querySelectorAll('[data-headlessui-portal] [role="dialog"]')) if (e.getClientRects().length > 0) return true;
  return false;
}
function keepFlagUntilClosed(dialog) {
  // The 'close' event fires after this task; listeners added earlier (the dialog's own) still see the flag.
  dialog.addEventListener('close', () => { if (!under.has(dialog)) delete dialog.dataset.qxUnder; }, {once: true});
}
export function syncConfirmTop(d = globalThis.document) {
  if (!d) return;
  if (held > 0 || confirmShown(d)) {
    for (const dialog of d.querySelectorAll('dialog[open]')) {
      let modal = false; try { modal = dialog.matches(':modal'); } catch {}
      if (!modal) continue;
      if (dialog.id === 'qhc-dialog' && !held) { dialog.close(); continue; }
      dialog.dataset.qxUnder = '1'; under.add(dialog);
      dialog.close(); dialog.show();
    }
  } else if (under.size) {
    for (const dialog of [...under]) {
      under.delete(dialog);
      if (dialog.open && dialog.isConnected) { dialog.close(); dialog.showModal(); keepFlagUntilClosed(dialog); }
      else delete dialog.dataset.qxUnder;
    }
  }
}
export function startConfirmTop(d = document) {
  if (started || !d?.body || typeof MutationObserver === 'undefined') return;
  started = true;
  let queued = false;
  new MutationObserver(() => {
    if (queued) return; queued = true;
    queueMicrotask(() => { queued = false; syncConfirmTop(d); });
  }).observe(d.body, {childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'open', 'hidden']});
  const css = d.createElement('style'); css.id = 'qx-confirm-top-style';
  // Just above our own UI (qx-site.css tops out at 1000) and below Privy's confirm layer (z-index 999999). It was 2147483000,
  // which put the stepped-down sheet over Privy's approve button on desktop (Randall, 2026-11-10).
  css.textContent = 'dialog[data-qx-under][open]{position:fixed;inset:0;margin:auto;z-index:1001}';
  d.head.append(css);
}
if (typeof document !== 'undefined') {
  if (document.body) startConfirmTop(document); else document.addEventListener('DOMContentLoaded', () => startConfirmTop(document), {once: true});
}
