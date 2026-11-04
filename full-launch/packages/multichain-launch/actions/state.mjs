// L72 chain-aware10820 action integration. New isolated acceptance required.
import {requireLaunchActionContext} from './context.mjs';
import {requireRpcChain} from '../../multichain/profiles.mjs';
// Lead-owned canonical read and full fixed-runtime validation. SOURCE ONLY.
import {abiEncode} from '../../launchpad/abi-encode.mjs';
import {abiWord} from '../../launchpad/abi-word.mjs';
import {graduationSchemas} from '../../../prototypes/pq-graduation/client/graduation-schema.mjs';
import {canonicalGraduationPart as part} from '../../../prototypes/pq-graduation/client/graduation-part.mjs';
import {decodeGraduationWords} from '../../../prototypes/pq-graduation/client/graduation-word-decode.mjs';
import {graduationPolicyHash,graduationBindingHash} from './operation.mjs';
import {zero32,zeroAddress,poolId,poolTuple,positionTuple,encodedHash} from '../../../prototypes/pq-graduation/client/graduation-descriptor.mjs';
import {ensure,hash,bytes,hashObject,freeze,quantity,q,setupCall} from '../../../prototypes/pq-graduation/client/graduation-setup-plan.mjs';
const flat=s=>Object.values(s).flatMap(x=>typeof x==='string'?[x]:flat(x));
const observedStates=new WeakMap();
export function requireLaunchActionState(context,state){ensure(observedStates.get(state)===context,'Fresh locally observed launch state required');return state;}
function unpack(schema,values){let i=0;const visit=s=>Object.fromEntries(Object.entries(s).map(([k,t])=>[k,typeof t==='string'?values[i++]:visit(t)]));const value=visit(schema);ensure(i===values.length,'Decoded tuple size');return freeze(value);}
export function decodeGraduationPart(name,raw){ensure(typeof name==='string'&&Object.hasOwn(graduationSchemas,name),'Tuple schema');const schema=graduationSchemas[name];return unpack(schema,decodeGraduationWords(raw,flat(schema)));}
function descriptorPosition(raw){const types=[...flat(graduationSchemas.descriptor),...flat(graduationSchemas.position)],v=decodeGraduationWords(raw,types);return freeze({descriptor:unpack(graduationSchemas.descriptor,v.slice(0,6)),position:unpack(graduationSchemas.position,v.slice(6))});}
export function decodeGraduationPolicyState(raw){
 const v=decodeGraduationWords(raw,[...flat(graduationSchemas.policy),...flat(graduationSchemas.policy),'uint256','bytes32','bytes32','uint64',...flat(graduationSchemas.descriptor)]);
 return freeze({current:unpack(graduationSchemas.policy,v.slice(0,6)),pending:unpack(graduationSchemas.policy,v.slice(6,12)),version:v[12],currentHash:v[13],pendingHash:v[14],eta:v[15],pendingDestination:unpack(graduationSchemas.descriptor,v.slice(16))});
}
export async function readLaunchActionState({provider,context,live,tag='latest',extraDescriptors=[]}){
 const {plan,binding,planner}=requireLaunchActionContext(context);
 requireRpcChain(plan.chainId,await provider.request({method:'eth_chainId',params:[]}));await live();
 const rpc=async(method,params)=>{const result=await provider.request({method,params});await live();return result;};
 const block=structuredClone(await rpc('eth_getBlockByNumber',[tag,false]));ensure(block&&quantity(block.number)&&q(BigInt(block.number))===block.number&&quantity(block.timestamp)&&q(BigInt(block.timestamp))===block.timestamp&&typeof block.hash==='string'&&block.hash.length===66&&/^0x[0-9a-f]{64}$/.test(block.hash),'Canonical block');
 const timestamp=BigInt(block.timestamp).toString();ensure(BigInt(timestamp)<(1n<<64n)-900n,'Block timestamp');
 for(const[id,code]of Object.entries(binding.codes))ensure(await rpc('eth_getCode',[plan.graph[id],block.number])===code,'Setup runtime changed');
 const call=(to,sig,types=[],values=[])=>rpc('eth_call',[{to,data:setupCall(sig,types,values),gas:q(7000000)},block.number]);
 const scalar=async(to,sig,type='uint256',types=[],values=[])=>decodeGraduationWords(await call(to,sig,types,values),[type])[0];
 const c=plan.graph.controller,phase=await scalar(c,'phase()','uint8'),nonce=await scalar(c,'nextNonce()');ensure(['0','1','2','3'].includes(phase),'Controller phase');
 const source=descriptorPosition(await call(c,'source()')),destination=descriptorPosition(await call(c,'destination()')),policy=decodeGraduationPolicyState(await call(c,'policyState()'));
 const module='0x'+Array.from(new TextEncoder().encode('QHOOKS/QGRAD/SLH128S/V1'),x=>x.toString(16).padStart(2,'0')).join('').padEnd(64,'0');
 const profile='0x'+Array.from(new TextEncoder().encode('SLH-DSA-SHA2-128s/FIPS205'),x=>x.toString(16).padStart(2,'0')).join('').padEnd(64,'0');
 const accountId=encodedHash(['uint256','address','bytes32','bytes32','address','bytes32'],[plan.chainId,c,module,profile,plan.profile.owner,plan.profile.publicKey]);ensure(await call(c,'accountId()')===accountId,'Graduation account changed');
 const hookCodes={},poolStates={},descriptors=new Map();
 for(const d of [source.descriptor,destination.descriptor,policy.pendingDestination,...extraDescriptors])if(d.key.hooks!==zeroAddress){const expected=planner.describe(d);descriptors.set(expected.descriptor.key.hooks,expected);}
 for(const[hook,expected]of descriptors){
  const actual=await rpc('eth_getCode',[hook,block.number]);
  if(actual!=='0x'){
   ensure(actual===expected.runtime,'Fee-aware hook runtime changed');
  }
  hookCodes[hook]=actual;
  const slot=BigInt(encodedHash(['bytes32','uint256'],[expected.poolId,'6'])),words=[];
  for(let i=0;i<4;i++)words.push(await scalar(plan.graph.manager,'extsload(bytes32)','bytes32',['bytes32'],['0x'+abiWord('uint256',((slot+BigInt(i))%(1n<<256n)).toString())]));
  poolStates[hook]=words;
 }
 let sourceLiquidity='0',destinationLiquidity='0',observed='0',bindingHash=zero32;
 const posLiquidity=async pair=>{const k=part('pool',pair.descriptor.key),p=part('position',pair.position);return scalar(plan.graph.escrow,'positionLiquidity('+poolTuple+','+positionTuple+')','uint128',[...k.types,...p.types],[...k.values,...p.values]);};
 if(phase==='0')ensure(nonce==='0'&&policy.version==='0'&&policy.currentHash===zero32&&policy.pendingHash===zero32&&source.descriptor.key.hooks===zeroAddress&&destination.descriptor.key.hooks===zeroAddress,'Uninitialized state changed');
 else{
  ensure(BigInt(policy.version)>0n&&policy.currentHash===graduationPolicyHash(policy.current),'Current policy mismatch');
  ensure(hookCodes[source.descriptor.key.hooks]&&hookCodes[source.descriptor.key.hooks]!=='0x','Source hook unavailable');
  const b={manager:plan.graph.manager,quote:plan.graph.quote,notice:plan.profile.fields.notice,source:source.descriptor,position:source.position};bindingHash=graduationBindingHash(b);ensure(await call(c,'bindingHash()')===bindingHash,'Source binding mismatch');
  sourceLiquidity=await posLiquidity(source);ensure(sourceLiquidity===(phase==='1'?source.position.liquidity:'0'),'Source LP mismatch');
  observed=await scalar(source.descriptor.key.hooks,'observedNetQuote()');
  if(['2','3'].includes(phase)){ensure(hookCodes[destination.descriptor.key.hooks]&&hookCodes[destination.descriptor.key.hooks]!=='0x','Destination hook unavailable');destinationLiquidity=await posLiquidity(destination);ensure(destinationLiquidity===(phase==='2'?destination.position.liquidity:'0'),'Destination LP mismatch');}
 }
 if(policy.pendingHash!==zero32)ensure(phase==='1'&&policy.pendingHash===graduationPolicyHash(policy.pending)&&policy.eta!=='0','Pending policy mismatch');
 else ensure(policy.eta==='0','Unexpected pending ETA');
 // The wallet and post-quantum key acting for the launch now (they can rotate; the identity above stays fixed).
 // Controllers without key rotation answer nothing here, and the launch's original keys apply.
 let keys={owner:plan.profile.owner,publicKey:plan.profile.publicKey,epoch:'1'};
 try{const o=await call(c,'currentOwner()'),k=await call(c,'currentPublicKey()'),e=await scalar(c,'authEpoch()');
  if(/^0x0{24}[0-9a-f]{40}$/.test(o)&&/^0x[0-9a-f]{64}$/.test(k)&&BigInt(o)>0n&&BigInt(k)>0n&&BigInt(e)>0n)keys={owner:'0x'+o.slice(26),publicKey:k,epoch:e};}catch{}
 const assets={};for(const asset of [plan.constructor.currency0,plan.constructor.currency1])assets[asset]={balance:await scalar(asset,'balanceOf(address)','uint256',['address'],[keys.owner]),allowance:await scalar(asset,'allowance(address,address)','uint256',['address','address'],[keys.owner,plan.graph.escrow]),escrowBalance:await scalar(asset,'balanceOf(address)','uint256',['address'],[plan.graph.escrow])};
 ensure((await rpc('eth_getBlockByNumber',[block.number,false]))?.hash===block.hash,'State block changed');
 const state={phase,nonce,source,destination,policy,accountId,module,profile,keys,bindingHash,sourceLiquidity,destinationLiquidity,observed,assets,hookCodes,poolStates};
 requireRpcChain(plan.chainId,await rpc('eth_chainId',[]));
 const result=freeze({...state,fingerprint:hashObject(state),timestamp,blockNumber:block.number,blockHash:block.hash});observedStates.set(result,context);return result;
}
