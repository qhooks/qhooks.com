// Lead-owned semantic public journal validation. Import is recovery-only.
import {parseGraduationJournalEnvelope} from './graduation-journal-envelope.mjs';
import {parseGraduationActionFields} from './graduation-action-fields.mjs';
import {typedGraduationAction} from './graduation-typed-data.mjs';
import {reviewGraduationAction} from './graduation-review.mjs';
import {graduationCalldata} from './graduation-calldata.mjs';
import {graduationKinds,graduationAllowanceCall,sameGraduationValue,validateGraduationPolicyBinding} from './graduation-action-plan.mjs';
import {graduationDescriptor,zeroAddress} from './graduation-descriptor.mjs';
import {ensure,freeze,quantity} from './graduation-setup-plan.mjs';
import {abiWord} from '../../../packages/launchpad/abi-word.mjs';
const numbers=['schemaVersion','chainId','actionType','authEpoch','policyVersion','nonce','validAfter','validUntil'];
export function graduationActionFromMessage(message){
 const entries=Object.entries(message).map(([key,value])=>{
  if(!numbers.includes(key))return [key,value];
  abiWord(key==='validAfter'||key==='validUntil'?'uint64':'uint256',value);return [key,BigInt(value)];
 });
 return Object.fromEntries(entries);
}
export function graduationJournal(plan,intent,proof,stage){
 return freeze({schemaVersion:1,kind:'qhooks-graduation-action-journal',setupPlanId:plan.id,fields:intent.fields,action:intent.action?typedGraduationAction(intent.action).message:null,request:intent.request,proof:proof?{walletSignatureHex:proof.walletSignatureHex,pqSignatureHex:proof.pqSignatureHex}:null,stage:structuredClone(stage)});
}
export function readGraduationJournal(plan,binding,text){
 const root=parseGraduationJournalEnvelope(text);ensure(root.setupPlanId===plan.id,'Different setup journal');
 let action=null,request=null,expected;
 if(root.fields.kind==='approve-token')expected=graduationAllowanceCall(plan,root.fields);
 else{
  const checked=reviewGraduationAction(graduationActionFromMessage(root.action),root.request);action=checked.action;request=checked.operation.review;
  ensure(action.chainId===31337n&&action.controller===plan.graph.controller&&action.owner===plan.profile.owner&&action.publicKey===plan.profile.publicKey&&action.actionType===BigInt(graduationKinds[root.fields.kind]),'Action journal identity');
  let fields;
  if(root.fields.kind==='bootstrap'){
   fields={kind:'bootstrap',bootstrap:request.bootstrap};ensure(request.manager===plan.graph.manager&&request.quote===plan.graph.quote&&request.notice===plan.profile.fields.notice,'Bootstrap journal binding');
   graduationDescriptor(plan,request.bootstrap.source);validateGraduationPolicyBinding(plan,binding,request.bootstrap.policy,request.bootstrap.destination,request.bootstrap.source);
  }else{
   ensure(request.binding.manager===plan.graph.manager&&request.binding.quote===plan.graph.quote&&request.binding.notice===plan.profile.fields.notice,'Action journal binding');graduationDescriptor(plan,request.binding.source);
   if(root.fields.kind==='announce')fields={kind:'announce',policy:request.policy,destination:request.destination,eta:request.eta};
   else if(root.fields.kind==='migrate')fields={kind:'migrate',migration:request.migration};
   else if(root.fields.kind==='fees'||root.fields.kind==='exit')fields={kind:root.fields.kind,withdrawal:request.withdrawal};
   else fields={kind:root.fields.kind};
   if(request.destination){const policy=request.policy||request.pendingPolicy||request.currentPolicy;validateGraduationPolicyBinding(plan,binding,policy,request.destination,request.binding.source);}
   if(request.pool)graduationDescriptor(plan,request.pool);
  }
  ensure(sameGraduationValue(parseGraduationActionFields(fields),root.fields),'Operation fields differ from signed review');
  const recipient=request.migration?.limits.recipient??request.withdrawal?.recipient;
  ensure(![zeroAddress,plan.graph.controller,plan.graph.escrow].includes(recipient),'Journal payout recipient');
  expected={to:plan.graph.controller,input:graduationCalldata(action,request,root.proof.walletSignatureHex,root.proof.pqSignatureHex),value:'0x0'};
 }
 const tx=root.stage.transaction;
 ensure(quantity(tx.nonce)&&quantity(tx.gas)&&BigInt(tx.gas)>0n&&BigInt(tx.gas)<=7000000n,'Recovered gas/nonce bound');
 const transaction={chainId:'0x7a69',from:plan.profile.owner,to:expected.to,input:expected.input,value:expected.value,nonce:tx.nonce,gas:tx.gas};
 ensure(sameGraduationValue(tx,transaction),'Recovered transaction differs from exact action');
 return freeze({intent:{fields:root.fields,action,request,expected},proof:root.proof,stage:root.stage,transaction});
}
