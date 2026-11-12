import {allowedPool, mountFeeShare, createFeeShareIO, renderNoLaunch} from '/qx-fee-share.mjs';
if (!allowedPool(window.location.search)) renderNoLaunch(document);
else Promise.all([import('/wallet-hub-fresh.mjs'), import('/qx-taps.mjs')]).then(([wallet, reads]) => {
  mountFeeShare({document, search: window.location.search, hub: wallet.getWalletHub(window), io: createFeeShareIO(reads.createReadClient())});
}).catch(() => { document.getElementById('qfs-root').textContent = 'Could not load setup. Reload to try again.'; });
