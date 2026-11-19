import {readHookReferralSupport} from './hook-referral-reader.mjs';
import {hookReferralEnabledPartnerSlugs} from './hook-referral-config.mjs';
import {selectHookReferral} from './hook-referral-policy.mjs';
const ZERO='0x'+'0'.repeat(40),TTL=20000,MAX=32;
const address=v=>typeof v==='string'&&/^0x[0-9a-f]{40}$/i.test(v)?v.toLowerCase():null;
const slug=v=>typeof v==='string'&&v.length<=32&&/^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/.test(v.toLowerCase())?v.toLowerCase():null;
const unavailable=(reason='context_stale')=>Object.assign(new Error('Referral check changed or expired. Refresh the quote before continuing.'),{code:'hook_referral_unavailable',reason});
export function hookReferralKey(chainId,key){
 if(!key||![key.currency0,key.currency1,key.hooks].every(address)||!Number.isInteger(key.fee)||key.fee<0||key.fee>=2**24||!Number.isInteger(key.tickSpacing)||key.tickSpacing<-(2**23)||key.tickSpacing>=2**23)throw unavailable('invalid_pool_key');
 return JSON.stringify([String(chainId),address(key.currency0),address(key.currency1),key.fee,key.tickSpacing,address(key.hooks)]);
}
const word=v=>'0x'+v.slice(2).padStart(64,'0');
const oldHookData=(key,ref)=>{try{return ref&&ref!==ZERO&&(BigInt(key.hooks)&16383n)===10956n?word(ref):'0x';}catch{return '0x';}};
const skipped=reason=>({state:'skipped',blocking:false,hookData:'0x',reason,appliedHookReferrer:null,shareBps:null,basis:'hook-charge',contract:null,pool:null,pin:null,allocationFinal:false});

