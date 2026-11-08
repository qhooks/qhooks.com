// Pure original revenue proposals. No wallet, provider, registry, networking or signing authority.
import {encode,selector,keccak} from './lab-deploy-core.mjs';

export const REVENUE_MECHANISM_VERSION=1;
export const QUOTE_FEE_HOOK_FLAGS='204';
export const DECREASE_FEES_SIGNATURE='decreaseFees(uint24,uint24)';
export const BIDWALL_ADD_SIGNATURE='addLiquidity((uint128,uint128,uint256,uint256,uint160,uint160,uint64))';
export const QUOTE_FEE_CONFIG_ABI=Object.freeze([
 ['manager','address'],['currency0','address'],['currency1','address'],['poolLpFee','uint24'],['tickSpacing','int24'],
 ['quote','address'],['controller','address'],['buyCeilingPpm','uint24'],['sellCeilingPpm','uint24'],['initialBuyPpm','uint24'],['initialSellPpm','uint24']
].map(([name,type])=>Object.freeze({name,type})));
export const BIDWALL_CONFIG_ABI=Object.freeze([
 ['tickLower','int24'],['tickUpper','int24'],['lpFeeBeneficiary','address'],['unusedBudgetRecipient','address'],['releaseAfter','uint64']
].map(([name,type])=>Object.freeze({name,type})));
export const BIDWALL_ADD_ABI=Object.freeze([
 ['liquidity','uint128'],['minimumLiquidity','uint128'],['maximumQuote','uint256'],['minimumQuoteSpent','uint256'],
 ['minimumSqrtPriceX96','uint160'],['maximumSqrtPriceX96','uint160'],['deadline','uint64']
].map(([name,type])=>Object.freeze({name,type})));

const ZERO='0x'+'0'.repeat(40),U256=(1n<<256n)-1n,U128=(1n<<128n)-1n,U64=(1n<<64n)-1n;
const MIN_SQRT=4295128739n,MAX_SQRT=1461446703485210103287273052203988822378723970342n;
const ensure=(ok,message)=>{if(!ok)throw new TypeError(message);};
function shape(value,keys,label){
 ensure(value&&Object.getPrototypeOf(value)===Object.prototype,label+' must be a plain object');
 const d=Object.getOwnPropertyDescriptors(value),own=Reflect.ownKeys(d);
 ensure(own.length===keys.length&&own.every(k=>typeof k==='string'&&keys.includes(k)&&d[k].enumerable&&Object.hasOwn(d[k],'value')),label+' fields must match exactly');
}
function integer(value,min,max,label){ensure(typeof value==='string'&&/^(0|-?[1-9][0-9]*)$/.test(value),'Use canonical raw integer strings for '+label);const n=BigInt(value);ensure(n>=min&&n<=max,label+' is out of range');return value;}
function address(value,label){ensure(typeof value==='string'&&/^0x[0-9a-f]{40}$/i.test(value)&&value.toLowerCase()!==ZERO,'Invalid '+label);return value.toLowerCase();}
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const tuple=(components,value)=>encode(components.map(c=>c.type),components.map(c=>value[c.name]));
function identity(input,kind,extra){
 shape(input,['kind','schemaVersion','chainId',...extra],'Proposal');
 ensure(input.kind===kind&&input.schemaVersion===REVENUE_MECHANISM_VERSION,'Unsupported revenue proposal schema');
 return integer(input.chainId,1n,BigInt(Number.MAX_SAFE_INTEGER),'chain ID');
}
const envelope=(kind,chainId,body)=>freeze({kind,schemaVersion:1,chainId,...body,executionEnabled:false,publicRuntimeAdmitted:false});

