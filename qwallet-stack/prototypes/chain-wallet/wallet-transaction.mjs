// New L65 fixed-asset wallet adapter; separate acceptance required.
// Lead-owned explicit selected-chain call authority. No keys, arbitrary UI RPC or auto retry.
import {ensure,address,quantity,bytes} from '../../apps/marketplace-preview/mainnet-fees.mjs';
import {quoteWalletCall,recheckWalletCall,walletFeePolicy} from '../../packages/chain-wallet/fees.mjs';
import {matchesReviewedTransaction,matchesReceipt} from '../../packages/multichain/receipt-match.mjs';
const hash=x=>typeof x==='string'&&/^0x[0-9a-f]{64}$/.test(x);
const shape=(o,keys)=>{
 if(!o||Object.getPrototypeOf(o)!==Object.prototype)return false;
 const own=Reflect.ownKeys(o),d=Object.getOwnPropertyDescriptors(o);
 return own.length===keys.length&&own.every(k=>typeof k==='string'&&keys.includes(k)&&d[k].enumerable&&Object.hasOwn(d[k],'value'));
};
const txKeys=['type','chainId','from','to','data','value','nonce','gas','maxFeePerGas','maxPriorityFeePerGas'];
const clone=x=>structuredClone(x),freeze=x=>{if(x&&typeof x==='object'&&!Object.isFrozen(x)){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
export function parseWalletTransaction(text,{chainId,owner,intentId,call}){
 const policy=walletFeePolicy(chainId);
 ensure(address(owner)&&hash(intentId)&&shape(call,['to','data','value'])&&address(call.to)&&bytes(call.data)&&call.data.length<=98306&&quantity(call.value),'Expected call identity');
 ensure(typeof text==='string'&&text.length<250000,'Public call progress required');const j=JSON.parse(text);
 ensure(shape(j,['version','kind','chainId','owner','intentId','transaction','status','hash'])&&j.version===1&&j.kind==='qhooks-chain-wallet-call'&&j.chainId===policy.hexId&&j.owner===owner&&j.intentId===intentId,'Call progress identity');
 ensure(['submitting','unknown','submitted','confirmed','reverted','rejected'].includes(j.status),'Call progress status');
 ensure(['submitted','confirmed','reverted'].includes(j.status)?hash(j.hash):j.hash===null,'Call progress hash');
 const t=j.transaction;ensure(shape(t,txKeys)&&t.type==='0x2'&&t.chainId===policy.hexId&&t.from===owner&&['to','data','value'].every(k=>t[k]===call[k]),'Call progress transaction');
 ensure(['nonce','gas','maxFeePerGas','maxPriorityFeePerGas','value'].every(k=>quantity(t[k]))&&BigInt(t.nonce)<(1n<<64n)-1n&&BigInt(t.gas)>0n&&BigInt(t.gas)<=7000000n&&BigInt(t.maxFeePerGas)>0n&&BigInt(t.maxFeePerGas)<=policy.maxPrice&&BigInt(t.maxPriorityFeePerGas)<=BigInt(t.maxFeePerGas),'Call progress fee bounds');
 if(j.status==='submitting')j.status='unknown';return j;
}
export async function createWalletTransaction({chainId,provider,owner,intentId,call:input,inspect,confirm,save,saved=null,onChange=()=>{},clock=Date.now}){
 const policy=walletFeePolicy(chainId);
 ensure(provider&&['request','on','removeListener'].every(k=>typeof provider[k]==='function')&&address(owner)&&hash(intentId)&&shape(input,['to','data','value'])&&address(input.to)&&bytes(input.data)&&input.data.length<=98306&&quantity(input.value),'Call dependencies');
 ensure([inspect,confirm,save,onChange,clock].every(f=>typeof f==='function'),'Call callbacks');const call=freeze(clone(input));
 ensure(saved===null||typeof saved==='string'&&saved.length>0,'Public progress text required');
 let journal=saved===null?null:parseWalletTransaction(saved,{chainId,owner,intentId,call}),quote=null,outcome=null,attention=null,revision=0,busy=false,dead=false,saveFailed=false;
 const feeQuotes=new WeakMap();
 const recoveryOnly=saved!==null,request=(method,params=[])=>provider.request({method,params});
 const snapshot=()=>freeze({busy,quote,outcome,status:attention||journal?.status||'idle',saveFailed,recoveryOnly,journal:clone(journal)});
 const notify=()=>{try{onChange(snapshot());}catch{}};
 const invalidate=()=>{revision++;quote=null;outcome=null;attention='connection-changed';notify();};
 const events=['accountsChanged','chainChanged','disconnect'];for(const e of events)provider.on(e,invalidate);
 async function live(rev){ensure(!dead&&revision===rev,'Connection changed');const [chain,accounts]=await Promise.all([request('eth_chainId'),request('eth_accounts')]);ensure(!dead&&revision===rev&&chain===policy.hexId&&Array.isArray(accounts)&&accounts[0]?.toLowerCase()===owner,'Reconnect the expected wallet on the selected chain');}
 async function persist(){try{await save(clone(journal));saveFailed=false;}catch(e){saveFailed=true;throw new Error('Could not save public transaction progress',{cause:e});}finally{notify();}}
 async function operation(fn){ensure(!dead&&!busy,'Account transaction busy');busy=true;const rev=revision;notify();const check=()=>live(rev);try{await check();return await fn(check);}finally{busy=false;notify();}}
 function matches(tx,h){return matchesReviewedTransaction(journal.transaction,tx,h);}
 async function reconcile(check){
  quote=null;outcome=null;attention=null;ensure(journal,'No submitted account transaction');
  if(!journal.hash){attention=journal.status==='unknown'?'recover-transaction-hash':journal.status;return snapshot();}
  const [tx,receipt]=await Promise.all([request('eth_getTransactionByHash',[journal.hash]),request('eth_getTransactionReceipt',[journal.hash])]);await check();
  if(!tx||!receipt||tx.blockHash===null||tx.blockNumber===null){attention='pending-or-replaced';return snapshot();}
  ensure(matches(tx,journal.hash),'Mined call differs from reviewed transaction');
  ensure(matchesReceipt(tx,receipt,journal.hash),'Call receipt identity');
  const block=await request('eth_getBlockByNumber',[receipt.blockNumber,false]);await check();
  if(!block||block.hash!==receipt.blockHash){attention='reorg';return snapshot();}
  ensure(block.number===receipt.blockNumber&&Array.isArray(block.transactions)&&block.transactions.includes(journal.hash),'Call canonical inclusion');
  journal.status=receipt.status==='0x1'?'confirmed':'reverted';await persist();await check();
  if(journal.status==='confirmed'){const result=await confirm(receipt,check);await check();ensure(result&&typeof result==='object','Missing account outcome');outcome=freeze(clone(result));}
  return snapshot();
 }
 const api={snapshot,journal:()=>freeze(clone(journal)),
  review:()=>operation(async check=>{
   ensure(!recoveryOnly&&(!journal||journal.status==='rejected'),'Recover existing progress before a new call');ensure(!saveFailed,'Save progress first');quote=null;outcome=null;
   const fingerprint=await inspect(check);await check();ensure(hash(fingerprint),'Account fingerprint required');
   const next=await quoteWalletCall({chainId,request,owner,call,clock});await check();quote=freeze({...next,stateFingerprint:fingerprint});feeQuotes.set(quote,next);attention=null;return quote;
  }),
  submit:token=>operation(async check=>{
   ensure(!recoveryOnly&&token&&token===quote,'Review this exact account transaction');const chosen=quote;quote=null;outcome=null;ensure(!saveFailed,'Save progress first');
   ensure(await inspect(check)===chosen.stateFingerprint,'Account changed; review again');await check();await recheckWalletCall({request,quote:feeQuotes.get(chosen),clock});await check();
   journal={version:1,kind:'qhooks-chain-wallet-call',chainId:policy.hexId,owner,intentId,transaction:clone(chosen.transaction),status:'submitting',hash:null};attention=null;let sent=false;
   try{await persist();await check();ensure(await request('eth_getTransactionCount',[owner,'pending'])===journal.transaction.nonce,'Wallet nonce changed');await check();
    sent=true;const h=await request('eth_sendTransaction',[clone(journal.transaction)]);ensure(hash(h),'Wallet returned invalid transaction hash');journal.hash=h;journal.status='submitted';await persist();await check();return await reconcile(check);
   }catch(e){if(journal.status==='submitting'){journal.status=!sent||e?.code===4001?'rejected':'unknown';attention=journal.status==='unknown'?'recover-transaction-hash':null;try{await persist();}catch{}}throw e;}
  }),
  reconcile:()=>operation(reconcile),
  recover:h=>operation(async check=>{ensure(journal?.status==='unknown'&&hash(h),'No uncertain call or invalid hash');quote=null;const tx=await request('eth_getTransactionByHash',[h]);await check();ensure(matches(tx,h),'Recovery call differs from reviewed transaction');journal.hash=h;journal.status='submitted';await persist();return reconcile(check);}),
  save:()=>operation(async()=>{ensure(journal,'No progress');await persist();return snapshot();}),
  invalidateReview(){quote=null;notify();},
  dispose(){if(dead)return;dead=true;invalidate();for(const e of events)provider.removeListener(e,invalidate);}
 };
 try{await live(revision);}catch(e){api.dispose();throw e;}return Object.freeze(api);
}
