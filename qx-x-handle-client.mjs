// Private preferences and observed events only. This client cannot sign or trade.
import {memberWallet} from './qx-member-wallet.mjs';
import {xPost} from './qx-x-core.mjs';
import {normaliseTrackerDraft,validateTrackerStatus,normaliseTrackerPrefs,normaliseTrackerFeed} from './qx-x-handle-core.mjs';
import {validTokenTarget} from './qx-token-resolution.mjs';
import {chainById} from './chains.mjs';
import {quickAmounts,quickUnit,QUICK_UNITS,scopedTradingStorage} from './qx-trade-settings-store.mjs';
import {createTradingProfiles,resolveTradingTolerance} from './qx-trading-preferences.mjs';

export const X_HANDLE_KINDS=Object.freeze([
 ['post','Posts'],['reply','Replies'],['repost','Reposts'],['quote','Quotes'],
 ['deleted','Deleted posts'],['ca_posts','CA posts'],['pin','Pinned posts'],['follow_ca','Follows with a CA']
]);
const text=(v,n)=>typeof v==='string'&&v.length<=n&&!/[\u0000-\u0008\u000b-\u001f\u007f]/.test(v);
const fail=message=>{throw Error(message);};
const same=(chain,a,b)=>chain==='solana'?a===b:String(a).toLowerCase()===String(b).toLowerCase();
export function xHandleOwner(value){return memberWallet(value)?.key||null;}
export function xHandleDraft(raw){return normaliseTrackerDraft({version:1,handles:[raw]}).handles[0];}
export const xHandleStatus=validateTrackerStatus;
export const xHandlePrefs=normaliseTrackerPrefs;
// A CA is a candidate, not chain evidence. Only explicit selection followed by
// matching server metadata produces the asset used by the chart/ticket below.
export function xHandleTokenHref(asset){
 if(!asset||!validTokenTarget(asset.chainId,asset.token))return null;
 const chain=String(asset.chainId),key=asset.kind==='launch'&&/^0x[\da-f]{40}$/i.test(asset.controller||'')&&chain!=='solana'?'m':'t';
 return '/terminal#'+new URLSearchParams({[key]:chain+':'+(key==='m'?asset.controller:asset.token)});
}
export async function resolveXHandleCandidate(candidate,chain,{fetcher=(...args)=>globalThis.fetch(...args),signal}={}){
 chain=String(chain);const token=candidate?.address;
 if(!candidate||!validTokenTarget(chain,token)||(chain==='solana')!==(candidate.family==='solana'))fail('Choose the token’s exact chain.');
 const address=chain==='solana'?token:token.toLowerCase(),fallback={family:candidate.family,chainId:chain,token:address,kind:'token'};
 const controller=new AbortController(),abort=()=>controller.abort(),timer=setTimeout(abort,10000);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
 async function read(path){const r=await fetcher(path,{cache:'no-store',credentials:'omit',redirect:'error',signal:controller.signal});if(!r.ok)throw Error('Token metadata is unavailable on this chain.');return r.json();}
 try{
  const body=await read('/api/community/token/'+chain+'/'+address);if(controller.signal.aborted)throw new DOMException('Cancelled','AbortError');
  if(body?.redirect){const route=body.redirect;if(String(route.chainId)!==chain||!/^0x[\da-f]{40}$/i.test(route.controller||'')||chain==='solana')fail('The returned launch did not match this chain.');
   const launch=route.controller.toLowerCase(),market=await read('/api/terminal/market/'+chain+'/'+launch+'?tf=1'),meta=market?.meta;
   if(String(meta?.chainId)!==chain||!same(chain,meta?.token,address)||!same(chain,meta?.controller,launch))fail('The returned token did not match this selection.');
   return {asset:{...fallback,kind:'launch',controller:launch,...(text(meta.symbol,24)?{symbol:meta.symbol}:{}),...(text(meta.name,100)?{name:meta.name}:{})},confirmed:true};
  }
  const board=body?.board;if(!board||String(board.chainId)!==chain||!same(chain,board.address||board.token,address))fail('The returned token did not match this selection.');
  // The legacy community board confirms identity, not executable pool depth.
  // Outside tokens open their real token page; they do not inherit a buy route.
  return {asset:{...fallback,...(text(board.symbol,24)?{symbol:board.symbol}:{}),...(text(board.name,100)?{name:board.name}:{})},confirmed:false};
 }catch(error){if(signal?.aborted)throw error;if(controller.signal.aborted)throw Error('Token metadata timed out. Retry.');throw error;}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
export function xHandleQuickBuy(asset,{owner,storage}={}){
 const href=xHandleTokenHref(asset),identity=memberWallet(owner);if(!href||!identity||(asset.chainId==='solana')!==(identity.family==='solana'))return null;
 const chain=String(asset.chainId),scoped=scopedTradingStorage(storage,{owner:()=>identity.key}),unit=quickUnit(chain),amount=quickAmounts(scoped,chain)[unit],native=chain==='solana'?'SOL':chainById(chain)?.native;
 // Legacy terminal amt is in the native coin. Never turn a USDC preset into ETH.
 if(QUICK_UNITS[unit]!==native)return {href,label:'Open buy ticket',amount:null,unit:null,profile:null};
 let profile=null,slip=null;try{profile=createTradingProfiles(scoped,{legacyTolerance:scoped.getItem('qhooks:terminal:tol')}).snapshot(chain).profile;slip=resolveTradingTolerance(profile.buy).bps;}catch{}
 const [path,hash]=href.split('#'),query=new URLSearchParams(hash);query.set('side','buy');query.set('amt',amount);if(slip)query.set('slip',String(slip));
 return {href:path+'#'+query,label:'Buy '+amount+' '+native,amount,unit:native,profile:profile?.name||null};
}
export function xHandleFeed(raw,owner){
 const clean=normaliseTrackerFeed(raw,owner);if(!Number.isSafeInteger(clean.compliance?.redactionGeneration)||clean.compliance.redactionGeneration<0)fail('Event redaction status could not be verified.');
 return {...clean,events:clean.events.map(event=>({...event,post:event.post?{...event.post,url:xPost(event.post.url).url}:null}))};
}
const messages={tracker_unavailable:'The tracking source is not connected yet. Your settings have not been saved.',identity_unavailable:'This account identity could not be confirmed. Try again when the source is connected.',capability_unavailable:'One of these event types is not supported by the connected source.',revision_conflict:'Settings changed elsewhere. Reload before saving.',preferences_changed:'Settings changed elsewhere. Reload before saving.',unauthorized:'Save once to sign in with a free profile message.',forbidden:'Sign in with the wallet that owns these settings.',slow_down:'Too many requests. Wait a moment and retry.',redaction_changed:'A source-backed removal changed this feed. Reloading the first page.'};
export function createXHandleClient({fetcher=(...args)=>globalThis.fetch(...args)}={}){
 async function request(path,{signal,headers={},...options}={}){const controller=new AbortController(),cancel=()=>controller.abort(),timer=setTimeout(cancel,10000);signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();try{const response=await fetcher(path,{cache:'no-store',credentials:'omit',redirect:'error',...options,headers,signal:controller.signal});const raw=await response.json().catch(()=>null);if(controller.signal.aborted)throw new DOMException('Cancelled','AbortError');if(!response.ok)throw Object.assign(Error(messages[raw?.error]||'The tracker could not be read. Retry.'),{code:raw?.error||'unavailable',status:response.status,...(Number.isSafeInteger(raw?.compliance?.redactionGeneration)&&raw.compliance.redactionGeneration>=0?{compliance:{redactionGeneration:raw.compliance.redactionGeneration}}:{})});return raw;}catch(error){if(controller.signal.aborted&&!signal?.aborted)throw Error('The tracker read timed out. Retry.');throw error;}finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}}

 const path=owner=>{const who=memberWallet(owner);if(!who)fail('Connect a profile wallet first.');return who.path+'/x-tracker';};
 return Object.freeze({
  async status({signal}={}){return xHandleStatus(await request('/api/x-tracker/status',{signal}));},
  async prefs(owner,{headers,signal}={}){return xHandlePrefs(await request(path(owner),{headers,signal}),owner);},
  async save(owner,handles,{revision=null,headers,signal}={}){if(!headers?.authorization)fail('Sign in with your profile wallet to save.');if(!Array.isArray(handles)||handles.length>50)fail('Keep up to 50 accounts.');const clean=normaliseTrackerDraft({version:1,handles}).handles;return xHandlePrefs(await request(path(owner),{method:'PUT',headers:{...headers,'content-type':'application/json','if-match':String(revision??0)},body:JSON.stringify({version:1,handles:clean}),signal}),owner);},
  async feed(owner,{cursor=null,headers,signal}={}){if(!memberWallet(owner))fail('Connect a profile wallet first.');const q=new URLSearchParams({owner});if(cursor!==null){if(!text(cursor,2048)||!cursor)fail('This page cursor is invalid.');q.set('cursor',cursor);}return xHandleFeed(await request('/api/x-tracker/feed?'+q,{headers,signal}),owner);}
 });
}

