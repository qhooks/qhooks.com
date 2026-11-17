// Public observations already read by the selected token's QProof/Holder X-ray.
// No network, wallets, scans or timers. Keep the producer's time and pool scope.
export const EVIDENCE_MAX_AGE=300000;
const KEY='qhooks:discovery:evidence:v1',LIMIT=64,types=['holders','qproof','lp','guard','agent'];
export function evidenceIdentity(chain,token){chain=String(chain);token=String(token||'');if(chain==='solana')return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(token)?chain+':'+token:null;return /^\d{1,6}$/.test(chain)&&/^0x[\da-f]{40}$/i.test(token)?chain+':'+token.toLowerCase():null;}
export function evidenceTime(value){const n=typeof value==='string'?Date.parse(value):value;return Number.isSafeInteger(n)&&n>0?(n<1e12?n*1000:n):null;}
const fresh=(v,now)=>Number.isSafeInteger(v?.at)&&v.at<=now+5000&&now-v.at<=EVIDENCE_MAX_AGE;
const pct=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=100?n:null;
function tidy(type,v){if(!v||typeof v.source!=='string'||!v.source||v.source.length>120)return null;const base={at:evidenceTime(v.at),source:v.source};if(!base.at)return null;
 if(type==='holders')return {...base,devPct:pct(v.devPct),top10Pct:pct(v.top10Pct),sameBlock:v.sameBlock===true?true:null,sharedFunding:v.sharedFunding===true?true:null,scope:String(v.scope||'Returned holders').slice(0,180)};
 if(type==='qproof')return v.presentationVersion===2&&['clear','watch','danger','incomplete'].includes(v.level)&&typeof v.label==='string'&&v.label.length>0&&v.label.length<=80&&typeof v.reason==='string'&&v.reason.length<=500?{...base,presentationVersion:2,level:v.level,label:v.label,reason:v.reason}:null;
 if(type==='lp')return v.noRemove===true&&/^0x[\da-f]{64}$/.test(v.poolId||'')?{...base,noRemove:true,poolId:v.poolId}:null;
 if(type==='guard')return typeof v.active==='boolean'&&(!v.active||Number.isSafeInteger(v.until)&&v.until>base.at)?{...base,active:v.active,until:v.active?v.until:null}:null;
 // Only an explicit route-capability observation may set this; chain support is insufficient.
 if(type==='agent')return typeof v.ready==='boolean'&&typeof v.route==='string'&&v.route?{...base,ready:v.ready,route:v.route.slice(0,80)}:null;
 return null;
}
export function createDiscoveryEvidence({storage,now=Date.now,changed=()=>{}}={}){
 let memoRaw=null,memo={};const read=()=>{try{const raw=storage?.getItem(KEY);if(raw&&raw===memoRaw)return memo;if(!raw||raw.length>131072)return {};const x=JSON.parse(raw);memoRaw=raw;memo=x&&typeof x==='object'&&!Array.isArray(x)?x:{};return memo;}catch{return {};}};
 return {record(chain,token,type,value){const id=evidenceIdentity(chain,token),v=tidy(type,value);if(!id||!types.includes(type)||!v||!fresh(v,now()))return false;const data={...read()},prior=tidy(type,data[id]?.[type]);if(prior&&prior.at>=v.at&&JSON.stringify(prior)===JSON.stringify(v)||prior&&prior.at>v.at)return false;
  if(type==='holders'&&prior?.at===v.at){for(const k of ['sameBlock','sharedFunding'])if(prior[k]===true)v[k]=true;for(const k of ['devPct','top10Pct'])if(v[k]===null)v[k]=prior[k];}if(prior&&JSON.stringify(prior)===JSON.stringify(v))return false;data[id]={...data[id],[type]:v};const entries=Object.entries(data).map(([k,r])=>[k,Object.fromEntries(types.map(t=>[t,tidy(t,r?.[t])]).filter(([,x])=>fresh(x,now())))]).filter(([,r])=>Object.keys(r).length).sort((a,b)=>Math.max(...Object.values(b[1]).map(x=>x.at))-Math.max(...Object.values(a[1]).map(x=>x.at))).slice(0,LIMIT);
  try{storage?.setItem(KEY,JSON.stringify(Object.fromEntries(entries)));changed(id);return true;}catch{return false;}
 },get(chain,token,pool){const id=evidenceIdentity(chain,token),row=id?read()[id]:null,out={};for(const t of types){const v=tidy(t,row?.[t]);if(fresh(v,now()))out[t]=v;}if(out.lp&&String(pool||'').toLowerCase()!==out.lp.poolId)delete out.lp;if(out.guard?.active&&now()>=out.guard.until)out.guard={...out.guard,active:false};return out;}};
}
let singleton;
export function discoveryEvidence(){if(!singleton){let storage;try{storage=globalThis.localStorage;}catch{}singleton=createDiscoveryEvidence({storage,changed:id=>{globalThis.document?.dispatchEvent(new CustomEvent('qxt:discovery-evidence',{detail:{id}}));}});}return singleton;}
export function rowEvidence(row){return discoveryEvidence().get(row.chainId,row.token?.address,row.pool||row.launch?.poolId);}
export function evidenceMetrics(row){const evidence=rowEvidence(row),h=evidence.holders;return {...h,hasSocials:typeof row.hasSocials==='boolean'?row.hasSocials:null};}
// Exact creator balances can be used from a partial holder list. Missing creators cannot.
export function holderEvidence({view,data,market,sample,chainId,now=Date.now()}){
 const at=evidenceTime(view.at);if(!at||!fresh({at},now)||sample?.stale||market.holderCoverage?.stale)return null;
 const normalize=value=>String(chainId)==='solana'?String(value||''):String(value||'').toLowerCase(),creator=normalize(market.meta?.owner),found=view.rows.find(r=>normalize(r.holder)===creator),share=r=>r?.amount&&view.supply?.n>0n?Number((r.amount.n*10n**BigInt(view.supply.scale)*1000000n+view.supply.n*10n**BigInt(r.amount.scale)-1n)/(view.supply.n*10n**BigInt(r.amount.scale)))/10000:null;
 const devPct=share(found);let top10Pct=pct(sample?.top10Pct);
 if(top10Pct===null&&!view.partial&&view.supply?.n>0n&&view.rows.every(r=>r.amount)){const owners=new Map();for(const r of view.rows){if(r.excluded)continue;owners.set(r.holder,(owners.get(r.holder)||0)+(share(r)||0));}top10Pct=[...owners.values()].sort((a,b)=>b-a).slice(0,10).reduce((a,b)=>a+b,0);}
 return {at,source:view.source,scope:view.scope,devPct,top10Pct:pct(top10Pct),sameBlock:data.rows.some(r=>r.signals.some(s=>s.kind==='block'))?true:null,sharedFunding:data.rows.some(r=>r.signals.some(s=>s.kind==='funder'))?true:null};
}
