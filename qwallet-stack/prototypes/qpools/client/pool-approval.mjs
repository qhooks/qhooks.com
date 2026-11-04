// Explicit wallet AND SLH approval. No persistence, broadcasting or fallback.
import {typedPoolAction} from './pool-typed-data.mjs';
import {poolWalletDigest,verifyPoolWalletApproval} from './pool-wallet-proof.mjs';
const ensure=(ok,message)=>{if(!ok)throw new Error(message);};
export function canonicalPoolAction(action){
 const typed=typedPoolAction(action);
 return Object.freeze(Object.fromEntries(typed.types.QPoolAction.map(({name,type})=>[name,type.startsWith('uint')?BigInt(typed.message[name]):typed.message[name]])));
}
export function createPoolApprover({provider,session,signer,clock=()=>Math.floor(Date.now()/1000)}){
 ensure(provider&&typeof provider.request==='function'&&session&&typeof session.refresh==='function'&&signer&&typeof signer.signAction==='function'&&typeof signer.lock==='function'&&typeof clock==='function','Invalid approval dependencies');
 let busy=false,dead=false,revision=0;
 const invalidate=()=>{revision++;signer.lock();};
 return Object.freeze({
  async approve(input){
   ensure(!dead&&!busy,'Approval unavailable');busy=true;
   try{
    const rev=revision,action=canonicalPoolAction(input),typed=typedPoolAction(action),connected=session.current,publicKeyHex=signer.publicKeyHex,keyId=signer.keyId;
    function live(){
     ensure(!dead&&revision===rev&&connected&&connected===session.current&&signer.backupVerified&&!signer.locked,'Approval became stale');
     ensure(action.owner===connected.owner&&action.chainId.toString()===connected.chainId&&action.publicKey===publicKeyHex&&signer.publicKeyHex===publicKeyHex&&signer.keyId===keyId,'Wallet, chain or quantum key changed');
     const now=clock();ensure(Number.isSafeInteger(now)&&now>=0,'Invalid approval clock');ensure(action.validAfter<=BigInt(now)&&BigInt(now)<action.validUntil,'Approval window expired');
    }
    live();await session.refresh(connected);live();
    const pq=signer.signAction(action);live();
    ensure(pq.publicKeyHex===publicKeyHex&&pq.keyId===keyId,'Quantum signer identity changed');
    const signature=await provider.request({method:'eth_signTypedData_v4',params:[action.owner,JSON.stringify(typed)]});
    await session.refresh(connected);live();
    const walletSignatureHex=verifyPoolWalletApproval(action,signature);live();
    return Object.freeze({action,walletDigestHex:poolWalletDigest(action),walletSignatureHex,pqSignatureHex:pq.signatureHex,publicKeyHex,keyId});
   }finally{busy=false;}
  },
  invalidate,
  dispose(){if(!dead){dead=true;invalidate();}}
 });
}
