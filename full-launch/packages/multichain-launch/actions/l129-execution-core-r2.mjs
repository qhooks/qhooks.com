// L129 additive boundary-aware variant of packages/multichain-launch/actions/execution-core.mjs SHA df3309ad83ec1e176b1d171d8ca4f1901e6887b5602561b72dfa122ce8286ae6.
import {requireLiveBoundLaunchProvider} from '../l129-guarded-provider-r2.mjs';
// Internal execution core. The public entry point is connected.mjs, which always
// constructs fixed production admission. Fixtures exercise this core separately.
import {requireLaunchActionContext} from './context.mjs';
import {readLaunchActionState} from './state.mjs';
import {planLaunchAction,actionExtraDescriptors} from './plan.mjs';
import {createGraduationApprover} from './approval.mjs';
import {graduationCalldata} from './calldata.mjs';
import {graduationReceiptOutcome} from './outcome.mjs';
import {launchActionJournal,readLaunchActionJournal} from './journal.mjs';
import {parseGraduationActionFields} from '../../../prototypes/pq-graduation/client/graduation-action-fields.mjs';
import {typedGraduationAction} from '../../../prototypes/pq-graduation/client/graduation-typed-data.mjs';
import {leaseGraduationSigner} from '../../../prototypes/pq-graduation/client/graduation-signer-lease.mjs';
import {walletFeePolicy,quoteWalletCall,recheckWalletCall} from '../../chain-wallet/fees.mjs';
import {matchesReviewedTransaction,matchesReceipt} from '../../multichain/receipt-match.mjs';
import {ensure,freeze} from '../../token-launch/artifact.mjs';
const hash=x=>typeof x==='string'&&x.length===66&&x.startsWith('0x')&&!/[^0-9a-f]/.test(x.slice(2));
const events=['accountsChanged','chainChanged','disconnect'];
export async function createLaunchActionExecution({provider,session,context,admission,fields:raw,signer=null,saved=null,save,onChange=()=>{},clock=Date.now}){
 const {plan}=requireLaunchActionContext(context),policy=walletFeePolicy(plan.chainId),connection=session?.current;
 ensure(provider&&['request','on','removeListener'].every(k=>typeof provider[k]==='function')&&typeof session?.refresh==='function'&&typeof admission?.verify==='function'&&[save,onChange,clock].every(f=>typeof f==='function'),'Connected action dependencies');
 // The wallet that acts for the launch can rotate: it is checked against the chain's current owner on inspect.
 ensure(connection?.chainId===plan.chainId&&/^0x[0-9a-f]{40}$/.test(connection.owner||''),'Connect the exact launch owner and chain');
 let currentKeys={owner:plan.profile.owner,publicKey:plan.profile.publicKey};
 ensure(saved===null||typeof saved==='string','Public recovery journal required');ensure(signer===null||typeof signer?.lock==='function','Signer interface');
 let busy=false,dead=false,connectionInvalid=false,revision=0,intent=null,proof=null,stage=null,review=null,consent=null,approval=null,outcome=null,attention=null,saveFailed=false,activeApprover=null;
 const recoveryOnly=saved!==null,now=()=>{const t=clock();ensure(Number.isSafeInteger(t)&&t>=0&&Number.isSafeInteger(t+120000),'Invalid action clock');return t;};
 const snapshot=()=>freeze({chainId:plan.chainId,owner:plan.profile.owner,nativeSymbol:policy.nativeSymbol,busy,recoveryOnly,fields:intent?.fields||null,action:intent?.action?typedGraduationAction(intent.action).message:null,request:intent?.request||null,state:intent?.state||null,approved:!!approval,review,feesAccepted:!!review&&consent===review,stage:stage?structuredClone(stage):null,outcome,attention,saveFailed});
 const notify=()=>{try{onChange(snapshot());}catch{}};
 const invalidate=()=>{connectionInvalid=true;revision++;review=null;consent=null;approval=null;outcome=null;activeApprover?.invalidate();signer?.lock();attention='connection-changed';notify();};
 requireLiveBoundLaunchProvider(provider,session,connection);
 for(const e of events)provider.on(e,invalidate);
 const live=async rev=>{
  ensure(!dead&&!connectionInvalid&&rev===revision&&session.current===connection,'Action connection changed');
  requireLiveBoundLaunchProvider(provider,session,connection);
 };
 const journal=()=>{ensure(stage,'No public action transaction yet');return JSON.stringify(launchActionJournal(context,intent,proof,stage));};
 async function persist(){try{await save(journal());saveFailed=false;}catch(e){saveFailed=true;attention='save-failed';throw new Error('Save public action progress before continuing',{cause:e});}finally{notify();}}
 async function operation(fn,{allowSaveFailure=false}={}){
  ensure(!busy&&!dead&&(allowSaveFailure||!saveFailed),'Action unavailable or progress needs saving');busy=true;const rev=revision;notify();
  try{await live(rev);return await fn(()=>live(rev));}catch(e){review=null;consent=null;throw e;}finally{busy=false;notify();}
 }
 const rpc=async(live,method,params=[])=>{const value=await provider.request({method,params});await live();return value;};
 const admit=live=>admission.verify({request:(method,params=[])=>rpc(live,method,params),live});
 const readState=async(live,observation)=>{
  ensure(observation&&observation.chainId===plan.chainId&&hash(observation.blockHash),'Admitted canonical state block required');
  const state=await readLaunchActionState({provider,context,live,tag:observation.blockNumber,extraDescriptors:actionExtraDescriptors(intent.fields)});
  ensure(state.blockNumber===observation.blockNumber&&state.blockHash===observation.blockHash,'Admission and action state must share a canonical block');return state;
 };
 const canReplace=()=>!stage||['pending','rejected'].includes(stage.status);
 function keyReady(){if(intent.action)ensure(signer?.backupVerified&&!signer.locked&&signer.publicKeyHex===currentKeys.publicKey,'Restore and verify this launch key');}
 async function inspect(live){
  const observation=await admit(live),state=await readState(live,observation);ensure(state.fingerprint===intent.state.fingerprint,'Launch state changed; prepare a fresh action');
  if(state.keys)currentKeys=state.keys;ensure(connection.owner===currentKeys.owner,'Connect the exact launch owner and chain');
  if(intent.action)ensure(BigInt(state.timestamp)>=intent.action.validAfter&&BigInt(state.timestamp)<intent.action.validUntil,'Launch approval expired');
  planLaunchAction({context,input:intent.fields,state});return state;
 }
 function call(){
  if(!intent.action)return {to:intent.expected.to,data:intent.expected.input,value:intent.expected.value};
  ensure(approval&&proof,'Approve both keys first');return {to:plan.graph.controller,data:graduationCalldata(intent.action,intent.request,proof.walletSignatureHex,proof.pqSignatureHex),value:'0x0'};
 }
 async function reconcile(live){
  outcome=null;attention=null;ensure(stage,'No action transaction');await admit(live);
  if(!stage.hash){attention=stage.status==='unknown'?'recover-transaction-hash':'not-broadcast';return snapshot();}
  const tx=structuredClone(await rpc(live,'eth_getTransactionByHash',[stage.hash])),receipt=structuredClone(await rpc(live,'eth_getTransactionReceipt',[stage.hash]));
  if(!tx||!receipt||tx.blockHash===null||tx.blockNumber===null){attention='pending-or-replaced';return snapshot();}
  ensure(matchesReviewedTransaction(stage.transaction,tx,stage.hash)&&matchesReceipt(tx,receipt,stage.hash),'Action transaction or receipt differs from review');
  const block=structuredClone(await rpc(live,'eth_getBlockByNumber',[receipt.blockNumber,false]));
  if(!block||block.hash!==receipt.blockHash){attention='reorg';return snapshot();}
  ensure(block.number===receipt.blockNumber&&Array.isArray(block.transactions)&&block.transactions.includes(stage.hash),'Canonical action inclusion missing');
  if(receipt.status==='0x0'){stage.status='reverted';await persist();await live();attention='reverted';return snapshot();}
  const result={journal:{...stage,status:'confirmed'},receipt};
  const verified=await graduationReceiptOutcome({provider,context,intent,result,live});await admit(live);
  const again=await rpc(live,'eth_getBlockByNumber',[block.number,false]);ensure(again?.hash===block.hash&&again?.number===block.number,'Action observation reorganized');
  stage.status='confirmed';await persist();await live();outcome=verified;attention=null;return snapshot();
 }
 try{
  await live(0);const observation=await admit(()=>live(0));
  if(recoveryOnly){const restored=readLaunchActionJournal(context,saved);intent=restored.intent;proof=restored.proof;stage=structuredClone(restored.stage);{const st=await readState(()=>live(0),observation);if(st.keys)currentKeys=st.keys;}attention='revalidation-required';}
  else{const fields=parseGraduationActionFields(raw);intent={fields};intent=planLaunchAction({context,input:fields,state:await readState(()=>live(0),observation)});if(intent.state?.keys)currentKeys=intent.state.keys;}
 }catch(e){for(const event of events)provider.removeListener(event,invalidate);throw e;}
 const api={snapshot,journal,
  approve:()=>operation(async live=>{
   ensure(!recoveryOnly&&intent.action&&canReplace(),'Prepare a fresh protected action');keyReady();review=null;consent=null;approval=null;proof=null;stage=null;outcome=null;
   const before=await inspect(live),at=now(),lease=leaseGraduationSigner(signer);
   activeApprover=createGraduationApprover({provider,session,signer:lease,clock:()=>Number(before.timestamp)+Math.max(0,Math.floor((now()-at)/1000))});
   try{const next=await activeApprover.approve(intent.action,intent.request);await live();keyReady();await inspect(live);graduationCalldata(intent.action,intent.request,next.walletSignatureHex,next.pqSignatureHex);proof={walletSignatureHex:next.walletSignatureHex,pqSignatureHex:next.pqSignatureHex};approval=next;attention=null;return next;}
   finally{activeApprover?.dispose();activeApprover=null;}
  }),
  review:()=>operation(async live=>{
   ensure(!recoveryOnly&&canReplace(),'Reconcile the existing action first');keyReady();review=null;consent=null;outcome=null;
   const state=await inspect(live),quote=await quoteWalletCall({chainId:plan.chainId,request:(m,p)=>rpc(live,m,p),owner:connection.owner,call:call(),clock});
   ensure(quote.funded,'Insufficient '+policy.nativeSymbol+' for this action');await inspect(live);keyReady();
   stage={transaction:structuredClone(quote.transaction),status:'pending',hash:null};await persist();await live();keyReady();
   review=freeze({...quote,stateFingerprint:state.fingerprint,quote,serviceFeeMode:'off'});attention=null;return review;
  }),
  acceptFees(token){ensure(!busy&&!dead&&!saveFailed&&!recoveryOnly&&token&&token===review&&session.current===connection&&now()>=review.reviewedAt&&now()<review.expiresAt,'Accept this exact current fee review');keyReady();consent=review;notify();},
  submit:token=>operation(async live=>{
   ensure(!recoveryOnly&&token&&token===review&&consent===review&&stage?.status==='pending','Explicit current fee acceptance required');const chosen=review;review=null;consent=null;outcome=null;
   keyReady();await inspect(live);await recheckWalletCall({request:(m,p)=>rpc(live,m,p),quote:chosen.quote,clock});await inspect(live);keyReady();
   stage.status='submitting';let sent=false;
   try{
    await persist();await live();keyReady();
    ensure(now()>=chosen.reviewedAt&&now()<chosen.expiresAt,'Fee review expired before broadcast');
    ensure(await rpc(live,'eth_getTransactionCount',[connection.owner,'pending'])===stage.transaction.nonce,'Wallet nonce changed');await inspect(live);keyReady();
    sent=true;const h=await provider.request({method:'eth_sendTransaction',params:[structuredClone(stage.transaction)]});ensure(hash(h),'Wallet returned invalid action hash');stage.hash=h;stage.status='submitted';await persist();await live();return await reconcile(live);
   }catch(e){if(stage.status==='submitting'){stage.status=!sent||e?.code===4001?'rejected':'unknown';attention=stage.status==='unknown'?'recover-transaction-hash':null;try{await persist();}catch{}}throw e;}
  }),
  reconcile:()=>operation(async live=>{review=null;consent=null;return reconcile(live);}),
  recover:h=>operation(async live=>{
   ensure(stage?.status==='unknown'&&hash(h),'No uncertain action or invalid hash');review=null;consent=null;await admit(live);
   const tx=await rpc(live,'eth_getTransactionByHash',[h]);ensure(matchesReviewedTransaction(stage.transaction,tx,h),'Recovery transaction differs from reviewed action');stage.hash=h;stage.status='submitted';await persist();return reconcile(live);
  }),
  retrySave:()=>operation(async()=>{await persist();return snapshot();},{allowSaveFailure:true}),invalidate,
  dispose(){if(dead)return;dead=true;revision++;review=null;consent=null;approval=null;activeApprover?.dispose();for(const e of events)provider.removeListener(e,invalidate);}
 };
 if(recoveryOnly)for(const method of ['approve','review','acceptFees','submit'])delete api[method];
 return Object.freeze(api);
}
