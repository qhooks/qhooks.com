// Solana wallets for the terminal, through the Wallet Standard (Phantom, Solflare, Backpack and others register
// themselves; no wallet library needed). Only what trading needs: list, connect (silently when remembered), the address,
// and signing a Jupiter transaction.
import {base58Encode} from './qx-solana-identity.mjs';
const wallets = new Set(), listeners = new Set();
let current = null; // { wallet, account }
let restoring = false;
let selection = 0;
const KEY = 'qhooks:sol-wallet';
const usable = w => w.chains?.some(c => c.startsWith('solana:')) && w.features?.['standard:connect'] && (w.features?.['solana:signTransaction'] || w.features?.['solana:signAndSendTransaction']);
const notify = () => listeners.forEach(f => { try { f(); } catch {} });
function register(...ws) { for (const w of ws) if (usable(w)) wallets.add(w); notify(); restore(); return () => { ws.forEach(w => wallets.delete(w)); notify(); }; }
if (typeof window !== 'undefined') {
  window.addEventListener('wallet-standard:register-wallet', e => { try { e.detail?.({ register }); } catch {} });
  try { window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: { register } })); } catch {}
}

export const solWallets = () => [...wallets].map(w => ({ name: w.name, icon: w.icon }));
export const solAddress = () => current?.account?.address || null;
export function onSolChange(f) { listeners.add(f); return () => listeners.delete(f); }

async function restore() {
  if (current || restoring) return;
  let name = null; try { name = localStorage.getItem(KEY); } catch {}
  const w = name && [...wallets].find(x => x.name === name); if (!w) return;
  restoring = true; const version = selection;
  try { const r = await w.features['standard:connect'].connect({ silent: true }); if (version === selection && r?.accounts?.[0]) { current = { wallet: w, account: r.accounts[0] }; notify(); } } catch {}
  restoring = false;
}

export async function connectSol(name, {silent = false, address = null} = {}) {
  // A sign-in handoff must use the named wallet and exact account; ordinary manual connections keep their defaults.
  const w = [...wallets].find(x => x.name === name) || (!address && [...wallets][0]);
  if (!w) throw new Error('No Solana wallet found. Install Phantom, Solflare or Backpack.');
  const version = ++selection;
  const stillSelected = () => { if (version !== selection) throw new Error('The wallet connection changed. Choose your Solana wallet again.'); };
  if (silent && current?.wallet === w && (!address || current.account.address === address)) return current.account.address;
  const pick = r => address ? r?.accounts?.find(a => a.address === address) : r?.accounts?.[0];
  let account;
  if (silent) { try { account = pick(await w.features['standard:connect'].connect({silent: true})); } catch {} }
  stillSelected();
  if (!account) account = pick(await w.features['standard:connect'].connect());
  stillSelected();
  if (!account) throw new Error(address ? 'Choose the Solana account you signed in with.' : 'The wallet did not share an account');
  current = { wallet: w, account }; try { localStorage.setItem(KEY, w.name); } catch {}
  notify(); return account.address;
}
export async function disconnectSol() {
  selection++;
  try { await current?.wallet.features['standard:disconnect']?.disconnect(); } catch {}
  current = null; try { localStorage.removeItem(KEY); } catch {} notify();
}

const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const toB64 = b => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
const supports = (session, name) => session?.wallet.features[name] && (!session.account.features || session.account.features.includes(name)) && (!session.account.chains || session.account.chains.includes('solana:mainnet'));
function walletError(error) {
  if (error?.code === 4001 || /user (?:rejected|denied)|request rejected|cancelled|canceled/i.test(error?.message || '')) return Object.assign(new Error('Wallet approval cancelled.'), {code:4001});
  return error;
}
async function signWithWallet(session, transaction) {
  if (!supports(session, 'solana:signTransaction')) throw new Error('This wallet cannot sign this transaction. Use another Solana wallet.');
  try {
    const [out] = await session.wallet.features['solana:signTransaction'].signTransaction({account:session.account, transaction, chain:'solana:mainnet'});
    if (!(out?.signedTransaction instanceof Uint8Array) || !out.signedTransaction.length) throw new Error('The wallet did not sign');
    return out.signedTransaction;
  } catch (error) { throw walletError(error); }
}
/// Signs a base64 transaction (Jupiter's order) with the connected wallet and returns it signed, base64.
export async function signSol(base64) {
  if (!current) throw new Error('Connect a Solana wallet first');
  return toB64(await signWithWallet(current, fromB64(base64)));
}

// Shared submission path. A co-signer requires wallet-first signing on the returned
// transaction; sign-and-send cannot collect another signature after broadcasting.
export async function sendSol(base64, {owner=solAddress(), coSign, send}={}) {
  const session=current;
  if (!session || session.account.address!==owner) throw new Error('The wallet changed. Review again.');
  const transaction=fromB64(base64);
  if (!coSign && supports(session, 'solana:signAndSendTransaction')) {
    let out;
    try {
      [out]=await session.wallet.features['solana:signAndSendTransaction'].signAndSendTransaction({account:session.account, transaction, chain:'solana:mainnet', options:{skipPreflight:false, preflightCommitment:'confirmed', maxRetries:2}});
    } catch (error) { throw walletError(error); }
    if (!(out?.signature instanceof Uint8Array) || out.signature.length!==64) throw new Error('The wallet did not return a transaction signature.');
    // Submission already happened: return the signature even if the user changed
    // wallets while approving, so the caller can save it and recover confirmation.
    return base58Encode(out.signature);
  }
  let signed=await signWithWallet(session, transaction);
  const checkWallet=()=>{if(current!==session || solAddress()!==owner)throw new Error('The wallet changed. Review again.');};
  checkWallet();
  if (coSign) signed=await coSign(signed);
  checkWallet();
  return send(signed);
}

/// A fresh, scoped rewards signature. It never signs a transfer or authorizes trading.
export async function signSolMessage(message) {
  const feature=current?.wallet?.features?.['solana:signMessage'];
  if(!current||!feature)throw new Error('This wallet cannot sign rewards messages. Use a Solana wallet with message signing.');
  const bytes=new TextEncoder().encode(message),[result]=await feature.signMessage({account:current.account,message:bytes});
  if(!result?.signature||result.signature.length!==64||!result.signedMessage||result.signedMessage.length!==bytes.length||result.signedMessage.some((b,i)=>b!==bytes[i]))throw new Error('The wallet did not sign the exact rewards message.');
  const chars='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let n=0n;for(const b of result.signature)n=n*256n+BigInt(b);let encoded='';while(n){encoded=chars[Number(n%58n)]+encoded;n/=58n;}let zero=0;while(zero<result.signature.length&&result.signature[zero]===0)zero++;return '1'.repeat(zero)+encoded;
}
