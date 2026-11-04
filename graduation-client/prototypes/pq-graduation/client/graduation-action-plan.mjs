// Lead-owned live-state-to-intent boundary. Never accepts user nonce/domain or
// current policy as signing authority. SOURCE ONLY until isolated Q50 acceptance.
import {parseGraduationActionFields} from './graduation-action-fields.mjs';
import {graduationDescriptor,graduationPolicyFor,poolId,zeroAddress,zero32} from './graduation-descriptor.mjs';
import {prepareGraduationOperation,graduationPolicyHash} from './graduation-operation.mjs';
import {reviewGraduationAction} from './graduation-review.mjs';
import {ensure,freeze,setupCall} from './graduation-setup-plan.mjs';
export const graduationKinds=Object.freeze({bootstrap:1,announce:2,cancel:3,apply:4,migrate:5,fees:6,exit:7});
export const sameGraduationValue=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function actionExtraDescriptors(fields){
 const ds=fields.kind==='bootstrap'?[fields.bootstrap.source,fields.bootstrap.destination]:fields.kind==='announce'?[fields.destination]:[];
 return ds.filter(d=>d.key.hooks!==zeroAddress);
}
export function graduationAllowanceCall(plan,fields){
 ensure(fields.kind==='approve-token'&&[plan.constructor.currency0,plan.constructor.currency1].includes(fields.asset),'Fixed token allowance only');
 return freeze({to:fields.asset,input:setupCall('approve(address,uint256)',['address','uint256'],[plan.graph.escrow,fields.amount]),value:'0x0'});
}
export function validateGraduationPolicyBinding(plan,binding,policy,destination,source){
 const expected=graduationPolicyFor(plan,binding,{mode:policy.mode,threshold:policy.threshold,destination});
 ensure(sameGraduationValue(expected,policy),'Exact controller and retained-hook policy commitments required');
 if(policy.mode!=='2')ensure(poolId(destination)!==poolId(source),'Distinct destination pool required');
 // The accepted operation validator additionally enforces an entirely empty
 // Stay descriptor, nonzero liquidity and all tuple/position semantics.
}
export function planGraduationAction({plan,binding,input,state}){
 const fields=parseGraduationActionFields(input),phase=state.phase,policy=state.policy;
 const empty=d=>{graduationDescriptor(plan,d);ensure(state.hookCodes[d.key.hooks]==='0x'&&state.poolStates[d.key.hooks]?.every(v=>v===zero32),'Destination hook/pool already occupied');};
 const recipient=a=>ensure(![zeroAddress,plan.graph.controller,plan.graph.escrow].includes(a),'Invalid protected payout recipient');
 if(fields.kind==='approve-token'){
  const expected=graduationAllowanceCall(plan,fields),asset=state.assets[fields.asset];ensure(asset,'Unknown token');
  ensure(fields.amount==='0'||(phase==='0'&&BigInt(fields.amount)<=BigInt(asset.balance)),'Only pre-bootstrap exact allowances or explicit zero revocation');
  return freeze({fields,action:null,request:null,expected,state});
 }
 const kind=graduationKinds[fields.kind];let request;
 if(kind===1){
  ensure(phase==='0','Already initialized');const b=fields.bootstrap;
  empty(b.source);validateGraduationPolicyBinding(plan,binding,b.policy,b.destination,b.source);if(b.policy.mode!=='2')empty(b.destination);
  for(const [asset,max]of [[plan.constructor.currency0,b.maxAmount0],[plan.constructor.currency1,b.maxAmount1]]){
   ensure(BigInt(state.assets[asset].balance)>=BigInt(max)&&BigInt(state.assets[asset].allowance)>=BigInt(max),'Exact funding balance and escrow allowance required');
  }
  ensure(BigInt(b.maxAmount0)+BigInt(b.maxAmount1)>0n,'Nonzero funding limits');
  request={manager:plan.graph.manager,quote:plan.graph.quote,notice:plan.profile.fields.notice,bootstrap:b};
 }else{
  ensure(phase==='1'||phase==='2','No active graduation position');
  request={binding:{manager:plan.graph.manager,quote:plan.graph.quote,notice:plan.profile.fields.notice,source:state.source.descriptor,position:state.source.position},currentPolicy:policy.current};
  validateGraduationPolicyBinding(plan,binding,policy.current,state.destination.descriptor,state.source.descriptor);
  if(kind>=2&&kind<=4){
   ensure(phase==='1','Policy changes require source phase');
   if(kind===2){
    ensure(policy.pendingHash===zero32&&BigInt(policy.version)<(1n<<256n)-1n,'Pending policy or exhausted version');
    validateGraduationPolicyBinding(plan,binding,fields.policy,fields.destination,state.source.descriptor);
    ensure(graduationPolicyHash(fields.policy)!==policy.currentHash,'Policy is unchanged');
    if(fields.policy.mode!=='2')empty(fields.destination);
    ensure(BigInt(fields.eta)>=BigInt(state.timestamp)+BigInt(plan.profile.fields.notice),'Policy ETA violates notice');
    Object.assign(request,{policy:fields.policy,destination:fields.destination,eta:fields.eta});
   }else{
    ensure(policy.pendingHash!==zero32,'No pending policy');
    validateGraduationPolicyBinding(plan,binding,policy.pending,policy.pendingDestination,state.source.descriptor);
    if(kind===4)ensure(BigInt(state.timestamp)>=BigInt(policy.eta),'Policy notice has not elapsed');
    Object.assign(request,{pendingPolicy:policy.pending,destination:policy.pendingDestination,eta:policy.eta});
   }
  }else if(kind===5){
   ensure(phase==='1'&&policy.pendingHash===zero32&&policy.current.mode!=='2','Migration is not eligible');
   ensure(policy.current.mode==='1'||BigInt(state.observed)>=BigInt(policy.current.threshold),'Net raw quote threshold not reached');
   empty(state.destination.descriptor);recipient(fields.migration.limits.recipient);
   Object.assign(request,{destination:state.destination.descriptor,migration:fields.migration});
  }else{
   ensure(kind!==7||phase==='2','Source principal cannot exit');recipient(fields.withdrawal.recipient);
   const active=phase==='1'?state.source:state.destination;
   Object.assign(request,{phase,pool:active.descriptor,position:active.position,withdrawal:fields.withdrawal});
  }
 }
 const operation=prepareGraduationOperation(kind,request),action={schemaVersion:1n,chainId:31337n,controller:plan.graph.controller,moduleId:state.module,profileId:state.profile,accountId:state.accountId,owner:plan.profile.owner,publicKey:plan.profile.publicKey,actionType:BigInt(kind),authEpoch:1n,policyVersion:BigInt(policy.version),policyHash:policy.currentHash,operationHash:operation.operationHash,nonce:BigInt(state.nonce),validAfter:BigInt(state.timestamp),validUntil:BigInt(state.timestamp)+900n};
 const checked=reviewGraduationAction(action,operation.review);
 return freeze({fields,action:checked.action,request:checked.operation.review,expected:null,state});
}
