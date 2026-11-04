// Exact compiled bytecode comparison, including every immutable insertion.
// Getter equality alone does not establish contract identity.
import {readLaunchToolkit,LAUNCH_TOOLKIT_SHA,LAUNCH_IMMUTABLES_SHA} from './artifact.mjs';
// Pins follow the selected launch generation (see artifact.mjs).
export {LAUNCH_IMMUTABLES_SHA,LEGACY_LAUNCH_IMMUTABLES_SHA} from './artifact.mjs';
const ensure=(ok,m)=>{if(!ok)throw new TypeError(m);};
const hex=b=>Array.from(b,v=>v.toString(16).padStart(2,'0')).join('');
function valuesFor(input,refs){
 ensure(input&&typeof input==='object'&&[null,Object.prototype].includes(Object.getPrototypeOf(input)),'Plain runtime bindings required');
 const d=Object.getOwnPropertyDescriptors(input),keys=Reflect.ownKeys(d),names=refs.map(r=>r.name),out={};
 ensure(keys.length===names.length&&keys.every(k=>names.includes(k)),'Exact immutable bindings required');
 for(const r of refs){
  const x=d[r.name];ensure(x.enumerable&&Object.hasOwn(x,'value')&&typeof x.value==='string'&&/^0x[0-9a-f]{64}$/.test(x.value),'Canonical immutable ABI word required');
  const n=BigInt(x.value),t=r.type;
  // A launch without blocks binds the zero address as its blocks contract.
  if(t==='address'||t==='Currency'||t.startsWith('contract '))ensure((n>0n||r.name==='blocks')&&n<(1n<<160n),'Nonzero immutable address required');
  else if(t==='bool')ensure(n<=1n,'Immutable bool out of range');
  else if(/^uint(?:8|24|64|256)$/.test(t))ensure(n<(1n<<BigInt(t.slice(4))),'Immutable uint out of range');
  else if(t==='int24')ensure(n===BigInt.asUintN(256,BigInt.asIntN(24,n)),'Immutable signed word out of range');
  else ensure(t==='bytes32','Unknown immutable type');
  out[r.name]=x.value.slice(2);
 }
 return out;
}
export async function createLaunchRuntime({toolkitText,metadataText}){
 const toolkit=await readLaunchToolkit(toolkitText);
 ensure(typeof metadataText==='string'&&metadataText.length<=20000,'Bounded fixed immutable metadata required');
 const h=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(metadataText))));
 ensure(h===LAUNCH_IMMUTABLES_SHA,'Immutable metadata identity mismatch');const metadata=JSON.parse(metadataText);
 ensure(metadata.schemaVersion===1&&metadata.kind==='qhooks-launch-immutable-metadata'&&metadata.artifactSha256===LAUNCH_TOOLKIT_SHA,'Launch metadata binding mismatch');
 function expected(stage,values){
  ensure(typeof stage==='string'&&Object.hasOwn(metadata.contracts,stage),'Unknown launch runtime');
  const refs=metadata.contracts[stage].immutables,v=valuesFor(values,refs);let code=toolkit.contracts[stage].deployedBytecode;
  for(const r of refs)for(const {start,length}of r.ranges){ensure(length===32&&start>=0&&start+32<=(code.length-2)/2,'Invalid immutable range');const a=2+start*2,b=a+64;ensure(code.slice(a,b)==='0'.repeat(64),'Overlapping immutable metadata');code=code.slice(0,a)+v[r.name]+code.slice(b);}
  return code;
 }
 return Object.freeze({expected,matches:(stage,values,code)=>typeof code==='string'&&code===expected(stage,values),artifactSha256:LAUNCH_TOOLKIT_SHA,metadataSha256:LAUNCH_IMMUTABLES_SHA});
}
