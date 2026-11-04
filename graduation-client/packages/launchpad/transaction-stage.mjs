// Lead-owned submission/reconciliation boundary. Browser EIP1193 or fixed VM
// adapter; public data only. A saved status is never trusted as chain evidence.
import {assertTransaction} from './transaction-match.mjs';
import {transitionStage} from './stage-transition.mjs';
const HASH = /^0x[0-9a-f]{64}$/, ADDRESS = /^0x[0-9a-f]{40}$/;
const quantity = x => typeof x === 'string' && x.length <= 66 && /^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(x);
const ensure = (ok,message) => { if (!ok) throw new TypeError(message); };
export function createTransactionStage({provider,planId,transaction,expectedContractAddress=null,save=()=>{},snapshot=null}) {
  ensure(provider && ['request','on','removeListener'].every(k=>typeof provider[k]==='function'),'provider');
  ensure(typeof planId==='string' && HASH.test(planId) && typeof save==='function','plan identity');
  const keys=['chainId','from','to','input','value','nonce','gas'];
  ensure(transaction && Object.keys(transaction).sort().join()===keys.slice().sort().join(),'transaction fields');
  const tx=Object.freeze(Object.fromEntries(keys.map(k=>[k,transaction[k]])));
  assertTransaction({...tx,hash:planId},{...tx,hash:planId});
  ensure(tx.chainId==='0x7a69' && ADDRESS.test(tx.from) && (tx.to===null || ADDRESS.test(tx.to)),'local chain/address');
  ensure(quantity(tx.gas) && BigInt(tx.gas)>0n && BigInt(tx.gas)<=100000000n,'local gas bound');
  ensure(tx.to===null ? typeof expectedContractAddress==='string' && ADDRESS.test(expectedContractAddress) : expectedContractAddress===null,'creation identity');
  const identity={schemaVersion:1,planId,transaction:tx,expectedContractAddress};
  let state={status:'pending',hash:null},receipt=null,busy=false,dead=false,revision=0;
  if(snapshot!==null){
    ensure(snapshot && Object.keys(snapshot).sort().join()===['schemaVersion','planId','transaction','expectedContractAddress','status','hash'].sort().join(),'journal fields');
    ensure(snapshot.schemaVersion===1 && snapshot.planId===planId && snapshot.expectedContractAddress===expectedContractAddress,'journal identity');
    ensure(JSON.stringify(snapshot.transaction)===JSON.stringify(tx),'journal transaction changed');
    ensure(['pending','submitting','unknown','submitted','confirmed','reverted','rejected'].includes(snapshot.status),'journal status');
    const known=['submitted','confirmed','reverted'].includes(snapshot.status);
    ensure(known ? typeof snapshot.hash==='string' && HASH.test(snapshot.hash) : snapshot.hash===null,'journal hash');
    state={status:known?'submitted':snapshot.status==='submitting'?'unknown':snapshot.status,hash:snapshot.hash};
  }
  const events=['accountsChanged','chainChanged','disconnect'],invalidate=()=>{revision++;};
  for(const e of events)provider.on(e,invalidate);
  const view=()=>Object.freeze({...identity,...state});
  async function persist(event,hash=null){
    const next=transitionStage(state.status,event,hash);
    state={status:next.status,hash:next.hash??state.hash};receipt=null;
    await save(view());
  }
  async function live(rev){
    ensure(!dead && rev===revision,'connection changed');
    const chain=await provider.request({method:'eth_chainId'});
    const accounts=await provider.request({method:'eth_accounts'});
    ensure(!dead && rev===revision && chain===tx.chainId && Array.isArray(accounts) && typeof accounts[0]==='string' && accounts[0].toLowerCase()===tx.from,'connection changed');
  }
  async function exclusive(fn){ensure(!dead&&!busy,'stage unavailable');busy=true;const rev=revision;try{await live(rev);return await fn(rev);}finally{busy=false;}}
  async function reconcileInternal(rev){
    ensure(['submitted','confirmed','reverted'].includes(state.status) && state.hash,'no submitted transaction');
    if(state.status!=='submitted')await persist('reorg'); // Revalidate, never trust old confirmation.
    const actual=await provider.request({method:'eth_getTransactionByHash',params:[state.hash]});
    const found=await provider.request({method:'eth_getTransactionReceipt',params:[state.hash]});
    await live(rev);
    if(actual===null || found===null){
      const consumed=await provider.request({method:'eth_getTransactionCount',params:[tx.from,'latest']});await live(rev);ensure(quantity(consumed),'account nonce');
      return Object.freeze({journal:view(),receipt:null,attention:BigInt(consumed)>BigInt(tx.nonce)?'replaced-or-missing':actual===null?'missing':'pending'});
    }
    assertTransaction({...tx,hash:state.hash},actual);
    ensure(found.transactionHash===state.hash && found.from?.toLowerCase()===tx.from && (found.to===null?tx.to===null:found.to?.toLowerCase()===tx.to),'receipt transaction');
    ensure(typeof found.blockHash==='string' && HASH.test(found.blockHash) && quantity(found.blockNumber) && ['0x0','0x1'].includes(found.status),'receipt fields');
    // The transaction and receipt are separate reads. Mining may occur between
    // them; a still-pending transaction snapshot is not a mismatched mined one.
    if(actual.blockHash===null || actual.blockNumber===null)return Object.freeze({journal:view(),receipt:null,attention:'pending'});
    ensure(actual.blockHash===found.blockHash && actual.blockNumber===found.blockNumber,'mined transaction block');
    const block=await provider.request({method:'eth_getBlockByNumber',params:[found.blockNumber,false]});await live(rev);
    if(!block || block.hash!==found.blockHash)return Object.freeze({journal:view(),receipt:null,attention:'reorg'});
    ensure(block.number===found.blockNumber && Array.isArray(block.transactions) && block.transactions.length<=4096 && block.transactions.includes(state.hash),'canonical block inclusion');
    if(found.status==='0x1')ensure(expectedContractAddress===null ? found.contractAddress===null : found.contractAddress?.toLowerCase()===expectedContractAddress,'deployment address');
    const checked=Object.freeze({blockHash:found.blockHash,blockNumber:found.blockNumber,contractAddress:found.contractAddress,status:found.status});
    await persist(found.status==='0x1'?'confirmed':'reverted');receipt=checked;
    return Object.freeze({journal:view(),receipt,attention:null});
  }
  return Object.freeze({
    snapshot:view,
    submit:()=>exclusive(async rev=>{
      ensure(['pending','rejected'].includes(state.status),'explicit pending stage required');
      const nonce=await provider.request({method:'eth_getTransactionCount',params:[tx.from,'pending']});await live(rev);ensure(nonce===tx.nonce,'account nonce changed');
      await persist('submit');
      let sent=false;
      try{
        await live(rev);
        const latestNonce=await provider.request({method:'eth_getTransactionCount',params:[tx.from,'pending']});await live(rev);ensure(latestNonce===tx.nonce,'account nonce changed');
        sent=true;
        const request={from:tx.from,data:tx.input,value:tx.value,nonce:tx.nonce,gas:tx.gas,chainId:tx.chainId};if(tx.to!==null)request.to=tx.to;
        const hash=await provider.request({method:'eth_sendTransaction',params:[request]});
        ensure(typeof hash==='string'&&HASH.test(hash),'invalid transaction hash');await persist('accepted',hash);
        return view(); // Preserve broadcast hash even if the wallet changed during submission.
      }catch(error){
        if(state.status==='submitting')await persist(!sent || error?.code===4001?'rejected':'uncertain');
        throw error;
      }
    }),
    recover:hash=>exclusive(async rev=>{
      ensure(state.status==='unknown' && typeof hash==='string' && HASH.test(hash),'recovery hash');
      const actual=await provider.request({method:'eth_getTransactionByHash',params:[hash]});await live(rev);
      assertTransaction({...tx,hash},actual);await persist('recovered',hash);return reconcileInternal(rev);
    }),
    reconcile:()=>exclusive(reconcileInternal),
    dispose(){if(!dead){dead=true;revision++;for(const e of events)provider.removeListener(e,invalidate);}}
  });
}
