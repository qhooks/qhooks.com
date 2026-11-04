import {readPriorityFee} from '../multichain/priority-fee.mjs';
// Separate explicit bound for the measured8.509M controller; old7M flows unchanged.
// Read-only quotes, no wallet discovery, signatures or transaction sending.
import {tokenFeePolicy} from '../token-launch/fees.mjs';
import {baseDataFees,address,bytes,hex} from '../../apps/marketplace-preview/mainnet-fees.mjs';
import {rpcQuantity,feeBudget,formatNative} from '../multichain/fee-math.mjs';
import {requireRpcChain} from '../multichain/profiles.mjs';
import {readLaunchToolkit,LAUNCH_BLOCKS} from './artifact.mjs';
import {BLOCKS_CONSTRUCTOR_WORDS} from './launch-blocks.mjs';
const issued=new WeakMap(),U256=(1n<<256n)-1n,ensure=(ok,m)=>{if(!ok)throw new TypeError(m);};
const hash=x=>typeof x==='string'&&/^0x[0-9a-f]{64}$/.test(x);
// The platform launch fee is paid by the launch-blocks deployment itself (its constructor requires exactly this).
export function launchFeeWei(chainId,stage){return stage!=='blocks'?0n:chainId==='56'?700000000000000n:chainId==='5042'?500000000000000000n:200000000000000n;}
export function launchCreationPolicy(chainId,stage){
 const p=tokenFeePolicy(chainId);ensure(['verifier','collector','blocks','controller'].includes(stage),'Known launch creation stage required');
 return Object.freeze({...p,stage,maxGas:stage==='controller'?12000000n:stage==='blocks'?9000000n:7000000n});
}
function time(clock){ensure(typeof clock==='function','Clock required');const n=clock();ensure(Number.isSafeInteger(n)&&n>=0&&Number.isSafeInteger(n+120000),'Invalid quote clock');return n;}
function exactInit(toolkit,stage,data,owner){
 const code=toolkit.contracts[stage].bytecode,words={verifier:0,collector:3,blocks:BLOCKS_CONSTRUCTOR_WORDS,controller:LAUNCH_BLOCKS?10:9}[stage];
 ensure(bytes(data)&&data.startsWith(code)&&data.length===code.length+words*64&&data.length<=98306,'Fixed launch constructor required');
 if(stage==='controller')ensure(data.slice(code.length+64,code.length+128)===owner.slice(2).padStart(64,'0'),'Controller owner differs from payer');
}
async function observe(request,policy,owner,data,value='0x0'){
 requireRpcChain(policy.chainId,await request('eth_chainId',[]));
 const [block,price,tip,nonce,estimate,balance]=await Promise.all([
  request('eth_getBlockByNumber',['latest',false]),request('eth_gasPrice',[]),readPriorityFee(request),
  request('eth_getTransactionCount',[owner,'pending']),request('eth_estimateGas',[{from:owner,data,value}]),request('eth_getBalance',[owner,'latest'])
 ]);
 const r={base:rpcQuantity(block?.baseFeePerGas),suggested:rpcQuantity(price),tip:rpcQuantity(tip),nonce,estimate:rpcQuantity(estimate),balance:rpcQuantity(balance),block};
 ensure(hash(block?.hash)&&rpcQuantity(block.number)>=0n&&r.suggested>0n&&r.tip<=policy.maxPrice&&rpcQuantity(nonce)<(1n<<64n)-1n&&r.estimate>0n,'Invalid launch fee observation');
 if(policy.chainId==='8453')ensure(r.base>0n,'Invalid Base fee');
 requireRpcChain(policy.chainId,await request('eth_chainId',[]));return r;
}
export async function quoteLaunchCreation({chainId,stage,request,owner,data,toolkitText,clock=Date.now}){
 const policy=launchCreationPolicy(chainId,stage);ensure(typeof request==='function'&&address(owner),'Launch quote dependencies');
 const artifact=await readLaunchToolkit(toolkitText);exactInit(artifact,stage,data,owner);const fee=launchFeeWei(chainId,stage),now=time(clock),r=await observe(request,policy,owner,data,hex(fee));
 let price=2n*r.base+r.tip;if(price<2n*r.suggested)price=2n*r.suggested;if(chainId==='5042'&&price<20000000000n)price=20000000000n;
 const budget=feeBudget({estimate:r.estimate,price,value:fee,balance:U256,maxGas:policy.maxGas,maxPrice:policy.maxPrice});
 const dataFees=chainId==='8453'?await baseDataFees(request,data,hex(budget.gas)):{l1Wei:'0',operatorWei:'0'};
 const dataBound=2n*(BigInt(dataFees.l1Wei)+BigInt(dataFees.operatorWei)),maximum=budget.fee+dataBound;ensure(maximum<=U256,'Launch fee overflow');
 requireRpcChain(chainId,await request('eth_chainId',[]));const end=time(clock);ensure(end>=now&&end<now+120000,'Launch quote expired during read');
 const transaction=Object.freeze({type:'0x2',chainId:policy.hexId,from:owner,data,value:hex(fee),nonce:r.nonce,gas:hex(budget.gas),maxFeePerGas:hex(price),maxPriorityFeePerGas:hex(r.tip)});
 const q=Object.freeze({chainId,stage,nativeSymbol:policy.nativeSymbol,gasCap:policy.maxGas.toString(),estimatedGas:r.estimate.toString(),gas:budget.gas.toString(),executionFee:budget.fee.toString(),dataFeeBound:dataBound.toString(),maximumFee:maximum.toString(),maximumFeeNative:formatNative(maximum.toString()),balance:r.balance.toString(),funded:r.balance>=maximum,blockHash:r.block.hash,blockNumber:r.block.number,reviewedAt:now,expiresAt:now+120000,transaction});
 issued.set(q,{policy,dataFees});return q;
}
export async function recheckLaunchCreation({request,quote,clock=Date.now}){
 const record=issued.get(quote);ensure(record&&typeof request==='function','Locally issued launch quote required');
 const checkTime=()=>{const n=time(clock);ensure(n>=quote.reviewedAt&&n<quote.expiresAt,'Launch quote expired; review again');};checkTime();
 const t=quote.transaction,r=await observe(request,record.policy,t.from,t.data,t.value);checkTime();
 ensure(r.nonce===t.nonce,'Wallet nonce changed');ensure(r.estimate<=rpcQuantity(t.gas),'Launch gas requirement increased');
 ensure(r.base+rpcQuantity(t.maxPriorityFeePerGas)<=rpcQuantity(t.maxFeePerGas)&&r.suggested<=rpcQuantity(t.maxFeePerGas)&&r.tip<=rpcQuantity(t.maxPriorityFeePerGas),'Launch fees increased; review again');
 if(quote.chainId==='8453'){const f=await baseDataFees(request,t.data,t.gas);ensure(BigInt(f.l1Wei)<=2n*BigInt(record.dataFees.l1Wei)&&BigInt(f.operatorWei)<=2n*BigInt(record.dataFees.operatorWei),'Base data fees increased');}
 ensure(r.balance>=BigInt(quote.maximumFee)+BigInt(t.value),'Insufficient '+quote.nativeSymbol+' for launch');requireRpcChain(quote.chainId,await request('eth_chainId',[]));checkTime();return t;
}
