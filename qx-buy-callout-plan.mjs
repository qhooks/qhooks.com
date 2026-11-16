// Review prototype for a buy-attached trading-feed callout. No wallet, swap or network implementation lives here.
// A production adapter must supply verified confirmed-buy receipts and the existing signed-in publishing path.
const address=(chain,v)=>chain==='solana'?/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v):/^0x[0-9a-f]{40}$/i.test(v);
const normalize=(chain,v)=>chain==='solana'?v:String(v).toLowerCase();
export function createBuyCalloutPlan({publish,now=Date.now}={}){
 const records=new Map();
 function prepare({chainId,token,owner,text,consent=false}){
  chainId=String(chainId);text=String(text||'').trim();
  if(!consent)throw Error('Choose to publish this callout with your buy.');
  if(!address(chainId,token)||!address(chainId,owner)||!text||[...text].length>140||/[\r\n\u2028\u2029]/.test(text))throw Error('Use a valid token and wallet, and a callout of up to 140 characters on one line.');
  return Object.freeze({chainId,token:normalize(chainId,token),owner:normalize(chainId,owner),text,preparedAt:now()});
 }
 function snapshot(key){const r=records.get(key);return r?{key,status:r.status,tx:r.trade.tx,message:r.message||'',result:r.result||null}:null;}
 async function send(r){
  if(r.promise)return r.promise;
  if(r.status==='published'||r.status==='queued')return snapshot(r.key);
  if(typeof publish!=='function')throw Error('Publishing adapter has not been reviewed.');
  r.status='publishing';r.message='';
  const task=(async()=>{try{
   const result=await publish({...r.trade,thesis:r.intent.text,idempotencyKey:r.key});
   if(result?.recorded===true||result?.published===true){r.status='published';r.result=result;}
   else if(result?.pending===true){r.status='queued';r.result=result;}
   else throw Error('Callout was not accepted. The buy must not be repeated.');
  }catch(error){r.status='failed';r.message=error.message||'Could not publish the callout.';}return snapshot(r.key);})();
  r.promise=task;try{return await task;}finally{if(r.promise===task)r.promise=null;}
 }
 async function confirmed(intent,{chainId,token,owner,tx,side,status}){
  chainId=String(chainId);if(!intent||side!=='buy'||status!=='confirmed')throw Error('A confirmed buy is required before publishing.');
  if(chainId!==intent.chainId||normalize(chainId,token)!==intent.token||normalize(chainId,owner)!==intent.owner)throw Error('The confirmed buy does not match this callout.');
  if(!(chainId==='solana'?/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(tx||''):/^0x[0-9a-f]{64}$/i.test(tx||'')))throw Error('The confirmed transaction is required.');
  const key=chainId+':'+normalize(chainId,tx)+':'+intent.owner;
  let r=records.get(key);
  if(r&&(r.intent.token!==intent.token||r.intent.text!==intent.text))throw Error('A callout is already attached to this buy.');
  if(!r){r={key,intent,trade:{chainId,token:intent.token,owner:intent.owner,side:'buy',tx},status:'confirmed',promise:null};records.set(key,r);}
  return send(r);
 }
 return Object.freeze({prepare,confirmed,retry(key){const r=records.get(key);if(!r||r.status!=='failed')throw Error('There is no failed callout to retry.');return send(r);},snapshot});
}
