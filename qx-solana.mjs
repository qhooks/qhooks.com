// Solana wallets for the terminal, through the Wallet Standard (Phantom, Solflare, Backpack and others register
// themselves; no wallet library needed). Only what trading needs: list, connect (silently when remembered), the address,
// and signing a Jupiter transaction.
const wallets = new Set(), listeners = new Set();
let current = null; // { wallet, account }
const KEY = 'qhooks:sol-wallet';
const usable = w => w.chains?.some(c => c.startsWith('solana:')) && w.features?.['standard:connect'] && w.features?.['solana:signTransaction'];
const notify = () => listeners.forEach(f => { try { f(); } catch {} });
function register(...ws) { for (const w of ws) if (usable(w)) wallets.add(w); notify(); restore(); return () => { ws.forEach(w => wallets.delete(w)); notify(); }; }
window.addEventListener('wallet-standard:register-wallet', e => { try { e.detail?.({ register }); } catch {} });
try { window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: { register } })); } catch {}

export const solWallets = () => [...wallets].map(w => ({ name: w.name, icon: w.icon }));
export const solAddress = () => current?.account?.address || null;
export function onSolChange(f) { listeners.add(f); return () => listeners.delete(f); }

let restoring = false;
async function restore() {
  if (current || restoring) return;
  let name = null; try { name = localStorage.getItem(KEY); } catch {}
  const w = name && [...wallets].find(x => x.name === name); if (!w) return;
  restoring = true;
  try { const r = await w.features['standard:connect'].connect({ silent: true }); if (r?.accounts?.[0]) { current = { wallet: w, account: r.accounts[0] }; notify(); } } catch {}
  restoring = false;
}

export async function connectSol(name) {
  const w = [...wallets].find(x => x.name === name) || [...wallets][0];
  if (!w) throw new Error('No Solana wallet found. Install Phantom, Solflare or Backpack.');
  const r = await w.features['standard:connect'].connect();
  const account = r?.accounts?.[0]; if (!account) throw new Error('The wallet did not share an account');
  current = { wallet: w, account }; try { localStorage.setItem(KEY, w.name); } catch {}
  notify(); return account.address;
}
export async function disconnectSol() {
  try { await current?.wallet.features['standard:disconnect']?.disconnect(); } catch {}
  current = null; try { localStorage.removeItem(KEY); } catch {} notify();
}

const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const toB64 = b => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
/// Signs a base64 transaction (Jupiter's order) with the connected wallet and returns it signed, base64.
export async function signSol(base64) {
  if (!current) throw new Error('Connect a Solana wallet first');
  const [out] = await current.wallet.features['solana:signTransaction'].signTransaction({ account: current.account, transaction: fromB64(base64), chain: 'solana:mainnet' });
  if (!out?.signedTransaction) throw new Error('The wallet did not sign');
  return toB64(out.signedTransaction);
}
