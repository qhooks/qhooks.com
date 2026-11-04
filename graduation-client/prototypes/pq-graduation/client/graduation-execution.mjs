// Lead-owned connected action lifecycle. Local31337 only; SOURCE ONLY until
// Q50 isolated integration. Caller owns backups; this boundary never exports keys.
import {prepareGraduationSetup,ensure,address,quantity,q,freeze,hashObject} from './graduation-setup-plan.mjs';
import {parseGraduationActionFields} from './graduation-action-fields.mjs';
import {readGraduationState} from './graduation-state.mjs';
import {planGraduationAction,actionExtraDescriptors} from './graduation-action-plan.mjs';
import {createGraduationApprover} from './graduation-approval.mjs';
import {graduationCalldata} from './graduation-calldata.mjs';
import {typedGraduationAction} from './graduation-typed-data.mjs';
import {leaseGraduationSigner} from './graduation-signer-lease.mjs';
import {graduationJournal,readGraduationJournal} from './graduation-action-journal.mjs';
import {graduationReceiptOutcome} from './graduation-outcome.mjs';
import {createTransactionStage} from '../../../packages/launchpad/transaction-stage.mjs';
const events=['accountsChanged','chainChanged','disconnect'];
export async function createGraduationExecution({provider,session,setup,graduationText,tokenText,fields:raw,signer=null,saved=null,save,onChange=()=>{},clock=Date.now}){
 ensure(provider&&['request','on','removeListener'].every(k=>typeof provider[k]==='function')&&typeof session?.refresh==='function'&&typeof setup?.binding==='function'&&typeof save==='function'&&typeof onChange==='function'&&typeof clock==='function','Action dependencies');
 ensure(signer===null||typeof signer?.lock==='function','Signer interface');
 const connection=session.current;ensure(connection?.chainId==='31337'&&address(connection.owner),'Connect a local wallet');
 let busy=false,dead=false,revision=0,review=null,consent=null,approval=null,handle=null,latestStage=null,intent=null,outcome=null,attention=null,persistenceFailed=false,activeApprover=null;
 const recoveryOnly=saved!==null;
 const now=()=>{const n=clock();ensure(Number.isSafeInteger(n)&&n>=0&&n<=Number.MAX_SAFE_INTEGER-120000,'Invalid action clock');return n;};
 const snapshot=()=>freeze({busy,recoveryOnly,fields:intent?.fields||null,action:intent?.action?typedGraduationAction(intent.action).message:null,request:intent?.request||null,state:intent?.state||null,approved:!!approval,review,feesAccepted:!!review&&consent===review,journal:handle?.snapshot()||null,outcome,attention,persistenceFailed});
 const notify=()=>{try{onChange(snapshot());}catch{/* Presentation is not authority. */}};
 const invalidate=()=>{revision++;review=null;consent=null;approval=null;activeApprover?.invalidate();signer?.lock();outcome=null;attention='connection-changed';notify();};
 events.forEach(e=>provider.on(e,invalidate));
 const live=async rev=>{ensure(!dead&&rev===revision&&session.current===connection,'Action connection changed');await session.refresh(connection);ensure(!dead&&rev===revision&&session.current===connection&&connection.chainId==='31337','Action connection changed');};
 let binding,plan,proof=null;
 const journal=()=>{ensure(latestStage,'No reviewed public transaction yet');return JSON.stringify(graduationJournal(plan,intent,proof,latestStage));};
 async function persist(){try{await save(journal());persistenceFailed=false;}catch{persistenceFailed=true;attention='save-failed';throw new Error('Save the public action journal before continuing');}finally{notify();}}
 function stageFor(transaction,snapshot=null){
  const planId=hashObject({setupPlanId:plan.id,transaction});
  const next=createTransactionStage({provider,planId,transaction,snapshot,save:async stage=>{latestStage=stage;await persist();}});
  latestStage=next.snapshot();return next;
 }
 try{
  binding=await setup.binding();await live(0);plan=await prepareGraduationSetup(binding.profile,graduationText,tokenText);await live(0);
  ensure(binding.setupPlanId===plan.id&&connection.owner===plan.profile.owner,'Action setup changed');
  if(recoveryOnly){
   const recovered=readGraduationJournal(plan,binding,saved);intent=recovered.intent;proof=recovered.proof;
   handle=stageFor(recovered.transaction,recovered.stage);attention='revalidation-required';
   await readGraduationState({provider,plan,binding,live:()=>live(0),extraDescriptors:actionExtraDescriptors(intent.fields)});
  }else{
   const fields=parseGraduationActionFields(raw),state=await readGraduationState({provider,plan,binding,live:()=>live(0),extraDescriptors:actionExtraDescriptors(fields)});
   intent=planGraduationAction({plan,binding,input:fields,state});
  }
 }catch(error){handle?.dispose();events.forEach(e=>provider.removeListener(e,invalidate));throw error;}
 async function operation(fn,{allowSaveFailure=false}={}){
  ensure(!dead&&!busy,'Action unavailable');ensure(allowSaveFailure||!persistenceFailed,'Retry public journal saving first');busy=true;const rev=revision;notify();
  try{await live(rev);return await fn(()=>live(rev));}catch(error){review=null;consent=null;throw error;}finally{busy=false;notify();}
 }
 const canReplace=()=>!handle||['pending','rejected'].includes(handle.snapshot().status);
 function keyReady(){if(intent.action)ensure(signer?.backupVerified&&!signer.locked&&signer.publicKeyHex===plan.profile.publicKey,'Restore and verify this graduation key');}
 async function inspect(live){
  const state=await readGraduationState({provider,plan,binding,live,extraDescriptors:actionExtraDescriptors(intent.fields)});
  ensure(state.fingerprint===intent.state.fingerprint,'Graduation state changed; prepare a fresh action');
  if(intent.action)ensure(BigInt(state.timestamp)>=intent.action.validAfter&&BigInt(state.timestamp)<intent.action.validUntil,'Graduation approval expired');
  // Recheck time-dependent notice/eligibility and all funding/descriptor rules.
  planGraduationAction({plan,binding,input:intent.fields,state});return state;
 }
 const rpc=async(live,method,params=[])=>{const value=await provider.request({method,params});await live();return value;};
 function call(){
  if(!intent.action)return intent.expected;
  ensure(approval&&proof,'Approve both keys first');return {to:plan.graph.controller,input:graduationCalldata(intent.action,intent.request,proof.walletSignatureHex,proof.pqSignatureHex),value:'0x0'};
 }
 async function price(live,expected){
  const estimate=await rpc(live,'eth_estimateGas',[{from:connection.owner,to:expected.to,data:expected.input,value:expected.value}]),gasPrice=await rpc(live,'eth_gasPrice');
  ensure(quantity(estimate)&&BigInt(estimate)>0n&&quantity(gasPrice),'Action gas estimate');const gas=(BigInt(estimate)*12n+9n)/10n;
  const head=await rpc(live,'eth_getBlockByNumber',['latest',false]);ensure(gas<=7000000n&&head&&quantity(head.gasLimit)&&gas<=BigInt(head.gasLimit),'Local action gas bound');return {estimate,gas:q(gas),gasPrice};
 }
 async function finish(result,live){
  outcome=null;attention=result.attention||(result.journal.status==='confirmed'?null:result.journal.status);
  outcome=await graduationReceiptOutcome({provider,plan,binding,intent,result,live});return snapshot();
 }
 const api={snapshot,journal,
  approve:()=>operation(async live=>{
   ensure(!recoveryOnly&&intent.action&&canReplace(),'Prepare a fresh protected action');keyReady();review=null;consent=null;approval=null;proof=null;outcome=null;handle?.dispose();handle=null;latestStage=null;
   const before=await inspect(live),at=now(),lease=leaseGraduationSigner(signer);
   activeApprover=createGraduationApprover({provider,session,signer:lease,clock:()=>Number(before.timestamp)+Math.max(0,Math.floor((now()-at)/1000))});
   try{
    const next=await activeApprover.approve(intent.action,intent.request);await live();keyReady();await inspect(live);
    graduationCalldata(intent.action,intent.request,next.walletSignatureHex,next.pqSignatureHex);approval=next;proof={walletSignatureHex:next.walletSignatureHex,pqSignatureHex:next.pqSignatureHex};attention=null;return next;
   }finally{activeApprover?.dispose();activeApprover=null;}
  }),
  review:()=>operation(async live=>{
   ensure(!recoveryOnly&&canReplace(),'Reconcile the existing action first');keyReady();review=null;consent=null;outcome=null;
   const state=await inspect(live),expected=call(),nonce=await rpc(live,'eth_getTransactionCount',[connection.owner,'pending']);ensure(quantity(nonce),'Wallet nonce');
   const cost=await price(live,expected);await inspect(live);keyReady();
   const transaction=freeze({chainId:'0x7a69',from:connection.owner,to:expected.to,input:expected.input,value:expected.value,nonce,gas:cost.gas});
   handle?.dispose();handle=stageFor(transaction);await persist();await live();keyReady();const at=now();
   review=freeze({planId:latestStage.planId,transaction,stateFingerprint:state.fingerprint,estimatedGas:BigInt(cost.estimate).toString(),gasPriceWei:BigInt(cost.gasPrice).toString(),estimatedNetworkFeeWei:(BigInt(cost.estimate)*BigInt(cost.gasPrice)).toString(),gasLimitFeeEstimateWei:(BigInt(cost.gas)*BigInt(cost.gasPrice)).toString(),serviceFeeMode:'off',feeNote:'Network estimate only; your wallet confirms final fees.',reviewedAt:at,expiresAt:at+120000});attention=null;return review;
  }),
  acceptFees(token){ensure(!busy&&!dead&&!persistenceFailed&&!recoveryOnly&&token&&token===review&&session.current===connection&&now()>=review.reviewedAt&&now()<review.expiresAt,'Accept this exact current fee review');keyReady();consent=review;notify();},
  submit:token=>operation(async live=>{
   ensure(!recoveryOnly&&token&&token===review&&consent===review,'Explicit current fee acceptance required');const chosen=review;review=null;consent=null;outcome=null;
   ensure(now()>=chosen.reviewedAt&&now()<chosen.expiresAt,'Action review expired');keyReady();await inspect(live);const cost=await price(live,call());
   ensure(BigInt(cost.estimate).toString()===chosen.estimatedGas&&BigInt(cost.gasPrice).toString()===chosen.gasPriceWei&&cost.gas===chosen.transaction.gas,'Costs changed; review and accept again');await inspect(live);keyReady();
   try{await handle.submit();}catch(error){
    // In the accepted stage, the first submitting save precedes its send try.
    // Remaining in submitting after throw proves no provider send occurred.
    // Preserve the save-failed gate but allow explicit retry/review, never auto-send.
    if(handle.snapshot().status==='submitting'&&persistenceFailed){const tx=handle.snapshot().transaction;handle.dispose();handle=stageFor(tx);attention='save-failed-before-broadcast';}
    throw error;
   }
   await live();return finish(await handle.reconcile(),live);
  }),
  reconcile:()=>operation(async live=>{
   ensure(handle,'No action transaction');review=null;consent=null;outcome=null;const j=handle.snapshot();
   return finish(['submitted','confirmed','reverted'].includes(j.status)?await handle.reconcile():{journal:j,receipt:null,attention:j.status==='unknown'?'recover-transaction-hash':'not-broadcast'},live);
  }),
  recover:hash=>operation(async live=>{ensure(handle?.snapshot().status==='unknown','No uncertain transaction');review=null;consent=null;outcome=null;return finish(await handle.recover(hash),live);}),
  retrySave:()=>operation(async()=>{await persist();return snapshot();},{allowSaveFailure:true}),
  invalidate,
  dispose(){if(dead)return;dead=true;revision++;review=null;consent=null;approval=null;activeApprover?.dispose();handle?.dispose();events.forEach(e=>provider.removeListener(e,invalidate));}
 };
 // Recovery has no signing, fee-consent or sending capability, even after a
 // restored key is supplied. Only a newly prepared action can send.
 if(recoveryOnly)for(const key of ['approve','review','acceptFees','submit'])delete api[key];
 return Object.freeze(api);
}
