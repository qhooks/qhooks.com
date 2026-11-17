import {memberWallet} from './qx-member-wallet.mjs';
import {xPost} from './qx-x-core.mjs';
export const X_TRACKER_LIMITS=Object.freeze({handles:50,page:50,pollMs:60000,ownerCacheMs:90000,receiptEvents:50,receiptBytes:524288});
export const X_TRACKER_KINDS=Object.freeze(['post','reply','repost','quote','deleted','ca_posts','pin','follow_ca']);
export const X_TRACKER_COLORS=Object.freeze(['gold','green','blue','pink']);
const fail=message=>{throw TypeError(message);},plain=v=>v&&Object.getPrototypeOf(v)===Object.prototype;
export const trackerOwner=value=>memberWallet(value)?.key||null;
export const trackerProfilePath=value=>{const identity=memberWallet(value);if(!identity)return fail('Choose a wallet.');return identity.path+'/x-tracker';};
export const trackerAccountId=value=>typeof value==='string'&&/^[1-9][0-9]{0,24}$/.test(value)?value:null;
export function trackerHandle(value){if(typeof value!=='string')return null;const handle=value.replace(/^@/,'');return /^[A-Za-z0-9_]{1,15}$/.test(handle)?handle.toLowerCase():null;}
const text=(value,max)=>typeof value==='string'&&[...value].length<=max&&!/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(value)?value.normalize('NFC'):fail('Invalid tracker text.');
export function normaliseTrackerDraft(value){
 if(!plain(value)||value.version!==1||Object.keys(value).some(k=>!['version','handles'].includes(k))||!Array.isArray(value.handles)||value.handles.length>X_TRACKER_LIMITS.handles)return fail('Choose up to50 tracked accounts.');
 const seen=new Set();return {version:1,handles:value.handles.map(row=>{
  if(!plain(row)||Object.keys(row).some(k=>!['accountId','handle','label','pinned','sound','highlight','events'].includes(k)))return fail('Invalid tracked account.');
  const accountId=row.accountId===undefined?null:trackerAccountId(row.accountId),handle=row.handle===undefined?null:trackerHandle(row.handle);if(row.accountId!==undefined&&!accountId||row.handle!==undefined&&!handle||!accountId&&!handle)return fail('Choose an account identity.');const key=accountId||'@'+handle;if(seen.has(key))return fail('Choose each account once.');seen.add(key);
  if(typeof row.pinned!=='boolean'||typeof row.sound!=='boolean'||row.highlight!==null&&!X_TRACKER_COLORS.includes(row.highlight)||!Array.isArray(row.events)||row.events.length>X_TRACKER_KINDS.length||row.events.some(k=>!X_TRACKER_KINDS.includes(k)))return fail('Invalid tracker preferences.');
  return {...(accountId?{accountId}:{}),...(handle?{handle}:{}),label:text(row.label??'',48).trim(),pinned:row.pinned,sound:row.sound,highlight:row.highlight,events:[...new Set(row.events)]};
 })};
}
export function validateTrackerStatus(value){
 if(!plain(value)||value.version!==1||typeof value.enabled!=='boolean'||typeof value.available!=='boolean'||!plain(value.capabilities)||X_TRACKER_KINDS.some(k=>typeof value.capabilities[k]!=='boolean')||!plain(value.limits)||Object.keys(X_TRACKER_LIMITS).some(k=>value.limits[k]!==X_TRACKER_LIMITS[k]))return fail('Invalid tracker status.');
 if(value.available&&(!value.enabled||!value.source||typeof value.source.id!=='string'||typeof value.source.label!=='string')||!value.available&&Object.values(value.capabilities).some(Boolean))return fail('Unsupported tracker capabilities.');return value;
}
export function normaliseTrackerPrefs(value,wallet){
 const owner=trackerOwner(wallet);if(!owner||!plain(value)||value.version!==1||value.wallet!==owner||value.revision!==null&&(!Number.isSafeInteger(value.revision)||value.revision<1))return fail('Tracker preferences do not match this wallet.');
 const clean=normaliseTrackerDraft({version:1,handles:value.handles});if(clean.handles.some(h=>!h.accountId||!h.handle))return fail('Unresolved tracker identity.');return {version:1,wallet:owner,revision:value.revision,handles:clean.handles};
}
export function extractTrackerCandidates(value){
 if(typeof value!=='string'||value.length>10000)return [];const found=new Map();
 for(const match of value.matchAll(/(?<![0-9A-Fa-f])0x[0-9A-Fa-f]{40}(?![0-9A-Fa-f])/g)){const address=match[0].toLowerCase();found.set('evm:'+address,{family:'evm',address,chainId:null,route:null});if(found.size>=10)return [...found.values()];}
 for(const match of value.matchAll(/(?<![1-9A-HJ-NP-Za-km-z])[1-9A-HJ-NP-Za-km-z]{32,44}(?![1-9A-HJ-NP-Za-km-z])/g)){const identity=memberWallet('solana:'+match[0]);if(identity){found.set(identity.key,{family:'solana',address:identity.address,chainId:null,route:null});if(found.size>=10)break;}}
 return [...found.values()];
}
export function normaliseTrackerFeed(value,wallet){
 const owner=trackerOwner(wallet);if(!owner||!plain(value)||value.version!==1||value.wallet!==owner||!Array.isArray(value.events)||value.events.length>50||!Number.isSafeInteger(value.generatedAt)||value.generatedAt<1||value.sourceObservedAt!==null&&(!Number.isSafeInteger(value.sourceObservedAt)||value.sourceObservedAt<1)||value.nextCursor!==null&&(typeof value.nextCursor!=='string'||value.nextCursor.length>2048||!/^[A-Za-z0-9_-]+$/.test(value.nextCursor))||!plain(value.compliance)||!Number.isSafeInteger(value.compliance.redactionGeneration)||value.compliance.redactionGeneration<0||!plain(value.coverage)||!['observed','unavailable'].includes(value.coverage.state))return fail('Invalid tracker feed.');
 const preferences=normaliseTrackerPrefs({version:1,wallet:owner,revision:value.revision,handles:[]},owner);const events=value.events.map(event=>{
  if(!plain(event)||typeof event.id!=='string'||event.id.length>192||!X_TRACKER_KINDS.includes(event.kind)||event.kind==='ca_posts'||!trackerAccountId(event.account?.id)||!trackerHandle(event.account?.handle)||!Number.isSafeInteger(event.eventAt)||event.eventAt<1||!Number.isSafeInteger(event.observedAt)||event.observedAt<event.eventAt||typeof event.sourceRef!=='string'||event.sourceRef.length>256||!Array.isArray(event.candidates)||event.candidates.length>10)return fail('Invalid observed event.');
  if(event.post&&(!xPost(event.post.url)||xPost(event.post.url).id!==event.post.id||typeof event.post.text!=='string'||event.post.text.length>4000))return fail('Invalid observed post.');
  for(const candidate of event.candidates){if(candidate.chainId!==null||candidate.route!==null||!['evm','solana'].includes(candidate.family)||!memberWallet(candidate.family==='solana'?'solana:'+candidate.address:candidate.address))return fail('A candidate needs exact metadata resolution.');}
  normaliseTrackerDraft({version:1,handles:[{accountId:event.account.id,handle:event.account.handle,...event.preferences,events:[]}]});
  return event;
 });return {...value,revision:preferences.revision,events};
}
export const validateStatus=validateTrackerStatus,normalisePrefs=normaliseTrackerPrefs,normaliseFeed=normaliseTrackerFeed;
