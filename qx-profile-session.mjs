// A distinct, profile-only Solana session. EVM profiles continue to use the
// canonical board-session module directly; neither module can read the other's token.
import {memberWallet,solanaProfileMessage} from './qx-member-wallet.mjs';
const KEY='qhooks:solana-profile-session:v1',BASE='/api/community/profile-auth/solana',SCOPE='profile:write';
export function createSolanaProfileSession({walletHub,getConnection=()=>walletHub.snapshot().current,fetcher=(...args)=>globalThis.fetch(...args),storage=()=>localStorage,now=Date.now}={}){
 let memorySession=null;
 const owner=()=>memberWallet(getConnection()?.owner)?.family==='solana'?getConnection().owner:null;
 function boardSession(){const valid=value=>value?.version===1&&value.scope===SCOPE&&value.family==='solana'&&value.wallet===owner()&&/^sp1_[0-9a-f]{64}$/.test(value.token||'')&&Number.isFinite(value.expiresAt)&&value.expiresAt>now();try{const value=JSON.parse(storage().getItem(KEY)||'null');if(valid(value))return value;}catch{}return valid(memorySession)?memorySession:null;}
 const authHeaders=()=>{const value=boardSession();return value?{authorization:'Bearer '+value.token}:{};};
 async function signIn(connection=walletHub.capture()){
  await connection.check();const identity=memberWallet(connection.owner);if(identity?.family!=='solana')throw Error('Connect a Solana profile wallet first.');
  const post=async(path,body)=>{connection.assertCurrent();const response=await fetcher(BASE+path,{method:'POST',credentials:'omit',redirect:'error',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),value=await response.json().catch(()=>null);await connection.check();if(!response.ok)throw Error(({wallet_signature_invalid:'The signature did not match this Solana wallet.',challenge_expired:'This profile sign-in expired. Try again.',challenge_used:'This profile sign-in was already used. Try again.',blocked:'This profile cannot be edited.',slow_down:'Too many sign-in attempts. Try again later.',wrong_origin:'Open QHooks directly to edit your profile.'})[value?.error]||'Profile sign-in is unavailable. Try again.');return value;};
  const challenge=await post('/challenge',{wallet:identity.address});
  if(challenge?.version!==1||challenge.scope!==SCOPE||challenge.wallet!==identity.key||!/^[0-9a-f]{48}$/.test(challenge.id||'')||!Number.isFinite(challenge.issuedAt)||Math.abs(challenge.issuedAt-now())>300000||challenge.expiresAt!==challenge.issuedAt+300000||challenge.expiresAt<=now()||challenge.message!==solanaProfileMessage({wallet:identity.address,id:challenge.id,issuedAt:challenge.issuedAt,expiresAt:challenge.expiresAt}))throw Error('The sign-in challenge did not match this Solana profile.');
  const signature=await connection.sign(challenge.message);await connection.check();
  const value=await post('/session',{id:challenge.id,signature});
  if(value?.version!==1||value.scope!==SCOPE||value.family!=='solana'||value.wallet!==identity.key||value.address!==identity.address||!/^sp1_[0-9a-f]{64}$/.test(value.token||'')||!Number.isFinite(value.expiresAt)||value.expiresAt<=now()||value.expiresAt>now()+7*86400000+300000)throw Error('The sign-in response did not match this Solana profile.');
  connection.assertCurrent();memorySession=value;try{storage().setItem(KEY,JSON.stringify(value));}catch{}return value;
 }
 function signOut(){const value=boardSession();memorySession=null;try{storage().removeItem(KEY);}catch{}if(value)return fetcher(BASE+'/session',{method:'DELETE',credentials:'omit',redirect:'error',headers:{authorization:'Bearer '+value.token}}).catch(()=>{});}
 return Object.freeze({boardSession,authHeaders,signIn,signOut,capture:()=>walletHub.capture()});
}
export function solanaProfileSessions(walletHub){let shared;return{createBoardSession:options=>shared??=createSolanaProfileSession({...options,walletHub})};}
