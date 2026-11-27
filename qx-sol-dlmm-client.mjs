import {reviewDlmmBatch} from './qx-sol-dlmm-batch.mjs';
import {solAddress} from './qx-solana.mjs';
import {solRuntime,prepareSolTransaction,sendPreparedSol} from './qx-sol-launch-client.mjs';
export async function dlmmApi(path,body){const r=await fetch('/api/sol/dlmm/'+path,{cache:'no-store',...(body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});let v;try{v=await r.json();}catch{throw Error('Liquidity is unavailable. Try again.');}if(!r.ok)throw Error(v.error||'Liquidity request failed.');return v;}
export function validateAdd({amountSol,amountToken,shape,range}){
 const valid=v=>v===undefined||v===''||/^\d+(?:\.\d+)?$/.test(String(v));
 if(!valid(amountSol)||!valid(amountToken)||!(Number(amountSol||0)>0||Number(amountToken||0)>0))throw Error('Enter a positive amount.');
 if(!['spot','curve','bidask'].includes(shape)||!Number.isFinite(range.lowerPct)||!Number.isFinite(range.upperPct)||range.lowerPct<=-100||range.upperPct>1000||range.lowerPct>range.upperPct)throw Error('Choose a valid range.');
}
export async function reviewDlmm(input){
 const owner=solAddress();if(!owner)throw Error('Connect your Solana wallet.');
 const runtime=await solRuntime();let signer=null;
 const body={...input,owner};
 if(input.action==='add'){validateAdd(input);signer=runtime.Keypair.generate();body.position=signer.publicKey.toBase58();}
 if(input.action==='rebalance'){signer=runtime.Keypair.generate();body.newPosition=signer.publicKey.toBase58();}
 const response=await dlmmApi('prepare',body);
 if(response.walletTransactions?.length>1)return reviewDlmmBatch(runtime,response,signer,owner);
 if(response.walletTransactions?.length!==1)throw Error('Review this transaction again.');
 const tx=runtime.Transaction.from(Uint8Array.from(atob(response.walletTransactions[0]),c=>c.charCodeAt(0)));
 // Existing Phantom flow: wallet signs first, local position signature is added to
 // the returned message, then that exact message is submitted. Never signAndSend a
 // transaction that still needs the browser-only position co-signature.
 const prepared=await prepareSolTransaction(runtime,tx,signer?[signer]:[],owner,{fixedLast:response.last});
 let consumed=false;
 return {summary:response.summary,owner,async send(){if(consumed)throw Error('Review the action again.');if(solAddress()!==owner)throw Error('The wallet changed. Review again.');consumed=true;const sent=await sendPreparedSol(runtime,prepared);return sent;}};
}
