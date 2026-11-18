// Config context only. Copy, formatting, data acquisition and term ownership
// belong to the caller; missing facts never become example/default settings.
export const GLOSSARY_CONTEXT_ATTRIBUTE='data-glossary-context';
export const GLOSSARY_CONTEXT_EVENT='qhooks:glossary-context';
const own=(v,k)=>Object.hasOwn(v,k),UINT16=65535,UINT32=4294967295;
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const assert=ok=>{if(!ok)throw new TypeError('Invalid glossary context');};
function shape(v,keys){assert(plain(v)&&Object.keys(v).every(k=>keys.includes(k)));return v;}
function uint(v,max){if(v==null)return null;assert(typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=max);return v;}
function enabled(v){if(v==null)return null;assert(typeof v==='boolean');return v;}
function positive(v){if(v==null)return null;assert(typeof v==='number'&&Number.isFinite(v)&&v>0);return v;}
function chain(v){if(v==null)return null;if(typeof v==='number'){assert(Number.isSafeInteger(v)&&v>0);return String(v);}assert(typeof v==='string'&&(v==='solana'||/^[1-9]\d{0,15}$/.test(v)&&BigInt(v)<=BigInt(Number.MAX_SAFE_INTEGER)));return v;}
function symbol(v){if(v==null)return null;assert(typeof v==='string'&&!/[\u0000-\u001f\u007f]/.test(v)&&v.trim().length>0&&v.trim().length<=32);return v.trim();}
function storm(v){
 if(v==null)return null;shape(v,['floorBps','ceilingBps','multiplierBpsPerPricePercent','intervalSeconds','decaySeconds','enabled']);
 const out={floorBps:uint(v.floorBps,UINT16),ceilingBps:uint(v.ceilingBps,UINT16),multiplierBpsPerPricePercent:uint(v.multiplierBpsPerPricePercent,UINT16),intervalSeconds:uint(v.intervalSeconds,UINT32),decaySeconds:uint(v.decaySeconds,UINT32),enabled:enabled(v.enabled)};
 if(out.enabled===true){
  assert(out.floorBps===null||out.floorBps<=1000);assert(out.ceilingBps===null||out.ceilingBps<=1000);
  assert(out.floorBps===null||out.ceilingBps===null||out.floorBps<=out.ceilingBps);
  assert(out.multiplierBpsPerPricePercent===null||out.multiplierBpsPerPricePercent>0&&out.multiplierBpsPerPricePercent<=1000);
  assert(out.intervalSeconds===null||out.intervalSeconds>=60&&out.intervalSeconds<=86400);
  assert(out.decaySeconds===null||out.decaySeconds>=60&&out.decaySeconds<=604800);
  assert(out.intervalSeconds===null||out.decaySeconds===null||out.decaySeconds>=out.intervalSeconds);
 }
 return Object.freeze(out);
}
function sandwich(v){if(v==null)return null;shape(v,['maxBps','enabled']);const out={maxBps:uint(v.maxBps,UINT16),enabled:enabled(v.enabled)};if(out.enabled===true)assert(out.maxBps===null||out.maxBps>=100&&out.maxBps<=1500);return Object.freeze(out);}
function start(v){if(v==null)return null;shape(v,['standardUsd','actualUsd','chainId','quoteSymbol','steps']);return Object.freeze({standardUsd:positive(v.standardUsd),actualUsd:positive(v.actualUsd),chainId:chain(v.chainId),quoteSymbol:symbol(v.quoteSymbol),steps:uint(v.steps,161)});}
export function normalizeGlossaryContext(context){
 try{shape(context,['kind','storm','sandwich','start']);const kind=context.kind;assert(own(context,'kind')&&['pool','draft','catalog'].includes(kind));return Object.freeze({kind,storm:storm(context.storm),sandwich:sandwich(context.sandwich),start:start(context.start)});}catch{return null;}
}
function rawUint(v,max){
 if(v==null)return null;
 if(typeof v==='number'){assert(Number.isSafeInteger(v)&&v>=0&&v<=max);return v;}
 assert(typeof v==='bigint'||typeof v==='string'&&v.length<=20&&/^(0|[1-9]\d*)$/.test(v));const n=BigInt(v);assert(n>=0n&&n<=BigInt(max));return Number(n);
}
export function contextFromBlockConfig(flatDecoded,options={}){
 try{
  shape(options,['kind','mask','start']);const {kind,mask,start:pricing=null}=options;
  assert(plain(flatDecoded));const decodedMask=rawUint(flatDecoded.mask,UINT32),explicitMask=rawUint(mask,UINT32);
  assert(decodedMask===null||explicitMask===null||decodedMask===explicitMask);const bits=explicitMask??decodedMask;
  return normalizeGlossaryContext({kind,storm:{
   floorBps:rawUint(flatDecoded.stormFloorBps,UINT16),ceilingBps:rawUint(flatDecoded.stormCeilBps,UINT16),multiplierBpsPerPricePercent:rawUint(flatDecoded.stormMult,UINT16),
   intervalSeconds:rawUint(flatDecoded.stormInterval,UINT32),decaySeconds:rawUint(flatDecoded.stormDecay,UINT32),enabled:bits===null?null:!!(bits&512)
  },sandwich:{maxBps:rawUint(flatDecoded.sandwichMaxBps,UINT16),enabled:bits===null?null:!!(bits&128)},start:pricing});
 }catch{return null;}
}
export function setGlossaryContext(element,context){
 if(!element||typeof element.getAttribute!=='function'||typeof element.setAttribute!=='function'||typeof element.removeAttribute!=='function')throw new TypeError('Glossary scope element required');
 const normalized=normalizeGlossaryContext(context),serialized=normalized===null?null:JSON.stringify(normalized);
 if(element.getAttribute(GLOSSARY_CONTEXT_ATTRIBUTE)===serialized)return normalized;
 if(serialized===null)element.removeAttribute(GLOSSARY_CONTEXT_ATTRIBUTE);else element.setAttribute(GLOSSARY_CONTEXT_ATTRIBUTE,serialized);
 const EventClass=element.ownerDocument?.defaultView?.CustomEvent||globalThis.CustomEvent;
 if(typeof EventClass==='function'&&typeof element.dispatchEvent==='function')element.dispatchEvent(new EventClass(GLOSSARY_CONTEXT_EVENT,{bubbles:true,detail:Object.freeze({context:normalized})}));
 return normalized;
}
