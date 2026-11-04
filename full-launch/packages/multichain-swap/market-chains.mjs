// Fixed launch-pool admission for connected swaps. Source candidate, not enabled
// by the public site until isolated periphery and page acceptance are complete.
import {requireLaunchActionContext} from '../multichain-launch/actions/context.mjs';
import {createLaunchActionAdmission} from '../multichain-launch/actions/admission.mjs';
import {readLaunchActionState} from '../multichain-launch/actions/state.mjs';
import {createLaunchDependencies} from '../multichain-launch/dependencies.mjs';
import {parseActionStage} from '../multichain-launch/actions/action-stage-envelope.mjs';
import {walletFeePolicy} from '../chain-wallet/fees.mjs';
import {decodeGraduationWords} from '../../prototypes/pq-graduation/client/graduation-word-decode.mjs';
import {setupCall} from '../../prototypes/pq-graduation/client/graduation-setup-plan.mjs';
import {ensure,address,hash,freeze} from '../token-launch/artifact.mjs';
import {normalizeSwapFields} from './swap-fields.mjs';
import {swapQuoteBounds} from './swap-quote-math.mjs';
import {readSwapQuote} from './journal.mjs';
import {createSwapCalldata} from './calldata.mjs';
import {swapReceiptOutcomeForChain as swapReceiptOutcome} from './chain-receipt-outcome.mjs';

const MAX=(1n<<256n)-1n,MAX_OUTPUT=(1n<<127n)-1n;
const keyNames=['currency0','currency1','fee','tickSpacing','hooks'];
const sameKey=(a,b)=>keyNames.every(k=>a[k]===b[k]);
const quantity=x=>typeof x==='string'&&x.length>=3&&x.length<=66&&/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(x)&&'0x'+BigInt(x).toString(16)===x;
function uint(x,label){ensure(typeof x==='string'&&x.length>0&&x.length<=78&&!/[^0-9]/.test(x)&&BigInt(x).toString()===x&&BigInt(x)<=MAX,'Canonical '+label+' required');return BigInt(x);}

