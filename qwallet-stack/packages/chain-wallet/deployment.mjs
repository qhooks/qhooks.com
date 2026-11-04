// L65 additive fixed-asset wallet adapter. Derived from pinned L59; new acceptance required.
// Additive next-chain core setup. Not exposed by the public site until integration acceptance.
// Shares only the hash-pinned toolkit reader; accepted Base controllers remain unchanged.
import {readMainnetToolkit,TOOLKIT_SHA} from '../../apps/marketplace-preview/mainnet-deploy.mjs';
import {walletFeePolicy,quoteWalletCreation,recheckWalletCreation} from './fees.mjs';
import {rpcQuantity} from '../multichain/fee-math.mjs';
import {matchesReviewedTransaction,matchesReceipt} from '../multichain/receipt-match.mjs';
import {normalizeWalletAssets} from './wallet-assets.mjs';
import {encodePoolConstructor} from '../../prototypes/qpools/client/pool-constructor.mjs';
const ensure=(v,m)=>{if(!v)throw new TypeError(m);};
const hash=x=>typeof x==='string'&&/^0x[0-9a-f]{64}$/.test(x);
const address=x=>typeof x==='string'&&/^0x[0-9a-f]{40}$/.test(x)&&!/^0x0{40}$/.test(x);
const freeze=o=>{if(o&&typeof o==='object'&&!Object.isFrozen(o)){Object.values(o).forEach(freeze);Object.freeze(o);}return o;};
const clone=x=>structuredClone(x);
const keys=(o,names)=>o&&Object.getPrototypeOf(o)===Object.prototype&&Object.keys(o).sort().join()===names.slice().sort().join();
const txKeys=['type','chainId','from','data','value','nonce','gas','maxFeePerGas','maxPriorityFeePerGas'];
export function parseWalletDeployment(text,chainId,owner){
 const policy=walletFeePolicy(chainId);ensure(address(owner)&&typeof text==='string'&&text.length<500000,'Bounded deployment progress required');
 let j;try{j=JSON.parse(text);}catch{throw new TypeError('Invalid deployment progress');}
 ensure(keys(j,['version','kind','chainId','owner','artifactSha256','tokens','stages'])&&j.version===1&&j.kind==='qhooks-chain-wallet-deployment'&&j.chainId===policy.hexId&&j.owner===owner&&j.artifactSha256===TOOLKIT_SHA,'Progress network, wallet or toolkit mismatch');
 ensure(JSON.stringify(normalizeWalletAssets(chainId,j.tokens))===JSON.stringify(j.tokens),'Canonical wallet asset policy required');
 ensure(Array.isArray(j.stages)&&j.stages.length<=2,'Invalid stage list');
 for(const [i,s]of j.stages.entries()){
  ensure(keys(s,['id','transaction','status','hash'])&&s.id===['verifier','pool'][i]&&['submitting','unknown','submitted','confirmed','reverted','rejected'].includes(s.status),'Invalid stage');
  ensure(['submitted','confirmed','reverted'].includes(s.status)?hash(s.hash):s.hash===null,'Invalid transaction hash');
  const t=s.transaction;ensure(keys(t,txKeys)&&t.type==='0x2'&&t.chainId===policy.hexId&&t.from===owner&&t.value==='0x0'&&typeof t.data==='string'&&/^0x(?:[0-9a-f]{2})+$/.test(t.data)&&t.data.length<=98306,'Invalid creation transaction');
  const gas=rpcQuantity(t.gas),price=rpcQuantity(t.maxFeePerGas),tip=rpcQuantity(t.maxPriorityFeePerGas),nonce=rpcQuantity(t.nonce);
  ensure(gas>0n&&gas<=policy.maxGas&&price>0n&&price<=policy.maxPrice&&tip<=price&&nonce<(1n<<64n)-1n,'Invalid transaction limits');
  if(s.status==='submitting')s.status='unknown';
 }
 return j;
}
export async function createWalletDeployment({chainId,provider,owner,toolkitText,tokens,saved=null,save,onChange=()=>{},clock=Date.now}){
 const policy=walletFeePolicy(chainId);ensure(provider&&['request','on','removeListener'].every(k=>typeof provider[k]==='function')&&address(owner)&&[save,onChange,clock].every(f=>typeof f==='function'),'Deployment dependencies');
 const assets=normalizeWalletAssets(chainId,tokens),toolkit=await readMainnetToolkit(toolkitText);
 let journal=saved?parseWalletDeployment(saved,chainId,owner):{version:1,kind:'qhooks-chain-wallet-deployment',chainId:policy.hexId,owner,artifactSha256:TOOLKIT_SHA,tokens:assets,stages:[]};
 ensure(JSON.stringify(journal.tokens)===JSON.stringify(assets),'Saved wallet asset policy differs');
 let revision=0,dead=false,busy=false,quote=null,inner=null,verified={},attention=null,saveFailed=false;
 const request=(method,params=[])=>provider.request({method,params});
 const snapshot=()=>freeze({owner,chainId,tokens:assets,nativeSymbol:policy.nativeSymbol,busy,quote,verifier:verified.verifier||null,pool:verified.pool||null,status:attention||(verified.pool?'complete':journal.stages.at(-1)?.status||'idle'),saveFailed,stages:clone(journal.stages)});
 const notify=()=>{try{onChange(snapshot());}catch{}};
 const invalidate=()=>{revision++;quote=null;inner=null;verified={};attention='connection-changed';notify();};
 const events=['accountsChanged','chainChanged','disconnect'];for(const e of events)provider.on(e,invalidate);
 async function live(rev){
  ensure(!dead&&revision===rev,'Connection changed; reconnect');
  const [chain,accounts]=await Promise.all([request('eth_chainId'),request('eth_accounts')]);
  ensure(!dead&&revision===rev&&chain===policy.hexId&&Array.isArray(accounts)&&typeof accounts[0]==='string'&&accounts[0].toLowerCase()===owner,'Wallet or selected network changed');
 }
 async function persist(){try{await save(clone(journal));saveFailed=false;}catch(e){saveFailed=true;throw new Error('Could not save deployment progress',{cause:e});}finally{notify();}}
 async function operation(fn){ensure(!busy&&!dead,'Deployment unavailable');busy=true;const rev=revision;notify();try{await live(rev);return await fn(rev);}finally{busy=false;notify();}}
 const init=id=>{
  if(id==='verifier')return toolkit.contracts.verifier.bytecode;
  ensure(id==='pool'&&address(verified.verifier),'Confirm the verifier first');
  return toolkit.contracts.pool.bytecode+encodePoolConstructor(verified.verifier,assets).slice(2);
 };
 async function reconcile(rev){
  verified={};attention=null;
  for(const s of journal.stages){
   ensure(s.transaction.data===init(s.id),'Progress does not match fixed toolkit');
   if(!s.hash){attention=s.status==='unknown'?'recover-transaction-hash':s.status;break;}
   const [tx,r]=await Promise.all([request('eth_getTransactionByHash',[s.hash]),request('eth_getTransactionReceipt',[s.hash])]);await live(rev);
   if(!tx||!r||tx.blockHash===null||tx.blockNumber===null){attention='pending-or-replaced';break;}
   ensure(matchesReviewedTransaction(s.transaction,tx,s.hash),'Mined transaction differs from reviewed deployment');
   ensure(matchesReceipt(tx,r,s.hash),'Receipt identity mismatch');
   const block=await request('eth_getBlockByNumber',[r.blockNumber,false]);await live(rev);
   if(!block||block.hash!==r.blockHash){attention='reorg';break;}
   ensure(block.number===r.blockNumber&&Array.isArray(block.transactions)&&block.transactions.includes(s.hash),'Canonical inclusion missing');
   if(r.status==='0x0'){s.status='reverted';await persist();attention='reverted';break;}
   const deployed=r.contractAddress?.toLowerCase();ensure(address(deployed),'Missing deployed address');
   const runtime=s.id==='verifier'?toolkit.contracts.verifier.deployedBytecode:await request('eth_call',[{from:owner,data:s.transaction.data,gas:'0x6acfc0'},'latest']);await live(rev);
   ensure(typeof runtime==='string'&&/^0x(?:[0-9a-f]{2})+$/.test(runtime)&&runtime.length===toolkit.contracts[s.id].runtimeBytes*2+2,'Invalid expected runtime');
   const actual=await request('eth_getCode',[deployed,'latest']);await live(rev);ensure(actual===runtime,'Deployed runtime mismatch');
   s.status='confirmed';verified[s.id]=deployed;await persist();
  }
  return snapshot();
 }
 const api={snapshot,journal:()=>freeze(clone(journal)),
  review:()=>operation(async rev=>{
   quote=null;inner=null;await reconcile(rev);await live(rev);ensure(!saveFailed,'Save progress first');ensure(!verified.pool,'Core already deployed');
   const id=verified.verifier?'pool':'verifier',existing=journal.stages[id==='pool'?1:0];ensure(!existing||existing.status==='rejected','Reconcile or recover before another deployment');
   const q=await quoteWalletCreation({chainId,request,owner,call:{data:init(id),value:'0x0'},clock});await live(rev);ensure(q.funded,'Insufficient '+policy.nativeSymbol+' for deployment');
   inner=q;quote=freeze({...q,id});attention=null;return quote;
  }),
  submit:token=>operation(async rev=>{
   ensure(token&&token===quote&&inner,'Review this exact transaction');const selected=quote,fee=inner;quote=null;inner=null;
   await reconcile(rev);await live(rev);ensure(!saveFailed,'Save progress first');ensure(selected.transaction.data===init(selected.id),'Deployment dependency changed');
   const index=selected.id==='pool'?1:0;ensure(journal.stages.length===index||journal.stages[index]?.status==='rejected','Existing deployment must be reconciled');
   await recheckWalletCreation({request,quote:fee,clock});await live(rev);
   const stage={id:selected.id,transaction:clone(selected.transaction),status:'submitting',hash:null};journal.stages[index]=stage;attention=null;let sent=false;
   try{
    await persist();await live(rev);ensure(await request('eth_getTransactionCount',[owner,'pending'])===stage.transaction.nonce,'Wallet nonce changed');await live(rev);
    // Sole submission point: explicit user action, durable intent, never auto-retry.
    sent=true;const h=await request('eth_sendTransaction',[clone(stage.transaction)]);ensure(hash(h),'Invalid wallet transaction hash');stage.hash=h;stage.status='submitted';await persist();await live(rev);return await reconcile(rev);
   }catch(e){if(stage.status==='submitting'){stage.status=!sent||e?.code===4001?'rejected':'unknown';attention=stage.status==='unknown'?'recover-transaction-hash':null;try{await persist();}catch{}}throw e;}
  }),
  reconcile:()=>operation(async rev=>{quote=null;inner=null;return reconcile(rev);}),
  recover:h=>operation(async rev=>{
   quote=null;inner=null;const s=journal.stages.find(x=>x.status==='unknown');ensure(s&&hash(h),'No uncertain transaction or invalid hash');
   const tx=await request('eth_getTransactionByHash',[h]);await live(rev);ensure(matchesReviewedTransaction(s.transaction,tx,h),'Recovery transaction identity mismatch');
   s.hash=h;s.status='submitted';await persist();return reconcile(rev);
  }),
  save:()=>operation(async()=>{await persist();return snapshot();}),
  dispose(){if(dead)return;dead=true;invalidate();for(const e of events)provider.removeListener(e,invalidate);}
 };
 try{await live(revision);}catch(e){api.dispose();throw e;}return Object.freeze(api);
}
