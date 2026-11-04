// New L65 asset-aware wallet workspace. Accepted signer is reused unchanged.
// Lead-owned chain-scoped native account integration. No automatic signing or submission.
import {createSigner,restoreSigner} from '../qpools/client/signer.mjs';
import {leasePoolSigner} from '../qpools/client/pool-signer-lease.mjs';
import {createPoolApprover} from '../qpools/client/pool-approval.mjs';
import {typedPoolAction} from '../qpools/client/pool-typed-data.mjs';
import {approvedPoolCalldata,poolCalldata,poolHash} from '../qpools/client/pool-calldata.mjs';
import {ensure,hex} from '../../apps/marketplace-preview/mainnet-fees.mjs';
import {bindWalletPool} from './wallet-binding.mjs';
import {readWalletAccount,walletActionFromState,validateWalletAction} from './wallet-state.mjs';
import {parseWalletFields} from './wallet-fields.mjs';
import {parsePublicAction} from '../mainnet-account/native-public-action.mjs';
import {parseWalletEnvelope,packWalletEnvelope} from './wallet-journal.mjs';
import {createWalletTransaction} from './wallet-transaction.mjs';
import {walletOutcome} from './wallet-outcome.mjs';
import {walletFeePolicy} from '../../packages/chain-wallet/fees.mjs';
import {walletCall,checkWalletFunding} from './wallet-calls.mjs';
import {ZERO} from './wallet-state.mjs';
const text=new TextEncoder();
const publicApproval=a=>a?Object.freeze({...a,action:typedPoolAction(a.action).message}):null;
const rawFields=f=>Object.freeze({kind:f.kind,asset:f.kind==='enroll'?'':f.asset,amount:f.kind==='enroll'?'':f.amount,recipient:f.recipient});
export async function createWalletWorkspace({chainId,provider,session,tokens,toolkitText,deploymentText,save,onChange=()=>{},clock=Date.now}){
 ensure(provider&&['request','on','removeListener'].every(k=>typeof provider[k]==='function')&&session&&typeof session.refresh==='function'&&[save,onChange,clock].every(f=>typeof f==='function'),'Native workspace dependencies');
 walletFeePolicy(chainId);const connected=session.current;ensure(connected?.chainId===chainId,'Connect your wallet on the selected chain');
 let master=null,publicKey=null,active=null,approver=null,approval=null,action=null,fields=null,account=null,prepared=null,latest=null,anchor=null,binding=null,busy=false,dead=false,revision=0;
 const snapshot=()=>Object.freeze({chainId,busy,connected:session.current===connected?connected:null,publicKeyHex:publicKey,keyId:master?.keyId||null,locked:!master||master.locked,backupVerified:!!master?.backupVerified,account,fields,action:action?typedPoolAction(action).message:null,execution:active?.snapshot()||null,pool:binding?.pool||null});
 const notify=()=>{try{onChange(snapshot());}catch{}};
 const invalidate=()=>{revision++;master?.lock();approver?.invalidate();active?.invalidateReview();account=null;notify();};
 const events=['accountsChanged','chainChanged','disconnect'];for(const e of events)provider.on(e,invalidate);
 async function operation(fn){
  ensure(!dead&&!busy,'Native workspace unavailable');busy=true;const rev=revision;notify();
  const live=async()=>{ensure(!dead&&rev===revision&&session.current===connected,'Native connection changed');await session.refresh(connected);ensure(!dead&&rev===revision&&session.current===connected,'Native connection changed');};
  try{await live();return await fn(live);}catch(e){if(dead||rev!==revision||session.current!==connected)invalidate();throw e;}finally{busy=false;notify();}
 }
 const canReplace=()=>{const s=active?.snapshot();return !s?.journal||['rejected','reverted'].includes(s.journal.status)||s.journal.status==='confirmed'&&!!s.outcome;};
 function clear(){ensure(canReplace(),'Reconcile the existing account transaction first');const previous=active;active=null;previous?.dispose();approver?.dispose();approver=null;approval=null;action=null;fields=null;prepared=null;latest=null;anchor=null;}
 const now=()=>{const n=clock();ensure(Number.isSafeInteger(n)&&n>=0,'Invalid workspace clock');return n;};
 const seconds=()=>{const n=now();ensure(anchor&&n>=anchor.wall,'Account clock changed');const result=BigInt(anchor.timestamp)+BigInt(Math.floor((n-anchor.wall)/1000));ensure(result<=BigInt(Number.MAX_SAFE_INTEGER),'Approval time bound');return Number(result);};
 const requireKey=()=>ensure(master&&!master.locked&&master.backupVerified&&master.publicKeyHex===publicKey,'Restore and verify this account key');
 async function inspect(live,asset=fields?.asset||ZERO){ensure(publicKey,'Create or restore an account key');account=await readWalletAccount({provider,binding,owner:connected.owner,publicKey,asset,live});return account;}
 async function currentAction(live){
  const state=await inspect(live);ensure(prepared&&state.fingerprint===prepared.fingerprint,'Account changed; prepare again');
  if(action){requireKey();validateWalletAction(action,{binding,owner:connected.owner,publicKey});const t=BigInt(seconds());ensure(BigInt(state.timestamp)>=action.validAfter&&BigInt(state.timestamp)<action.validUntil&&t>=action.validAfter&&t<action.validUntil,'Approval window expired');}
  else checkWalletFunding(state,fields);
  return state.fingerprint;
 }
 async function transaction({selected,approved,protectedAction,identity,saved=null}){
  const call=walletCall({binding,fields:selected,approval:approved,action:protectedAction,identity});
  const intentId=poolHash(text.encode(JSON.stringify(['qhooks-chain-wallet-account',binding.artifactSha256,chainId,connected.owner,identity.publicKey,call.to,call.data,call.value])));
  const metadata={publicKey:identity.publicKey,fields:rawFields(selected),approval:publicApproval(approved)};
  return createWalletTransaction({chainId,provider,owner:connected.owner,intentId,call,clock,saved,
   inspect:currentAction,
   confirm:(receipt,live)=>walletOutcome({provider,binding,identity,fields:selected,action:protectedAction,receipt,live}),
   save:async journal=>{latest=packWalletEnvelope({chainId,...metadata,journal});await save(latest);notify();},onChange:notify});
 }
 const api={snapshot,
  generate:()=>operation(async live=>{ensure(!master||master.locked,'Lock the current key before replacing it');clear();const next=createSigner();try{await live();master=next;publicKey=next.publicKeyHex;account=null;return snapshot();}catch(e){next.lock();throw e;}}),
  exportBackup:password=>operation(async live=>{ensure(master&&!master.locked,'Unlock a quantum key');const encrypted=await master.exportBackup(password);await live();return encrypted;}),
  verifyBackup:(encrypted,password)=>operation(async live=>{ensure(master&&!master.locked,'Create a quantum key first');await master.verifyBackup(encrypted,password);await live();return snapshot();}),
  restore:(encrypted,password)=>operation(async live=>{clear();master?.lock();const next=await restoreSigner(encrypted,password);try{await live();master=next;publicKey=next.publicKeyHex;account=null;return snapshot();}catch(e){next.lock();throw e;}}),
  lock:invalidate,
  refresh:(asset=ZERO)=>operation(async live=>{await inspect(live,asset);return snapshot();}),
  prepare:raw=>operation(async live=>{
   const selected=parseWalletFields(raw);clear();const state=await inspect(live,selected.asset);
   if(['deposit','approve-token'].includes(selected.kind))checkWalletFunding(state,selected);
   else requireKey();
   const candidate=['deposit','approve-token'].includes(selected.kind)?null:walletActionFromState(state,selected);
   fields=selected;action=candidate;prepared=state;anchor={wall:now(),timestamp:state.timestamp};
   if(action)approver=createPoolApprover({provider,session,signer:leasePoolSigner(master),clock:seconds});
   return snapshot();
  }),
  approve:()=>operation(async live=>{ensure(action&&approver&&!approval&&!active,'Prepare a fresh protected action');await currentAction(live);const result=await approver.approve(action);await live();await currentAction(live);approvedPoolCalldata(result,action);approval=result;return result;}),
  review:()=>operation(async live=>{
   ensure(fields&&prepared&&(!action||approval)&&!active?.snapshot().recoveryOnly,'Prepare and approve this action');await currentAction(live);
   if(!active)active=await transaction({selected:fields,approved:approval,protectedAction:action,identity:prepared});
   await live();return active.review();
  }),
  submit:quote=>operation(async live=>{ensure(active&&!active.snapshot().recoveryOnly,'Recovered progress cannot submit');const result=await active.submit(quote);await live();return result;}),
  reconcile:()=>operation(async live=>{ensure(active,'No account transaction');const result=await active.reconcile();await live();return result;}),
  recover:hash=>operation(async live=>{ensure(active,'No uncertain account transaction');const result=await active.recover(hash);await live();return result;}),
  save:()=>operation(async live=>{ensure(active,'No progress');const result=await active.save();await live();return result;}),
  exportJournal(){ensure(latest,'No public account progress');return latest;},
  resume:saved=>operation(async live=>{
   ensure(canReplace(),'Reconcile existing progress first');const root=parseWalletEnvelope(saved,chainId),selected=parseWalletFields(root.fields);
   ensure(!master||master.locked||master.publicKeyHex===root.publicKey,'Lock the other quantum key first');
   const state=await readWalletAccount({provider,binding,owner:connected.owner,publicKey:root.publicKey,asset:selected.asset,live});
   let protectedAction=null,approved=null;
   if(!['deposit','approve-token'].includes(selected.kind)){
    protectedAction=validateWalletAction(parsePublicAction(root.approval.action),{binding,owner:connected.owner,publicKey:root.publicKey});
    ensure(protectedAction.accountId===state.accountId&&protectedAction.policyHash===state.policyHash&&protectedAction.actionType===(selected.kind==='enroll'?1n:2n)&&protectedAction.asset===selected.asset&&protectedAction.amount.toString()===selected.amount&&protectedAction.recipient===(selected.kind==='enroll'?connected.owner:selected.recipient),'Imported account action differs');
    approved=Object.freeze({...root.approval,action:protectedAction});approvedPoolCalldata(approved,protectedAction);
   }
   const candidate=await transaction({selected,approved,protectedAction,identity:state,saved:JSON.stringify(root.journal)});
   try{await live();}catch(e){candidate.dispose();throw e;}
   clear();active=candidate;publicKey=root.publicKey;fields=selected;action=protectedAction;approval=approved;account=state;latest=root;
   await active.save();await live();const result=await active.reconcile();await live();return result;
  }),
  clearAction(){ensure(!busy&&!dead,'Workspace busy');clear();notify();},
  dispose(){if(dead)return;dead=true;invalidate();active?.dispose();approver?.dispose();for(const e of events)provider.removeListener(e,invalidate);}
 };
 try{binding=await operation(live=>bindWalletPool({chainId,provider,owner:connected.owner,tokens,toolkitText,deploymentText,live}));}catch(e){api.dispose();throw e;}
 return Object.freeze(api);
}