/** Browser-only context cache. Registry/native acquisition is injected for public-seam tests. */
export function createSiteHookReferrals({getTrader=()=>null,storage,location,partnerState=()=>globalThis.__qhooksPartnerReferral,
 readSupport=readHookReferralSupport,enabledPartnerSlugs=hookReferralEnabledPartnerSlugs,fetchImpl=(...a)=>fetch(...a),now=Date.now,ttlMs=TTL,maxEntries=MAX}={}){
 const contexts=new Map(),pending=new Map(),stamps=new WeakMap();
 const ttl=Math.min(TTL,Math.max(1000,Number(ttlMs)||TTL)),max=Math.min(MAX,Math.max(1,Number(maxEntries)||MAX));
 function stored(k){try{return String((storage||globalThis.localStorage)?.getItem(k)||'').slice(0,128);}catch{return '';}}
 function selection(){
  let refs=[];try{refs=new URL((location||globalThis.location).href).searchParams.getAll('ref');}catch{}
  const persisted=slug(stored('qhooks:partner-ref')),url=refs.length===1?slug(refs[0]):null;
  const state=partnerState()||{};
  return {slug:persisted||url,hook:address(stored('qhooks:referrer:v1')),saved:address(stored('qhooks:ref')),
   urlWallet:refs.length===1?address(refs[0]):null,status:state.status||null,stateSlug:slug(state.slug),stateWallet:address(state.referrer)};
 }
 const selected=s=>!!s.slug&&enabledPartnerSlugs.some(v=>slug(v)===s.slug);
 const identity=(chainId,key,s,trader)=>hookReferralKey(chainId,key)+':'+JSON.stringify([trader,s]);
 function read(chainId,key){const s=selection(),trader=address(getTrader()),id=identity(chainId,key,s,trader);return {s,trader,id,active:selected(s)&&address(key.hooks)!==ZERO};}
 function dataWithoutPartner(key,s){return oldHookData(key,s.hook||s.saved||s.urlWallet);}
 function store(id,entry){contexts.delete(id);contexts.set(id,entry);while(contexts.size>max)contexts.delete(contexts.keys().next().value);return entry;}
 function current(chainId,key,{forSwap=false}={}){
  const {s,trader,id,active}=read(chainId,key);
  if(!active)return {data:dataWithoutPartner(key,s),metadata:skipped('partner_not_selected'),active:false};
  const entry=contexts.get(id);
  if(!entry||now()-entry.at>=ttl||now()<entry.at)throw unavailable('context_stale');
  if(forSwap&&(!trader||!Number.isFinite(entry.quotedAt)||now()-entry.quotedAt>=ttl||entry.quotedData!==entry.data))throw unavailable('quote_missing_or_stale');
  if(entry.metadata.blocking)throw unavailable(entry.metadata.reason);
  return entry;
 }
 async function registry(s){
  let response;try{response=await fetchImpl('/api/partner-referral?ref='+encodeURIComponent(s.slug),{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(5000)});}catch{throw unavailable('registry_unavailable');}
  if(!response.ok)throw unavailable(response.status===404?'partner_not_registered':'registry_unavailable');
  let p;try{p=await response.json();}catch{throw unavailable('registry_unavailable');}
  if(p.partner!==s.slug||!address(p.referrer)||address(p.referrer)===ZERO||!Number.isSafeInteger(p.revision)||p.revision<1)throw unavailable('registry_unavailable');
  return {slug:s.slug,wallet:address(p.referrer),revision:p.revision};
 }
 async function prepare({chainId,key,manager,poolId,router,rpc,force=false}={}){
  const {s,trader,id,active}=read(chainId,key);
  if(key&&typeof key==='object'){
   const previous=stamps.get(key);stamps.set(key,previous&&previous.chainId!==String(chainId)?{ambiguous:true}:{chainId:String(chainId)});
  }
  if(!active)return {data:dataWithoutPartner(key,s),metadata:skipped('partner_not_selected'),active:false};
  if(!trader||trader===ZERO)return store(id,{data:'0x',metadata:skipped('wallet_not_connected'),active:true,at:now()});
  const cached=contexts.get(id);if(!force&&cached&&now()>=cached.at&&now()-cached.at<ttl)return cached;
  if(pending.has(id))return pending.get(id);
  if(pending.size>=max)throw unavailable('referral_check_busy');
  const task=(async()=>{
   const partner=await registry(s);
   const explicit=s.saved||s.urlWallet;
   const existing=s.hook&&s.hook!==ZERO?s.hook:undefined;
   const legacy=existing&&existing!==partner.wallet?oldHookData(key,existing):explicit&&explicit!==partner.wallet?oldHookData(key,explicit):'0x';
   let support=await readSupport({chainId,manager,poolId,key,rpc});
   if(support?.state==='verified'&&(String(support.pin?.chainId)!==String(chainId)||String(support.pool).toLowerCase()!==String(poolId).toLowerCase()||support.hook&&address(support.hook)!==address(key.hooks)))throw unavailable('native_context_mismatch');
   let binding=ZERO,bindingRead=false;
   // Only a native verified enabled pool can require a binding read. Unknown
   // hooks stay untouched; no address-bit inference enables the partner.
   if(support?.state==='verified'&&support.referralsEnabled){
    if(!address(router)||typeof rpc!=='function'||!support.pin?.blockNumber)throw unavailable('binding_unavailable');
    const [value]=await rpc([['eth_call',[{to:router,data:'0xd21cacdf'+trader.slice(2).padStart(64,'0')},'0x'+BigInt(support.pin.blockNumber).toString(16)]]]);
    if(typeof value!=='string'||!/^0x0{24}[0-9a-f]{40}$/i.test(value))throw unavailable('binding_unavailable');
    binding='0x'+value.slice(-40).toLowerCase();bindingRead=true;
   }
   const metadata=selectHookReferral({partner,enabledPartnerSlugs,trader,routerBinding:binding,explicitReferrer:explicit||undefined,existingHookReferral:existing,support});
   if(metadata.blocking)throw unavailable(metadata.reason);
   const data=legacy!=='0x'?legacy:metadata.state==='applied'?metadata.hookData:'0x';
   if(read(chainId,key).id!==id)throw unavailable('wallet_or_referral_changed');
   const entry={data,metadata:{...metadata,partner:partner.slug,partnerRevision:partner.revision,routerBinding:bindingRead?binding:null},partner,active:true,at:now()};
   return store(id,entry);
  })().catch(error=>{contexts.delete(id);throw error?.code==='hook_referral_unavailable'?error:unavailable('native_referral_unavailable');}).finally(()=>pending.delete(id));
  pending.set(id,task);return task;
 }
 function data(chainId,key,{forSwap=false}={}){return current(chainId,key,{forSwap}).data;}
 function metadata(chainId,key){try{return structuredClone(current(chainId,key).metadata);}catch(error){return {...skipped(error.reason||'context_stale'),state:'unavailable',blocking:true};}}
 function markQuoted(chainId,key,bytes){const c=current(chainId,key);if(!c.active)return;if(c.data!==bytes)throw unavailable('quote_data_changed');c.quotedAt=now();c.quotedData=bytes;}
 async function assertCurrent(args){
  const before=current(args.chainId,args.key,{forSwap:true});if(!before.active)return before;
  const after=await prepare({...args,force:true});
  const terms=v=>JSON.stringify([v.data,v.partner?.wallet,v.partner?.revision,v.metadata.shareBps,v.metadata.contract,v.metadata.state]);
  if(terms(before)!==terms(after)){delete after.quotedAt;throw unavailable('quote_terms_changed');}
  after.quotedAt=before.quotedAt;after.quotedData=before.quotedData;
  current(args.chainId,args.key,{forSwap:true});return after;
 }
 function stampedChain(key){const stamp=stamps.get(key);if(!stamp||stamp.ambiguous)throw unavailable('pool_chain_ambiguous');return stamp.chainId;}
 return {prepare,data,metadata,markQuoted,assertCurrent,stampedChain,selection,selectedPartner:()=>{const s=selection();return selected(s)?s.slug:null;},needsContext:key=>selected(selection())&&address(key?.hooks)!==ZERO};
}
