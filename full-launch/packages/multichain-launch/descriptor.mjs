// Lead-owned additive fee-aware pool planner. Candidate execution only in VM.
// Accepted legacy10816 descriptors remain untouched; this graph requires10820.
import {abiEncode} from '../launchpad/abi-encode.mjs';
import {canonicalGraduationPart as part} from '../../prototypes/pq-graduation/client/graduation-part.mjs';
import {hash,bytes,ownFields,freeze} from '../../prototypes/pq-graduation/client/graduation-setup-plan.mjs';
import {prepareLaunchController,launchConstructorProps} from './graph.mjs';
import {readLaunchToolkit,LAUNCH_BLOCKS,LAUNCH_HOOK_FLAGS} from './artifact.mjs';
import {createLaunchRuntime} from './runtime.mjs';
const ensure=(ok,m)=>{if(!ok)throw new TypeError(m);};
const zero32='0x'+'0'.repeat(64),word=v=>'0x'+BigInt(v).toString(16).padStart(64,'0');
const digest=(types,values)=>hash(bytes(abiEncode(types,values)));
function decimal(v,max){ensure(typeof v==='string'&&v.length>0&&v.length<=78&&!/[^0-9]/.test(v)&&BigInt(v).toString()===v&&BigInt(v)<=max,'Canonical bounded decimal required');return BigInt(v);}
function strictPart(name,input){
 const parsed=part(name,input);
 for(let i=0;i<parsed.values.length;i++){
  const v=parsed.values[i],t=parsed.types[i];
  if(t==='address'||t==='bytes32')ensure(v.length===(t==='address'?42:66)&&! /[^0-9a-f]/.test(v.slice(2)),'Exact canonical hex field');
  else ensure(BigInt(v).toString()===v,'Exact canonical integer field');
 }
 return parsed;
}
export async function createLaunchPoolPlanner({chainId,nonce,constructor,toolkitText,metadataText}){
 decimal(nonce,(1n<<64n)-2n);
 const supplied=ownFields(constructor,launchConstructorProps());
 for(const[k,v]of Object.entries(supplied)){
  if(k==='notice')decimal(v,2592000n);
  else ensure(typeof v==='string'&&v.length===(k==='publicKey'?66:42)&&v.startsWith('0x')&&!/[^0-9a-f]/.test(v.slice(2)),'Canonical constructor identity');
 }
 const [setup,toolkit,runtime]=await Promise.all([prepareLaunchController({chainId,nonce,constructor:supplied,toolkitText,metadataText}),readLaunchToolkit(toolkitText),createLaunchRuntime({toolkitText,metadataText})]);
 const g=setup.graph,c=g.constructor,code=toolkit.contracts.sourceHook.bytecode,blocks=LAUNCH_BLOCKS,flags=BigInt(LAUNCH_HOOK_FLAGS);
 function hookInit(fee,tickSpacing){
  const f=decimal(fee,100000n),t=decimal(tickSpacing,32767n);ensure(f>0n&&t>0n,'Nonzero fee and tick spacing required');
  const types=['address','address','address','uint24','int24','address','address','address'],values=[c.manager,c.currency0,c.currency1,fee,tickSpacing,g.escrow,c.quote,c.collector];
  if(blocks){types.push('address');values.push(c.blocks);}
  return code+abiEncode(types,values).slice(2);
 }
 function describe(input){
  const d=strictPart('descriptor',input).value,k=d.key;ensure(k.currency0===c.currency0&&k.currency1===c.currency1,'Fixed sorted launch currencies required');
  const init=hookInit(k.fee,k.tickSpacing),initHash=hash(bytes(init)),predicted='0x'+hash(bytes('0xff'+g.factory.slice(2)+d.hookSalt.slice(2)+initHash.slice(2))).slice(-40);
  ensure(k.hooks===predicted&&(BigInt(predicted)&16383n)===flags,'Exact fee-aware factory hook required');
  const pool=strictPart('pool',k),poolId=digest(pool.types,pool.values),f=BigInt(k.fee),protocol=f/5n;
  const bindings={manager:word(c.manager),currency0:word(c.currency0),currency1:word(c.currency1),poolFee:word(f),tickSpacing:word(k.tickSpacing),creatorFeePpm:word(f),protocolFeePpm:word(protocol),totalFeePpm:word(f+protocol),escrow:word(g.escrow),quoteIs0:word(c.quote===c.currency0?1:0),collector:word(c.collector),...(blocks?{blocks:word(c.blocks),blocksActive:word(BigInt(c.blocks)===0n?0:1)}:{})};
  return freeze({descriptor:d,init,initHash,poolId,runtime:runtime.expected('sourceHook',bindings),retainedHash:digest(['string','address','address',...pool.types,'bytes32'],['QHOOKS/QGRAD/RETAINED/1',c.manager,c.quote,...pool.values,hash(bytes(code))])});
 }
 async function find({fee,tickSpacing,start='0'},isLive=()=>true){
  const first=decimal(start,(1n<<256n)-250001n),end=first+250000n;ensure(typeof isLive==='function','Search cancellation guard required');
  const init=hookInit(fee,tickSpacing),ih=hash(bytes(init));
  for(let i=first;i<end;i++){
   if((i-first)%1024n===0n){ensure(isLive(),'Hook search cancelled');await new Promise(r=>setTimeout(r,0));ensure(isLive(),'Hook search cancelled');}
   const salt=word(i),target='0x'+hash(bytes('0xff'+g.factory.slice(2)+salt.slice(2)+ih.slice(2))).slice(-40);
   if((BigInt(target)&16383n)===flags)return describe({key:{currency0:c.currency0,currency1:c.currency1,fee,tickSpacing,hooks:target},hookSalt:salt}).descriptor;
  }
  throw new Error('No hook found in this bounded salt range');
 }
 function policy({mode,threshold,destination}){
  ensure(['0','1','2'].includes(mode),'Known graduation mode required');const limit=decimal(threshold,(1n<<256n)-1n);
  if(mode==='2'){ensure(limit===0n,'Stay mode has no threshold');return strictPart('policy',{mode,metric:'0',threshold,destinationPoolId:zero32,adapterCodeHash:zero32,retainedHooksHash:zero32}).value;}
  ensure(mode==='0'?limit>0n:limit===0n,'Threshold/manual graduation cap');const d=describe(destination);
  return strictPart('policy',{mode,metric:'0',threshold,destinationPoolId:d.poolId,adapterCodeHash:hash(bytes(setup.expected.controller)),retainedHooksHash:d.retainedHash}).value;
 }
 return Object.freeze({graph:g,expected:setup.expected,describe,find,policy,requiredHookFlags:LAUNCH_HOOK_FLAGS});
}
