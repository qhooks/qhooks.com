// The board sign-in for other pages (e.g. a watchlist): one free EIP-191 signature opens a 7-day session for the connected wallet.
// The session lives in this browser (localStorage) and counts only while the same wallet is connected. Send it as
// `Authorization: Bearer <token>` (authHeaders()); the worker checks it with sessionWallet() from src/community.mjs. No cookies, so no CSRF.
import { connectedAddress, signMessage } from '/qx-chain.mjs';
const KEY = 'qhooks:board-session:v1';
/** {token, wallet, expiresAt} for the connected wallet, or null. */
export function boardSession() {
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && s.expiresAt > Date.now() && s.wallet === connectedAddress()) return s; } catch {}
  return null;
}
export const authHeaders = () => { const s = boardSession(); return s ? { authorization: 'Bearer ' + s.token } : {}; };
/** Signs in the connected wallet (one free signature). Throws when no wallet is connected or the signature is refused. */
export async function signIn() {
  const wallet = connectedAddress(); if (!wallet) throw new Error('Connect a wallet first');
  const post = (path, body) => fetch('/api/community' + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'sign_in_failed'); return j; });
  const { message } = await post('/session/message', { wallet });
  const s = await post('/session', { message, signature: await signMessage(message) });
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
  return s;
}
export function signOut() { const s = boardSession(); try { localStorage.removeItem(KEY); } catch {} if (s) fetch('/api/community/session', { method: 'DELETE', headers: { authorization: 'Bearer ' + s.token } }).catch(() => {}); }
