// Lead-owned CREATE2 and policy commitments; accepted artifact only. SOURCE ONLY.
import {abiEncode} from '../../../packages/launchpad/abi-encode.mjs';
import {abiWord} from '../../../packages/launchpad/abi-word.mjs';
import {canonicalGraduationPart as part} from './graduation-part.mjs';
import {ensure,hash,bytes,freeze} from './graduation-setup-plan.mjs';
export const zero32='0x'+'0'.repeat(64),zeroAddress='0x'+'0'.repeat(40);
export const poolTuple='(address,address,uint24,int24,address)',positionTuple='(int24,int24,bytes32,uint128)';
export const encodedHash=(types,values)=>hash(bytes(abiEncode(types,values)));
export const poolId=d=>{const p=part('pool',d.key);return encodedHash(p.types,p.values);};
export function graduationHookInit(plan,fee,tickSpacing){
 abiWord('uint24',fee);abiWord('int24',tickSpacing);ensure(BigInt(fee)<=1000000n&&BigInt(tickSpacing)>0n&&BigInt(tickSpacing)<=32767n,'Pool fee/spacing');
 const c=plan.constructor,g=plan.graph;
 return plan.contracts.sourceHook.bytecode+abiEncode(['address','address','address','uint24','int24','address','address'],[g.manager,c.currency0,c.currency1,fee,tickSpacing,g.escrow,g.quote]).slice(2);
}
export function graduationDescriptor(plan,input){
 const d=part('descriptor',input).value,c=plan.constructor;
 ensure(d.key.currency0===c.currency0&&d.key.currency1===c.currency1,'Fixed setup currencies');
 const init=graduationHookInit(plan,d.key.fee,d.key.tickSpacing),initHash=hash(bytes(init));
 const predicted='0x'+hash(bytes('0xff'+plan.graph.factory.slice(2)+d.hookSalt.slice(2)+initHash.slice(2))).slice(-40);
 ensure(predicted===d.key.hooks&&(BigInt(predicted)&16383n)===10816n,'Exact factory hook identity');
 return freeze({descriptor:d,init,initHash,poolId:poolId(d),retainedHash:encodedHash(['string','address','address',...part('pool',d.key).types,'bytes32'],['QHOOKS/QGRAD/RETAINED/1',plan.graph.manager,plan.graph.quote,...part('pool',d.key).values,hash(bytes(plan.contracts.sourceHook.bytecode))])});
}
export async function findGraduationDescriptor(plan,{fee,tickSpacing,start='0'},isLive=()=>true){
 abiWord('uint256',start);ensure(typeof isLive==='function','Search guard');
 const init=graduationHookInit(plan,fee,tickSpacing),ih=hash(bytes(init)),first=BigInt(start),end=first+250000n;ensure(end<(1n<<256n),'Search bound');
 for(let i=first;i<end;i++){
  if((i-first)%1024n===0n){ensure(isLive(),'Hook search cancelled');await new Promise(resolve=>setTimeout(resolve,0));ensure(isLive(),'Hook search cancelled');}
  const salt='0x'+abiWord('uint256',i.toString()),address='0x'+hash(bytes('0xff'+plan.graph.factory.slice(2)+salt.slice(2)+ih.slice(2))).slice(-40);
  if((BigInt(address)&16383n)===10816n)return graduationDescriptor(plan,{key:{currency0:plan.constructor.currency0,currency1:plan.constructor.currency1,fee,tickSpacing,hooks:address},hookSalt:salt}).descriptor;
 }
 throw new Error('No valid hook in the bounded search range');
}
export function graduationPolicyFor(plan,binding,{mode,threshold,destination}){
 ensure(['0','1','2'].includes(mode),'Policy mode');abiWord('uint256',threshold);
 if(mode==='2'){ensure(threshold==='0','Stay threshold');return part('policy',{mode,metric:'0',threshold,destinationPoolId:zero32,adapterCodeHash:zero32,retainedHooksHash:zero32}).value;}
 ensure(mode==='0'?BigInt(threshold)>0n:threshold==='0','Threshold or manual cap');const d=graduationDescriptor(plan,destination);
 return part('policy',{mode,metric:'0',threshold,destinationPoolId:d.poolId,adapterCodeHash:hash(bytes(binding.codes.controller)),retainedHooksHash:d.retainedHash}).value;
}