// One visible timer, no hidden polling and no automatic pagination. Every late
// response is scoped to the owner generation that requested it.
export function createXHandleController({client=createXHandleClient(),authHeaders=async()=>({}),authorize=async()=>({}),now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout,onFreshEvents=()=>{},onRedaction=()=>{},onFeed=()=>{}}={}){
 let state={owner:null,status:null,prefs:null,events:[],nextCursor:null,loading:false,saving:false,error:null,errorCode:null,coverage:null,sourceObservedAt:null,generatedAt:null,redactionGeneration:null},generation=0,abort=new AbortController(),timer=null,visible=true,dead=false,failures=0,inflight=null,seen=new Set(),bootstrapped=false;const watchers=new Set();
 const emit=()=>{for(const fn of watchers)fn(snapshot());};
 const snapshot=()=>({...state,events:[...state.events]});
 const current=(mine,owner)=>!dead&&mine===generation&&owner===state.owner&&!abort.signal.aborted;
 function stop(){if(timer!==null)clearTimer(timer);timer=null;}
 function schedule(){stop();if(!dead&&visible&&!state.saving&&state.owner&&state.status?.available){const base=Math.max(60000,state.status.limits.pollMs);timer=setTimer(()=>{timer=null;void refresh();},Math.min(600000,base*2**Math.min(failures,3)));}}
 async function refresh({loadPrefs=false,cursor=null}={}){
  if(dead||state.saving)return;if(inflight)return inflight;stop();const mine=generation,owner=state.owner,signal=abort.signal;state={...state,loading:true,error:null,errorCode:null};emit();
  let retryHead=false;const run=(async()=>{try{
   const status=await client.status({signal});if(!current(mine,owner))return;if(state.status?.source?.id!==status.source?.id){state={...state,events:[],nextCursor:null,redactionGeneration:null};seen=new Set();bootstrapped=false;onRedaction(owner,null);}state={...state,status};emit();
   if(!owner||!status.available){state={...state,prefs:owner?state.prefs:null,events:[],nextCursor:null,coverage:{state:'unavailable',reason:status.reason}};return;}
   const headers=await authHeaders(owner);if(!current(mine,owner))return;if(!headers?.authorization){state={...state,error:'Save to sign in with a free profile message. Your saved accounts stay private.'};return;}
   if(loadPrefs||!state.prefs){const prefs=await client.prefs(owner,{headers,signal});if(!current(mine,owner))return;state={...state,prefs};emit();}
   const feed=await client.feed(owner,{headers,signal,cursor});if(!current(mine,owner))return;
   const nextGeneration=feed.compliance.redactionGeneration;if(state.redactionGeneration!==null&&nextGeneration!==state.redactionGeneration){const old=state.redactionGeneration;state={...state,events:[],nextCursor:null};seen=new Set();bootstrapped=false;onRedaction(owner,nextGeneration);emit();if(nextGeneration<old)throw Error('Source redactions are refreshing. Retry.');}state={...state,redactionGeneration:nextGeneration};
   const fresh=feed.events.filter(event=>!seen.has(event.id));for(const event of feed.events)seen.add(event.id);while(seen.size>2000)seen.delete(seen.values().next().value);
   const events=cursor?[...state.events,...fresh].slice(-200):feed.events;
   state={...state,events,nextCursor:feed.nextCursor,coverage:feed.coverage,sourceObservedAt:feed.sourceObservedAt,generatedAt:feed.generatedAt};failures=0;onFeed(feed,owner);
   if(bootstrapped&&!cursor&&fresh.length)onFreshEvents(fresh,owner);bootstrapped=true;
  }catch(error){if(current(mine,owner)&&error?.name!=='AbortError'){failures++;if(error.code==='redaction_changed'){state={...state,events:[],nextCursor:null,redactionGeneration:Math.max(state.redactionGeneration??0,error.compliance?.redactionGeneration??0)};seen=new Set();bootstrapped=false;onRedaction(owner,state.redactionGeneration);retryHead=!!cursor;}state={...state,error:error.message||'The tracker could not be read. Retry.',errorCode:error.code||null};}}
  finally{if(current(mine,owner)){state={...state,loading:false};inflight=null;emit();if(retryHead)queueMicrotask(()=>void refresh());else schedule();}}})();
  inflight=run;return run;
 }
 function setOwner(value){const owner=xHandleOwner(value);if(owner===state.owner)return;generation++;abort.abort();abort=new AbortController();stop();inflight=null;seen=new Set();bootstrapped=false;failures=0;state={...state,owner,prefs:null,events:[],nextCursor:null,error:null,errorCode:null,coverage:null,sourceObservedAt:null,generatedAt:null,redactionGeneration:null,loading:false,saving:false};emit();void refresh({loadPrefs:true});}
 async function save(handles){if(dead||state.saving)return;const mine=generation,owner=state.owner;if(!owner)fail('Connect a profile wallet first.');if(!state.status?.available)fail('The tracking source is not connected yet.');const signal=abort.signal;stop();state={...state,saving:true,error:null,errorCode:null};emit();try{if(inflight)await inflight;if(!current(mine,owner))return;const headers=await authorize(owner);if(!current(mine,owner))return;let prefs=state.prefs;if(!prefs){prefs=await client.prefs(owner,{headers,signal});if(!current(mine,owner))return;state={...state,prefs};return {...prefs,loadedOnly:true};}const result=await client.save(owner,handles,{revision:prefs.revision,headers,signal});if(!current(mine,owner))return;state={...state,prefs:result};seen=new Set();bootstrapped=false;return result;}catch(error){if(current(mine,owner)){state={...state,error:error.message,errorCode:error.code||null};throw error;}}finally{if(current(mine,owner)){state={...state,saving:false};emit();schedule();}}}
 return Object.freeze({snapshot,subscribe(fn){watchers.add(fn);fn(snapshot());return()=>watchers.delete(fn);},setOwner,refresh,save,loadMore(){return state.nextCursor?refresh({cursor:state.nextCursor}):Promise.resolve();},setVisible(value){const before=visible;visible=value===true;stop();if(!visible){generation++;abort.abort();abort=new AbortController();inflight=null;state={...state,loading:false,saving:false};emit();}else if(!before)schedule();},dispose(){dead=true;generation++;stop();abort.abort();watchers.clear();}});
}

