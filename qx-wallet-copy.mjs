// Copy the connected wallet's address from anywhere it shows (Randall, 2026-11-04: "would be nice to easily copy my
// wallet address"). Reads the shared wallet hub, so Privy email/Google wallets, browser wallets and WalletConnect all
// work the same. Adds, without touching the wallet code:
//  - the wallet dialog (every page, terminal included): Copy address + View on explorer for the current chain;
//  - the header button, the terminal's button and My QHooks' wallet button: full address on hover, copy on long-press;
//  - the terminal's wallet menu: a Copy address item; My QHooks: a Copy address button beside the wallet button.
import { getWalletHub } from '/wallet-hub.mjs';
import '/qx-account-menu.mjs';
import { chainMap } from '/chains.mjs';

const EXPLORER = chainMap(c => c.explorer); // chains.mjs registry
const hub = getWalletHub(window);
let cur = null; // { owner, chainId }

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  try { // Older webviews (some in-app browsers) without the async clipboard API.
    const t = Object.assign(document.createElement('textarea'), { value: text, readOnly: true });
    t.style.cssText = 'position:fixed;top:-100px;opacity:0'; document.body.append(t); t.select();
    const ok = document.execCommand('copy'); t.remove(); return ok;
  } catch { return false; }
}
let toastTimer = 0;
function toast(text) {
  let el = document.getElementById('qwc-toast');
  if (!el) { el = Object.assign(document.createElement('div'), { id: 'qwc-toast', className: 'qwc-toast' }); el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); document.body.append(el); }
  el.textContent = text; el.classList.add('is-on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('is-on'), 1800);
}
const short = a => a.slice(0, 6) + '…' + a.slice(-4);
async function copyAddress(btn) {
  if (!cur) return;
  const ok = await copyText(cur.owner);
  if (btn) { const t = btn.dataset.label || btn.textContent; btn.dataset.label = t; btn.textContent = ok ? 'Copied' : 'Copy failed'; btn.classList.toggle('is-done', ok); setTimeout(() => { btn.textContent = t; btn.classList.remove('is-done'); }, 1400); }
  toast(ok ? 'Address copied · ' + short(cur.owner) : 'Could not copy. Select the address in the wallet panel.');
}
const explorerUrl = () => cur && EXPLORER[String(cur.chainId)] ? EXPLORER[String(cur.chainId)] + '/address/' + cur.owner : null;
function actions(cls) {
  const wrap = Object.assign(document.createElement('div'), { className: 'qwc-actions ' + cls });
  const b = Object.assign(document.createElement('button'), { type: 'button', className: 'qwc-copy', textContent: 'Copy address' });
  b.addEventListener('click', e => { e.preventDefault(); copyAddress(b); });
  const a = Object.assign(document.createElement('a'), { className: 'qwc-explorer', target: '_blank', rel: 'noopener noreferrer', textContent: 'View on explorer ↗' });
  wrap.append(b, a); return wrap;
}
function syncActions(wrap) {
  const url = explorerUrl(), a = wrap.querySelector('.qwc-explorer');
  wrap.hidden = !cur; if (url) { a.href = url; a.hidden = false; } else a.hidden = true;
}

// Long-press (touch) copies; the click that follows the press is swallowed so it doesn't also open a panel.
const pressed = new WeakSet();
function longPress(el) {
  if (!el || pressed.has(el)) return; pressed.add(el);
  let timer = 0, fired = false;
  el.addEventListener('touchstart', () => { fired = false; clearTimeout(timer); timer = setTimeout(() => { if (cur) { fired = true; copyAddress(null); navigator.vibrate?.(15); } }, 550); }, { passive: true });
  for (const ev of ['touchend', 'touchmove', 'touchcancel']) el.addEventListener(ev, () => clearTimeout(timer), { passive: true });
  el.addEventListener('click', e => { if (fired) { fired = false; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  el.addEventListener('contextmenu', e => { if (fired) e.preventDefault(); });
}
function hoverTitle(el) {
  if (!el) return;
  if (cur) el.title = cur.owner + ' · click for wallet details' + (matchMedia('(pointer:coarse)').matches ? ', long-press to copy' : '');
  else el.removeAttribute('title');
}

function render() {
  // The wallet dialog, under the full address.
  const addr = document.getElementById('qhc-address');
  if (addr) {
    let wrap = addr.parentElement.querySelector('.qwc-dialog');
    if (!wrap) { wrap = actions('qwc-dialog'); addr.after(wrap); }
    syncActions(wrap);
  }
  // Header button (site pages), terminal button, My QHooks buttons.
  for (const el of [document.getElementById('qhc-trigger'), document.getElementById('qxt-connect'), ...document.querySelectorAll('[data-qa-connect]')]) { hoverTitle(el); longPress(el); }
  // My QHooks: a visible Copy address beside the hero wallet button.
  const heroBtn = document.querySelector('.qa-hero [data-qa-connect]');
  if (heroBtn) {
    let group = heroBtn.closest('.qwc-group');
    if (!group) { group = Object.assign(document.createElement('div'), { className: 'qwc-group' }); heroBtn.before(group); group.append(heroBtn); }
    let b = group.querySelector('.qwc-inline');
    if (!b) { b = Object.assign(document.createElement('button'), { type: 'button', className: 'qa-btn qwc-inline', textContent: 'Copy address' }); b.addEventListener('click', () => copyAddress(b)); group.append(b); }
    b.hidden = !cur;
  }
}

// Terminal: its wallet menu is rebuilt on every open; add Copy address (and the explorer link) at the top.
const menu = document.getElementById('qxt-wallets');
if (menu) new MutationObserver(() => {
  if (!cur || menu.hidden || menu.querySelector('.qwc-copy')) return;
  const b = Object.assign(document.createElement('button'), { type: 'button', className: 'qwc-copy', textContent: 'Copy address' });
  b.addEventListener('click', () => { copyAddress(b); });
  const url = explorerUrl(); const items = [b];
  if (url) { const a = Object.assign(document.createElement('a'), { className: 'qwc-menu-link', href: url, target: '_blank', rel: 'noopener noreferrer', textContent: 'View on explorer ↗' }); items.push(a); }
  menu.prepend(...items);
}).observe(menu, { childList: true, attributes: true, attributeFilter: ['hidden'] });

hub.subscribe(s => { const c = s.current; cur = c ? { owner: c.owner, chainId: c.chainId } : null; render(); });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render, { once: true }); else render();
