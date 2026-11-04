// My QHooks and the creator dashboard: the site's shared wallet hub writes the connected address into #qt-connection,
// which every shared launch panel reads (qx-chain connectedAddress). A wallet switching networks for a claim is
// rejoined instead of being shown as disconnected (as the terminal does).
import { CHAIN_NAME } from '/qx-chain.mjs';
import { getWalletHub } from '/wallet-hub.mjs';

const hub = getWalletHub(window);
const line = document.getElementById('qt-connection');
const buttons = () => [...document.querySelectorAll('[data-qa-connect]')];
const short = a => a.slice(0, 6) + '…' + a.slice(-4);
let key = '', uuid = null, rejoinUntil = 0, rejoining = false;
window.addEventListener('qhooks:chain-switch', () => { rejoinUntil = Date.now() + 20000; });
function show(c) {
  const k = c ? c.owner.toLowerCase() + '@' + c.chainId : '';
  if (k === key) return;
  key = k;
  line.textContent = c ? (CHAIN_NAME[c.chainId] || 'EVM') + ' · ' + c.owner.toLowerCase() : '';
  for (const b of buttons()) b.textContent = c ? short(c.owner) : 'Connect wallet';
}
hub.subscribe(s => {
  const c = s.current;
  if (c) { uuid = c.entry.uuid; show(c); return; }
  if (rejoining) return;
  if (uuid && Date.now() < rejoinUntil) {
    rejoining = true;
    setTimeout(async () => { try { if (!hub.snapshot().current) await hub.connect(uuid); } catch {} rejoining = false; if (!hub.snapshot().current) show(null); }, 400);
    return;
  }
  show(null);
});
document.addEventListener('click', e => { if (e.target.closest('[data-qa-connect]')) hub.open(); });
export const openWallet = () => hub.open();
