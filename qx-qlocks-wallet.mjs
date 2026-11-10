// /qlocks and /qlocks-setup: keep #qt-connection in sync with the site's wallet hub (header "Connect wallet":
// browser wallets, QHooks email wallet, WalletConnect phone wallets, MetaMask Mobile), as My QHooks and Trade do.
// The shared qx-chain.mjs reads the address from that line (connectedAddress, onWalletChange) and sends through
// whichever EIP-6963 provider holds that address; every connect re-asks providers to announce, so send() also
// finds the email and phone wallets, which announce themselves only once signed in.
// Load before the page's own module.
import { CHAIN_NAME } from '/qx-chain.mjs';
import { getWalletHub } from '/wallet-hub.mjs';

const hub = getWalletHub(window);
const line = document.getElementById('qt-connection');
let key = '', uuid = null, rejoinUntil = 0, rejoining = false;
window.addEventListener('qhooks:chain-switch', () => { rejoinUntil = Date.now() + 20000; });
function show(c) {
  const k = c ? c.owner.toLowerCase() + '@' + c.chainId : '';
  if (k === key || !line) return;
  key = k;
  if (c) window.dispatchEvent(new Event('eip6963:requestProvider'));
  line.textContent = c ? (CHAIN_NAME[c.chainId] || 'EVM') + ' · ' + c.owner.toLowerCase() : '';
}
hub.subscribe(s => {
  const c = s.current;
  if (c) { uuid = c.entry.uuid; show(c); return; }
  if (rejoining) return;
  // A wallet switching networks for a send reconnects as a new session; rejoin it instead of showing it disconnected.
  if (uuid && Date.now() < rejoinUntil) {
    rejoining = true;
    setTimeout(async () => { try { if (!hub.snapshot().current) await hub.connect(uuid); } catch {} rejoining = false; if (!hub.snapshot().current) show(null); }, 400);
    return;
  }
  show(null);
});
/// Opens the site's wallet dialog (the same one as the header button).
export const openWallet = () => hub.open();
