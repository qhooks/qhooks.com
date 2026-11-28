// Quick-launch "Collect fees" on the token page (2026-11-28). Shown under the stats row only when the connected
// wallet is the launch's creator or payout; one collect(key) transaction through the page's own wallet (QHSign.evm).
// Additive: one token read per quick-launch-capable token page, nothing else on the page changes.
import {findLaunch, mountCollect, supported, canCollect} from '/qx-simple-collect.mjs';

const found = new Map(); let current = null, busy = false, redraw = null;
const route = () => { const m = /^#\/token\/(\d+)\/(0x[0-9a-fA-F]{40})/.exec(location.hash || ''); return m ? {chainId: m[1], token: m[2].toLowerCase()} : null; };
const wallet = () => { try { return window.QHWallet?.current?.() || null; } catch { return null; } };
const io = chainId => ({
  address: () => wallet()?.address || null,
  onChange: cb => { redraw = cb; },
  send: async (tx, onStatus) => {
    const w = wallet(); if (!w?.provider || !w.address) throw Error('Connect your wallet first');
    const r = await window.QHSign.evm({provider: w.provider, from: w.address, chainId, txs: [tx], on: (step) => onStatus(step === 'sign' || step === 'switch' ? 'Confirm in your wallet…' : step === 'sent' ? 'Confirming on chain…' : '')});
    const rc = r?.receipts?.[0]; if (rc && (rc.status === '0x0' || rc.status === 0)) throw Error('Collect did not go through.');
    return r;
  },
});
function place(r, launch) {
  const anchor = document.querySelector('.token-stats-row'); if (!anchor) return;
  let box = document.getElementById('qsc-token');
  if (box && box.dataset.key === r.chainId + ':' + r.token && box.isConnected && box.previousElementSibling === anchor) return;
  box?.remove();
  box = document.createElement('section'); box.id = 'qsc-token'; box.className = 'qsc'; box.dataset.key = r.chainId + ':' + r.token; box.hidden = true;
  box.style.cssText = 'padding:14px 16px;border:1px solid var(--line,rgba(255,255,255,.12));margin:10px 0';
  anchor.insertAdjacentElement('afterend', box);
  mountCollect(box, launch, io(r.chainId));
}
async function check() {
  const r = route(); if (!r || !supported(r.chainId)) { document.getElementById('qsc-token')?.remove(); return; }
  const k = r.chainId + ':' + r.token; current = k;
  if (found.has(k)) { const L = found.get(k); if (L && canCollect(L, wallet()?.address)) place(r, L); else document.getElementById('qsc-token')?.remove(); return; }
  if (busy) return; busy = true;
  try {
    const body = await fetch('/api/terminal/x/token/' + r.chainId + '/' + r.token, {headers: {accept: 'application/json'}}).then(x => x.ok ? x.json() : null).catch(() => null);
    const L = await findLaunch(r.chainId, r.token, {pools: body?.pools?.length ? body.pools : []}).catch(() => null);
    found.set(k, L);
    if (current === k && L && canCollect(L, wallet()?.address)) place(r, L);
  } finally { busy = false; }
}
let t = null;
new MutationObserver(() => { if (t) return; t = setTimeout(() => { t = null; check(); }, 300); }).observe(document.documentElement, {childList: true, subtree: true});
addEventListener('hashchange', check);
const hook = () => { if (window.QHWallet?.on) { window.QHWallet.on(() => { redraw?.(); check(); }); return true; } return false; };
if (!hook()) addEventListener('load', hook, {once: true});
check();
