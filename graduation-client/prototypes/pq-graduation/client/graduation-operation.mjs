// Lead-owned fixed operation commitments. SOURCE ONLY until Q48 acceptance.
// Named, canonical transaction details, never an arbitrary operation hash/tag.
// This does NOT establish trusted deployment identity or read live chain state.
import {abiEncode} from '../../../packages/launchpad/abi-encode.mjs';
import {abiWord} from '../../../packages/launchpad/abi-word.mjs';
import {keccak_256} from '../../qpools/client/vendor/hashes/sha3.js';
import {canonicalGraduationPart as part} from './graduation-part.mjs';
import {graduationSchemas as schemas} from './graduation-schema.mjs';

const Z='0x'+'0'.repeat(40),Z32='0x'+'0'.repeat(64);
const ensure=(b,m)=>{if(!b)throw new TypeError(m);};
const hex=b=>'0x'+Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
const bytes=h=>Uint8Array.from(h.slice(2).match(/../g)||[],x=>parseInt(x,16));
const hash=h=>hex(keccak_256(bytes(h)));
const scalar=(type,value)=>{abiWord(type,value);return {types:[type],values:[value]};};
const together=items=>({types:items.flatMap(x=>x.types),values:items.flatMap(x=>x.values)});
const tagged=(tag,items)=>{const x=together(items);return hash(abiEncode(['string',...x.types],[tag,...x.values]));};
const tuple=s=>'('+Object.values(s).map(t=>typeof t==='string'?t:tuple(t)).join(',')+')';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function fields(input,names){
 ensure(input!==null&&typeof input==='object'&&!Array.isArray(input)&&[Object.prototype,null].includes(Object.getPrototypeOf(input)),'Plain operation object required');
 const d=Object.getOwnPropertyDescriptors(input),keys=Reflect.ownKeys(d);
 ensure(keys.length===names.length&&keys.every(k=>typeof k==='string'&&names.includes(k)),'Exact operation fields required');
 ensure(keys.every(k=>Object.hasOwn(d[k],'value')),'Operation accessors forbidden');
 return Object.fromEntries(names.map(k=>[k,d[k].value]));
}
function pool(d,source){
 const k=d.key;ensure(k.currency0!==Z&&BigInt(k.currency0)<BigInt(k.currency1),'Ordered nonzero token pair required');
 ensure(BigInt(k.fee)<=1000000n&&BigInt(k.tickSpacing)>0n&&BigInt(k.tickSpacing)<=32767n,'Invalid pool fee or spacing');
 ensure((BigInt(k.hooks)&16383n)===10816n,'Wrong hook permissions');
 if(source)ensure(k.currency0===source.key.currency0&&k.currency1===source.key.currency1,'Pool currency mismatch');
}
function position(p,d){const spacing=BigInt(d.key.tickSpacing),lo=BigInt(p.tickLower),hi=BigInt(p.tickUpper);ensure(BigInt(p.liquidity)>0n&&lo<hi&&lo>=-887272n&&hi<=887272n&&lo%spacing===0n&&hi%spacing===0n,'Invalid position');}
function policy(p){
 const c=p.value;ensure(c.metric==='0'&&['0','1','2'].includes(c.mode),'Only net raw quote policies supported');
 if(c.mode==='2')ensure(c.threshold==='0'&&c.destinationPoolId===Z32&&c.adapterCodeHash===Z32&&c.retainedHooksHash===Z32,'Stay policy must have no destination');
 else{ensure(c.destinationPoolId!==Z32&&c.adapterCodeHash!==Z32&&c.retainedHooksHash!==Z32,'Complete destination commitments required');ensure(c.mode==='0'?BigInt(c.threshold)>0n:c.threshold==='0','Invalid threshold');}
 return tagged('QHOOKS/GRADUATION/POLICY/1',[p]);
}
function destination(c,d,src){
 if(c.mode==='2'){ensure(Object.values(d.key).every(v=>BigInt(v)===0n)&&BigInt(d.hookSalt)===0n,'Stay destination must be empty');return;}
 pool(d,src);const p=part('pool',d.key),srcp=part('pool',src.key);
 const id=hash(abiEncode(p.types,p.values));ensure(id===c.destinationPoolId&&id!==hash(abiEncode(srcp.types,srcp.values)),'Destination pool commitment mismatch');
}
function bound(b){pool(b.value.source);position(b.value.position,b.value.source);ensure(b.value.manager!==Z&&[b.value.source.key.currency0,b.value.source.key.currency1].includes(b.value.quote),'Invalid manager or quote');ensure(BigInt(b.value.notice)>=3600n&&BigInt(b.value.notice)<=2592000n,'Invalid notice');return tagged('QHOOKS/QGRAD/BINDING/1',[b]);}
export function graduationPolicyHash(input){return policy(part('policy',input));}
export function graduationBindingHash(input){return bound(part('binding',input));}

