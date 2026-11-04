// Lead-owned receipt and post-state acceptance. Receipt success alone is not an
// application outcome. Imported confirmations are re-read at their mined block.
import {ensure,hash,freeze} from './graduation-setup-plan.mjs';
import {abiWord} from '../../../packages/launchpad/abi-word.mjs';
import {decodeGraduationWords} from './graduation-word-decode.mjs';
import {poolId,zero32} from './graduation-descriptor.mjs';
import {graduationPolicyHash} from './graduation-operation.mjs';
import {readGraduationState} from './graduation-state.mjs';
import {sameGraduationValue,actionExtraDescriptors} from './graduation-action-plan.mjs';
const topic=s=>hash(new TextEncoder().encode(s)),word=(type,value)=>'0x'+abiWord(type,String(value));
export async function graduationReceiptOutcome({provider,plan,binding,intent,result,live}){
 await live();if(result.journal.status!=='confirmed'||!result.receipt)return null;
 const rpc=async(method,params)=>{const r=await provider.request({method,params});await live();return r;};
 const receipt=await rpc('eth_getTransactionReceipt',[result.journal.hash]);
 ensure(receipt&&receipt.transactionHash===result.journal.hash&&receipt.blockHash===result.receipt.blockHash&&receipt.blockNumber===result.receipt.blockNumber&&receipt.status==='0x1'&&Array.isArray(receipt.logs),'Confirmed graduation receipt changed');
 const a=intent.action,r=intent.request,f=intent.fields;
 const post=await readGraduationState({provider,plan,binding,live,tag:receipt.blockNumber,extraDescriptors:actionExtraDescriptors(f)});
 ensure(post.blockHash===receipt.blockHash,'Outcome block changed');
 let emitter=plan.graph.controller,signature,indexed,types,expected,amounts=null;
 if(!a){
  ensure(f.kind==='approve-token','Unsigned action kind');emitter=f.asset;signature='Approval(address,address,uint256)';indexed=[word('address',plan.profile.owner),word('address',plan.graph.escrow)];types=['uint256'];expected=[f.amount];
  ensure(post.assets[f.asset]?.allowance===f.amount,'Exact escrow allowance missing');
 }else{
  const kind=Number(a.actionType),phase=kind===5?'2':kind===7?'3':kind===6?r.phase:'1';
  ensure(post.phase===phase&&post.nonce===(a.nonce+1n).toString(),'Protected phase or nonce outcome mismatch');
  const policy=kind===1?r.bootstrap.policy:kind===4?r.pendingPolicy:r.currentPolicy;
  const version=kind===1?'1':(a.policyVersion+(kind===4?1n:0n)).toString();
  ensure(post.policy.version===version&&post.policy.currentHash===graduationPolicyHash(policy)&&sameGraduationValue(post.policy.current,policy),'Policy outcome mismatch');
  const src=kind===1?r.bootstrap.source:r.binding.source,pos=kind===1?r.bootstrap.position:r.binding.position;
  ensure(sameGraduationValue(post.source.descriptor,src)&&sameGraduationValue(post.source.position,pos),'Source position binding changed');
  if([1,3,4,5,7].includes(kind))ensure(post.policy.pendingHash===zero32&&post.policy.eta==='0','Pending policy was not cleared');
  if(kind===1){
   ensure(sameGraduationValue(post.destination.descriptor,r.bootstrap.destination),'Bootstrap destination mismatch');
   signature='Bootstrapped(bytes32,bytes32,uint128)';indexed=[poolId(src)];types=['bytes32','uint128'];expected=[post.policy.currentHash,pos.liquidity];
  }else if(kind===2){
   const next=graduationPolicyHash(r.policy);ensure(post.policy.pendingHash===next&&sameGraduationValue(post.policy.pending,r.policy)&&sameGraduationValue(post.policy.pendingDestination,r.destination)&&post.policy.eta===r.eta,'Announcement outcome mismatch');
   signature='PolicyAnnounced(bytes32,bytes32,uint256,uint64)';indexed=[a.policyHash,next];types=['uint256','uint64'];expected=[(a.policyVersion+1n).toString(),r.eta];
  }else if(kind===3){
   signature='PolicyCancelled(bytes32,uint64)';indexed=[graduationPolicyHash(r.pendingPolicy)];types=['uint64'];expected=[r.eta];
  }else if(kind===4){
   ensure(sameGraduationValue(post.destination.descriptor,r.destination),'Applied destination mismatch');
   signature='PolicyApplied(bytes32,bytes32,uint256)';indexed=[a.policyHash,graduationPolicyHash(r.pendingPolicy)];types=['uint256'];expected=[version];
  }else if(kind===5){
   ensure(sameGraduationValue(post.destination.descriptor,r.destination)&&sameGraduationValue(post.destination.position,r.migration.destinationPosition),'Migrated position mismatch');
   signature='Graduated(bytes32,bytes32,uint128,uint128,address,uint256[4])';indexed=[poolId(src),poolId(r.destination)];types=['uint128','uint128','address','uint256','uint256','uint256','uint256'];expected=[r.migration.sourceLiquidity,r.migration.destinationPosition.liquidity,r.migration.limits.recipient];
  }else{
   ensure(kind===6||kind===7,'Withdrawal kind');const active=r.phase==='1'?post.source:post.destination;
   ensure(sameGraduationValue(active.descriptor,r.pool)&&sameGraduationValue(active.position,r.position),'Withdrawal position mismatch');
   signature='Paid(uint256,bytes32,address,uint256[2])';indexed=[word('uint256',kind),poolId(r.pool),word('address',r.withdrawal.recipient)];types=['uint256','uint256'];expected=[];
  }
 }
 const topics=[topic(signature),...indexed],matches=receipt.logs.filter(l=>l.address===emitter&&l.topics?.[0]===topics[0]);
 ensure(matches.length===1,'Exactly one application event required');const event=matches[0];
 ensure(!event.removed&&event.transactionHash===receipt.transactionHash&&event.blockHash===receipt.blockHash&&event.blockNumber===receipt.blockNumber&&sameGraduationValue(event.topics,topics),'Application event identity mismatch');
 const values=decodeGraduationWords(event.data,types);ensure(expected.every((v,i)=>values[i]===v),'Application event values mismatch');
 if(a?.actionType===5n){
  amounts=values.slice(3);const limits=r.migration.limits;
  ensure(BigInt(amounts[0])>=BigInt(limits.minRemoved0)&&BigInt(amounts[1])>=BigInt(limits.minRemoved1)&&BigInt(amounts[2])<=BigInt(limits.maxAdded0)&&BigInt(amounts[3])<=BigInt(limits.maxAdded1)&&BigInt(amounts[0])>=BigInt(amounts[2])&&BigInt(amounts[1])>=BigInt(amounts[3]),'Migration asset limits violated');
 }else if(a?.actionType===6n||a?.actionType===7n){amounts=values;ensure(BigInt(values[0])>=BigInt(r.withdrawal.minAmount0)&&BigInt(values[1])>=BigInt(r.withdrawal.minAmount1),'Payout minimum not met');}
 // Also reject changed deployment/hook runtimes at the current head. Do not
 // require the old nonce, phase or approval window to remain current on resume.
 await readGraduationState({provider,plan,binding,live,extraDescriptors:actionExtraDescriptors(f)});
 ensure((await rpc('eth_getBlockByNumber',[receipt.blockNumber,false]))?.hash===receipt.blockHash,'Graduation confirmation reorg');
 return freeze({kind:f.kind,hash:receipt.transactionHash,controller:plan.graph.controller,blockHash:receipt.blockHash,blockNumber:receipt.blockNumber,phase:post.phase,policyVersion:post.policy.version,pendingEta:post.policy.eta,amounts});
}
