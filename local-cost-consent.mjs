// Local-only cost consent, not a billing backend or guaranteed network quote.
const ensure=(ok,message)=>{if(!ok)throw new Error(message);};
const quantity=x=>typeof x==='string'&&x.length<=66&&/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(x);
const address=x=>typeof x==='string'&&/^0x[0-9a-f]{40}$/.test(x);
export function createLocalCostConsent({clock=Date.now}={}){
 let quote=null,reviewRef=null,reviewText=null,accepted=false;
 const now=()=>{const n=clock();ensure(Number.isSafeInteger(n)&&n>=0&&n<=Number.MAX_SAFE_INTEGER-120000,'Invalid quote clock');return n;};
 const alive=()=>!!quote&&now()<quote.expiresAt;
 const matches=(review,connection)=>{
  try{return !!quote&&review===reviewRef&&JSON.stringify(review)===reviewText&&connection?.chainId==='31337'&&connection?.owner===quote.owner&&alive();}catch{return false;}
 };
 return Object.freeze({
  create(review,connection,gasPrice){
   quote=null;reviewRef=null;reviewText=null;accepted=false;
   const tx=review?.transaction;
   ensure(review&&typeof review==='object'&&/^0x[0-9a-f]{64}$/.test(review.planId)&&/^[a-z][a-z-]{0,40}$/.test(review.id),'Invalid transaction review');
   ensure(connection?.chainId==='31337'&&address(connection.owner)&&tx?.from===connection.owner&&tx.chainId==='0x7a69','Local payer or chain changed');
   ensure((tx.to===null||address(tx.to))&&typeof tx.input==='string'&&/^0x(?:[a-f0-9]{2})+$/.test(tx.input)&&tx.input.length<=200002&&quantity(tx.value)&&quantity(tx.nonce)&&quantity(tx.gas),'Invalid reviewed transaction');
   ensure(typeof review.estimatedGas==='string'&&/^[1-9][0-9]{0,8}$/.test(review.estimatedGas)&&BigInt(review.estimatedGas)<=BigInt(tx.gas)&&BigInt(tx.gas)<=100000000n,'Invalid gas estimate');
   ensure(quantity(gasPrice),'Gas price unavailable');
   reviewText=JSON.stringify(review);reviewRef=review;
   quote=Object.freeze({scheme:'ml-dsa-65',chainId:'31337',owner:connection.owner,planId:review.planId,stepId:review.id,estimatedGas:review.estimatedGas,gasLimit:BigInt(tx.gas).toString(),gasPriceWei:BigInt(gasPrice).toString(),estimatedNetworkFeeWei:(BigInt(review.estimatedGas)*BigInt(gasPrice)).toString(),expiresAt:now()+120000,serviceFeeMode:'off'});
   return quote;
  },
  accept(token){ensure(token===quote&&alive(),'Review the current cost estimate');accepted=true;},
  revoke(){accepted=false;},
  canSubmit:(review,connection)=>accepted&&matches(review,connection),
  snapshot:()=>Object.freeze({quote,accepted:accepted&&alive()}),
  clear(){quote=null;reviewRef=null;reviewText=null;accepted=false;}
 });
}
