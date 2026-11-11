import {memberWallet} from './qx-member-wallet.mjs';
import {normalizeProfileHandle} from './qx-profile-handle-core.mjs';

export function profileUrl({wallet,handle}={}){
 const name=normalizeProfileHandle(handle);if(name)return '/profile/'+name;
 const identity=memberWallet(wallet,{allowBareSolana:true});if(!identity)return '/profile';
 return identity.family==='solana'?'/profile/solana/'+identity.address:'/profile/'+identity.address;
}

// Optional transport makes the same address parser usable in offline fixtures.
export async function resolveProfileAddress(location,{fetcher=(...args)=>globalThis.fetch(...args),readWalletHandle=true}={}){
 const url=typeof location==='string'||location instanceof URL?new URL(location,'https://qhooks.com'):location;
 const match=/^\/profile(?:\.html)?(?:\/(.+?))?\/?$/.exec(url.pathname||'');
 let part='';try{part=decodeURIComponent(match?.[1]||url.hash?.slice(1)||'').trim();}catch{return{notFound:true,handle:''};}
 if(part.startsWith('solana/'))part='solana:'+part.slice(7);
 const identity=memberWallet(part,{allowBareSolana:true});
 if(identity){
  if(!readWalletHandle)return{wallet:identity.key,handle:null};
  let handle=null;try{const response=await fetcher(identity.path,{cache:'no-store',credentials:'omit',redirect:'error'});if(response.ok){const body=await response.json();if(body?.version===1&&body.wallet===identity.key)handle=normalizeProfileHandle(body.handle);}}catch{}
  return{wallet:identity.key,handle};
 }
 const handle=normalizeProfileHandle(part);if(!handle)return{notFound:true,handle:part.toLowerCase()};
 const response=await fetcher('/api/community/handle/'+handle,{cache:'no-store',credentials:'omit',redirect:'error'});
 if(response.status===404)return{notFound:true,handle};
 if(!response.ok)throw Error('This profile address could not be read. Try again.');
 const body=await response.json(),wallet=memberWallet(body?.wallet)?.key,current=normalizeProfileHandle(body?.handle);
 if(body?.version!==1||!wallet||!current)throw Error('This profile address response was invalid.');
 return{wallet,handle:current};
}

export function replaceProfileAddress(location,history,value){
 const path=profileUrl(value);if(path==='/profile'||!value?.wallet)return false;
 if(location.pathname===path&&!location.hash)return false;
 history.replaceState(history.state??null,'',path+(location.search||''));return true;
}
