// Founder-approved lead repair of L53-C02. Reuses accepted Base fee arithmetic.
import {quoteBaseCreation,recheckBaseQuote,BASE_CHAIN,ensure,quantity,address,bytes,hex} from '../../apps/marketplace-preview/mainnet-fees.mjs';
const issued=new WeakSet();
function callFields(input){
 ensure(input&&Object.getPrototypeOf(input)===Object.prototype,'Plain contract call required');
 const keys=Reflect.ownKeys(input),d=Object.getOwnPropertyDescriptors(input),names=['to','data','value'];
 ensure(keys.length===3&&keys.every(k=>typeof k==='string'&&names.includes(k)&&d[k].enumerable&&Object.hasOwn(d[k],'value')),'Exact call data fields required');
 const call=Object.fromEntries(names.map(k=>[k,d[k].value]));
 ensure(address(call.to)&&bytes(call.data)&&call.data.length<=98306&&quantity(call.value),'Invalid contract call');
 return Object.freeze(call);
}
const checkedClock=clock=>()=>{
 ensure(typeof clock==='function','Clock function required');const now=clock();
 ensure(Number.isSafeInteger(now)&&now>=0&&Number.isSafeInteger(now+120000),'Invalid clock');return now;
};
function adapter(request,owner,call){
 ensure(typeof request==='function'&&address(owner),'Call fee dependencies');
 return async(method,params=[])=>{
  if(method==='eth_estimateGas')return request(method,[{from:owner,...call}]);
  const value=await request(method,params);
  if(method!=='eth_getBalance')return value;
  ensure(quantity(value),'Invalid RPC balance');
  const remaining=BigInt(value)-BigInt(call.value);ensure(remaining>=0n,'Not enough ETH for the call value');return hex(remaining);
 };
}
export async function quoteNativeCall({request,owner,call:input,clock=Date.now}){
 const call=callFields(input),read=adapter(request,owner,call);
 const base=await quoteBaseCreation({request:read,owner,data:call.data,clock:checkedClock(clock)});
 const quote=Object.freeze({...base,balanceWei:(BigInt(base.balanceWei)+BigInt(call.value)).toString(),transaction:Object.freeze({...base.transaction,...call})});
 issued.add(quote);return quote;
}
export async function recheckNativeCall(request,quote,clock=Date.now){
 ensure(issued.has(quote),'Review an issued call quote');
 ensure(typeof request==='function'&&await request('eth_chainId',[])===BASE_CHAIN,'Switch your wallet to Base mainnet');
 const t=quote.transaction,call=callFields({to:t.to,data:t.data,value:t.value});
 await recheckBaseQuote(adapter(request,t.from,call),quote,checkedClock(clock));
}
