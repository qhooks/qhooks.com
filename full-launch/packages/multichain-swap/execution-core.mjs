// Internal source-only direct-swap lifecycle. Public admission and UI wrappers
// must supply the fixed market service; this module does not activate swaps.
import {normalizeSwapFields} from './swap-fields.mjs';
import {readSwapJournal,newSwapJournal} from './journal.mjs';
import {quoteWalletCall,recheckWalletCall} from '../chain-wallet/fees.mjs';
import {matchesReviewedTransaction,matchesReceipt} from '../multichain/receipt-match.mjs';
import {requireRpcChain} from '../multichain/profiles.mjs';
import {ensure,address,hash,freeze} from '../token-launch/artifact.mjs';

const events=['accountsChanged','chainChanged','disconnect'];
const clone=value=>structuredClone(value);
const plain=value=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

export async function createSwapExecutionCore({provider,session,market,fields:raw,saved=null,save,onChange=()=>{},clock=Date.now}){
 ensure(provider&&['request','on','removeListener'].every(key=>typeof provider[key]==='function')&&typeof session?.refresh==='function'&&plain(market)&&[market.observe,market.validateStage,market.outcome,save,onChange,clock].every(value=>typeof value==='function'),'Swap execution dependencies');
 ensure(typeof market.chainId==='string'&&address(market.controller)&&hash(market.contextId),'Swap market identity');
 ensure(saved===null||typeof saved==='string'&&saved.length>0,'Public swap progress text required');
 const connection=session.current,chainId=market.chainId,controller=market.controller.toLowerCase();
 ensure(connection&&connection.chainId===chainId&&address(connection.owner)&&connection.owner===connection.owner.toLowerCase(),'Connect the exact swap owner and chain');
 const owner=connection.owner,fields=normalizeSwapFields(raw),identity={chainId,controller,contextId:market.contextId,owner,fields};
 const recoveryOnly=saved!==null;
 let state=clone(recoveryOnly?readSwapJournal(saved,identity):newSwapJournal(identity));
 ensure(plain(state)&&Array.isArray(state.records)&&state.records.length<=12,'Invalid swap journal');
 let busy=false,dead=false,invalid=false,revision=0,review=null,consent=null,attention=null,saveFailed=false,outcome=null,completed=false,prepared=null,marketSnapshot=null;

 const now=()=>{const value=clock();ensure(Number.isSafeInteger(value)&&value>=0&&Number.isSafeInteger(value+120000),'Invalid swap clock');return value;};
 const currentRecord=()=>state.records.at(-1)||null;
 const currentKind=()=>completed?null:prepared?.kind||currentRecord()?.kind||null;
 const snapshot=()=>freeze({chainId,owner,controller,fields:clone(fields),busy,invalid,recoveryOnly,current:currentKind(),stage:clone(currentRecord()?.stage||null),quote:clone(prepared?.quote??currentRecord()?.quote??null),marketSnapshot:clone(marketSnapshot),review,feesAccepted:!!review&&consent===review,attention,saveFailed,outcome:clone(outcome),completed});
 const notify=()=>{try{onChange(snapshot());}catch{}}
 const clearReview=()=>{review=null;consent=null;};
 const invalidate=()=>{invalid=true;revision++;clearReview();prepared=null;outcome=null;attention='connection-changed';notify();};
 for(const event of events)provider.on(event,invalidate);

 async function live(rev){
  ensure(!dead&&!invalid&&rev===revision&&session.current===connection,'Swap connection changed');
  await session.refresh(connection);
  const [walletChain,accounts]=await Promise.all([
   provider.request({method:'eth_chainId',params:[]}),
   provider.request({method:'eth_accounts',params:[]})
  ]);
  requireRpcChain(chainId,walletChain);
  ensure(!dead&&!invalid&&rev===revision&&session.current===connection&&Array.isArray(accounts)&&accounts[0]?.toLowerCase()===owner,'Swap connection changed');
 }
 const rpc=async(rev,method,params=[])=>{const value=await provider.request({method,params});await live(rev);return value;};
 const services=rev=>({request:(method,params=[])=>rpc(rev,method,params),live:()=>live(rev),owner,fields});
 const journal=()=>JSON.stringify(state);
 async function persist(){
  try{await save(journal());saveFailed=false;}
  catch(error){saveFailed=true;attention='save-failed';throw new Error('Save swap progress before continuing',{cause:error});}
  finally{notify();}
 }
 async function operation(fn,{allowSaveFailure=false,allowInvalid=false,requireLive=true}={}){
  if(busy||dead||invalid&&!allowInvalid||saveFailed&&!allowSaveFailure){clearReview();notify();throw new Error('Swap execution unavailable or progress needs saving');}
  busy=true;const rev=revision;notify();
  try{if(requireLive)await live(rev);return await fn(rev);}
  catch(error){clearReview();throw error;}
  finally{busy=false;notify();}
 }
 function failClear(message){clearReview();notify();throw new Error(message);}
 function readObservation(value){
  ensure(plain(value)&&Object.isFrozen(value)&&Reflect.ownKeys(value).length===4&&['quote','next','marketSnapshot','funding'].every(key=>Object.hasOwn(value,key)),'Invalid frozen swap observation');
  ensure(value.quote===null||plain(value.quote),'Invalid swap quote');
  ensure(value.next===null||plain(value.next)&&Object.isFrozen(value.next)&&Reflect.ownKeys(value.next).length===2&&typeof value.next.kind==='string'&&value.next.kind.length>0&&value.next.kind.length<=64&&plain(value.next.call),'Invalid next swap stage');
  ensure(value.next===null||value.quote!==null,'Every executable swap stage requires a quote');
  clone(value.quote);clone(value.marketSnapshot);clone(value.funding);if(value.next)clone(value.next.call);
  return value;
 }
 async function observe(rev){
  const observation=readObservation(await market.observe(services(rev)));
  await live(rev);marketSnapshot=clone(observation.marketSnapshot);return observation;
 }
 function canAdvance(){
  if(completed)return false;
  const record=currentRecord();
  if(!record)return true;
  if(record.stage.status==='pending'&&record.stage.hash===null)return true;
  if(record.stage.status==='rejected')return true;
  return record.stage.status==='confirmed'&&outcome!==null;
 }
 function journalWithUnsent(record){
  const candidate=clone(state),current=candidate.records.at(-1);
  if(current&&['pending','rejected'].includes(current.stage.status))candidate.records[candidate.records.length-1]=record;
  else{ensure(candidate.records.length<12,'Swap stage limit reached');candidate.records.push(record);}
  return readSwapJournal(JSON.stringify(candidate),identity);
 }
 async function validate(rev,record,fees){
  await market.validateStage({...services(rev),record:clone(record),fees});
  await live(rev);
 }
 async function reconcileInternal(rev){
  clearReview();prepared=null;attention=null;completed=false;outcome=null;
  const record=currentRecord();
  if(!record){attention='not-prepared';return snapshot();}
  const stage=record.stage;
  if(stage.status==='submitting'&&!stage.hash){stage.status='unknown';await persist();}
  if(stage.hash&&['confirmed','reverted'].includes(stage.status)){stage.status='submitted';await persist();}
  if(!stage.hash){attention=stage.status==='unknown'?'recover-transaction-hash':'not-broadcast';return snapshot();}
  const transaction=clone(await rpc(rev,'eth_getTransactionByHash',[stage.hash]));
  const receipt=clone(await rpc(rev,'eth_getTransactionReceipt',[stage.hash]));
  if(!transaction||!receipt||transaction.blockHash===null||transaction.blockNumber===null){attention='pending-or-replaced';return snapshot();}
  ensure(matchesReviewedTransaction(stage.transaction,transaction,stage.hash)&&matchesReceipt(transaction,receipt,stage.hash),'Swap transaction or receipt differs from review');
  const block=clone(await rpc(rev,'eth_getBlockByNumber',[receipt.blockNumber,false]));
  if(!block||block.hash!==receipt.blockHash){attention='reorg';return snapshot();}
  ensure(block.number===receipt.blockNumber&&Array.isArray(block.transactions)&&block.transactions.includes(stage.hash),'Swap canonical inclusion missing');
  if(receipt.status==='0x0'){stage.status='reverted';await persist();attention='reverted';return snapshot();}
  const verified=await market.outcome({...services(rev),record:clone(record),receipt:clone(receipt)});
  ensure(verified!==null&&verified!==undefined,'Swap outcome required');await live(rev);
  const again=clone(await rpc(rev,'eth_getBlockByNumber',[block.number,false]));
  ensure(again?.number===block.number&&again?.hash===block.hash,'Swap observation reorganized');
  stage.status='confirmed';await persist();outcome=clone(verified);
  if(record.kind==='swap'){completed=true;attention=null;return snapshot();}
  const observation=await observe(rev);completed=observation.next===null;
  attention=completed?null:'next-stage-required';return snapshot();
 }

 const api={snapshot,journal,
  prepareNext:()=>operation(async rev=>{
   ensure(!completed,'Swap lifecycle is complete');clearReview();prepared=null;attention=null;
   ensure(canAdvance(),'Confirm the current swap stage or recover its transaction first');
   const observation=await observe(rev);
   if(observation.next===null){completed=true;attention=null;return snapshot();}
   prepared=freeze({kind:observation.next.kind,call:clone(observation.next.call),quote:clone(observation.quote),funding:clone(observation.funding)});
   attention='review-required';return snapshot();
  }),
  review:()=>operation(async rev=>{
   ensure(!recoveryOnly&&!completed&&prepared&&canAdvance(),'Prepare the next swap stage first');clearReview();outcome=currentRecord()?.stage.status==='confirmed'?outcome:null;
   const expected=prepared,observation=await observe(rev);
   ensure(observation.next&&observation.next.kind===expected.kind&&observation.quote&&expected.quote&&observation.quote.phase===expected.quote.phase&&equal(observation.quote.poolKey,expected.quote.poolKey),'Swap pool or phase changed; prepare it again');
   const fees=await quoteWalletCall({chainId,request:(method,params)=>rpc(rev,method,params),owner,call:clone(observation.next.call),clock});
   await live(rev);ensure(fees.funded,'Insufficient native balance for swap transaction fees');
   const record={kind:observation.next.kind,quote:clone(observation.quote),stage:{transaction:clone(fees.transaction),status:'pending',hash:null}};
   await validate(rev,record,fees);state=journalWithUnsent(record);outcome=null;await persist();await live(rev);
   review=freeze({...fees,expiresAt:Math.min(fees.expiresAt,record.quote.expiresAt),quote:fees,kind:record.kind,marketQuote:clone(record.quote),marketSnapshot:clone(marketSnapshot)});prepared=freeze({kind:record.kind,call:clone(observation.next.call),quote:clone(record.quote),funding:clone(observation.funding)});attention=null;return review;
  }),
  acceptFees(token){
   try{const at=now();ensure(!busy&&!dead&&!invalid&&!saveFailed&&!recoveryOnly&&token&&token===review&&session.current===connection&&at>=review.reviewedAt&&at<review.expiresAt&&at<currentRecord().quote.expiresAt,'Accept this exact current swap fee review');consent=review;notify();}
   catch{failClear('Accept this exact current swap fee review');}
  },
  submit:token=>operation(async rev=>{
   ensure(!recoveryOnly&&token&&token===review&&consent===review&&currentRecord()?.stage.status==='pending','Explicit current swap fee acceptance required');
   const chosen=review,record=currentRecord();clearReview();outcome=null;
   let sent=false;
   try{
    await validate(rev,record,chosen.quote);await recheckWalletCall({request:(method,params)=>rpc(rev,method,params),quote:chosen.quote,clock});await live(rev);
    record.stage.status='submitting';
    await persist();await live(rev);
    await validate(rev,record,chosen.quote);
    const pendingNonce=await rpc(rev,'eth_getTransactionCount',[owner,'pending']);
    ensure(pendingNonce===record.stage.transaction.nonce,'Wallet nonce changed before swap');
    ensure(now()>=chosen.reviewedAt&&now()<chosen.expiresAt&&now()<record.quote.expiresAt,'Swap review expired before broadcast');
    sent=true;
    const returned=await provider.request({method:'eth_sendTransaction',params:[clone(record.stage.transaction)]});
    ensure(hash(returned),'Wallet returned invalid swap transaction hash');
    record.stage.hash=returned;record.stage.status='submitted';await persist();
    await live(rev);return await reconcileInternal(rev);
   }catch(error){
    if(['pending','submitting'].includes(record.stage.status)){
     record.stage.status=!sent||error?.code===4001?'rejected':'unknown';
     attention=record.stage.status==='unknown'?'recover-transaction-hash':null;
     try{await persist();}catch{}
    }
    throw error;
   }
  }),
  reconcile:()=>operation(reconcileInternal),
  recover:transactionHash=>operation(async rev=>{
   clearReview();const record=currentRecord();ensure(record?.stage.status==='unknown'&&hash(transactionHash),'No uncertain swap transaction or invalid hash');
   const transaction=clone(await rpc(rev,'eth_getTransactionByHash',[transactionHash]));
   ensure(matchesReviewedTransaction(record.stage.transaction,transaction,transactionHash),'Recovery transaction differs from reviewed swap');
   record.stage.hash=transactionHash;record.stage.status='submitted';await persist();return reconcileInternal(rev);
  }),
  retrySave:()=>operation(async()=>{await persist();return snapshot();},{allowSaveFailure:true,allowInvalid:true,requireLive:false}),
  invalidate,
  dispose(){if(dead)return;dead=true;revision++;clearReview();prepared=null;for(const event of events)provider.removeListener(event,invalidate);}
 };
 try{
  await live(0);
  if(recoveryOnly)await reconcileInternal(0);
  else await live(0);
 }catch(error){api.dispose();throw error;}
 if(recoveryOnly)for(const method of ['prepareNext','review','acceptFees','submit'])delete api[method];
 notify();return Object.freeze(api);
}
