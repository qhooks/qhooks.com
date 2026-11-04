import {readPriorityFee} from './priority-fee.mjs';
// Lead-owned read-only next-chain quotes. No signer, submission, bridge or Base override.
import {networkProfile,requireRpcChain} from './profiles.mjs';
import {feeBudget,rpcQuantity,formatNative} from './fee-math.mjs';
const issued=new WeakMap(),U256=(1n<<256n)-1n;
const ensure=(v,m)=>{if(!v)throw new TypeError(m);};
const hex=n=>'0x'+n.toString(16),address=x=>typeof x==='string'&&/^0x[0-9a-f]{40}$/.test(x)&&!/^0x0{40}$/.test(x);
const hash=x=>typeof x==='string'&&/^0x[0-9a-f]{64}$/.test(x);
// Application review bounds, not protocol fee claims. They are never silently enlarged.
const caps=Object.freeze({'4663':10000000000n,'1':1000000000000n,'42161':10000000000n,'56':10000000000n,'5042':20000000000000n});
export function nextChainFeePolicy(chainId){
 const p=networkProfile(chainId);ensure(Object.hasOwn(caps,chainId),'Use the existing Base fee adapter');
 return Object.freeze({chainId,hexId:p.hexId,nativeSymbol:p.nativeSymbol,maxGas:7000000n,maxPrice:caps[chainId],feeAccounting:p.feeAccounting});
}
function plainFields(input,names){
 ensure(input&&Object.getPrototypeOf(input)===Object.prototype,'Plain call required');
 const descriptors=Object.getOwnPropertyDescriptors(input),keys=Reflect.ownKeys(descriptors);
 ensure(keys.length===names.length&&keys.every(k=>typeof k==='string'&&names.includes(k)&&descriptors[k].enumerable&&Object.hasOwn(descriptors[k],'value')),'Exact call data fields required');
 return Object.fromEntries(names.map(k=>[k,descriptors[k].value]));
}
function checkedCall(input){
 // Creation omits to entirely; never turn an invalid address into contract creation.
 const keys=Reflect.ownKeys(input||{}),call=plainFields(input,keys.includes('to')?['to','data','value']:['data','value']);
 ensure(!Object.hasOwn(call,'to')||address(call.to),'Nonzero lowercase destination required');
 ensure(typeof call.data==='string'&&/^0x(?:[0-9a-f]{2})*$/.test(call.data)&&call.data.length<=98306,'Bounded calldata required');
 ensure(Object.hasOwn(call,'to')||call.data.length>2,'Creation bytecode required');rpcQuantity(call.value);
 return Object.freeze(call);
}
function now(clock){const n=clock();ensure(Number.isSafeInteger(n)&&n>=0&&Number.isSafeInteger(n+120000),'Invalid clock');return n;}
async function read(request,policy,owner,call){
 requireRpcChain(policy.chainId,await request('eth_chainId',[]));
 const [block,gasPrice,priority,nonce,estimate,balance]=await Promise.all([
  request('eth_getBlockByNumber',['latest',false]),request('eth_gasPrice',[]),readPriorityFee(request),
  request('eth_getTransactionCount',[owner,'pending']),request('eth_estimateGas',[{from:owner,...call}]),request('eth_getBalance',[owner,'latest'])
 ]);
 requireRpcChain(policy.chainId,await request('eth_chainId',[]));
 const base=rpcQuantity(block?.baseFeePerGas),tip=rpcQuantity(priority),suggested=rpcQuantity(gasPrice),n=rpcQuantity(nonce),g=rpcQuantity(estimate),b=rpcQuantity(balance);
 ensure(hash(block?.hash)&&rpcQuantity(block.number)>=0n,'Invalid quote block');
 ensure(tip<=policy.maxPrice&&suggested>0n&&n<(1n<<64n)-1n&&g>0n,'Invalid network fee data');
 // Nitro estimates include parent-chain data gas: do not add an OP oracle fee.
 // BSC may have a zero base fee; its suggested price and tip must still be budgeted.
 let price=2n*base+tip;if(price<2n*suggested)price=2n*suggested;
 // Arc's current documented mempool floor. Still fetch prices; this is not a fixed quote.
 if(policy.chainId==='5042'&&price<20000000000n)price=20000000000n;
 return {block,base,tip,suggested,nonce,n,estimate:g,balance:b,price};
}
export async function quoteNextChain({chainId,request,owner,call:input,clock=Date.now}){
 const policy=nextChainFeePolicy(chainId),call=checkedCall(input);
 ensure(typeof request==='function'&&typeof clock==='function'&&address(owner),'Quote dependencies');
 const start=now(clock),data=await read(request,policy,owner,call),end=now(clock);
 ensure(end>=start&&end-start<120000,'Network quote expired during request');
 const budget=feeBudget({estimate:data.estimate,price:data.price,value:rpcQuantity(call.value),balance:U256,maxGas:policy.maxGas,maxPrice:policy.maxPrice});
 const transaction=Object.freeze({type:'0x2',chainId:policy.hexId,from:owner,...call,nonce:data.nonce,gas:hex(budget.gas),maxFeePerGas:hex(data.price),maxPriorityFeePerGas:hex(data.tip)});
 const quote=Object.freeze({chainId,nativeSymbol:policy.nativeSymbol,feeAccounting:policy.feeAccounting,estimatedGas:data.estimate.toString(),gas:budget.gas.toString(),maximumFee:budget.fee.toString(),maximumFeeNative:formatNative(budget.fee.toString()),requiredBalance:budget.required.toString(),balance:data.balance.toString(),funded:data.balance>=budget.required,blockNumber:data.block.number,blockHash:data.block.hash,reviewedAt:start,expiresAt:start+120000,transaction});
 issued.set(quote,{policy,call,owner});return quote;
}
export async function recheckNextChain({request,quote,clock=Date.now}){
 const binding=issued.get(quote);ensure(binding,'Review a locally issued network quote');
 ensure(typeof request==='function'&&typeof clock==='function','Recheck dependencies');
 const checkTime=()=>{const t=now(clock);ensure(t>=quote.reviewedAt&&t<quote.expiresAt,'Quote expired; review again');};checkTime();
 const data=await read(request,binding.policy,binding.owner,binding.call);checkTime();
 ensure(data.nonce===quote.transaction.nonce,'Wallet nonce changed; review again');
 ensure(data.estimate<=rpcQuantity(quote.transaction.gas),'Gas requirement increased; review again');
 ensure(data.base+rpcQuantity(quote.transaction.maxPriorityFeePerGas)<=rpcQuantity(quote.transaction.maxFeePerGas)&&data.suggested<=rpcQuantity(quote.transaction.maxFeePerGas)&&data.tip<=rpcQuantity(quote.transaction.maxPriorityFeePerGas),'Network fee increased; review again');
 ensure(data.balance>=BigInt(quote.requiredBalance),'Insufficient '+binding.policy.nativeSymbol+' balance');
 return quote.transaction;
}