// Sound requires a fresh gesture in this document, and is forgotten on owner
// change, hide or teardown. Merely loading saved `sound:true` never plays it.
export function createXHandleSound({createAudio=()=>new (globalThis.AudioContext||globalThis.webkitAudioContext)(),isVisible=()=>true}={}){
 let audio=null,enabled=false,epoch=0,last=-Infinity;
 return {get enabled(){return enabled;},async enable({isTrusted=false}={}){if(!isTrusted)return false;const mine=++epoch;try{audio??=createAudio();await audio.resume();if(mine!==epoch||!isVisible())return false;enabled=true;return true;}catch{enabled=false;return false;}},play(events,now=Date.now()){if(!enabled||!audio||!isVisible()||now-last<2000||!events.some(e=>e.preferences?.sound===true))return false;try{const osc=audio.createOscillator(),gain=audio.createGain();osc.type='sine';osc.frequency.value=660;gain.gain.setValueAtTime(0.0001,audio.currentTime);gain.gain.exponentialRampToValueAtTime(0.055,audio.currentTime+0.012);gain.gain.exponentialRampToValueAtTime(0.0001,audio.currentTime+0.12);osc.connect(gain);gain.connect(audio.destination);osc.start();osc.stop(audio.currentTime+0.13);last=now;return true;}catch{return false;}},disable(){epoch++;enabled=false;void audio?.suspend?.().catch(()=>{});},dispose(){epoch++;enabled=false;void audio?.close?.().catch(()=>{});audio=null;}};
}
