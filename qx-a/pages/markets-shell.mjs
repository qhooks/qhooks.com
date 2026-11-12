// Markets lane: one way to mount the System A shell on markets, orders, perps, copy, wallets and Elysium.
// The page's own wallet control (#qhc-trigger, bound by wallet-site.mjs) moves into the shell's wallet slot, so every
// existing connect flow keeps working. Once connected it shows the short address and turns into the quiet account button.
import { mountShell } from '/qx-a/shell.mjs';
import { setArt, ambient } from '/qx-a/components.mjs';

export function laneShell({ active = 'trade', mode = 'app', title = '', back = '/terminal', wallet, ribbon = false, art = true } = {}) {
  // Pages without a token of their own are lit by the QHooks banner (System A: the token's art is the room).
  if (art) { setArt({ blur: '/qx-a/img/qhooks-banner-blur.jpg' }); document.body.prepend(ambient()); }
  const trig = wallet === undefined ? document.getElementById('qhc-trigger') : wallet;
  if (trig?.classList) trig.classList.add('qa-btn', 'qa-btn--primary', 'qa-wallet__btn');
  const shell = mountShell({ active, mode, title, back, ribbon, logo: '/qhooks-logo.jpg', ...(trig ? { wallet: trig } : wallet === null ? { wallet: document.createTextNode('') } : {}) });
  if (trig?.classList && trig.id === 'qhc-trigger') {
    const paint = () => { const on = /^0x/i.test(trig.textContent.trim()); trig.classList.toggle('qa-btn--primary', !on); trig.classList.toggle('qa-btn--secondary', on); };
    new MutationObserver(paint).observe(trig, { childList: true, characterData: true, subtree: true });
    paint();
  }
  return shell;
}

// Keeps a [data-qa-connect] page button quiet once a wallet is connected (qx-account-wallet.mjs writes the address into it).
export function quietWhenConnected(btn) {
  if (!btn) return;
  const paint = () => { const on = /^0x/i.test(btn.textContent.trim()); btn.classList.toggle('is-connected', on); };
  new MutationObserver(paint).observe(btn, { childList: true, characterData: true, subtree: true });
  paint();
}

// Polls a JSON endpoint only while the page is visible; returns stop().
export function visiblePoll(fn, ms) {
  let t = null, dead = false;
  const run = async () => { if (dead) return; if (!document.hidden) { try { await fn(); } catch {} } t = setTimeout(run, ms); };
  const wake = () => { if (!document.hidden && !dead) { clearTimeout(t); run(); } };
  document.addEventListener('visibilitychange', wake);
  run();
  return () => { dead = true; clearTimeout(t); document.removeEventListener('visibilitychange', wake); };
}
