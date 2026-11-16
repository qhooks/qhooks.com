// A broadcast hash is pending until our RPC confirms it. Receipt lag never resubmits a transaction.
const HASH=/^0x[0-9a-fA-F]{64}$/;
const validHash=value=>typeof value==='string'&&HASH.test(value);
export function pendingReceiptHash(error){
 const seen=new Set(),list=[];for(let e=error;e&&typeof e==='object'&&!seen.has(e)&&list.length<12;e=e.cause||e.error||e.data?.originalError){seen.add(e);list.push(e);}
 const text=list.map(e=>[e.name,e.message,e.shortMessage,e.details].filter(v=>typeof v==='string').join(' ')).join(' ');
 if(!/receipt/i.test(text)||!/not.*found|could not.*found|timeout|timed out|not.*processed|pending|not.*block/i.test(text)||list.some(e=>Number(e.code)===4001)||/reverted/i.test(text))return null;
 for(const e of list)for(const h of[e.transactionHash,e.txHash,e.hash,e.receipt?.transactionHash])if(validHash(h))return h;
 const match=text.match(/(?:transaction receipt|transaction hash|transactionHash|txHash)[^\n]{0,100}?(0x[0-9a-f]{64})(?![0-9a-f])/i);return validHash(match?.[1])?match[1]:null;
}
export function pendingTransaction(chainId,hash){return Object.assign(Error('Confirming… Your transaction is still pending.'),{pending:true,mayHaveSubmitted:true,chainId:String(chainId),txHash:hash});}
export async function waitTransactionReceipt(chainId,hash,{rpc,onStatus=()=>{},assert=()=>{},wait=ms=>new Promise(r=>setTimeout(r,ms)),now=Date.now,timeoutMs=600000}={}){
 if(!validHash(hash))throw Error('The wallet did not return a transaction hash.');
 const start=now();let delay=1000;onStatus('Confirming…');
 for(;;){
  assert();let receipt=null;try{receipt=await rpc(chainId,'eth_getTransactionReceipt',[hash],{purpose:'transaction',signal:AbortSignal.timeout(10000)});}catch{/* A lagging RPC is still pending. */}assert();
  if(receipt&&validHash(receipt.transactionHash)&&receipt.transactionHash.toLowerCase()===hash.toLowerCase()){
   if(receipt.status==='0x0')throw Object.assign(Error('The transaction reverted.'),{code:'transaction_reverted',txHash:hash,chainId:String(chainId),mayHaveSubmitted:true});
   if(receipt.status==='0x1'){const confirmedMs=now()-start;onStatus('Confirmed');return {...receipt,confirmedMs};}
  }
  if(now()-start>=timeoutMs)throw pendingTransaction(chainId,hash);
  await wait(Math.min(delay,Math.max(0,timeoutMs-(now()-start))));delay=Math.min(10000,Math.ceil(delay*1.5));
 }
}
