// Lead-owned local setup. Fixed artifacts, explicit actions, no auto-send.
// SOURCE ONLY until isolated Q49 integration acceptance.
import {prepareGraduationSetup,setupIds,ensure,quantity,address,q,freeze,hashObject,setupCall,predictGraduationCreate} from './graduation-setup-plan.mjs';
import {parseGraduationSetupJournal} from './graduation-setup-journal.mjs';
import {createTransactionStage} from '../../../packages/launchpad/transaction-stage.mjs';
const gasCap=29000000n;
export async function createGraduationSetup({provider,session,profile,graduationText,tokenText,signer=null,journal=null,save,onChange=()=>{},clock=Date.now}){
 ensure(provider&&['request','on','removeListener'].every(k=>typeof provider[k]==='function')&&session&&typeof session.refresh==='function'&&typeof save==='function'&&typeof onChange==='function'&&typeof clock==='function','Setup dependencies');
 ensure(signer===null||(signer&&typeof signer.lock==='function'),'Signer interface');
 const connection=session.current;ensure(connection?.chainId==='31337'&&address(connection.owner),'Connect a local wallet');
 const restored=journal===null?null:parseGraduationSetupJournal(journal);
 const plan=await prepareGraduationSetup(restored?restored.profile:profile,graduationText,tokenText);
 await session.refresh(connection);ensure(session.current===connection&&connection.owner===plan.profile.owner,'Setup connection changed');
 let stages={},handles={},busy=false,dead=false,revision=0,review=null,consent=null,binding=null,attention=restored?'revalidation-required':null,persistenceFailed=false,currentSigner=signer;
 const publicJournal=()=>({schemaVersion:1,kind:'qhooks-graduation-setup-journal',profile:plan.profile,stages:structuredClone(stages)});
 const snapshot=()=>freeze({profile:plan.profile,graph:plan.graph,busy,review,feesAccepted:!!review&&consent===review,stages:structuredClone(stages),attention,persistenceFailed,ready:!!binding});
 const notify=()=>{try{onChange(snapshot());}catch{/* Rendering does not authorize. */}};
 const now=()=>{const value=clock();ensure(Number.isSafeInteger(value)&&value>=0&&value<=Number.MAX_SAFE_INTEGER-120000,'Invalid clock');return value;};
 async function persist(){try{await save(JSON.stringify(publicJournal()));persistenceFailed=false;}catch{persistenceFailed=true;attention='save-failed';throw new Error('Save the public setup journal before continuing');}finally{notify();}}
 function stageFor(id,gas,saved=null){
  ensure(setupIds.includes(id)&&quantity(gas)&&BigInt(gas)>0n&&BigInt(gas)<=gasCap,'Setup stage or gas');
  const tx=Object.freeze({chainId:'0x7a69',from:plan.profile.owner,to:null,input:plan.inputs[id],value:'0x0',nonce:q(BigInt(plan.profile.baseNonce)+BigInt(setupIds.indexOf(id))),gas});
  const planId=hashObject({setupPlan:plan.id,id,transaction:tx,expectedContractAddress:plan.graph[id]});
  return createTransactionStage({provider,planId,transaction:tx,expectedContractAddress:plan.graph[id],snapshot:saved,save:async next=>{stages[id]=structuredClone(next);await persist();}});
 }
 try{if(restored)for(const id of setupIds)if(restored.stages[id]){handles[id]=stageFor(id,restored.stages[id].transaction.gas,restored.stages[id]);stages[id]=handles[id].snapshot();}}catch(error){Object.values(handles).forEach(h=>h.dispose());throw error;}
 const invalidate=()=>{revision++;review=null;consent=null;binding=null;currentSigner?.lock();attention='connection-changed';notify();};
 const events=['accountsChanged','chainChanged','disconnect'];events.forEach(e=>provider.on(e,invalidate));
 async function operation(fn,{allowSaveFailure=false}={}){
  ensure(!busy&&!dead,'Setup is busy or closed');ensure(allowSaveFailure||!persistenceFailed,'Retry saving the public journal first');
  busy=true;const rev=revision;notify();
  const live=async()=>{ensure(!dead&&rev===revision&&session.current===connection,'Setup connection changed');await session.refresh(connection);ensure(!dead&&rev===revision&&session.current===connection,'Setup connection changed');};
  try{await live();return await fn(live);}finally{busy=false;notify();}
 }
 const rpc=async(live,method,params=[])=>{const out=await provider.request({method,params});await live();return out;};
 function keyReady(){ensure(currentSigner?.backupVerified&&!currentSigner.locked&&currentSigner.publicKeyHex===plan.profile.publicKey&&typeof currentSigner.lock==='function','Restore and verify the matching graduation backup');}
 async function readHead(live){const b=await rpc(live,'eth_getBlockByNumber',['latest',false]);ensure(b&&quantity(b.number)&&quantity(b.gasLimit)&&typeof b.hash==='string'&&/^0x[0-9a-f]{64}$/.test(b.hash),'Local block');ensure(BigInt(b.gasLimit)>=gasCap,'Local block gas limit');return b;}
 async function canonical(live,block){ensure((await rpc(live,'eth_getBlockByNumber',[block.number,false]))?.hash===block.hash,'Read block changed');}
 async function expectedRuntime(live,id,from,input,tag){
  const code=await rpc(live,'eth_call',[{from,data:input,gas:q(gasCap)},tag]);
  const name=id==='quote'?'token':id;
  ensure(typeof code==='string'&&/^0x(?:[0-9a-f]{2})+$/.test(code)&&code.length===plan.contracts[name].runtimeBytes*2+2,'Compiled constructor runtime unavailable');return code;
 }
 async function verifyCreated(live,id,result,head){
  const receipt=result.receipt,stage=handles[id].snapshot(),block=await rpc(live,'eth_getBlockByNumber',[receipt.blockNumber,false]);
  ensure(block?.hash===receipt.blockHash&&block.transactions?.[0]===stage.hash&&BigInt(block.number)>0n&&BigInt(block.number)<=BigInt(head.number),'Creation must be first in a canonical local block');
  const parent=await rpc(live,'eth_getBlockByNumber',[q(BigInt(block.number)-1n),false]);ensure(parent&&parent.hash===block.parentHash,'Creation parent changed');
  ensure(await rpc(live,'eth_getTransactionCount',[plan.profile.owner,parent.number])===stage.transaction.nonce,'Constructor replay nonce mismatch');
  const expected=await expectedRuntime(live,id,plan.profile.owner,plan.inputs[id],parent.number);
  ensure(await rpc(live,'eth_getCode',[plan.graph[id],head.number])===expected,'Deployed runtime mismatch');
  await canonical(live,parent);await canonical(live,block);return expected;
 }
 async function refresh(live){
  binding=null;attention=null;const head=await readHead(live),codes={};
  for(const id of setupIds){
   const h=handles[id];if(!h)return null;
   const s=h.snapshot();if(!['submitted','confirmed','reverted'].includes(s.status)){attention=s.status==='unknown'?'recover-transaction-hash':s.status;return null;}
   const result=await h.reconcile();await live();stages[id]=h.snapshot();
   if(result.journal.status!=='confirmed'||!result.receipt){attention=result.attention||result.journal.status;return null;}
   codes[id]=await verifyCreated(live,id,result,head);
  }
  // Child constructors have no self-address immutable. Their fixed sender and
  // explicit args reconstruct full code; factory simulation follows escrow check.
  for(const id of ['escrow','factory']){
   const expected=await expectedRuntime(live,id,plan.graph.controller,plan.childInputs[id],head.number);
   ensure(await rpc(live,'eth_getCode',[plan.graph[id],head.number])===expected,'Child runtime mismatch');codes[id]=expected;
  }
  const view=async(to,sig)=>rpc(live,'eth_call',[{to,data:setupCall(sig)},head.number]);
  for(const[id,value]of Object.entries({owner:plan.profile.owner,publicKey:plan.profile.publicKey,manager:plan.graph.manager,verifier:plan.graph.verifier,currency0:plan.constructor.currency0,currency1:plan.constructor.currency1,quoteCurrency:plan.graph.quote,escrow:plan.graph.escrow,hookFactory:plan.graph.factory,noticeSeconds:q(plan.profile.fields.notice)})){
   const expected='0x'+BigInt(value).toString(16).padStart(64,'0');ensure(await view(plan.graph.controller,id+'()')===expected,'Controller binding changed');
  }
  await canonical(live,head);binding=freeze({profile:plan.profile,graph:plan.graph,constructor:plan.constructor,codes,setupPlanId:plan.id,blockHash:head.hash,blockNumber:head.number});return binding;
 }
 async function prerequisites(live,id){
  const index=setupIds.indexOf(id);ensure(index>=0,'Unknown setup stage');
  // Revalidate every preceding deployment, never trust saved confirmed flags.
  const head=await readHead(live);
  for(const previous of setupIds.slice(0,index)){
   const h=handles[previous];ensure(h&&['submitted','confirmed','reverted'].includes(h.snapshot().status),'Confirm previous deployment first');
   const result=await h.reconcile();await live();stages[previous]=h.snapshot();ensure(result.journal.status==='confirmed'&&result.receipt&&!result.attention,'Previous deployment is not canonical');await verifyCreated(live,previous,result,head);
  }
  for(const address of id==='controller'?[plan.graph.controller,plan.graph.escrow,plan.graph.factory]:[plan.graph[id]])ensure(await rpc(live,'eth_getCode',[address,head.number])==='0x','Expected deployment address occupied');
  const expectedNonce=q(BigInt(plan.profile.baseNonce)+BigInt(index));ensure(await rpc(live,'eth_getTransactionCount',[plan.profile.owner,'pending'])===expectedNonce,'Wallet nonce changed');
  await expectedRuntime(live,id,plan.profile.owner,plan.inputs[id],'latest');await canonical(live,head);
 }
 async function price(live,id){
  const estimate=await rpc(live,'eth_estimateGas',[{from:plan.profile.owner,data:plan.inputs[id],value:'0x0'}]);
  const gasPrice=await rpc(live,'eth_gasPrice');ensure(quantity(estimate)&&BigInt(estimate)>0n&&quantity(gasPrice),'Setup gas estimate');
  const gas=(BigInt(estimate)*12n+9n)/10n;ensure(gas<=gasCap,'Setup gas bound exceeded');return {estimate,gas:q(gas),gasPrice};
 }
 return Object.freeze({
  snapshot,journal:()=>JSON.stringify(publicJournal()),
  attachSigner(next){ensure(!dead&&!busy,'Setup unavailable');ensure(next?.backupVerified&&!next.locked&&next.publicKeyHex===plan.profile.publicKey&&typeof next.lock==='function','Wrong or unverified key');currentSigner=next;review=null;consent=null;notify();},
  review:id=>operation(async live=>{
   ensure(setupIds.includes(id)&&(!handles[id]||['pending','rejected'].includes(handles[id].snapshot().status)),'Reconcile existing transaction first');keyReady();review=null;consent=null;binding=null;
   await prerequisites(live,id);const cost=await price(live,id);keyReady();
   handles[id]?.dispose();handles[id]=stageFor(id,cost.gas);stages[id]=handles[id].snapshot();await persist();await live();
   const at=now();review=freeze({id,planId:stages[id].planId,transaction:stages[id].transaction,expectedContractAddress:plan.graph[id],estimatedGas:BigInt(cost.estimate).toString(),gasPriceWei:BigInt(cost.gasPrice).toString(),estimatedNetworkFeeWei:(BigInt(cost.estimate)*BigInt(cost.gasPrice)).toString(),gasLimitFeeEstimateWei:(BigInt(cost.gas)*BigInt(cost.gasPrice)).toString(),scheme:'slh-dsa-sha2-128s',serviceFeeMode:'off',feeNote:'Network estimate only; wallet confirms final fees.',reviewedAt:at,expiresAt:at+120000});attention=null;return review;
  }),
  acceptFees(token){ensure(!busy&&!dead&&token&&token===review&&session.current===connection&&now()<review.expiresAt,'Review current setup costs');consent=review;notify();},
  submit:token=>operation(async live=>{
   ensure(token&&token===review&&consent===review,'Explicit cost acceptance required');const chosen=review;review=null;consent=null;
   const at=now();ensure(at>=chosen.reviewedAt&&at<chosen.expiresAt,'Setup review expired');keyReady();await prerequisites(live,chosen.id);const cost=await price(live,chosen.id);
   ensure(BigInt(cost.gasPrice).toString()===chosen.gasPriceWei&&BigInt(cost.estimate).toString()===chosen.estimatedGas&&cost.gas===chosen.transaction.gas,'Costs changed; review and accept again');keyReady();
   await handles[chosen.id].submit();await live();const result=await handles[chosen.id].reconcile();await live();stages[chosen.id]=handles[chosen.id].snapshot();attention=result.attention|| (result.journal.status==='confirmed'?null:result.journal.status);
   if(result.journal.status==='confirmed'&&result.receipt)await verifyCreated(live,chosen.id,result,await readHead(live));
   if(chosen.id==='controller')await refresh(live);return snapshot();
  }),
  reconcile:()=>operation(async live=>{review=null;consent=null;await refresh(live);return snapshot();}),
  recover:(id,transactionHash)=>operation(async live=>{ensure(setupIds.includes(id)&&handles[id]?.snapshot().status==='unknown','No unknown setup transaction');review=null;consent=null;await handles[id].recover(transactionHash);await live();await refresh(live);return snapshot();}),
  binding:()=>operation(async live=>{ensure(await refresh(live),'All setup deployments must be confirmed');return binding;}),
  retrySave:()=>operation(async()=>{await persist();return snapshot();},{allowSaveFailure:true}),
  invalidate,
  dispose(){if(dead)return;dead=true;invalidate();Object.values(handles).forEach(h=>h.dispose());events.forEach(e=>provider.removeListener(e,invalidate));}
 });
}