export function prepareGraduationOperation(kind,input){
 ensure(Number.isInteger(kind)&&kind>=1&&kind<=7,'Invalid graduation action kind');
 let x,review,operationHash,argumentsParts=[],method,signature,currentPolicyHash=Z32,bindingHash;
 const T=tuple,PROOF='(uint256,uint64,uint64,bytes,bytes)';
 if(kind===1){
  x=fields(input,['manager','quote','notice','bootstrap']);const b=part('bootstrap',x.bootstrap);
  const binding=part('binding',{manager:x.manager,quote:x.quote,notice:x.notice,source:b.value.source,position:b.value.position});bindingHash=bound(binding);
  policy(part('policy',b.value.policy));destination(b.value.policy,b.value.destination,b.value.source);
  ensure(BigInt(b.value.sqrtPriceX96)>0n,'Zero initialization price');
  operationHash=tagged('QHOOKS/QGRAD/BOOTSTRAP/1',[scalar('address',x.manager),scalar('address',x.quote),scalar('uint64',x.notice),b]);
  review=Object.freeze({manager:binding.value.manager,quote:binding.value.quote,notice:binding.value.notice,bootstrap:b.value});argumentsParts=[b];method='bootstrap';signature=method+'('+T(schemas.bootstrap)+','+PROOF+')';
 }else{
  const specific=kind===2?['policy','destination','eta']:kind===3||kind===4?['pendingPolicy','destination','eta']:kind===5?['destination','migration']:['phase','pool','position','withdrawal'];
  x=fields(input,['binding','currentPolicy',...specific]);const b=part('binding',x.binding),cp=part('policy',x.currentPolicy);bindingHash=bound(b);currentPolicyHash=policy(cp);
  const bh=scalar('bytes32',bindingHash);review={binding:b.value,currentPolicy:cp.value};
  if(kind===2||kind===3||kind===4){
   const p=part('policy',kind===2?x.policy:x.pendingPolicy),d=part('descriptor',x.destination),eta=scalar('uint64',x.eta),ph=policy(p);
   destination(p.value,d.value,b.value.source);ensure(ph!==currentPolicyHash,'Policy is unchanged');
   review={...review,[kind===2?'policy':'pendingPolicy']:p.value,destination:d.value,eta:x.eta};
   if(kind===2){operationHash=tagged('QHOOKS/QGRAD/ANNOUNCE/1',[bh,p,d,eta]);argumentsParts=[p,d,eta];method='announcePolicy';signature=method+'('+T(schemas.policy)+','+T(schemas.descriptor)+',uint64,'+PROOF+')';}
   else{operationHash=tagged('QHOOKS/QGRAD/PENDING/1',[scalar('uint256',String(kind)),bh,scalar('bytes32',ph),d,eta]);method=kind===3?'cancelPolicy':'applyPolicy';signature=method+'('+PROOF+')';}
  }else if(kind===5){
   const d=part('descriptor',x.destination),m=part('migration',x.migration);ensure(cp.value.mode!=='2','Stay policy cannot migrate');destination(cp.value,d.value,b.value.source);position(m.value.destinationPosition,d.value);
   ensure(m.value.sourceLiquidity===b.value.position.liquidity&&BigInt(m.value.sqrtPriceX96)>0n&&BigInt(m.value.limits.minLiquidity)>0n&&BigInt(m.value.limits.minLiquidity)<=BigInt(m.value.destinationPosition.liquidity),'Invalid migration amounts');
   ensure(m.value.limits.recipient!==Z,'Zero recipient');operationHash=tagged('QHOOKS/QGRAD/MIGRATE/1',[bh,d,m]);argumentsParts=[m];method='migrate';signature=method+'('+T(schemas.migration)+','+PROOF+')';review={...review,destination:d.value,migration:m.value};
  }else{
   const phase=scalar('uint256',x.phase),d=part('descriptor',x.pool),p=part('position',x.position),w=part('withdrawal',x.withdrawal);
   ensure(['1','2'].includes(x.phase)&&(kind!==7||x.phase==='2'),'Invalid withdrawal phase');pool(d.value,b.value.source);position(p.value,d.value);ensure(w.value.recipient!==Z,'Zero recipient');
   if(x.phase==='1')ensure(same(d.value,b.value.source)&&same(p.value,b.value.position),'Source position mismatch');else destination(cp.value,d.value,b.value.source);
   operationHash=tagged('QHOOKS/QGRAD/WITHDRAW/1',[scalar('uint256',String(kind)),phase,bh,d,p,w]);argumentsParts=[w];method=kind===6?'collectFees':'exitDestination';signature=method+'('+T(schemas.withdrawal)+','+PROOF+')';review={...review,phase:x.phase,pool:d.value,position:p.value,withdrawal:w.value};
  }
  Object.freeze(review);
 }
 const args=together(argumentsParts);
 return Object.freeze({kind,method,signature,review,operationHash,bindingHash,currentPolicyHash,argumentTypes:Object.freeze(args.types),argumentValues:Object.freeze(args.values)});
}
