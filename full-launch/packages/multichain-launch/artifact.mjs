// Fixed accepted launch toolkits. Reading an artifact is not production admission.
// Each launch is managed with the toolkit generation it was created with:
//  - blocks (2026-11-02): QGraduation pools with launch blocks, hook flags 10956. New launches.
//  - l200 (2026-11-02): controller accepts EIP-7702 delegated owners; runtime identical to L64.
//    The L64 toolkit stays accepted inside this generation so its launches restore unchanged.
const GENERATIONS=Object.freeze({
 blocks:Object.freeze({id:'blocks',toolkit:'be7c2f612f989322a25175271ca54813331a1233d86c29e54460ba91e3377f45',metadata:'6af620d12176f5fcbef57b061fca3145724da5ad67902a7ded2db3eb4bdca2d8',legacyToolkit:null,legacyMetadata:null,flags:10956,blocks:true,path:''}),
 l200:Object.freeze({id:'l200',toolkit:'340402e4c2657f0005edd43f34e9d54b8c22c081d0bd48401e350f51e08a3a7b',metadata:'f02ee9045f289496d272cad48a5191c3afaaee65317bc1959bac07d42158925b',legacyToolkit:'1129f081ea3621f3a79b1837a549a93455a4ae657c96f3885aed4bcd3fa6d3f3',legacyMetadata:'4ae7ab85e5ec4a6ad92ce5f54fc90c29acffbb833a46a79f6de4b295039eab0d',flags:10820,blocks:false,path:'gen-l200/'})
});
export const LAUNCH_GENERATION_IDS=Object.freeze(Object.keys(GENERATIONS));
export const LAUNCH_HOOK_FLAG_SET=Object.freeze([10956,10820]);
// Live bindings: importers always see the selected generation.
export let LAUNCH_GENERATION='blocks';
export let LAUNCH_TOOLKIT_SHA='';
export let LEGACY_LAUNCH_TOOLKIT_SHA=null;
export let LAUNCH_TOOLKIT_SHAS=Object.freeze([]);
export let LAUNCH_IMMUTABLES_SHA='';
export let LEGACY_LAUNCH_IMMUTABLES_SHA=null;
export let LAUNCH_HOOK_FLAGS=10956;
export let LAUNCH_BLOCKS=true;
export function selectLaunchGeneration(id){
 const g=GENERATIONS[id];if(!g)throw new TypeError('Unknown launch generation');
 LAUNCH_GENERATION=g.id;LAUNCH_TOOLKIT_SHA=g.toolkit;LEGACY_LAUNCH_TOOLKIT_SHA=g.legacyToolkit;
 LAUNCH_TOOLKIT_SHAS=Object.freeze([g.toolkit,...(g.legacyToolkit?[g.legacyToolkit]:[])]);
 LAUNCH_IMMUTABLES_SHA=g.metadata;LEGACY_LAUNCH_IMMUTABLES_SHA=g.legacyMetadata;LAUNCH_HOOK_FLAGS=g.flags;LAUNCH_BLOCKS=g.blocks;
 return g;
}
selectLaunchGeneration('blocks');
export function launchGenerationForToolkit(sha){
 for(const g of Object.values(GENERATIONS))if(g.toolkit===sha||g.legacyToolkit===sha)return g.id;
 throw new TypeError('Unrecognized launch toolkit');
}
// Generation of a pool package or controller constructor: only blocks launches name a blocks contract.
export const launchGenerationForConstructor=c=>c&&Object.hasOwn(c,'blocks')?'blocks':'l200';
const textCache=new Map();
/** Selects a generation and returns its pinned toolkit and metadata texts, fetched once per page. */
export async function loadLaunchGeneration(id,{base='/full-launch/',fetcher=globalThis.fetch}={}){
 const g=selectLaunchGeneration(id);
 if(!textCache.has(g.id))textCache.set(g.id,(async()=>{
  const read=async name=>{const r=await fetcher(base+g.path+name,{redirect:'error',cache:'no-store'});if(!r.ok)throw Error('Launch artifact unavailable: '+name);const t=await r.text();if(t.length>1000000)throw Error('Launch artifact too large');return t;};
  const [toolkitText,metadataText]=await Promise.all([read('toolkit.json'),read('metadata.json')]);return Object.freeze({toolkitText,metadataText});
 })().catch(e=>{textCache.delete(g.id);throw e;}));
 const texts=await textCache.get(g.id);selectLaunchGeneration(id);return texts;
}
const freeze=o=>{if(o&&typeof o==='object'){Object.values(o).forEach(freeze);Object.freeze(o);}return o;};
export async function readLaunchToolkit(raw){
 if(typeof raw!=='string'||raw.length>500000)throw new TypeError('Bounded launch toolkit required');
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw))),b=>b.toString(16).padStart(2,'0')).join('');
 if(!LAUNCH_TOOLKIT_SHAS.includes(hash))throw new TypeError('Unrecognized launch toolkit');
 const a=JSON.parse(raw);if(a.schemaVersion!==1||a.kind!=='qhooks-fee-graduation-toolkit'||a.requiredHookFlags!==LAUNCH_HOOK_FLAGS||a.localCompositionAccepted!==true)throw new TypeError('Launch toolkit identity');
 return freeze({sha256:hash,requiredHookFlags:LAUNCH_HOOK_FLAGS,contracts:a.contracts});
}
