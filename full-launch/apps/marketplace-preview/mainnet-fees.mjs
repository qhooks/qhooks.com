import {readPriorityFee} from '../../packages/multichain/priority-fee.mjs';
// Lead-owned Base fee boundary. No transaction submission or private key handling.
export const BASE_CHAIN='0x2105';
export const GAS_ORACLE='0x420000000000000000000000000000000000000f';
export const ensure=(ok,message)=>{if(!ok)throw new TypeError(message);};
export const quantity=x=>typeof x==='string'&&/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(x)&&x.length<=66;
export const hex=n=>'0x'+BigInt(n).toString(16);
export const address=x=>typeof x==='string'&&/^0x[0-9a-f]{40}$/.test(x)&&!/^0x0{40}$/.test(x);
export const bytes=x=>typeof x==='string'&&/^0x(?:[0-9a-f]{2})+$/.test(x);
const word=n=>BigInt(n).toString(16).padStart(64,'0');
const unsigned=(x,label='quantity')=>{ensure(quantity(x),'Invalid Base RPC '+label);return BigInt(x);};
export async function baseDataFees(request,data,gas){
 ensure(typeof request==='function'&&bytes(data)&&data.length<=98306&&quantity(gas),'Fee request');
 // EIP1559 creation, empty access list: 256 bytes conservatively covers unsigned
 // envelope/field/RLP overhead. Oracle itself adds the signature-size allowance.
 const size=BigInt((data.length-2)/2+256);
 const ask=async(selector,value)=>{
  const raw=await request('eth_call',[{to:GAS_ORACLE,data:selector+word(value)},'latest']);
  ensure(typeof raw==='string'&&/^0x[0-9a-f]{64}$/.test(raw),'Base fee oracle unavailable');return BigInt(raw);
 };
 const [l1,operator]=await Promise.all([ask('0xf1c7a58b',size),ask('0x275aedd2',BigInt(gas))]);
 return Object.freeze({l1Wei:l1.toString(),operatorWei:operator.toString(),unsignedSizeBound:size.toString()});
}
const TIP_CAP=100000000n; // 0.1 gwei
export async function quoteBaseCreation({request,owner,data,clock=Date.now}){
 ensure(typeof request==='function'&&address(owner)&&bytes(data)&&data.length<=98306,'Deployment quote input');
 ensure(await request('eth_chainId',[])===BASE_CHAIN,'Switch your wallet to Base mainnet');
 const [block,priority,nonce,estimate,balance]=await Promise.all([
  request('eth_getBlockByNumber',['latest',false]),readPriorityFee(request),
  request('eth_getTransactionCount',[owner,'pending']),
  request('eth_estimateGas',[{from:owner,data,value:'0x0'}]),request('eth_getBalance',[owner,'latest'])
 ]);
 const base=unsigned(block?.baseFeePerGas,'baseFeePerGas'),walletTip=unsigned(priority,'priority fee'),n=unsigned(nonce,'pending nonce'),g=unsigned(estimate,'gas estimate');
 ensure(base>0n&&n<(1n<<64n)-1n&&g>0n,'Invalid deployment fee data');
 // The flow's max fee is 1 gwei (2 × base fee + tip). Base orders by tip and its usual tip is ~0.001 gwei, so a wallet
 // that suggests a tip of ~1 gwei made the deploy refuse outright. The requested tip is now lowered to at most
 // 0.1 gwei (and to what fits under the cap); it is never raised. Plain-word refusals end with a period so the page shows them.
 const room=1000000000n-base*2n;
 ensure(room>0n,'Base network fees are unusually high right now. Nothing was sent; wait a few minutes and retry.');
 const tip=[walletTip,TIP_CAP,room].reduce((a,b)=>a<b?a:b);
 const gas=(g*125n+99n)/100n,maxFee=base*2n+tip;
 ensure(gas<=7000000n,'This launch needs more gas than the guided flow allows on Base. Nothing was sent; remove an option or use Expert Studio.');
 ensure(maxFee<=1000000000n,'Base network fees are unusually high right now. Nothing was sent; wait a few minutes and retry.');
 const fees=await baseDataFees(request,data,hex(gas));
 const execution=gas*maxFee,total=execution+2n*(BigInt(fees.l1Wei)+BigInt(fees.operatorWei));
 ensure(total<=unsigned(balance,'native balance'),'Not enough ETH on Base for this fee estimate');
 const now=clock();ensure(Number.isSafeInteger(now),'Invalid clock');
 const transaction=Object.freeze({type:'0x2',chainId:BASE_CHAIN,from:owner,data,value:'0x0',nonce,gas:hex(gas),maxFeePerGas:hex(maxFee),maxPriorityFeePerGas:hex(tip)});
 return Object.freeze({...fees,gas:gas.toString(),estimatedGas:g.toString(),executionWei:execution.toString(),totalWei:total.toString(),balanceWei:BigInt(balance).toString(),reviewedAt:now,expiresAt:now+120000,transaction});
}
export async function recheckBaseQuote(request,quote,clock=Date.now){
 ensure(quote&&Number.isSafeInteger(quote.reviewedAt)&&Number.isSafeInteger(quote.expiresAt),'Missing quote');
 const now=clock();ensure(Number.isSafeInteger(now)&&now>=quote.reviewedAt&&now<quote.expiresAt,'Quote expired. Review a fresh estimate.');
 const t=quote.transaction;
 const [nonce,balance,block,estimate,fees]=await Promise.all([
  request('eth_getTransactionCount',[t.from,'pending']),request('eth_getBalance',[t.from,'latest']),
  request('eth_getBlockByNumber',['latest',false]),request('eth_estimateGas',[{from:t.from,data:t.data,value:'0x0'}]),baseDataFees(request,t.data,t.gas)
 ]);
 ensure(nonce===t.nonce,'Wallet nonce changed. Review again.');
 ensure(unsigned(block?.baseFeePerGas,'baseFeePerGas')+unsigned(t.maxPriorityFeePerGas)<=unsigned(t.maxFeePerGas),'Gas price increased. Review again.');
 ensure(unsigned(estimate,'gas estimate')<=unsigned(t.gas),'Gas requirement increased. Review again.');
 ensure(BigInt(fees.l1Wei)<=2n*BigInt(quote.l1Wei)&&BigInt(fees.operatorWei)<=2n*BigInt(quote.operatorWei),'Base data fees increased. Review again.');
 ensure(unsigned(balance,'native balance')>=BigInt(quote.totalWei),'Base balance changed. Review again.');
}
