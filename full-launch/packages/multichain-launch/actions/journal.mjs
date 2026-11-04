// Public-only, semantically exact recovery envelope. Imported records never send.
import {requireLaunchActionContext} from './context.mjs';
import {parseActionStage} from './action-stage-envelope.mjs';
import {assertCanonicalLaunchData} from './canonical-action-data.mjs';
import {walletFeePolicy} from '../../chain-wallet/fees.mjs';
import {shape,ensure,freeze} from '../../token-launch/artifact.mjs';
import {parseGraduationActionFields} from '../../../prototypes/pq-graduation/client/graduation-action-fields.mjs';
import {typedGraduationAction} from '../../../prototypes/pq-graduation/client/graduation-typed-data.mjs';
import {reviewGraduationAction} from './review.mjs';
import {graduationCalldata} from './calldata.mjs';
import {graduationKinds,graduationAllowanceCall,sameGraduationValue,validateLaunchPolicyBinding} from './plan.mjs';
import {zeroAddress} from '../../../prototypes/pq-graduation/client/graduation-descriptor.mjs';
const numbers=['schemaVersion','chainId','actionType','authEpoch','policyVersion','nonce','validAfter','validUntil'];
const actionKeys='schemaVersion chainId controller moduleId profileId accountId owner publicKey actionType authEpoch policyVersion policyHash operationHash nonce validAfter validUntil'.split(' ');
export function launchActionJournal(context,intent,proof,stage){
 const {plan}=requireLaunchActionContext(context);
 return freeze({schemaVersion:1,kind:'qhooks-connected-launch-action',setupPlanId:plan.id,fields:intent.fields,action:intent.action?typedGraduationAction(intent.action).message:null,request:intent.request,proof:proof?{...proof}:null,stage:structuredClone(stage)});
}
export function readLaunchActionJournal(context,text){
 const {plan,planner}=requireLaunchActionContext(context);ensure(typeof text==='string'&&text.length>0&&text.length<=250000,'Bounded action journal required');const root=JSON.parse(text);
 ensure(shape(root,['schemaVersion','kind','setupPlanId','fields','action','request','proof','stage'])&&root.schemaVersion===1&&root.kind==='qhooks-connected-launch-action'&&root.setupPlanId===plan.id,'Action journal identity');
 const fields=parseGraduationActionFields(root.fields);assertCanonicalLaunchData(Object.fromEntries(Object.entries(fields).filter(([k])=>k!=='kind')));
 ensure(sameGraduationValue(root.fields,fields),'Canonical journal fields required');let action=null,request=null,expected;
 if(fields.kind==='approve-token'){
  ensure(root.action===null&&root.request===null&&root.proof===null,'Unsigned allowance journal only');
  ensure(BigInt(fields.amount)<(1n<<256n)-1n,'Finite recovered allowance required');expected=graduationAllowanceCall(plan,fields);
 }else{
  ensure(shape(root.action,actionKeys)&&shape(root.proof,['walletSignatureHex','pqSignatureHex']),'Exact action and proof fields required');assertCanonicalLaunchData(root.action);assertCanonicalLaunchData(root.request);
  const converted=Object.fromEntries(Object.entries(root.action).map(([k,v])=>[k,numbers.includes(k)?BigInt(v):v]));
  const checked=reviewGraduationAction(converted,root.request);action=checked.action;request=checked.operation.review;
  ensure(action.chainId===BigInt(plan.chainId)&&action.controller===plan.graph.controller&&(action.authEpoch>1n||(action.owner===plan.profile.owner&&action.publicKey===plan.profile.publicKey))&&action.actionType===BigInt(graduationKinds[fields.kind]),'Recovered action domain mismatch');let inferred;
  if(fields.kind==='bootstrap'){
   inferred={kind:'bootstrap',bootstrap:request.bootstrap};ensure(request.manager===plan.graph.manager&&request.quote===plan.graph.quote&&request.notice===plan.profile.fields.notice,'Bootstrap binding mismatch');
   planner.describe(request.bootstrap.source);validateLaunchPolicyBinding(context,request.bootstrap.policy,request.bootstrap.destination,request.bootstrap.source);
  }else{
   ensure(request.binding.manager===plan.graph.manager&&request.binding.quote===plan.graph.quote&&request.binding.notice===plan.profile.fields.notice,'Recovered binding mismatch');planner.describe(request.binding.source);
   if(fields.kind==='announce')inferred={kind:'announce',policy:request.policy,destination:request.destination,eta:request.eta};
   else if(fields.kind==='migrate')inferred={kind:'migrate',migration:request.migration};
   else if(['fees','exit'].includes(fields.kind))inferred={kind:fields.kind,withdrawal:request.withdrawal};
   else inferred={kind:fields.kind};
   if(request.destination)validateLaunchPolicyBinding(context,request.policy||request.pendingPolicy||request.currentPolicy,request.destination,request.binding.source);
   if(request.pool)planner.describe(request.pool);
  }
  ensure(sameGraduationValue(parseGraduationActionFields(inferred),fields),'Recovered fields differ from signed operation');
  const recipient=request.migration?.limits.recipient??request.withdrawal?.recipient;ensure(![zeroAddress,plan.graph.controller,plan.graph.escrow].includes(recipient),'Invalid recovered payout recipient');
  expected={to:plan.graph.controller,input:graduationCalldata(action,request,root.proof.walletSignatureHex,root.proof.pqSignatureHex),value:'0x0'};
 }
 // After a key rotation the signed action names the wallet that sends it.
 const stage=parseActionStage(root.stage,walletFeePolicy(plan.chainId),action?.owner??plan.profile.owner),t=stage.transaction;
 ensure(t.to===expected.to&&t.data===expected.input&&t.value===expected.value,'Recovered transaction differs from exact operation');
 return freeze({intent:{fields,action,request,expected},proof:root.proof,stage});
}
