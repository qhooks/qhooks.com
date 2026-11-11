import {connectSol} from './qx-solana.mjs';

// One connection attempt per published wallet/account, including while the connection is pending.
// Privy publishes public metadata only; the Wallet Standard wallet keeps its provider and signing permissions.
export function createSolanaPrivyHandoff({connect = connectSol, onError = () => {}} = {}) {
  let key = null, pending = null, dead = false;
  return Object.freeze({
    update(state) {
      if (dead) return Promise.resolve(null);
      const wallet = state?.solanaWallet;
      if (!wallet?.name || !wallet?.address) { key = null; pending = null; return Promise.resolve(null); }
      const next = JSON.stringify([wallet.name, wallet.address]);
      if (key === next) return pending;
      key = next;
      pending = Promise.resolve().then(() => dead || key !== next ? null : connect(wallet.name, {silent: true, address: wallet.address}))
        .catch(error => { if (!dead && key === next) onError(error); return null; });
      return pending;
    },
    dispose() { dead = true; key = null; pending = null; }
  });
}