export async function createSwapMarket({context,policyText,toolkitText,metadataText,tokenFields,clock=Date.now}){
 const {plan,planner}=requireLaunchActionContext(context),chainId=plan.chainId,controller=plan.graph.controller;
 ensure(typeof clock==='function','Swap observation clock required');
 const [dependencies,admission]=await Promise.all([
  createLaunchDependencies({chainId,policyText,quote:plan.graph.quote}),
  createLaunchActionAdmission({context,policyText,toolkitText,metadataText,tokenFields})
 ]);
 const profile=dependencies.profile,feePolicy=walletFeePolicy(chainId);
 function now(){const n=clock();ensure(Number.isSafeInteger(n)&&n>=0&&Number.isSafeInteger(n+120000),'Invalid swap clock');return n;}
 function boundary({request,live,owner,fields}){
  ensure(typeof request==='function'&&typeof live==='function'&&address(owner)&&owner.length===42&&owner!==controller,'Swap wallet boundary');
  const normalized=normalizeSwapFields(fields);
  const rpc=async(method,params=[])=>{await live();const value=structuredClone(await request(method,params));await live();return value;};
  return {owner,fields:normalized,live,rpc,provider:{request:({method,params=[]})=>rpc(method,params)}};
 }
 async function canonical(b,number,blockHash){
  const block=await b.rpc('eth_getBlockByNumber',[number,false]);
  ensure(block?.number===number&&block.hash===blockHash&&quantity(block.timestamp),'Swap observation reorganized');
  return block;
 }
 async function observed(b,tag=null){
  // Reuse the same immutable admission at a receipt's block for recovery.
  // Only the internal latest-block selection is replaced; all code, proxy-slot,
  // metadata and canonicality checks still run against the resulting block.
  const request=tag===null?b.rpc:(method,params=[])=>b.rpc(method,method==='eth_getBlockByNumber'&&params[0]==='latest'?[tag,false]:params);
  const admitted=await admission.verify({request,live:b.live});
  const state=await readLaunchActionState({provider:b.provider,context,live:b.live,tag:admitted.blockNumber});
  ensure(state.blockNumber===admitted.blockNumber&&state.blockHash===admitted.blockHash,'Swap dependency/state block differs');
  return {admitted,state};
 }
 function pool(state,{key=null,active=true}={}){
  let descriptor;
  if(active){
   ensure(state.phase==='1'||state.phase==='2','Launch has no active liquidity position');
   const position=state.phase==='1'?state.source:state.destination;
   ensure(BigInt(state.phase==='1'?state.sourceLiquidity:state.destinationLiquidity)>0n,'Active launch liquidity is empty');
   descriptor=position.descriptor;
   if(key)ensure(sameKey(descriptor.key,key),'The reviewed pool is no longer active');
  }else{
   descriptor=[state.source.descriptor,state.destination.descriptor].find(d=>sameKey(d.key,key));
   ensure(descriptor,'Historical swap pool is outside this controller');
  }
  const description=planner.describe(descriptor);
  ensure(state.hookCodes[descriptor.key.hooks]===description.runtime,'Exact swap hook runtime missing');
  const codec=createSwapCalldata({chainId,profile,context:{controller,poolKey:description.descriptor.key}});
  return {description,codec,key:codec.poolKey};
 }
 function currencies(p,fields){return {input:fields.zeroForOne?p.key.currency0:p.key.currency1,output:fields.zeroForOne?p.key.currency1:p.key.currency0};}
 async function funds(b,p,tag){
  const {input,output}=currencies(p,b.fields),call=(to,sig,types,values)=>b.rpc('eth_call',[{to,data:setupCall(sig,types,values)},tag]);
  const scalar=async(to,sig,types,values)=>decodeGraduationWords(await call(to,sig,types,values),['uint256'])[0];
  const balance=await scalar(input,'balanceOf(address)',['address'],[b.owner]);
  const allowance=await scalar(input,'allowance(address,address)',['address','address'],[b.owner,p.codec.targets.permit2]);
  // Decode as uint256 then impose the exact Permit2 ABI widths (160/48/48).
  const permit=decodeGraduationWords(await call(p.codec.targets.permit2,'allowance(address,address,address)',['address','address','address'],[b.owner,input,p.codec.targets.router]),['uint256','uint256','uint256']);
  ensure(BigInt(permit[0])<(1n<<160n)&&BigInt(permit[1])<(1n<<48n)&&BigInt(permit[2])<(1n<<48n),'Permit2 allowance ABI changed');
  const native=await b.rpc('eth_getBalance',[b.owner,tag]);ensure(quantity(native),'Canonical swap gas balance required');
  const shared=profile.quote.nativeSharedBalance===true&&input===profile.quote.address;
  if(profile.quote.nativeSharedBalance)ensure(chainId==='5042'&&profile.quote.address==='0x3600000000000000000000000000000000000000'&&profile.quote.decimals===6,'Unknown native/token balance sharing');
  if(shared)ensure(BigInt(balance)===BigInt(native)/1000000000000n,'Arc input/native balance alias mismatch');
  const reserve=shared?BigInt(b.fields.amountIn)*1000000000000n:0n;
  ensure(reserve<=MAX,'Shared principal overflow');
  return freeze({inputCurrency:input,outputCurrency:output,inputBalance:balance,erc20Allowance:allowance,permit2Amount:permit[0],permit2Expiration:permit[1],permit2Nonce:permit[2],nativeBalance:BigInt(native).toString(),nativePrincipalReserve:reserve.toString(),sharedInputAndGas:shared});
 }
 async function quoteAmount(b,p,tag){
  const call=p.codec.exactInputQuote({poolKey:p.key,zeroForOne:b.fields.zeroForOne,amountIn:b.fields.amountIn});
  const values=decodeGraduationWords(await b.rpc('eth_call',[{...call,from:b.owner,gas:'0x6acfc0'},tag]),['uint256','uint256']);
  ensure(BigInt(values[0])>0n&&BigInt(values[0])<=MAX_OUTPUT&&BigInt(values[1])>0n,'Invalid exact-input quote');
  return {expectedAmount:values[0],quoterGasEstimate:values[1]};
 }
 function callFor(p,fields,q,kind){
  const {input}=currencies(p,fields);
  if(kind==='swap')return p.codec.exactInputSwap({poolKey:p.key,zeroForOne:fields.zeroForOne,amountIn:fields.amountIn,minimumOut:q.minimumOut,deadline:q.deadline});
  if(kind==='erc20-reset')return freeze({to:input,data:setupCall('approve(address,uint256)',['address','uint256'],[p.codec.targets.permit2,'0']),value:'0x0'});
  const approvals=p.codec.finiteApprovals({token:input,amount:fields.amountIn,expiration:q.approvalExpiration});
  ensure(kind==='erc20-approve'||kind==='permit2-approve','Unknown swap approval stage');
  return approvals[kind==='erc20-approve'?0:1];
 }
 function nextKind(funding,fields,q){
  if(funding.erc20Allowance!==fields.amountIn)return funding.erc20Allowance==='0'?'erc20-approve':'erc20-reset';
  if(funding.permit2Amount!==fields.amountIn||BigInt(funding.permit2Expiration)<BigInt(q.deadline))return 'permit2-approve';
  return 'swap';
 }
 function requireFunds(f,fields,fees=null){
  ensure(BigInt(f.inputBalance)>=BigInt(fields.amountIn),'Insufficient input token balance');
  const fee=fees?uint(fees.maximumFee,'maximum network fee'):0n;
  // Each approval and the final swap is separately reviewed. Reserve the entire
  // input plus this call's fee. The launch workspace's additional 7M-gas reserve
  // is for a future protected PQ call, which this ordinary trade never makes.
  const principal=BigInt(f.nativePrincipalReserve);
  ensure(fee<=MAX-principal&&BigInt(f.nativeBalance)>=principal+fee,'Insufficient gas balance after reserving swap input');
 }
 function bindRecord(record,b,p){
  ensure(record&&Object.getPrototypeOf(record)===Object.prototype&&Object.keys(record).length===3&&['kind','quote','stage'].every(k=>Object.hasOwn(record,k)),'Exact swap record required');
  const quote=readSwapQuote(record.quote,b.fields),stage=parseActionStage(record.stage,feePolicy,b.owner);
  ensure(sameKey(quote.poolKey,p.key),'Record pool binding changed');
  const call=callFor(p,b.fields,quote,record.kind);
  ensure(['to','data','value'].every(k=>stage.transaction[k]===call[k]),'Swap call differs from the fixed route');
  return {quote,stage,call};
 }
 return Object.freeze({chainId,controller,contextId:plan.id,
  async observe(input){
   const b=boundary(input),quotedAt=now(),{admitted,state}=await observed(b),p=pool(state);
   const funding=await funds(b,p,state.blockNumber);requireFunds(funding,b.fields);
   const priced=await quoteAmount(b,p,state.blockNumber),bounds=swapQuoteBounds(priced.expectedAmount,b.fields.slippageBps,state.timestamp);
   const quote=readSwapQuote({poolKey:p.key,phase:state.phase,blockNumber:state.blockNumber,blockHash:state.blockHash,timestamp:state.timestamp,expectedAmount:bounds.expectedAmount,minimumOut:bounds.minimumOut,deadline:bounds.deadline,approvalExpiration:(BigInt(state.timestamp)+900n).toString(),quotedAt,expiresAt:quotedAt+120000},b.fields);
   await canonical(b,state.blockNumber,state.blockHash);ensure(now()>=quotedAt&&now()<quote.expiresAt,'Swap observation expired');
   const kind=nextKind(funding,b.fields,quote);
   return freeze({quote,next:{kind,call:callFor(p,b.fields,quote,kind)},marketSnapshot:{chainId,controller,poolId:p.description.poolId,phase:state.phase,token:admitted.token,tokenFields:admitted.tokenFields,quoteSymbol:profile.quote.symbol,quoteDecimals:profile.quote.decimals,inputCurrency:funding.inputCurrency,outputCurrency:funding.outputCurrency,creatorFeePpm:p.key.fee,protocolFeePpm:(BigInt(p.key.fee)/5n).toString(),quoteAlreadyIncludesProtocolFee:true,quoterGasEstimate:priced.quoterGasEstimate,blockNumber:state.blockNumber,blockHash:state.blockHash},funding});
  },
  async validateStage(input){
   const b=boundary(input),{record,fees}=input,{state}=await observed(b),p=pool(state,{key:record?.quote?.poolKey});
   const bound=bindRecord(record,b,p),q=bound.quote,at=now();
   ensure(['pending','submitting'].includes(record.stage.status),'Unsent swap stage required');
   ensure(fees?.chainId===chainId&&fees.transaction&&Object.keys(bound.stage.transaction).every(k=>fees.transaction[k]===bound.stage.transaction[k])&&Object.keys(fees.transaction).length===Object.keys(bound.stage.transaction).length,'Fee review and swap transaction differ');
   ensure(at>=q.quotedAt&&at<q.expiresAt&&state.phase===q.phase&&BigInt(state.timestamp)<BigInt(q.deadline),'Swap quote expired or launch phase changed');
   const original=await canonical(b,q.blockNumber,q.blockHash);
   ensure(BigInt(original.timestamp).toString()===q.timestamp&&BigInt(q.blockNumber)<=BigInt(state.blockNumber),'Quote block/time binding changed');
   const funding=await funds(b,p,state.blockNumber);requireFunds(funding,b.fields,fees);
   ensure(nextKind(funding,b.fields,q)===record.kind,'Swap approval state changed; prepare again');
   const latest=await quoteAmount(b,p,state.blockNumber);
   ensure(BigInt(latest.expectedAmount)>=BigInt(q.minimumOut),'Fresh net quote is below the reviewed minimum');
   await canonical(b,state.blockNumber,state.blockHash);
   const finalNow=now();ensure(finalNow>=q.quotedAt&&finalNow<q.expiresAt,'Swap quote expired during admission');
   return freeze({blockNumber:state.blockNumber,blockHash:state.blockHash,funding});
  },
  async outcome(input){
   const b=boundary(input),{record,receipt}=input;
   ensure(receipt&&quantity(receipt.blockNumber)&&hash(receipt.blockHash)&&receipt.blockHash.length===66,'Canonical swap receipt required');
   // Recovery uses the historical descriptor, not today's active phase or TTL.
   const {state:post}=await observed(b,receipt.blockNumber);
   ensure(post.blockHash===receipt.blockHash,'Swap outcome block changed');
   const p=pool(post,{key:record?.quote?.poolKey,active:false});bindRecord(record,b,p);
   const result=swapReceiptOutcome({chainId,receipt,record,owner:b.owner,manager:plan.graph.manager,router:p.codec.targets.router,permit2:p.codec.targets.permit2,collector:plan.graph.collector,fields:b.fields,poolId:p.description.poolId,blocks:plan.constructor.blocks??null});
   // Recheck current admitted periphery/token/graph; later valid trading or
   // graduation does not invalidate a previously mined successful outcome.
   const current=await observed(b);pool(current.state,{key:p.key,active:false});
   await canonical(b,receipt.blockNumber,receipt.blockHash);
   return result;
  }
 });
}
