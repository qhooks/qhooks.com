// Price and funding math only. Factory codecs and tier semantics are shared with one-tap.
import {START_TIERS,checkSteps,stepsForUsd,capAtSteps} from './qx-quick-launch-core.mjs';
import {parseDecimalAmount} from './full-launch/packages/crosschain/decimal-amount.mjs';
export const START_PRICE_HOLD = 'Launch paused while we fix start pricing.';
const ensure=ok=>{if(!ok)throw new TypeError(START_PRICE_HOLD);};
const Q=1n<<96n,ceil=(a,b)=>(a+b-1n)/b;
// Adapted from Uniswap v4 TickMath (MIT), bundled source-kit.zip, vendor/uniswap-v4-core/src/libraries/TickMath.sol.
const FACTORS=[0xfffcb933bd6fad37aa2d162d1a594001n,0xfff97272373d413259a46990580e213an,0xfff2e50f5f656932ef12357cf3c7fdccn,0xffe5caca7e10e4e61c3624eaa0941cd0n,0xffcb9843d60f6159c9db58835c926644n,0xff973b41fa98c081472e6896dfb254c0n,0xff2ea16466c96a3843ec78b326b52861n,0xfe5dee046a99a2a811c461f1969c3053n,0xfcbe86c7900a88aedcffc83b479aa3a4n,0xf987a7253ac413176f2b074cf7815e54n,0xf3392b0822b70005940c7a398e4b70f3n,0xe7159475a2c29b7443b29c7fa6e889d9n,0xd097f3bdfd2022b8845ad8f792aa5825n,0xa9f746462d870fdf8a65dc1f90e061e5n,0x70d869a156d2a1b890bb3df62baf32f7n,0x31be135f97d08fd981231505542fcfa6n,0x9aa508b5b7a84e1c677de54f3e99bc9n,0x5d6af8dedb81196699c329225ee604n,0x2216e584f5fa1ea926041bedfe98n,0x48a170391f7dc42444e8fa2n];
export function sqrtAtTick(tick){
 ensure(Number.isInteger(tick)&&Math.abs(tick)<=887272);let ratio=1n<<128n,n=Math.abs(tick);
 for(let i=0;i<FACTORS.length;i++)if(n&(1<<i))ratio=ratio*FACTORS[i]>>128n;
 if(tick>0)ratio=((1n<<256n)-1n)/ratio;
 return (ratio+((1n<<32n)-1n))>>32n;
}
export function startSelection(tier='standard',steps='0',customUsd){
 ensure(START_TIERS.some(t=>t[0]===tier));const result={startTier:tier,startSteps:String(checkSteps(steps))};
 if(customUsd!==undefined){ensure(typeof customUsd==='string'&&customUsd.length<=32&&(customUsd===''||/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(customUsd)&&Number(customUsd)>0&&Number.isFinite(Number(customUsd))));result.startUsd=customUsd;}
 return result;
}
export function selectedStart({tier='standard',steps=0,customUsd='',standardUsd}){
 startSelection(tier,steps,customUsd);ensure(Number.isFinite(standardUsd)&&standardUsd>0);
 const target=START_TIERS.find(t=>t[0]===tier)[2];
 const selectedCapUsd=tier==='custom'&&customUsd!==''?Number(customUsd):target===null?capAtSteps(standardUsd,checkSteps(steps)):target||standardUsd;
 const count=target||tier==='custom'&&customUsd!==''?stepsForUsd(selectedCapUsd,standardUsd):tier==='standard'?0:checkSteps(steps);
 ensure(Math.abs(capAtSteps(standardUsd,count)/selectedCapUsd-1)<=.02);
 return {steps:count,selectedCapUsd};
}
export function chooseStart({tier='standard',steps=0,customUsd='',base,start,quoteUsd,quoteDecimals}){
 ensure(base&&start&&Number.isInteger(base.tick0)&&Number.isInteger(start.tick0)&&Math.abs(start.tick0)<=887272&&BigInt(start.startCapWei)>0n&&Number.isFinite(quoteUsd)&&quoteUsd>0);
 const standardUsd=Number(base.startCapWei)/10**quoteDecimals*quoteUsd;
 const selection=selectedStart({tier,steps,customUsd,standardUsd}),actual=Number(start.startCapWei)/10**quoteDecimals*quoteUsd;ensure(Math.abs(actual/selection.selectedCapUsd-1)<=0.02);
 return Object.freeze({version:1,tier,steps:selection.steps,tick0:start.tick0,startCapWei:String(start.startCapWei),quoteUsd,selectedCapUsd:selection.selectedCapUsd,quoteDecimals,standardUsd});
}
export function impliedStartCap({sqrtPriceX96,tokenIs0,price,totalSupply,quoteDecimals,quoteUsd}){
 // Sales encode quote raw units per whole 18-decimal token, rather than a pool sqrt price.
 if(price!==undefined){const p=BigInt(price),supply=BigInt(totalSupply);ensure(p>0n&&supply>0n&&Number.isFinite(quoteUsd)&&quoteUsd>0&&Number.isInteger(quoteDecimals)&&quoteDecimals>=0&&quoteDecimals<=18);return Number(p*supply)/Number(10n**18n*10n**BigInt(quoteDecimals))*quoteUsd;}
 const p=BigInt(sqrtPriceX96),supply=BigInt(totalSupply);ensure(p>=4295128739n&&p<1461446703485210103287273052203988822378723970342n&&supply>0n&&Number.isFinite(quoteUsd)&&quoteUsd>0&&Number.isInteger(quoteDecimals)&&quoteDecimals>=0&&quoteDecimals<=18);
 // Integer rational first, conversion only for the final bounded USD comparison.
 const numerator=tokenIs0?p*p*supply:Q*Q*supply,denominator=(tokenIs0?Q*Q:p*p)*10n**BigInt(quoteDecimals);
 return Number(numerator)/Number(denominator)*quoteUsd;
}
export function assertStartPrice(input){
 const actual=impliedStartCap(input),target=Number(input.selectedCapUsd);
 ensure(Number.isFinite(actual)&&Number.isFinite(target)&&target>0&&Math.abs(actual/target-1)<=0.02);return actual;
}
export function optionalQuoteRaw(value,decimals){
 ensure(typeof value==='string'&&value.length<=100&&Number.isInteger(decimals)&&decimals>=0&&decimals<=18);
 if(typeof value==='string'&&/^0(?:\.0+)?$/.test(value)&&(value.split('.')[1]?.length||0)<=decimals)return '0';
 return parseDecimalAmount(value,decimals);
}
export function planStartLiquidity({token,quote,tokenDecimals,quoteDecimals,tokenAmount,quoteAmount,totalSupply,pricing}){
 ensure(/^0x[0-9a-f]{40}$/.test(token)&&/^0x[0-9a-f]{40}$/.test(quote)&&BigInt(token)>0n&&BigInt(quote)>0n&&token!==quote);
 ensure(Number.isInteger(tokenDecimals)&&tokenDecimals>=0&&tokenDecimals<=18&&pricing?.quoteDecimals===quoteDecimals);
 const tokens=BigInt(parseDecimalAmount(tokenAmount,tokenDecimals)),extra=BigInt(optionalQuoteRaw(quoteAmount,quoteDecimals)),supply=BigInt(totalSupply),tokenIs0=BigInt(token)<BigInt(quote);
 ensure(tokens>0n&&tokens<=supply&&extra>=0n&&BigInt(pricing.startCapWei)>0n);
 // Factory tick0 is token0/quote1, with one billion 18-decimal tokens. Preserve that exact tick for its supply.
 // Other supplies/decimals keep the same market cap by adjusting the raw-unit price on the same 200-tick grid.
 const supplyShift=Math.round(Math.log(1e27/Number(supply))/Math.log(1.0001)/200)*200;
 const tick=(pricing.tick0+supplyShift)*(tokenIs0?1:-1),P=sqrtAtTick(tick),limit=887200;
 let lo=tokenIs0?tick:-limit,hi=tokenIs0?limit:tick,L;
 // The bootstrap initializes P before adding any position. Optional quote can fund a mixed position AT that price;
 // it never contributes to the price calculation. Maxima leave any unneeded assets in the creator's wallet.
 if(extra>0n){lo=-limit;hi=limit;}
 ensure(lo<hi&&tick>=lo&&tick<=hi);
 const A=sqrtAtTick(lo),B=sqrtAtTick(hi),amount0=tokenIs0?tokens:extra,amount1=tokenIs0?extra:tokens;
 const L0=P===B?null:amount0*P*B/(Q*(B-P)),L1=P===A?null:amount1*Q/(P-A);
 L=L0===null?L1:L1===null?L0:L0<L1?L0:L1;
 const used0=P===B?0n:ceil(L*Q*(B-P),B*P),used1=P===A?0n:ceil(L*(P-A),Q);
 // v4 floors its negative tick quotient; spacing 200 counts 8874 ticks.
 ensure(L>0n&&L<=((1n<<128n)-1n)/8874n&&used0<=amount0&&used1<=amount1&&used0<(1n<<127n)&&used1<(1n<<127n));
 const actual=assertStartPrice({sqrtPriceX96:P,tokenIs0,totalSupply:supply,quoteDecimals,quoteUsd:pricing.quoteUsd,selectedCapUsd:pricing.selectedCapUsd});
 const usedToken=tokenIs0?used0:used1,usedQuote=tokenIs0?used1:used0;
 return Object.freeze({currency0:tokenIs0?token:quote,currency1:tokenIs0?quote:token,token,quote,tokenIs0,sqrtPriceX96:String(P),tickSpacing:'200',
  position:Object.freeze({tickLower:String(lo),tickUpper:String(hi),salt:'0x'+'0'.repeat(64),liquidity:String(L)}),maxAmount0:String(used0),maxAmount1:String(used1),
  fundedTokenRaw:String(usedToken),fundedQuoteRaw:String(usedQuote),unusedTokenRaw:String(tokens-usedToken),unusedQuoteRaw:String(extra-usedQuote),impliedCapUsd:actual,
  scope:extra>0n?'fixed-price-optional-funding':'single-sided-start',sourcePrincipalExit:'migrate-first-with-both-keys'});
}
