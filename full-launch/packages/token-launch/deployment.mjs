// Fixed-supply token stage only. Does not initialize liquidity or claim PQ protection.
import {TOKEN_ARTIFACT_SHA,ensure,address,hash,shape,freeze,readTokenArtifact,tokenCreation,tokenViewExpectations} from './artifact.mjs';
import {normalizeTokenFields} from './token-fields.mjs';
import {tokenFeePolicy,quoteTokenCreation,recheckTokenCreation} from './fees.mjs';
import {rpcQuantity} from '../multichain/fee-math.mjs';
import {matchesReviewedTransaction,matchesReceipt} from '../multichain/receipt-match.mjs';
const clone=x=>structuredClone(x),txKeys=['type','chainId','from','data','value','nonce','gas','maxFeePerGas','maxPriorityFeePerGas'];
export function parseTokenDeployment(text,chainId,owner){
 const p=tokenFeePolicy(chainId);ensure(address(owner)&&typeof text==='string'&&text.length<=100000,'Bounded public token progress required');const j=JSON.parse(text);
 ensure(shape(j,['version','kind','chainId','owner','artifactSha256','fields','stages'])&&j.version===1&&j.kind==='qhooks-token-creation'&&j.chainId===p.hexId&&j.owner===owner&&j.artifactSha256===TOKEN_ARTIFACT_SHA,'Token progress identity mismatch');
 const fields=normalizeTokenFields(j.fields);ensure(JSON.stringify(fields)===JSON.stringify(j.fields),'Canonical token fields required');
 ensure(Array.isArray(j.stages)&&j.stages.length<=1,'Single token stage required');
 for(const s of j.stages){
  ensure(shape(s,['transaction','status','hash'])&&['submitting','unknown','submitted','confirmed','reverted','rejected'].includes(s.status),'Invalid token stage');
  ensure(['submitted','confirmed','reverted'].includes(s.status)?hash(s.hash):s.hash===null,'Invalid token transaction hash');
  const t=s.transaction;ensure(shape(t,txKeys)&&t.type==='0x2'&&t.chainId===p.hexId&&t.from===owner&&t.value==='0x0'&&typeof t.data==='string'&&t.data.length<=98306&&/^0x(?:[0-9a-f]{2})+$/.test(t.data),'Invalid token creation');
  const g=rpcQuantity(t.gas),n=rpcQuantity(t.nonce),f=rpcQuantity(t.maxFeePerGas),tip=rpcQuantity(t.maxPriorityFeePerGas);
  ensure(g>0n&&g<=p.maxGas&&n<(1n<<64n)-1n&&f>0n&&f<=p.maxPrice&&tip<=f,'Token transaction bounds');if(s.status==='submitting')s.status='unknown';
 }
 return j;
}
export async function createTokenDeployment({chainId,provider,owner,artifactText,fields:input,saved=null,save,onChange=()=>{},clock=Date.now}){
 const policy=tokenFeePolicy(chainId);ensure(provider&&['request','on','removeListener'].every(k=>typeof provider[k]==='function')&&address(owner)&&[save,onChange,clock].every(f=>typeof f==='function'),'Token deployment dependencies');
 ensure(saved===null||typeof saved==='string'&&saved.length>0,'Public progress text required');
 const token=await readTokenArtifact(artifactText),restored=saved===null?null:parseTokenDeployment(saved,chainId,owner),fields=normalizeTokenFields(restored?restored.fields:input),data=tokenCreation(token,fields,owner);
 let journal=restored||{version:1,kind:'qhooks-token-creation',chainId:policy.hexId,owner,artifactSha256:TOKEN_ARTIFACT_SHA,fields,stages:[]};
 for(const s of journal.stages)ensure(s.transaction.data===data,'Progress constructor differs from fixed token');
 let revision=0,dead=false,busy=false,quote=null,verified=null,attention=null,saveFailed=false;
 const recoveryOnly=saved!==null,request=(method,params=[])=>provider.request({method,params});
 const snapshot=()=>freeze({chainId,owner,fields,nativeSymbol:policy.nativeSymbol,busy,quote,token:verified,status:attention||(verified?'complete':journal.stages[0]?.status||'idle'),saveFailed,recoveryOnly,stages:clone(journal.stages)});
 const notify=()=>{try{onChange(snapshot());}catch{}};
 const invalidate=()=>{revision++;quote=null;verified=null;attention='connection-changed';notify();};
 const events=['accountsChanged','chainChanged','disconnect'];for(const e of events)provider.on(e,invalidate);
 async function live(rev){ensure(!dead&&rev===revision,'Connection changed');const [chain,accounts]=await Promise.all([request('eth_chainId'),request('eth_accounts')]);ensure(!dead&&rev===revision&&chain===policy.hexId&&Array.isArray(accounts)&&accounts[0]?.toLowerCase()===owner,'Reconnect the expected wallet on the selected chain');}
 async function persist(){try{await save(clone(journal));saveFailed=false;}catch(e){saveFailed=true;throw new Error('Could not save token deployment progress',{cause:e});}finally{notify();}}
 async function operation(fn){ensure(!busy&&!dead,'Token deployment unavailable');busy=true;const rev=revision;notify();try{await live(rev);return await fn(rev);}finally{busy=false;notify();}}
 async function reconcile(rev){
  verified=null;attention=null;const s=journal.stages[0];if(!s)return snapshot();ensure(s.transaction.data===data,'Fixed token constructor mismatch');
  if(!s.hash){attention=s.status==='unknown'?'recover-transaction-hash':s.status;return snapshot();}
  const [tx,r]=await Promise.all([request('eth_getTransactionByHash',[s.hash]),request('eth_getTransactionReceipt',[s.hash])]);await live(rev);
  if(!tx||!r||tx.blockHash===null||tx.blockNumber===null){attention='pending-or-replaced';return snapshot();}
  ensure(matchesReviewedTransaction(s.transaction,tx,s.hash)&&matchesReceipt(tx,r,s.hash),'Token receipt or transaction mismatch');
  const block=await request('eth_getBlockByNumber',[r.blockNumber,false]);await live(rev);
  if(!block||block.hash!==r.blockHash){attention='reorg';return snapshot();}
  ensure(block.number===r.blockNumber&&Array.isArray(block.transactions)&&block.transactions.includes(s.hash),'Token canonical inclusion missing');
  if(r.status==='0x0'){s.status='reverted';await persist();attention='reverted';return snapshot();}
  const deployed=r.contractAddress?.toLowerCase();ensure(address(deployed)&&deployed!==owner,'Missing token address');
  const runtime=await request('eth_call',[{from:owner,data,gas:'0x6acfc0'},block.number]);await live(rev);
  ensure(typeof runtime==='string'&&/^0x(?:[0-9a-f]{2})+$/.test(runtime)&&runtime.length===token.runtimeBytes*2+2,'Token runtime simulation failed');
  ensure(await request('eth_getCode',[deployed,block.number])===runtime,'Token runtime mismatch');await live(rev);
  for(const[selector,expected]of Object.entries(tokenViewExpectations(fields))){ensure(await request('eth_call',[{to:deployed,data:selector},block.number])===expected,'Token metadata or supply mismatch');await live(rev);}
  const logs=r.logs.filter(l=>l.address?.toLowerCase()===deployed);ensure(logs.length===1,'Exact token mint event required');const mint=logs[0];
  ensure(mint.removed!==true&&mint.transactionHash===s.hash&&mint.blockHash===r.blockHash&&mint.blockNumber===r.blockNumber&&JSON.stringify(mint.topics)===JSON.stringify(['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef','0x'+'0'.repeat(64),'0x'+owner.slice(2).padStart(64,'0')])&&mint.data==='0x'+BigInt(fields.totalSupply).toString(16).padStart(64,'0'),'Token mint identity mismatch');
  const again=await request('eth_getBlockByNumber',[block.number,false]);await live(rev);ensure(again?.hash===block.hash&&again?.number===block.number,'Token observation reorganized');
  s.status='confirmed';verified=deployed;await persist();return snapshot();
 }
 const api={snapshot,journal:()=>freeze(clone(journal)),
  review:()=>operation(async rev=>{quote=null;ensure(!recoveryOnly,'Imported progress is recovery-only');await reconcile(rev);await live(rev);ensure(!saveFailed&&!verified,'Save progress or use the existing token');ensure(!journal.stages[0]||journal.stages[0].status==='rejected','Reconcile existing token creation');const next=await quoteTokenCreation({chainId,request,owner,data,clock});await live(rev);ensure(next.funded,'Insufficient '+policy.nativeSymbol+' for token deployment');quote=next;attention=null;return quote;}),
  submit:selected=>operation(async rev=>{
   ensure(!recoveryOnly&&selected&&selected===quote,'Review this exact token transaction');quote=null;await reconcile(rev);await live(rev);ensure(!saveFailed&&!verified&&(!journal.stages[0]||journal.stages[0].status==='rejected'),'Existing token progress must be reconciled');
   await recheckTokenCreation({request,quote:selected,clock});await live(rev);
   const stage={transaction:clone(selected.transaction),status:'submitting',hash:null};journal.stages[0]=stage;let sent=false;
   try{await persist();await live(rev);ensure(await request('eth_getTransactionCount',[owner,'pending'])===stage.transaction.nonce,'Wallet nonce changed');await live(rev);sent=true;const h=await request('eth_sendTransaction',[clone(stage.transaction)]);ensure(hash(h),'Wallet returned invalid token transaction hash');stage.hash=h;stage.status='submitted';await persist();await live(rev);return await reconcile(rev);}
   catch(e){if(stage.status==='submitting'){stage.status=!sent||e?.code===4001?'rejected':'unknown';attention=stage.status==='unknown'?'recover-transaction-hash':null;try{await persist();}catch{}}throw e;}
  }),
  reconcile:()=>operation(async rev=>{quote=null;return reconcile(rev);}),
  recover:h=>operation(async rev=>{quote=null;const s=journal.stages[0];ensure(s?.status==='unknown'&&hash(h),'No uncertain token transaction or invalid hash');const tx=await request('eth_getTransactionByHash',[h]);await live(rev);ensure(matchesReviewedTransaction(s.transaction,tx,h),'Recovery transaction differs from token creation');s.hash=h;s.status='submitted';await persist();return reconcile(rev);}),
  save:()=>operation(async()=>{await persist();return snapshot();}),
  invalidateReview(){quote=null;notify();},
  dispose(){if(dead)return;dead=true;invalidate();for(const e of events)provider.removeListener(e,invalidate);}
 };
 try{await live(revision);}catch(e){api.dispose();throw e;}return Object.freeze(api);
}
