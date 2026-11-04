// L129 additive request-boundary variant of packages/multichain-launch/workspace-complete-core.mjs SHA 35df62f234698cfa65fa825d65131b761a28eaea5d38e0bdd2187a211f5bfa90.
import {requireBoundWalletSession} from './l129-bound-session.mjs';
import {createGuardedLaunchProvider} from './l129-guarded-provider.mjs';
// Internal orchestration engine. The public workspace supplies fixed services.
// No implicit send, fee consent, wrapping or key generation occurs here.
import {ensure,freeze} from '../token-launch/artifact.mjs';
import {newWorkspaceJournal,parseWorkspaceJournal,launchDeployments} from './workspace-journal.mjs';
import {workspaceTokenFields} from './workspace-fields.mjs';
import {planV4LaunchLiquidity} from './liquidity-v4-plan.mjs';
import {createLaunchActionContext} from './actions/context.mjs';
import {readLaunchActionState} from './actions/state.mjs';
import {readLaunchActionJournal} from './actions/journal.mjs';
import {parseDecimalAmount} from '../crosschain/decimal-amount.mjs';
import {zeroAddress,zero32} from '../../prototypes/pq-graduation/client/graduation-descriptor.mjs';
const clone=x=>structuredClone(x),events=['accountsChanged','chainChanged','disconnect'];
export async function createLaunchWorkspaceCore({provider,session,chainId,owner,fields,publicKey,signer=null,saved=null,save,onChange=()=>{},clock=Date.now,toolkitText,metadataText,tokenText,services}){
 ensure(provider&&['request','on','removeListener'].every(k=>typeof provider[k]==='function')&&[save,onChange,clock].every(f=>typeof f==='function')&&typeof session?.refresh==='function','Launch workspace dependencies');
 requireBoundWalletSession(session,provider);
 const connection=session.current;ensure(connection?.chainId===chainId&&connection.owner===owner,'Connect selected chain and owner');
 const deps=await services.dependencies(chainId),quote=deps.profile.quote,manager=deps.profile.contracts.PoolManager.address;
 let j=saved===null?newWorkspaceJournal({chainId,owner,publicKey,fields,quoteDecimals:quote.decimals}):clone(parseWorkspaceJournal(saved,{chainId,owner,quoteDecimals:quote.decimals}));
 let dead=false,invalid=false,busy=false,revision=0,saveFailed=false,attention=null,current='token',completed=[],addresses={},funding=null,context=null,state=null,action=null,actionIndex=-1,review=null,consent=null,sendAuthorization=null;
 const handles=new Map(),replacementNonces=new Map(),tf=workspaceTokenFields(j.fields),now=()=>{const n=clock();ensure(Number.isSafeInteger(n)&&n>=0,'Valid clock required');return n;};
 const snapshot=()=>freeze({chainId,owner,publicKey:j.publicKey,fields:j.fields,quote:{address:quote.address,symbol:quote.symbol,decimals:quote.decimals,wrapNative:quote.wrapNative,nativeSharedBalance:quote.nativeSharedBalance},busy,attention,saveFailed,completed:[...completed],current,addresses:{...addresses},funding,state,review,feesAccepted:!!review&&consent===review,keyReady:!!signer?.backupVerified&&!signer?.locked,action:action?.snapshot()||null,deployments:Object.fromEntries([...handles].map(([id,h])=>[id,h.snapshot()]))});
 const notify=()=>{try{onChange(snapshot());}catch{}};
 const journal=()=>JSON.stringify(j);
 async function persist(){try{const text=journal();ensure(text.length<=2000000,'Launch history limit reached; export progress');await save(text);saveFailed=false;}catch(e){saveFailed=true;attention='save-failed';throw new Error('Save public launch progress before continuing',{cause:e});}finally{notify();}}
 // After a key rotation the launch acts with the key its controller names now (currentPublicKey); launch
  // steps before the controller exists still need the launch's own key.
  let currentKey=null;
  async function loadCurrentKey(){try{if(addresses.controller){const r=await request('eth_call',[{to:addresses.controller,data:'0xd0deef17'},'latest']);if(/^0x[0-9a-f]{64}$/.test(r)&&BigInt(r)>0n)currentKey=r;}}catch{}}
  function keyReady(){ensure(signer?.backupVerified&&!signer.locked&&(signer.publicKeyHex===j.publicKey||(!!currentKey&&signer.publicKeyHex===currentKey)),'Restore and verify the matching quantum backup');}
 const invalidate=()=>{invalid=true;revision++;review=null;consent=null;sendAuthorization=null;signer?.lock();attention='connection-changed';notify();};
 for(const e of events)provider.on(e,invalidate);
 function checkpoint(rev=revision){requireBoundWalletSession(session,provider);ensure(!dead&&!invalid&&rev===revision&&session.current===connection,'Launch connection changed');}
 async function live(rev=revision){checkpoint(rev);}
 const request=(method,params=[])=>guardedProvider.request({method,params});
 const admission=()=>deps.verify({request,live});
 const boundary=createGuardedLaunchProvider({provider,session,connection,check:()=>checkpoint(),beforeSend:async params=>{
   await live();
   const authorized=sendAuthorization;ensure(authorized&&JSON.stringify(params[0])===JSON.stringify(authorized.transaction),'Explicit reviewed launch transaction required');keyReady();await admission();await live();keyReady();
   ensure(await request('eth_getTransactionCount',[owner,'pending'])===authorized.transaction.nonce,'Wallet nonce changed before launch send');
   ensure(sendAuthorization===authorized&&now()>=authorized.reviewedAt&&now()<authorized.expiresAt,'Launch fee consent expired before wallet request');sendAuthorization=null;
 }});
 const guardedProvider=boundary.provider;
 async function operation(fn,{allowSaveFailure=false}={}){
  ensure(!dead&&!busy&&(allowSaveFailure||!saveFailed),'Launch is busy, closed or needs saving');busy=true;const rev=revision;notify();
  try{await live(rev);return await fn();}catch(e){review=null;consent=null;sendAuthorization=null;throw e;}finally{busy=false;notify();}
 }
 function constructorFor(id){
  if(id==='token')return tf;if(id==='verifier')return {};
  ensure(addresses.token,'Confirm token deployment');const currencies=[addresses.token,quote.address].sort();
  if(id==='collector')return {manager,currency0:currencies[0],currency1:currencies[1]};
  ensure(id==='controller'&&addresses.verifier&&addresses.collector,'Confirm verifier and fee collector');
  return {verifier:addresses.verifier,owner,publicKey:j.publicKey,manager,currency0:currencies[0],currency1:currencies[1],quote:quote.address,notice:j.fields.notice,collector:addresses.collector};
 }
 async function deployment(id,index,restore=true){
  const key=id+':'+index;if(handles.has(key))return handles.get(key);const rows=j.deployments[id],record=rows[index],expected=constructorFor(id);
  const opts={chainId,provider:guardedProvider,owner,fields:expected,saved:restore&&record?JSON.stringify(record):null,save:async next=>{rows[index]=clone(next);await persist();},clock,onChange:notify};
  const h=id==='token'?await services.token({...opts,artifactText:tokenText}):await services.deployment({...opts,stage:id,toolkitText,metadataText});
  try{ensure(JSON.stringify(h.snapshot().fields)===JSON.stringify(expected),'Saved deployment differs from the launch configuration');}catch(e){h.dispose();throw e;}handles.set(key,h);return h;
 }
 async function makeContext(){
  const last=j.deployments.controller.at(-1),tx=last?.stages?.[0]?.transaction;ensure(tx,'Confirmed controller transaction required');
  const next=await createLaunchActionContext({chainId,nonce:BigInt(tx.nonce).toString(),constructor:constructorFor('controller'),toolkitText,metadataText});ensure(next.plan.graph.controller===addresses.controller,'Controller CREATE identity changed');context=next;
  funding=planV4LaunchLiquidity({token:addresses.token,quote:quote.address,tokenDecimals:Number(j.fields.decimals),quoteDecimals:quote.decimals,tokenAmount:j.fields.tokenAmount,quoteAmount:j.fields.quoteAmount});
  if(!j.pools){
   const source=await context.planner.find({fee:j.fields.lpFeePpm,tickSpacing:'60'},()=>!dead&&!invalid),destination=j.fields.graduationMode==='2'?{key:{currency0:zeroAddress,currency1:zeroAddress,fee:'0',tickSpacing:'0',hooks:zeroAddress},hookSalt:zero32}:await context.planner.find({fee:j.fields.destinationFeePpm,tickSpacing:'60',start:(BigInt(source.hookSalt)+1n).toString()},()=>!dead&&!invalid);
   await live();j.pools={source,destination};await persist();
  }
  context.planner.describe(j.pools.source);ensure(j.pools.source.key.fee===j.fields.lpFeePpm&&j.pools.source.key.tickSpacing==='60','Source pool settings differ from launch');
  if(j.fields.graduationMode!=='2'){context.planner.describe(j.pools.destination);ensure(j.pools.destination.key.fee===j.fields.destinationFeePpm&&j.pools.destination.key.tickSpacing==='60','Destination pool settings differ from launch');}
 }
 async function observe(){
  const admitted=await admission();state=await readLaunchActionState({provider:guardedProvider,context,live,tag:admitted.blockNumber,extraDescriptors:[j.pools.source,...(j.fields.graduationMode==='2'?[]:[j.pools.destination])]});ensure(state.blockHash===admitted.blockHash,'Launch dependencies and state block differ');return state;
 }
 async function openAction(index,raw=null){
  action?.dispose();action=null;actionIndex=index;const row=j.actions[index];
  const next=await services.action({provider:guardedProvider,session,context,fields:raw,signer,saved:row?JSON.stringify(row):null,tokenFields:tf,toolkitText,metadataText,save:async text=>{j.actions[index]=JSON.parse(text);await persist();},onChange:notify,clock});await live();action=next;return next;
 }
 function bootstrapFields(){
  const threshold=j.fields.threshold==='0'?'0':parseDecimalAmount(j.fields.threshold,quote.decimals),policy=context.planner.policy({mode:j.fields.graduationMode,threshold,destination:j.pools.destination});
  return {kind:'bootstrap',bootstrap:{source:j.pools.source,sqrtPriceX96:funding.sqrtPriceX96,position:funding.position,maxAmount0:funding.maxAmount0,maxAmount1:funding.maxAmount1,policy,destination:j.pools.destination}};
 }
 async function confirmBootstrap(){
  ensure(JSON.stringify(state.source.descriptor)===JSON.stringify(j.pools.source)&&JSON.stringify(state.source.position)===JSON.stringify(funding.position),'Onchain source position differs from this launch');
  const index=j.actions.findLastIndex(row=>row.fields?.kind==='bootstrap');ensure(index>=0&&JSON.stringify(j.actions[index].fields)===JSON.stringify(bootstrapFields()),'Matching bootstrap progress required');
  if(index===actionIndex){ensure(action.snapshot().outcome?.kind==='bootstrap','Confirm bootstrap receipt before completing launch');return;}
  const check=await services.action({provider:guardedProvider,session,context,saved:JSON.stringify(j.actions[index]),tokenFields:tf,toolkitText,metadataText,clock,save:async text=>{j.actions[index]=JSON.parse(text);await persist();}});
  try{ensure((await check.reconcile()).outcome?.kind==='bootstrap','Historical bootstrap outcome missing');await live();}finally{check.dispose();}
 }
 async function refresh(){
  completed=[];addresses={};state=null;attention=null;await admission();
  for(const id of launchDeployments){
   const rows=j.deployments[id];current=id;if(!rows.length)return snapshot();
   for(let i=0;i<rows.length;i++){
    const h=await deployment(id,i),s=await h.reconcile();await live();
    if(i<rows.length-1){ensure(s.stages[0]?.status==='reverted'&&s.status==='reverted','Earlier deployment attempt is unresolved');continue;}
    const target=id==='token'?s.token:s.address;
    if(!target){attention=s.status;return snapshot();}addresses[id]=target;
   }
   completed.push(id);
  }
  await makeContext();await observe();
  for(const row of j.actions)readLaunchActionJournal(context,JSON.stringify(row));
  if(j.actions.length){
   if(actionIndex!==j.actions.length-1||!action)await openAction(j.actions.length-1);
   const a=await action.reconcile();await live();attention=a.attention;
   if(['unknown','submitted','submitting'].includes(a.stage?.status)){current='funding';return snapshot();}
   if(a.stage?.status==='confirmed')ensure(a.outcome,'Recheck action outcome before advancing');
  }
  const funded=[funding.currency0,funding.currency1].every((asset,i)=>BigInt(state.assets[asset].balance)>=BigInt(funding['maxAmount'+i])&&BigInt(state.assets[asset].allowance)>=BigInt(funding['maxAmount'+i]));
  if(state.phase!=='0'||funded)completed.push('funding');
  if(state.phase!=='0'){await confirmBootstrap();completed.push('bootstrap');current=null;attention=null;}else current=funded?'bootstrap':'funding';return snapshot();
 }
 async function newAction(raw){
  ensure(j.actions.length<64,'Export action history before continuing');const prior=action?.snapshot();
  ensure(!prior?.stage||['pending','rejected','confirmed','reverted'].includes(prior.stage.status),'Recover the existing transaction first');
  if(prior?.stage?.status==='confirmed')ensure(prior.outcome,'Confirm application outcome first');
  await loadCurrentKey();keyReady();return openAction(j.actions.length,raw);
 }
 async function prepareNext(){
  review=null;consent=null;keyReady();await refresh();
  if(launchDeployments.includes(current)){
   const rows=j.deployments[current];if(!rows.length){const h=await deployment(current,0,false);rows.push(clone(h.journal()));await persist();return snapshot();}
   const key=current+':'+(rows.length-1),h=handles.get(key);ensure(h,'Prepare the deployment');const previous=h.snapshot();
   ensure(!previous.stages.length||previous.stages[0].status==='rejected','Reconcile the existing deployment first');
   if(previous.recoveryOnly){
    // An explicit fresh review may replace a proven-not-sent/canceled proposal
    // only at the SAME still-unused wallet nonce. Never resend imported progress.
    const tx=previous.stages[0]?.transaction;
    if(tx){ensure(await request('eth_getTransactionCount',[owner,'latest'])===tx.nonce&&await request('eth_getTransactionCount',[owner,'pending'])===tx.nonce,'Canceled nonce was used or is pending; recover its transaction');replacementNonces.set(key,tx);}
    h.dispose();handles.delete(key);await deployment(current,rows.length-1,false);
   }
   return snapshot();
  }
  ensure(context&&state.phase==='0','Launch is already initialized');
  for(const[asset,amount]of [[funding.currency0,funding.maxAmount0],[funding.currency1,funding.maxAmount1]]){
   ensure(BigInt(state.assets[asset].balance)>=BigInt(amount),asset===quote.address?'Fund your wallet with '+quote.symbol+' for initial liquidity':'Insufficient launch-token funding balance');
   if(BigInt(state.assets[asset].allowance)<BigInt(amount)){await newAction({kind:'approve-token',asset,amount});attention=null;return snapshot();}
  }
  await newAction(bootstrapFields());attention=null;return snapshot();
 }
 const api={snapshot,journal,
  attachSigner(next){ensure(!busy&&!dead&&!invalid&&// A rotated launch acts with its current key: launch steps still sign only with the launch's own key (keyReady),
  // management actions only with the key the controller names now (the action core checks it on chain).
  next?.backupVerified&&!next.locked,'Verified matching key required');signer=next;loadCurrentKey().then(notify,()=>{});review=null;consent=null;notify();},
  reconcile:()=>operation(refresh),prepareNext:()=>operation(prepareNext),
  prepareAction:raw=>operation(async()=>{review=null;consent=null;await refresh();ensure(context&&completed.includes('bootstrap'),'Complete launch setup first');await newAction(raw);return snapshot();}),
  approve:()=>operation(async()=>{ensure(action,'Prepare a protected action');review=null;consent=null;keyReady();await action.approve();return snapshot();}),
  review:()=>operation(async()=>{
   review=null;consent=null;keyReady();await admission();let q,id;
   if(launchDeployments.includes(current)){id=current;const key=id+':'+(j.deployments[id].length-1),h=handles.get(key);ensure(h,'Prepare the next deployment');q=await h.review();const prior=replacementNonces.get(key);if(prior)ensure(q.transaction.nonce===prior.nonce&&q.transaction.data===prior.data,'Replacement must use the original nonce and exact constructor');}
   else{ensure(action,'Prepare the next action');id='action';q=await action.review();}
   await live();review=freeze({...q,stageId:id,inner:q});attention=null;return review;
  }),
  acceptFees(q){ensure(!busy&&!dead&&!invalid&&!saveFailed&&q&&q===review&&now()>=q.reviewedAt&&now()<q.expiresAt,'Accept this exact launch fee review');keyReady();if(q.stageId==='action')action.acceptFees(q.inner);consent=q;notify();},
  submit:q=>operation(async()=>{
   ensure(q&&q===review&&consent===review,'Explicit launch fee consent required');keyReady();const chosen=q;review=null;consent=null;sendAuthorization=chosen;
   try{if(chosen.stageId==='action')await action.submit(chosen.inner);else await handles.get(chosen.stageId+':'+(j.deployments[chosen.stageId].length-1)).submit(chosen.inner);await live();return await refresh();}finally{sendAuthorization=null;}
  }),
  recover:hash=>operation(async()=>{review=null;consent=null;if(launchDeployments.includes(current)){const rows=j.deployments[current];ensure(rows.length,'No deployment transaction');await handles.get(current+':'+(rows.length-1)).recover(hash);}else{ensure(action,'No action transaction');await action.recover(hash);}return refresh();}),
  retryRevertedDeployment:()=>operation(async()=>{review=null;consent=null;await refresh();ensure(launchDeployments.includes(current),'No reverted deployment');const rows=j.deployments[current],h=handles.get(current+':'+(rows.length-1));ensure(rows.length<8&&h?.snapshot().status==='reverted'&&h.snapshot().stages[0]?.hash,'Only a canonically reverted deployment can be retried');keyReady();const next=await deployment(current,rows.length,false);rows.push(clone(next.journal()));await persist();return snapshot();}),
  save:()=>operation(async()=>{for(const h of handles.values())if(h.snapshot().saveFailed)await h.save();if(action?.snapshot().saveFailed)await action.retrySave();await persist();return snapshot();},{allowSaveFailure:true}),
  invalidate,
  dispose(){if(dead)return;dead=true;invalidate();boundary.dispose();action?.dispose();for(const h of handles.values())h.dispose();for(const e of events)provider.removeListener(e,invalidate);}
 };
 try{await live();await refresh();}catch(e){api.dispose();throw e;}return Object.freeze(api);
}
