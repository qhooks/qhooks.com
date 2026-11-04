// Additive deployment controller. Accepted local crypto/transaction sources unchanged.
import {BASE_CHAIN,ensure,quantity,address,bytes,quoteBaseCreation,recheckBaseQuote} from './mainnet-fees.mjs';
export const TOOLKIT_SHA='fec97a82d33a12b6e5a16aedd9043d79e268367a88d540b3a70eade77370426b';
const hash=x=>typeof x==='string'&&/^0x[0-9a-f]{64}$/.test(x);
const freeze=o=>{if(o&&typeof o==='object'&&!Object.isFrozen(o)){Object.values(o).forEach(freeze);Object.freeze(o);}return o;};
const copy=x=>structuredClone(x);
const keys=(o,expected)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.getPrototypeOf(o)===Object.prototype&&Object.keys(o).sort().join()===expected.slice().sort().join();
const txKeys=['type','chainId','from','data','value','nonce','gas','maxFeePerGas','maxPriorityFeePerGas'];
export async function readMainnetToolkit(text){
 ensure(typeof text==='string'&&text.length<500000,'Fixed deployment toolkit required');
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
 ensure(digest===TOOLKIT_SHA,'Deployment toolkit identity mismatch');return freeze(JSON.parse(text));
}
export function parseMainnetJournal(text,owner){
 ensure(typeof text==='string'&&text.length<500000,'Public deployment progress required');let j;try{j=JSON.parse(text);}catch{throw new TypeError('Invalid deployment progress');}
 ensure(keys(j,['version','kind','chainId','owner','artifactSha256','stages'])&&j.version===1&&j.kind==='qhooks-base-deployment'&&j.chainId===BASE_CHAIN&&j.owner===owner&&j.artifactSha256===TOOLKIT_SHA,'Progress belongs to a different wallet, network or toolkit');
 ensure(Array.isArray(j.stages)&&j.stages.length<=2,'Invalid deployment stages');
 for(const [i,s]of j.stages.entries()){
  ensure(keys(s,['id','transaction','status','hash'])&&s.id===['verifier','pool'][i]&&['submitting','unknown','submitted','confirmed','reverted','rejected'].includes(s.status),'Invalid deployment record');
  ensure(['submitted','confirmed','reverted'].includes(s.status)?hash(s.hash):s.hash===null,'Invalid transaction hash');
  const t=s.transaction;ensure(keys(t,txKeys)&&t.type==='0x2'&&t.chainId===BASE_CHAIN&&t.from===owner&&t.value==='0x0'&&bytes(t.data)&&t.data.length<=98306,'Invalid transaction identity');
  ensure(['nonce','gas','maxFeePerGas','maxPriorityFeePerGas'].every(k=>quantity(t[k]))&&BigInt(t.nonce)<(1n<<64n)-1n&&BigInt(t.gas)>0n&&BigInt(t.gas)<=7000000n&&BigInt(t.maxFeePerGas)>0n&&BigInt(t.maxFeePerGas)<=1000000000n&&BigInt(t.maxPriorityFeePerGas)<=BigInt(t.maxFeePerGas),'Invalid transaction limits');
  if(s.status==='submitting')s.status='unknown';
 }
 return j;
}
export async function createMainnetDeployment({provider,owner,toolkitText,saved=null,save,onChange=()=>{},clock=Date.now}){
 ensure(provider&&['request','on','removeListener'].every(k=>typeof provider[k]==='function')&&address(owner)&&typeof save==='function'&&typeof onChange==='function','Deployment dependencies');
 const toolkit=await readMainnetToolkit(toolkitText);
 let journal=saved?parseMainnetJournal(saved,owner):{version:1,kind:'qhooks-base-deployment',chainId:BASE_CHAIN,owner,artifactSha256:TOOLKIT_SHA,stages:[]};
 let revision=0,dead=false,busy=false,quote=null,verified={},attention=null,saveFailed=false;
 const request=(method,params=[])=>provider.request({method,params});
 const snapshot=()=>freeze({owner,chainId:BASE_CHAIN,busy,quote,verifier:verified.verifier||null,pool:verified.pool||null,status:attention||(verified.pool?'complete':journal.stages.at(-1)?.status||'idle'),saveFailed,stages:copy(journal.stages)});
 const notify=()=>{try{onChange(snapshot());}catch{/* Rendering cannot change authority. */}};
 const invalidate=()=>{revision++;quote=null;verified={};attention='connection-changed';notify();};
 const events=['accountsChanged','chainChanged','disconnect'];for(const event of events)provider.on(event,invalidate);
 async function live(rev){
  ensure(!dead&&revision===rev,'Connection changed. Reconnect.');const [chain,accounts]=await Promise.all([request('eth_chainId'),request('eth_accounts')]);
  ensure(!dead&&revision===rev&&chain===BASE_CHAIN&&Array.isArray(accounts)&&typeof accounts[0]==='string'&&accounts[0].toLowerCase()===owner,'Wallet or network changed. Reconnect on Base.');
 }
 async function persist(){try{await save(copy(journal));saveFailed=false;}catch(error){saveFailed=true;throw new Error('Could not save deployment progress. Download it before continuing.',{cause:error});}finally{notify();}}
 async function operation(fn){ensure(!busy&&!dead,'Deployment operation already active');busy=true;const rev=revision;notify();try{await live(rev);return await fn(rev);}finally{busy=false;notify();}}
 function init(id){
  if(id==='verifier')return toolkit.contracts.verifier.bytecode;
  ensure(id==='pool'&&address(verified.verifier),'Confirm the verifier first');
  return toolkit.contracts.pool.bytecode+verified.verifier.slice(2).padStart(64,'0')+'40'.padStart(64,'0')+'0'.repeat(64);
 }
 async function validateStage(s,rev){
  ensure(s.transaction.data===init(s.id),'Saved deployment input does not match the fixed toolkit');
  if(!s.hash){attention=s.status==='unknown'?'recover-transaction-hash':s.status;return false;}
  const [tx,receipt]=await Promise.all([request('eth_getTransactionByHash',[s.hash]),request('eth_getTransactionReceipt',[s.hash])]);await live(rev);
  if(!tx||!receipt||tx.blockHash===null||tx.blockNumber===null){attention='pending-or-replaced';return false;}
  const expected=s.transaction;
  ensure(tx.hash===s.hash&&tx.to===null&&tx.from?.toLowerCase()===owner&&tx.input===expected.data&&tx.chainId===BASE_CHAIN&&tx.type==='0x2'&&['value','nonce','gas','maxFeePerGas','maxPriorityFeePerGas'].every(k=>tx[k]===expected[k]),'Mined transaction differs from reviewed deployment');
  ensure(receipt.transactionHash===s.hash&&receipt.from?.toLowerCase()===owner&&receipt.to===null&&hash(receipt.blockHash)&&quantity(receipt.blockNumber)&&['0x0','0x1'].includes(receipt.status)&&receipt.blockHash===tx.blockHash&&receipt.blockNumber===tx.blockNumber,'Receipt identity mismatch');
  const block=await request('eth_getBlockByNumber',[receipt.blockNumber,false]);await live(rev);
  if(!block||block.hash!==receipt.blockHash){attention='reorg';return false;}
  ensure(block.number===receipt.blockNumber&&Array.isArray(block.transactions)&&block.transactions.includes(s.hash),'Canonical block inclusion missing');
  if(receipt.status==='0x0'){s.status='reverted';await persist();attention='reverted';return false;}
  const deployed=receipt.contractAddress?.toLowerCase();ensure(address(deployed),'Missing deployed contract');
  // Creation eth_call returns the exact runtime with actual constructor immutables.
  const expectedRuntime=s.id==='verifier'?toolkit.contracts.verifier.deployedBytecode:await request('eth_call',[{from:owner,data:expected.data,gas:'0x6acfc0'},'latest']);
  ensure(bytes(expectedRuntime)&&expectedRuntime.length===toolkit.contracts[s.id].runtimeBytes*2+2,'Invalid expected runtime');
  const code=await request('eth_getCode',[deployed,'latest']);await live(rev);ensure(code===expectedRuntime,'Deployed runtime mismatch');
  s.status='confirmed';verified[s.id]=deployed;await persist();return true;
 }
 async function reconcile(rev){verified={};attention=null;for(const stage of journal.stages)if(!await validateStage(stage,rev))break;return snapshot();}
 const api={snapshot,journal:()=>freeze(copy(journal)),
  review:()=>operation(async rev=>{
   quote=null;await reconcile(rev);await live(rev);ensure(!saveFailed,'Save deployment progress first');
   ensure(!verified.pool,'Both core contracts are already deployed');
   const id=verified.verifier?'pool':'verifier',index=id==='pool'?1:0,existing=journal.stages[index];
   ensure(!existing||existing.status==='rejected','Reconcile or recover the existing transaction before another deployment');
   const q=await quoteBaseCreation({request,owner,data:init(id),clock});await live(rev);
   quote=freeze({...q,id});attention=null;return quote;
  }),
  submit:token=>operation(async rev=>{
   ensure(token&&token===quote,'Review this exact transaction first');const selected=quote;quote=null;
   await reconcile(rev);await live(rev);ensure(!saveFailed,'Save deployment progress first');
   ensure(selected.transaction.data===init(selected.id),'Deployment dependency changed');
   const index=selected.id==='pool'?1:0;ensure(journal.stages.length===index||journal.stages[index]?.status==='rejected','Existing deployment must be reconciled');
   await recheckBaseQuote(request,selected,clock);await live(rev);
   const stage={id:selected.id,transaction:copy(selected.transaction),status:'submitting',hash:null};journal.stages[index]=stage;attention=null;
   // Persist intent before the only transaction-sending call. A failed or uncertain
   // broadcast is never silently retried, including after reload/account changes.
   let sent=false;
   try{
    await persist();await live(rev);
    ensure(await request('eth_getTransactionCount',[owner,'pending'])===stage.transaction.nonce,'Wallet nonce changed');await live(rev);
    sent=true;const result=await request('eth_sendTransaction',[copy(stage.transaction)]);
    ensure(hash(result),'Wallet returned an invalid transaction hash');stage.hash=result;stage.status='submitted';await persist();
    // Preserve the hash even if the user changed accounts during confirmation.
    await live(rev);return await reconcile(rev);
   }catch(error){if(stage.status==='submitting'){stage.status=!sent||error?.code===4001?'rejected':'unknown';attention=stage.status==='unknown'?'recover-transaction-hash':null;try{await persist();}catch{/* Keep recovery state in memory. */}}throw error;}
  }),
  reconcile:()=>operation(async rev=>{quote=null;return reconcile(rev);}),
  recover:transactionHash=>operation(async rev=>{
   quote=null;const s=journal.stages.find(s=>s.status==='unknown');ensure(s&&hash(transactionHash),'No uncertain transaction or invalid hash');
   const tx=await request('eth_getTransactionByHash',[transactionHash]);await live(rev);
   ensure(tx&&tx.hash===transactionHash&&tx.from?.toLowerCase()===owner&&tx.to===null&&tx.input===s.transaction.data&&tx.chainId===BASE_CHAIN&&tx.nonce===s.transaction.nonce,'Recovery transaction identity mismatch');
   // Save only after full field matching. This also rejects wallet-edited fees.
   ensure(tx.type==='0x2'&&['value','gas','maxFeePerGas','maxPriorityFeePerGas'].every(k=>tx[k]===s.transaction[k]),'Recovery transaction differs from reviewed deployment');
   s.hash=transactionHash;s.status='submitted';await persist();return reconcile(rev);
  }),
  save:()=>operation(async()=>{await persist();return snapshot();}),
  invalidateReview(){quote=null;notify();},
  dispose(){if(dead)return;dead=true;invalidate();for(const event of events)provider.removeListener(event,invalidate);}
 };
 try{await live(revision);}catch(e){api.dispose();throw e;}return Object.freeze(api);
}
