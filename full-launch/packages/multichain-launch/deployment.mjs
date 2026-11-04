// Resumable fixed verifier/collector/controller creation. Production dependency admission is separate.
import {ensure,address,hash,shape,freeze} from '../token-launch/artifact.mjs';
import {LAUNCH_TOOLKIT_SHA,LEGACY_LAUNCH_TOOLKIT_SHA} from './artifact.mjs';
import {LAUNCH_IMMUTABLES_SHA,LEGACY_LAUNCH_IMMUTABLES_SHA,createLaunchRuntime} from './runtime.mjs';
import {normalizeLaunchCreation,launchCreationInput,prepareLaunchCreation} from './creation-plan.mjs';
import {launchCreationPolicy,quoteLaunchCreation,recheckLaunchCreation,launchFeeWei} from './creation-fees.mjs';
import {rpcQuantity} from '../multichain/fee-math.mjs';
import {matchesReviewedTransaction,matchesReceipt} from '../multichain/receipt-match.mjs';
const clone=x=>structuredClone(x),txKeys=['type','chainId','from','data','value','nonce','gas','maxFeePerGas','maxPriorityFeePerGas'];
export function parseLaunchDeployment(text,chainId,owner,stage){
 const p=launchCreationPolicy(chainId,stage);ensure(address(owner)&&typeof text==='string'&&text.length<=100000,'Bounded public launch progress required');const j=JSON.parse(text);
 ensure(shape(j,['version','kind','chainId','owner','artifactSha256','metadataSha256','stage','fields','stages'])&&j.version===1&&j.kind==='qhooks-launch-creation'&&j.chainId===p.hexId&&j.owner===owner&&j.stage===stage&&(j.artifactSha256===LAUNCH_TOOLKIT_SHA&&j.metadataSha256===LAUNCH_IMMUTABLES_SHA||LEGACY_LAUNCH_TOOLKIT_SHA!==null&&j.artifactSha256===LEGACY_LAUNCH_TOOLKIT_SHA&&j.metadataSha256===LEGACY_LAUNCH_IMMUTABLES_SHA),'Launch progress identity mismatch');
 const fields=normalizeLaunchCreation(stage,j.fields,owner);ensure(JSON.stringify(fields)===JSON.stringify(j.fields),'Canonical launch fields required');
 ensure(Array.isArray(j.stages)&&j.stages.length<=1,'Single launch stage required');
 for(const s of j.stages){
  ensure(shape(s,['transaction','status','hash'])&&['submitting','unknown','submitted','confirmed','reverted','rejected'].includes(s.status),'Invalid launch stage');
  ensure(['submitted','confirmed','reverted'].includes(s.status)?hash(s.hash):s.hash===null,'Invalid launch transaction hash');
  const t=s.transaction;ensure(shape(t,txKeys)&&t.type==='0x2'&&t.chainId===p.hexId&&t.from===owner&&BigInt(t.value)===launchFeeWei(p.chainId,stage)&&/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(t.value)&&typeof t.data==='string'&&t.data.length<=98306&&/^0x(?:[0-9a-f]{2})+$/.test(t.data),'Invalid launch creation');
  const g=rpcQuantity(t.gas),n=rpcQuantity(t.nonce),f=rpcQuantity(t.maxFeePerGas),tip=rpcQuantity(t.maxPriorityFeePerGas);
  ensure(g>0n&&g<=p.maxGas&&n<(1n<<64n)-1n&&f>0n&&f<=p.maxPrice&&tip<=f,'Launch transaction bounds');if(s.status==='submitting')s.status='unknown';
 }
 return j;
}
export async function createLaunchDeployment({chainId,stage,provider,owner,toolkitText,metadataText,fields:input,saved=null,save,onChange=()=>{},clock=Date.now}){
 const policy=launchCreationPolicy(chainId,stage);ensure(provider&&['request','on','removeListener'].every(k=>typeof provider[k]==='function')&&address(owner)&&[save,onChange,clock].every(f=>typeof f==='function'),'Launch deployment dependencies');
 ensure(saved===null||typeof saved==='string'&&saved.length>0,'Public progress text required');
 const restored=saved===null?null:parseLaunchDeployment(saved,chainId,owner,stage),fields=normalizeLaunchCreation(stage,restored?restored.fields:input,owner),data=await launchCreationInput({stage,fields,owner,toolkitText});
 const planFor=nonce=>prepareLaunchCreation({chainId,stage,fields,owner,nonce:rpcQuantity(nonce).toString(),toolkitText,metadataText});
 // Validate both pinned artifacts, without inventing a creation nonce.
 await createLaunchRuntime({toolkitText,metadataText});
 let journal=restored||{version:1,kind:'qhooks-launch-creation',chainId:policy.hexId,owner,artifactSha256:LAUNCH_TOOLKIT_SHA,metadataSha256:LAUNCH_IMMUTABLES_SHA,stage,fields,stages:[]};
 for(const s of journal.stages)ensure(s.transaction.data===data,'Progress constructor differs from fixed launch');
 let revision=0,dead=false,busy=false,quote=null,verified=null,attention=null,saveFailed=false;
 const recoveryOnly=saved!==null,request=(method,params=[])=>provider.request({method,params});
 const snapshot=()=>freeze({chainId,stage,owner,fields,nativeSymbol:policy.nativeSymbol,busy,quote,address:verified,status:attention||(verified?'complete':journal.stages[0]?.status||'idle'),saveFailed,recoveryOnly,stages:clone(journal.stages)});
 const notify=()=>{try{onChange(snapshot());}catch{}};
 const invalidate=()=>{revision++;quote=null;verified=null;attention='connection-changed';notify();};
 const events=['accountsChanged','chainChanged','disconnect'];for(const e of events)provider.on(e,invalidate);
 async function live(rev){ensure(!dead&&rev===revision,'Connection changed');const [chain,accounts]=await Promise.all([request('eth_chainId'),request('eth_accounts')]);ensure(!dead&&rev===revision&&chain===policy.hexId&&Array.isArray(accounts)&&accounts[0]?.toLowerCase()===owner,'Reconnect the expected wallet on the selected chain');}
 async function persist(){try{await save(clone(journal));saveFailed=false;}catch(e){saveFailed=true;throw new Error('Could not save launch deployment progress',{cause:e});}finally{notify();}}
 async function operation(fn){ensure(!busy&&!dead,'Launch deployment unavailable');busy=true;const rev=revision;notify();try{await live(rev);return await fn(rev);}finally{busy=false;notify();}}
 async function reconcile(rev){
  verified=null;attention=null;const s=journal.stages[0];if(!s)return snapshot();ensure(s.transaction.data===data,'Fixed launch constructor mismatch');
  if(!s.hash){attention=s.status==='unknown'?'recover-transaction-hash':s.status;return snapshot();}
  const [tx,r]=await Promise.all([request('eth_getTransactionByHash',[s.hash]),request('eth_getTransactionReceipt',[s.hash])]);await live(rev);
  if(!tx||!r||tx.blockHash===null||tx.blockNumber===null){attention='pending-or-replaced';return snapshot();}
  ensure(matchesReviewedTransaction(s.transaction,tx,s.hash)&&matchesReceipt(tx,r,s.hash),'Launch receipt or transaction mismatch');
  const block=await request('eth_getBlockByNumber',[r.blockNumber,false]);await live(rev);
  if(!block||block.hash!==r.blockHash){attention='reorg';return snapshot();}
  ensure(block.number===r.blockNumber&&Array.isArray(block.transactions)&&block.transactions.includes(s.hash),'Launch canonical inclusion missing');
  if(r.status==='0x0'){s.status='reverted';await persist();attention='reverted';return snapshot();}
  const plan=await planFor(s.transaction.nonce);await live(rev);
  ensure(r.contractAddress?.toLowerCase()===plan.address,'Launch CREATE address mismatch');
  for(const [target,expected]of Object.entries(plan.contracts)){ensure(await request('eth_getCode',[target,block.number])===expected,'Launch graph runtime mismatch');await live(rev);}
  const again=await request('eth_getBlockByNumber',[block.number,false]);await live(rev);ensure(again?.hash===block.hash&&again?.number===block.number,'Launch observation reorganized');
  s.status='confirmed';verified=plan.address;await persist();return snapshot();
 }
 const api={snapshot,journal:()=>freeze(clone(journal)),
  review:()=>operation(async rev=>{quote=null;ensure(!recoveryOnly,'Imported progress is recovery-only');await reconcile(rev);await live(rev);ensure(!saveFailed&&!verified,'Save progress or use the existing launch');ensure(!journal.stages[0]||journal.stages[0].status==='rejected','Reconcile existing launch creation');const next=await quoteLaunchCreation({chainId,stage,request,owner,data,toolkitText,clock});await live(rev);await planFor(next.transaction.nonce);await live(rev);ensure(next.funded,'Insufficient '+policy.nativeSymbol+' for launch deployment');quote=next;attention=null;return quote;}),
  submit:selected=>operation(async rev=>{
   ensure(!recoveryOnly&&selected&&selected===quote,'Review this exact launch transaction');quote=null;await reconcile(rev);await live(rev);ensure(!saveFailed&&!verified&&(!journal.stages[0]||journal.stages[0].status==='rejected'),'Existing launch progress must be reconciled');
   await recheckLaunchCreation({request,quote:selected,clock});await live(rev);
   const stage={transaction:clone(selected.transaction),status:'submitting',hash:null};journal.stages[0]=stage;let sent=false;
   try{await persist();await live(rev);ensure(await request('eth_getTransactionCount',[owner,'pending'])===stage.transaction.nonce,'Wallet nonce changed');await live(rev);sent=true;const h=await request('eth_sendTransaction',[clone(stage.transaction)]);ensure(hash(h),'Wallet returned invalid launch transaction hash');stage.hash=h;stage.status='submitted';await persist();await live(rev);return await reconcile(rev);}
   catch(e){if(stage.status==='submitting'){stage.status=!sent||e?.code===4001?'rejected':'unknown';attention=stage.status==='unknown'?'recover-transaction-hash':null;try{await persist();}catch{}}throw e;}
  }),
  reconcile:()=>operation(async rev=>{quote=null;return reconcile(rev);}),
  recover:h=>operation(async rev=>{quote=null;const s=journal.stages[0];ensure(s?.status==='unknown'&&hash(h),'No uncertain launch transaction or invalid hash');const tx=await request('eth_getTransactionByHash',[h]);await live(rev);ensure(matchesReviewedTransaction(s.transaction,tx,h),'Recovery transaction differs from launch creation');s.hash=h;s.status='submitted';await persist();return reconcile(rev);}),
  save:()=>operation(async()=>{await persist();return snapshot();}),
  invalidateReview(){quote=null;notify();},
  dispose(){if(dead)return;dead=true;invalidate();for(const e of events)provider.removeListener(e,invalidate);}
 };
 try{await live(revision);}catch(e){api.dispose();throw e;}return Object.freeze(api);
}
