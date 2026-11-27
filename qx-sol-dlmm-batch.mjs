import {solAddress,signAllSolTransactions} from './qx-solana.mjs';
import {waitSolFinalized} from './qx-sol-launch-confirm.mjs';
const COMPUTE='ComputeBudget111111111111111111111111111111';
const fromB64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const b64=bytes=>{let s='';for(const n of bytes)s+=String.fromCharCode(n);return btoa(s);};
const content=tx=>tx.instructions.filter(i=>i.programId.toBase58()!==COMPUTE);
async function simulate(serialized,fetchImpl){
 const r=await fetchImpl('/api/sol-launch/rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'simulateTransaction',params:[serialized,{encoding:'base64',sigVerify:false,replaceRecentBlockhash:true,commitment:'confirmed'}]})}),v=await r.json();
 if(!r.ok||v.error||!v.result?.value||v.result.value.err)throw Error('Batch simulation failed. Nothing was sent.');
}
export async function waitDlmmConfirmed(connection,signature,{lastValidBlockHeight,now=Date.now,delay=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 const deadline=now()+60000;
 while(now()<deadline){const status=(await connection.getSignatureStatuses([signature],{searchTransactionHistory:true}))?.value?.[0];if(status?.err)throw Error('A batch transaction failed on chain.');if(['confirmed','finalized'].includes(status?.confirmationStatus))return signature;if(Number.isSafeInteger(lastValidBlockHeight)&&await connection.getBlockHeight('confirmed')>lastValidBlockHeight)throw Error('The remaining batch expired. Review its position before retrying.');await delay(1000);}
 throw Error('Batch confirmation is pending. Check its signatures before retrying.');
}
export async function reviewDlmmBatch(runtime,response,signer,owner,{fetchImpl=(...args)=>fetch(...args),address=solAddress,signAll=signAllSolTransactions,wait=waitSolFinalized,waitConfirmed=waitDlmmConfirmed}={}){
 const transactions=response.walletTransactions.map(s=>runtime.Transaction.from(fromB64(s))),probes=response.simulationWalletTransactions;
 if(transactions.length<2||!probes||probes.length!==transactions.length)throw Error('Review the complete transaction batch again.');
 const prefixes=transactions.map((tx,i)=>{
  const probe=runtime.Transaction.from(fromB64(probes[i])),actual=content(tx),all=content(probe),suffix=all.slice(all.length-actual.length);
  const equal=(a,b)=>a.programId.equals(b.programId)&&b64(a.data)===b64(b.data)&&a.keys.length===b.keys.length&&a.keys.every((k,j)=>k.pubkey.equals(b.keys[j].pubkey)&&(!b.keys[j].isSigner||k.isSigner)&&(!b.keys[j].isWritable||k.isWritable));
  if(all.length<actual.length||!suffix.every((ix,j)=>equal(ix,actual[j])))throw Error('Batch simulation context mismatch.');
  return i===0?[]:all.slice(0,all.length-actual.length);
 });
 for(const probe of probes)await simulate(probe,fetchImpl);
 let consumed=false;
 return {summary:response.summary,owner,async send(){
  if(consumed||address()!==owner)throw Error('The wallet changed. Review again.');consumed=true;
  const last=await runtime.connection.getLatestBlockhash('confirmed');
  const wires=transactions.map(tx=>{tx.recentBlockhash=last.blockhash;tx.signatures=[];return b64(tx.serialize({requireAllSignatures:false,verifySignatures:false}));});
  const outputs=await signAll(wires,{owner});if(address()!==owner)throw Error('The wallet changed. Review again.');
  const signed=outputs.map(bytes=>runtime.Transaction.from(bytes));
  for(let i=0;i<signed.length;i++){
   const tx=signed[i];if(tx.feePayer?.toBase58()!==owner||tx.recentBlockhash!==last.blockhash)throw Error('The wallet changed the batch. Review again.');
   const probe=new runtime.Transaction({feePayer:tx.feePayer,recentBlockhash:tx.recentBlockhash});probe.add(...tx.instructions.filter(ix=>ix.programId.toBase58()===COMPUTE),...prefixes[i],...content(tx));
   await simulate(b64(probe.serialize({requireAllSignatures:false,verifySignatures:false})),fetchImpl);
   if(signer&&tx.signatures.some(s=>s.publicKey.equals(signer.publicKey)))tx.partialSign(signer);
  }
  if(address()!==owner)throw Error('The wallet changed. Review again.');
  if(await runtime.connection.getBlockHeight('confirmed')>last.lastValidBlockHeight)throw Error('The batch expired before submission. Review again.');
  const signatures=[],send=async i=>{const signature=await runtime.connection.sendRawTransaction(signed[i].serialize(),{skipPreflight:false,preflightCommitment:'confirmed',maxRetries:2});signatures.push(signature);return signature;};
  const signature=await send(0);let confirming;
  return {signature,signatures,confirm(){if(!confirming)confirming=(async()=>{try{for(let i=0;i<signed.length;i++){if(i)await send(i);await waitConfirmed(runtime.connection,signatures[i],{lastValidBlockHeight:last.lastValidBlockHeight});}for(const submitted of signatures)await wait(runtime.connection,submitted,{lastValidBlockHeight:last.lastValidBlockHeight});return signatures.at(-1);}catch(error){throw Error('Batch pending after '+signatures.length+' submission(s). Check '+signatures.at(-1)+' before retrying. '+error.message);}})();return confirming;}};
 }};
}
