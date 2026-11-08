// One free EIP-191 signature opens the existing seven-day community session.
// Hub pages inject their current connection; existing Trade/Studio callers keep
// their public connection-line API. No wallet authority or permission is stored.
import {connectedAddress,signMessage,captureMessageWallet} from '/qx-chain.mjs';
const KEY='qhooks:board-session:v1';
export function createBoardSession({getConnection,fetcher=(...args)=>globalThis.fetch(...args),storage=()=>localStorage,now=Date.now}={}){
 const owner=()=>getConnection?getConnection()?.owner?.toLowerCase()||null:connectedAddress();
 function capture(){
  if(getConnection)return captureMessageWallet(getConnection);
  const wallet=owner();if(!wallet)throw Error('Connect a wallet first');
  const assertCurrent=()=>{if(owner()!==wallet)throw Error('Your wallet changed. Review and sign in again.');};
  return Object.freeze({owner:wallet,assertCurrent,check:async()=>assertCurrent(),sign:async text=>{assertCurrent();const result=await signMessage(text);assertCurrent();return result;}});
 }
 function boardSession(){try{const s=JSON.parse(storage().getItem(KEY)||'null');if(s&&s.expiresAt>now()&&s.wallet===owner())return s;}catch{}return null;}
 const authHeaders=()=>{const s=boardSession();return s?{authorization:'Bearer '+s.token}:{};};
 async function signIn(connection=capture()){
  await connection.check();const wallet=connection.owner;
  const post=async(path,body)=>{connection.assertCurrent();const response=await fetcher('/api/community'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const value=await response.json().catch(()=>({}));connection.assertCurrent();if(!response.ok)throw Error(value.error||'sign_in_failed');return value;};
  const {message}=await post('/session/message',{wallet});if(typeof message!=='string'||!message)throw Error('Sign-in message is unavailable. Try again.');
  const signature=await connection.sign(message);await connection.check();
  const session=await post('/session',{message,signature});await connection.check();
  if(session?.wallet!==wallet||typeof session.token!=='string'||!session.token||!Number.isFinite(session.expiresAt)||session.expiresAt<=now())throw Error('The sign-in response did not match this wallet. Try again.');
  try{storage().setItem(KEY,JSON.stringify(session));}catch{}
  return session;
 }
 function signOut(){const s=boardSession();try{storage().removeItem(KEY);}catch{}if(s)fetcher('/api/community/session',{method:'DELETE',headers:{authorization:'Bearer '+s.token}}).catch(()=>{});}
 return Object.freeze({boardSession,authHeaders,signIn,signOut,capture});
}
const shared=createBoardSession();
export const boardSession=shared.boardSession,authHeaders=shared.authHeaders,signIn=shared.signIn,signOut=shared.signOut,capture=shared.capture;
