// Private tour progress. Existing profile sessions are optional; this module never signs in.
import {memberWallet} from './qx-member-wallet.mjs';
export const FIRST_RUN_VERSION=1, FIRST_RUN_RELEASE_LIMIT=64;
const ID=/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
const abort=()=>Object.assign(Error('Your wallet changed.'),{name:'AbortError'});
export function firstRunIdentity(value){return memberWallet(value)?.key||null;}
export function normalizeFirstRunState(value={},wallet){
 const who=firstRunIdentity(wallet);if(!who)throw TypeError('Choose a wallet.');
 const tourVersion=Number.isSafeInteger(value.tourVersion)&&value.tourVersion>=0&&value.tourVersion<=10000?value.tourVersion:0;
 const seenReleaseIds=Array.isArray(value.seenReleaseIds)?[...new Set(value.seenReleaseIds.filter(id=>typeof id==='string'&&ID.test(id)))].sort().slice(-FIRST_RUN_RELEASE_LIMIT):[];
 return {version:1,wallet:who,tourVersion,outcome:tourVersion&&['skipped','completed'].includes(value.outcome)?value.outcome:null,seenReleaseIds,revision:Number.isSafeInteger(value.revision)&&value.revision>0?value.revision:null};
}
export function mergeFirstRunState(left,right,wallet){
 const a=normalizeFirstRunState(left,wallet),b=normalizeFirstRunState(right,wallet),tourVersion=Math.max(a.tourVersion,b.tourVersion);
 const outcome=[a,b].some(v=>v.tourVersion===tourVersion&&v.outcome==='completed')?'completed':[a,b].some(v=>v.tourVersion===tourVersion&&v.outcome==='skipped')?'skipped':null;
 return normalizeFirstRunState({tourVersion,outcome,seenReleaseIds:[...a.seenReleaseIds,...b.seenReleaseIds],revision:Math.max(a.revision||0,b.revision||0)},wallet);
}
export function validateFirstRunMutation(value){
 if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).some(key=>!['version','tourVersion','outcome','seenReleaseIds'].includes(key))||value.version!==1)throw TypeError('Invalid tour progress.');
 if(value.tourVersion!==undefined&&(!Number.isSafeInteger(value.tourVersion)||value.tourVersion<1||value.tourVersion>10000||!['skipped','completed'].includes(value.outcome)))throw TypeError('Invalid tour completion.');
 if(value.outcome!==undefined&&value.tourVersion===undefined)throw TypeError('Choose a tour version.');
 if(value.seenReleaseIds!==undefined&&(!Array.isArray(value.seenReleaseIds)||value.seenReleaseIds.length>FIRST_RUN_RELEASE_LIMIT||value.seenReleaseIds.some(id=>typeof id!=='string'||!ID.test(id))))throw TypeError('Invalid release progress.');
 if(value.tourVersion===undefined&&(!value.seenReleaseIds||value.seenReleaseIds.length===0))throw TypeError('Choose tour or release progress.');
 return {version:1,...(value.tourVersion===undefined?{}:{tourVersion:value.tourVersion,outcome:value.outcome}),...(value.seenReleaseIds===undefined?{}:{seenReleaseIds:[...new Set(value.seenReleaseIds)]})};
}
export function createFirstRunState({owner=()=>null,authHeaders=()=>({}),fetcher=(...args)=>globalThis.fetch(...args),storage=()=>globalThis.localStorage,now=Date.now,timeoutMs=2000}={}){
 let disposed=false;const memory=new Map(),controllers=new Set(),requestMs=Number.isFinite(timeoutMs)?Math.max(1,Math.min(2000,Math.trunc(timeoutMs))):2000;
 const key=who=>'qhooks:first-run:v1:'+who;
 function context(input={}){const who=firstRunIdentity(input.owner||owner());if(disposed||!who||who!==firstRunIdentity(owner())||input.family&&input.family!==memberWallet(who).family||input.signal?.aborted)throw abort();return who;}
 function current(who,signal){if(disposed||who!==firstRunIdentity(owner())||signal?.aborted)throw abort();}
 function local(who){let saved;try{saved=JSON.parse(storage()?.getItem(key(who))||'null');}catch{}return mergeFirstRunState(saved?.wallet===who?saved:{},memory.get(who),who);}
 function remember(who,value){const next=mergeFirstRunState(local(who),value,who);memory.set(who,next);while(memory.size>8)memory.delete(memory.keys().next().value);try{storage()?.setItem(key(who),JSON.stringify(next));}catch{}return next;}
 const view=(value,input,source='local',sync='local')=>({...value,completed:value.tourVersion>=(input.version||FIRST_RUN_VERSION),source,sync});
 function peek(input={}){const who=context(input);return view(local(who),input);}
 async function request(input,mutation,deadline=now()+requestMs){
  const who=context(input);let value=mutation?remember(who,mutation):local(who),auth;try{auth=authHeaders(who)||{};}catch{auth={};}
  if(!auth.authorization)return view(value,input);
  const remaining=deadline-now();if(remaining<=0)return view(value,input,'local','unavailable');
  const controller=new AbortController();controllers.add(controller);let timedOut=false,timer,stop;
  const timeout=Object.assign(Error('Tour progress read timed out.'),{name:'TimeoutError'}),cancel=()=>controller.abort();
  const interrupted=new Promise((_,reject)=>{stop=()=>reject(timedOut?timeout:abort());controller.signal.addEventListener('abort',stop,{once:true});timer=setTimeout(()=>{timedOut=true;controller.abort();},remaining);});
  input.signal?.addEventListener('abort',cancel,{once:true});if(input.signal?.aborted)cancel();
  const requestCurrent=()=>{current(who,input.signal);if(controller.signal.aborted)throw timedOut?timeout:abort();};
  try{
   const transport=(async()=>{
    requestCurrent();const response=await fetcher(memberWallet(who).path+'/first-run',{method:mutation?'PUT':'GET',credentials:'omit',redirect:'error',cache:'no-store',signal:controller.signal,headers:{authorization:auth.authorization,...(mutation?{'content-type':'application/json'}:{})},...(mutation?{body:JSON.stringify(mutation)}:{})});
    requestCurrent();if(!response.ok)return {response};const raw=await response.json();requestCurrent();return {response,raw};
   })();
   const {response,raw}=await Promise.race([transport,interrupted]);requestCurrent();if(!response.ok)return view(value,input,'local',response.status===401?'local':'unavailable');
   if(raw?.version!==1||raw.wallet!==who||!Number.isSafeInteger(raw.tourVersion)||raw.tourVersion<0||raw.tourVersion>10000||raw.tourVersion>0&&!['skipped','completed'].includes(raw.outcome)||!Array.isArray(raw.seenReleaseIds)||raw.seenReleaseIds.length>FIRST_RUN_RELEASE_LIMIT||raw.seenReleaseIds.some(id=>typeof id!=='string'||!ID.test(id))||raw.revision!==null&&(!Number.isSafeInteger(raw.revision)||raw.revision<1))throw Error('Invalid tour response.');
   value=remember(who,raw);
   // A completion made while signed out stays local until an existing session is available.
   // Reconcile it once, without asking for a signature or replacing another device's progress.
   if(!mutation&&(value.tourVersion>raw.tourVersion||value.tourVersion===raw.tourVersion&&value.outcome==='completed'&&raw.outcome!=='completed'||value.seenReleaseIds.some(id=>!raw.seenReleaseIds.includes(id))))return request(input,validateFirstRunMutation({version:1,...(value.tourVersion?{tourVersion:value.tourVersion,outcome:value.outcome}:{}),...(value.seenReleaseIds.length?{seenReleaseIds:value.seenReleaseIds}:{})}),deadline);
   return view(value,input,'server','saved');
  }catch(error){current(who,input.signal);if(error?.name==='AbortError'&&!timedOut)throw error;return view(value,input,'local','unavailable');}
  finally{clearTimeout(timer);controller.signal.removeEventListener('abort',stop);controllers.delete(controller);input.signal?.removeEventListener('abort',cancel);}
 }
 return Object.freeze({peek,read:input=>request(input||{}),markTour(input={}){return request(input,validateFirstRunMutation({version:1,tourVersion:input.version||FIRST_RUN_VERSION,outcome:input.outcome}));},markReleases(input={}){return request(input,validateFirstRunMutation({version:1,seenReleaseIds:input.ids}));},dispose(){disposed=true;for(const controller of controllers)controller.abort();controllers.clear();memory.clear();}});
}
