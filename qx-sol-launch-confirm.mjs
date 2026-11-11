// Same-origin RPC is HTTP only. Finality must not depend on a WebSocket subscription.
export async function waitSolFinalized(connection,signature,{lastValidBlockHeight,timeoutMs=90000,now=Date.now,wait=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 const end=now()+timeoutMs;
 while(now()<end){
  const response=await connection.getSignatureStatuses([signature],{searchTransactionHistory:true}),status=response?.value?.[0];
  if(status?.confirmationStatus==='finalized'){if(status.err)throw Error('Transaction failed on chain. Open the transaction to inspect it.');return signature;}
  if(status==null&&Number.isSafeInteger(lastValidBlockHeight)){const height=await connection.getBlockHeight('finalized');if(height>lastValidBlockHeight+32)throw Error('The transaction expired without confirmation. Keep its signature and check before starting again.');}
  await wait(2000);
 }
 throw Error('Confirmation is pending. Keep the transaction link and check again.');
}
