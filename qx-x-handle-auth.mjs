// Existing profile-message sessions only. No transaction signer or silent
// Solana connection. The Solana discovery module is behind an explicit choice.
import {memberWallet} from './qx-member-wallet.mjs';

export async function createXHandleAuth({target=globalThis.window,walletHub=null,sessions=null,
 loadHub=()=>import('./wallet-hub.mjs'),loadSessions=()=>import('./qx-board-session.mjs'),
 loadSolWallet=()=>import('./qx-solana-profile-wallet.mjs'),loadSolSessions=()=>import('./qx-profile-session.mjs')}={}){
 const hub=walletHub||(await loadHub()).getWalletHub(target),watchers=new Set();
 let family='evm',sol=null,solStop=null,dead=false,generation=0,solPending=null;
 const auths=new Map();
 const current=()=>family==='solana'?sol?.snapshot().current||null:hub.snapshot().current||null;
 const snapshot=()=>({owner:memberWallet(current()?.owner)?.key||null,family,busy:family==='solana'?sol?.snapshot().busy===true:hub.snapshot().busy===true,solWallets:sol?.snapshot().wallets||[]});
 let prior=null;
 function publish(){if(dead)return;const next=snapshot();if(next.owner!==prior){generation++;prior=next.owner;}for(const fn of watchers)fn(next);}
 const stop=hub.subscribe(publish);
 function still(owner,mine){if(dead||mine!==generation||snapshot().owner!==owner)throw Error('Your profile wallet changed. Review your settings again.');}
 async function session(owner){
  const who=memberWallet(owner);if(!who||snapshot().owner!==owner)throw Error('Connect the wallet that owns these settings.');
  const key=who.family;if(!auths.has(key)){
   const getConnection=()=>current();
   const pending=(async()=>{if(sessions)return sessions.createBoardSession({getConnection});if(key==='solana')return (await loadSolSessions()).createSolanaProfileSession({walletHub:sol,getConnection,storage:()=>target.localStorage});return (await loadSessions()).createBoardSession({getConnection,storage:()=>target.localStorage});})();
   auths.set(key,pending);pending.catch(()=>{if(auths.get(key)===pending)auths.delete(key);});
  }
  return auths.get(key);
 }
 return Object.freeze({snapshot,subscribe(fn){watchers.add(fn);fn(snapshot());return()=>watchers.delete(fn);},
  async headers(owner){const mine=generation,auth=await session(owner);still(owner,mine);return auth.authHeaders();},
  async authorize(owner){const mine=generation,auth=await session(owner);still(owner,mine);const capture=auth.capture();await capture.check();still(owner,mine);if(!auth.boardSession())await auth.signIn(capture);await capture.check();still(owner,mine);return auth.authHeaders();},
  useEvm({connect=false}={}){family='evm';generation++;publish();if(connect)hub.open();},
  async useSolana(){if(dead)return;family='solana';generation++;publish();if(sol)return snapshot();if(!solPending)solPending=loadSolWallet().then(module=>{if(dead)return null;sol=module.createSolanaProfileWallet(target);solStop=sol.subscribe(publish);return sol;}).finally(()=>{solPending=null;});await solPending;publish();return snapshot();},
  async connectSolana(id){if(family!=='solana'||!sol)throw Error('Choose a Solana profile wallet first.');await sol.connect(id);publish();return snapshot();},
  async disconnectSolana(){if(sol)await sol.disconnect();publish();},
  dispose(){dead=true;generation++;stop();solStop?.();sol?.dispose();watchers.clear();auths.clear();}
 });
}
