// Internal engine; public native-wrap.mjs fixes the production dependency policy.
// Wrapping is not a quantum-protected transfer or a deposit into QHooks custody.
import {ensure,address,hash,freeze} from '../token-launch/artifact.mjs';
import {parseDecimalAmount} from '../crosschain/decimal-amount.mjs';
import {walletFeePolicy,quoteWalletCall,recheckWalletCall} from '../chain-wallet/fees.mjs';
import {matchesReviewedTransaction,matchesReceipt} from '../multichain/receipt-match.mjs';
import {readWrapJournal,WRAP_GAS_LIMIT} from './wrap-journal.mjs';
import {keccak_256} from '../../prototypes/qpools/client/vendor/hashes/sha3.js';
const events=['accountsChanged','chainChanged','disconnect'],clone=x=>structuredClone(x);
const hex=b=>'0x'+Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
const depositTopic=hex(keccak_256(new TextEncoder().encode('Deposit(address,uint256)')));
const mintTopic=hex(keccak_256(new TextEncoder().encode('Transfer(address,address,uint256)')));
const human=n=>{const s=n.padStart(19,'0'),f=s.slice(-18).replace(/0+$/,'');return s.slice(0,-18)+(f?'.'+f:'');};
export async function createNativeWrapCore({provider,session,chainId,dependencies,amount,saved=null,save,onChange=()=>{},clock=Date.now}){
 const policy=walletFeePolicy(chainId),connection=session?.current,q=dependencies?.profile?.quote;
 ensure(['4663','56'].includes(chainId)&&connection?.chainId===chainId&&address(connection.owner)&&q?.wrapNative===true&&q.decimals===18&&q.nativeSharedBalance===false&&address(q.address),'This chain has no admitted native wrapping route');
 ensure(provider&&['request','on','removeListener'].every(k=>typeof provider[k]==='function')&&typeof session.refresh==='function'&&typeof dependencies.verify==='function'&&[save,onChange,clock].every(f=>typeof f==='function'),'Wrapping dependencies');
 const owner=connection.owner,recoveryOnly=saved!==null;
 let j=recoveryOnly?readWrapJournal(saved,{chainId,owner,quote:q.address}):{version:1,kind:'qhooks-native-wrap',chainId,owner,quote:q.address,amount:parseDecimalAmount(amount,18),stage:null};
 let busy=false,dead=false,invalid=false,revision=0,review=null,consent=null,attention=null,saveFailed=false;
 const now=()=>{const n=clock();ensure(Number.isSafeInteger(n)&&n>=0&&Number.isSafeInteger(n+120000),'Invalid wrapping clock');return n;};
 const snapshot=()=>freeze({chainId,owner,quote:q.address,quoteSymbol:q.symbol,nativeSymbol:policy.nativeSymbol,amount:j.amount,amountHuman:human(j.amount),recoveryOnly,busy,invalid,review,feesAccepted:!!review&&consent===review,stage:clone(j.stage),attention,saveFailed});
 const notify=()=>{try{onChange(snapshot());}catch{}};
 const invalidate=()=>{invalid=true;revision++;review=null;consent=null;attention='connection-changed';notify();};
 for(const e of events)provider.on(e,invalidate);
 async function live(rev){ensure(!dead&&!invalid&&rev===revision&&session.current===connection,'Wrapping connection changed');await session.refresh(connection);ensure(!dead&&!invalid&&rev===revision&&session.current===connection,'Wrapping connection changed');}
 const rpc=async(rev,method,params=[])=>{const value=await provider.request({method,params});await live(rev);return value;};
 const admit=rev=>dependencies.verify({request:(m,p)=>rpc(rev,m,p),live:()=>live(rev)});
 const journal=()=>JSON.stringify(j);
 async function persist(){try{await save(journal());saveFailed=false;}catch(e){saveFailed=true;attention='save-failed';throw Error('Save wrapping progress before continuing',{cause:e});}finally{notify();}}
 async function operation(fn,{allowSaveFailure=false}={}){ensure(!busy&&!dead&&!invalid&&(allowSaveFailure||!saveFailed),'Wrapping unavailable or progress needs saving');busy=true;const rev=revision;notify();try{await live(rev);return await fn(rev);}catch(e){review=null;consent=null;throw e;}finally{busy=false;notify();}}
 async function gasReserve(rev,quote){
  // In addition to this transaction's value and maximum cost, retain a further
  // wrapping-fee-sized buffer. This is not a quote for later launch deployments.
  const balance=BigInt(await rpc(rev,'eth_getBalance',[owner,'latest']));
  ensure(balance>=BigInt(quote.requiredBalance)+BigInt(quote.maximumFee),'Keep additional native currency for later network fees');
 }
 async function reconcile(rev){
  review=null;consent=null;attention=null;const s=j.stage;
  // Previously terminal receipts are observations, not permanent guarantees.
  // Demote them until canonical inclusion is freshly revalidated, so a reorg
  // or failed observation cannot leave a stale "confirmed" restart control.
  if(s?.hash&&['confirmed','reverted'].includes(s.status)){s.status='submitted';await persist();}
  await admit(rev);
  if(!s?.hash){attention=s?.status==='unknown'?'recover-transaction-hash':'not-broadcast';return snapshot();}
  const tx=clone(await rpc(rev,'eth_getTransactionByHash',[s.hash])),receipt=clone(await rpc(rev,'eth_getTransactionReceipt',[s.hash]));
  if(!tx||!receipt||tx.blockHash===null||tx.blockNumber===null){attention='pending-or-replaced';return snapshot();}
  ensure(matchesReviewedTransaction(s.transaction,tx,s.hash)&&matchesReceipt(tx,receipt,s.hash),'Wrapping transaction or receipt differs from review');
  const block=clone(await rpc(rev,'eth_getBlockByNumber',[receipt.blockNumber,false]));
  if(!block||block.hash!==receipt.blockHash){attention='reorg';return snapshot();}
  ensure(block.number===receipt.blockNumber&&Array.isArray(block.transactions)&&block.transactions.includes(s.hash),'Wrapping canonical inclusion missing');
  if(receipt.status==='0x0'){s.status='reverted';await persist();attention='reverted';return snapshot();}
  ensure(Array.isArray(receipt.logs),'Wrapping event logs required');
  // The pinned Robinhood aeWETH runtime mints ERC20 balance and emits Transfer
  // from zero. The pinned WBNB runtime emits Deposit. Select the exact expected
  // event by admitted chain; never accept an arbitrary event as a fallback.
  const ownerTopic='0x'+owner.slice(2).padStart(64,'0'),expectedTopics=chainId==='4663'?[mintTopic,'0x'+'0'.repeat(64),ownerTopic]:[depositTopic,ownerTopic];
  const logs=receipt.logs.filter(l=>l.address?.toLowerCase()===q.address&&l.topics?.[0]===expectedTopics[0]);
  ensure(logs.length===1,'Exactly one native wrapping credit event required');const l=logs[0];
  ensure(l.removed!==true&&l.transactionHash===s.hash&&l.blockHash===receipt.blockHash&&l.blockNumber===receipt.blockNumber&&JSON.stringify(l.topics)===JSON.stringify(expectedTopics)&&l.data==='0x'+BigInt(j.amount).toString(16).padStart(64,'0'),'Native wrapping credit event identity mismatch');
  await admit(rev);const again=await rpc(rev,'eth_getBlockByNumber',[block.number,false]);ensure(again?.number===block.number&&again?.hash===block.hash,'Wrapping observation reorganized');
  s.status='confirmed';await persist();attention=null;return snapshot();
 }
 const api={snapshot,journal,
  review:()=>operation(async rev=>{
   ensure(!recoveryOnly&&(!j.stage||['pending','rejected'].includes(j.stage.status)),'Recover the existing wrapping transaction first');review=null;consent=null;await admit(rev);
   const quote=await quoteWalletCall({chainId,request:(m,p)=>rpc(rev,m,p),owner,call:{to:q.address,data:'0xd0e30db0',value:'0x'+BigInt(j.amount).toString(16)},clock});
   ensure(quote.funded&&BigInt(quote.gas)<=WRAP_GAS_LIMIT,'Wrapping balance or gas bound');await gasReserve(rev,quote);await admit(rev);
   j.stage={transaction:clone(quote.transaction),status:'pending',hash:null};readWrapJournal(journal(),{chainId,owner,quote:q.address});await persist();await live(rev);
   review=freeze({...quote,quote,extraGasReserve:quote.maximumFee,serviceFeeMode:'off'});attention=null;return review;
  }),
  acceptFees(token){ensure(!busy&&!dead&&!invalid&&!saveFailed&&!recoveryOnly&&token&&token===review&&session.current===connection&&now()>=review.reviewedAt&&now()<review.expiresAt,'Accept this exact wrapping fee review');consent=review;notify();},
  submit:token=>operation(async rev=>{
   ensure(!recoveryOnly&&token&&token===review&&consent===review&&j.stage?.status==='pending','Explicit current wrapping fee acceptance required');const chosen=review;review=null;consent=null;
   await admit(rev);await recheckWalletCall({request:(m,p)=>rpc(rev,m,p),quote:chosen.quote,clock});await gasReserve(rev,chosen.quote);await admit(rev);
   j.stage.status='submitting';let sent=false;
   try{await persist();await live(rev);ensure(await rpc(rev,'eth_getTransactionCount',[owner,'pending'])===j.stage.transaction.nonce,'Wallet nonce changed before wrapping');ensure(now()>=chosen.reviewedAt&&now()<chosen.expiresAt,'Wrapping fee review expired before broadcast');
    sent=true;const h=await provider.request({method:'eth_sendTransaction',params:[clone(j.stage.transaction)]});ensure(hash(h),'Wallet returned invalid wrapping hash');j.stage.hash=h;j.stage.status='submitted';await persist();await live(rev);return reconcile(rev);
   }catch(e){if(j.stage.status==='submitting'){j.stage.status=!sent||e?.code===4001?'rejected':'unknown';attention=j.stage.status==='unknown'?'recover-transaction-hash':null;try{await persist();}catch{}}throw e;}
  }),
  reconcile:()=>operation(reconcile),
  recover:h=>operation(async rev=>{ensure(j.stage?.status==='unknown'&&hash(h),'No uncertain wrapping transaction or invalid hash');review=null;consent=null;await admit(rev);const tx=await rpc(rev,'eth_getTransactionByHash',[h]);ensure(matchesReviewedTransaction(j.stage.transaction,tx,h),'Recovery transaction differs from wrapping review');j.stage.hash=h;j.stage.status='submitted';await persist();return reconcile(rev);}),
  retrySave:()=>operation(async()=>{await persist();return snapshot();},{allowSaveFailure:true}),invalidate,
  dispose(){if(dead)return;dead=true;invalidate();for(const e of events)provider.removeListener(e,invalidate);}
 };
 try{await live(0);if(recoveryOnly)await reconcile(0);else await admit(0);}catch(e){api.dispose();throw e;}
 if(recoveryOnly)for(const method of ['review','acceptFees','submit'])delete api[method];
 return Object.freeze(api);
}