export function createRevenueMechanismProposal(input){
 const chainId=identity(input,'qhooks-quote-fee-bidwall',['fee','wall']);
 shape(input.fee,QUOTE_FEE_CONFIG_ABI.map(c=>c.name),'Fee configuration');
 shape(input.wall,BIDWALL_CONFIG_ABI.map(c=>c.name),'Bidwall configuration');
 const fee={};for(const {name,type}of QUOTE_FEE_CONFIG_ABI){const v=input.fee[name];fee[name]=type==='address'?address(v,name):integer(v,name==='tickSpacing'?1n:0n,name==='tickSpacing'?32767n:name==='poolLpFee'?999999n:100000n,name);}
 ensure(fee.currency0<fee.currency1,'Currencies must be strictly ordered');ensure([fee.currency0,fee.currency1].includes(fee.quote),'Quote must be one exact pool currency');
 ensure(BigInt(fee.initialBuyPpm)<=BigInt(fee.buyCeilingPpm)&&BigInt(fee.initialSellPpm)<=BigInt(fee.sellCeilingPpm),'Initial fee exceeds its immutable ceiling');
 const wall={};const spacing=BigInt(fee.tickSpacing),maxTick=887272n/spacing*spacing;
 for(const {name,type}of BIDWALL_CONFIG_ABI){const v=input.wall[name];wall[name]=type==='address'?address(v,name):integer(v,name.startsWith('tick')?-maxTick:1n,name.startsWith('tick')?maxTick:U64,name);}
 ensure(BigInt(wall.tickLower)<BigInt(wall.tickUpper)&&BigInt(wall.tickLower)%spacing===0n&&BigInt(wall.tickUpper)%spacing===0n,'Bid range must use ordered usable pool ticks');
 const constructorData='0x'+tuple(QUOTE_FEE_CONFIG_ABI,fee)+tuple(BIDWALL_CONFIG_ABI,wall);
 return envelope(input.kind,chainId,{fee,wall,constructorData,constructorDataHash:keccak(constructorData),hookFlags:QUOTE_FEE_HOOK_FLAGS,
  capabilities:{exactInput:true,exactOutput:false,buyPartialFill:false,sellPartialFill:true,feeUnits:'quote raw units; ppm of gross quote',lpFeeSeparate:true,terminalFeeChanged:false},
  liquidityPolicy:{range:'fixed-committed',quoteOnlyAtExecution:true,principal:'permanently-locked',lpFeeBeneficiary:wall.lpFeeBeneficiary,unusedBudgetRecipient:wall.unusedBudgetRecipient,unusedReleaseAfter:wall.releaseAfter,investmentCutoff:wall.releaseAfter,investmentsStrictlyBeforeCutoff:true,rejectSelfRecipients:true,rejectSelfFeeSource:true,guaranteedFloor:false},
  requiredAdmission:['chain/manager/plain-ERC20 runtimes','controller code and actual QHooks PQ authorization policy','exact candidate creation/runtime bytes and hook permission address','pool key and live price/range/deadline simulation']});
}

export function createDecreaseOnlyFeeProposal(input){
 const chainId=identity(input,'qhooks-decrease-quote-fees',['hook','controller','observedBuyPpm','observedSellPpm','newBuyPpm','newSellPpm']);
 const hook=address(input.hook,'hook'),controller=address(input.controller,'controller'),rates={};
 for(const name of ['observedBuyPpm','observedSellPpm','newBuyPpm','newSellPpm'])rates[name]=integer(input[name],0n,100000n,name);
 ensure(BigInt(rates.newBuyPpm)<=BigInt(rates.observedBuyPpm)&&BigInt(rates.newSellPpm)<=BigInt(rates.observedSellPpm),'A fee increase is not a decrease proposal');
 const data=selector(DECREASE_FEES_SIGNATURE)+encode(['uint24','uint24'],[rates.newBuyPpm,rates.newSellPpm]);
 return envelope(input.kind,chainId,{controller,...rates,controllerCall:{to:hook,value:'0x0',data},requiresFreshRateRead:true,requiresControllerAuthorization:true});
}

export function createBidwallAddProposal(input){
 const chainId=identity(input,'qhooks-add-fixed-bid-liquidity',['bidwall','bounds']);shape(input.bounds,BIDWALL_ADD_ABI.map(c=>c.name),'Bidwall bounds');
 const bidwall=address(input.bidwall,'bidwall'),bounds={};
 for(const {name,type}of BIDWALL_ADD_ABI){const n=input.bounds[name];bounds[name]=integer(n,name.includes('Sqrt')?MIN_SQRT+1n:1n,type==='uint128'?U128:type==='uint64'?U64:name.includes('Sqrt')?MAX_SQRT-1n:U256,name);}
 ensure(BigInt(bounds.minimumLiquidity)<=BigInt(bounds.liquidity),'Minimum liquidity exceeds requested liquidity');
 ensure(BigInt(bounds.minimumQuoteSpent)<=BigInt(bounds.maximumQuote),'Minimum quote spend exceeds its limit');
 ensure(BigInt(bounds.minimumSqrtPriceX96)<=BigInt(bounds.maximumSqrtPriceX96),'Price bounds are reversed');
 const data=selector(BIDWALL_ADD_SIGNATURE)+tuple(BIDWALL_ADD_ABI,bounds);
 return envelope(input.kind,chainId,{bounds,call:{to:bidwall,value:'0x0',data},requiresFreshPoolBudgetPriceDeadlineSimulation:true,arbitraryRecipient:false,principal:'permanently-locked'});
}
