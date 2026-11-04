// Lead integration: exact user amounts -> full-range Uniswap v4 position.
// No wallet, RPC, signature or transaction authority in this module.
import {parseDecimalAmount} from '../crosschain/decimal-amount.mjs';
import {fullRangeLiquidity} from './liquidity-math.mjs';
const ensure=(ok,m)=>{if(!ok)throw new TypeError(m);};
const address=x=>typeof x==='string'&&x.length===42&&/^0x[0-9a-f]{40}$/.test(x)&&BigInt(x)>0n;
// Derived from pinned v4 TickMath at spacing60; independent EVM oracle required.
export const launchRange=Object.freeze({tickSpacing:'60',tickLower:'-887220',tickUpper:'887220',sqrtLower:'4306310044',sqrtUpper:'1457652066949847389969617340386294118487833376468',maxLiquidity:'11505743598341114571880798222544994'});
function exact(input,names){
 ensure(input&&typeof input==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(input)),'Plain funding fields required');
 const d=Object.getOwnPropertyDescriptors(input),keys=Reflect.ownKeys(d);ensure(keys.length===names.length&&keys.every(k=>names.includes(k)),'Exact funding fields required');
 const out={};for(const k of names){ensure(d[k].enumerable&&Object.hasOwn(d[k],'value'),'Own funding data required');out[k]=d[k].value;}return out;
}
export function planLaunchLiquidity(input){
 const f=exact(input,['token','quote','tokenDecimals','quoteDecimals','tokenAmount','quoteAmount']);
 ensure(address(f.token)&&address(f.quote)&&f.token!==f.quote,'Distinct nonzero lowercase token and quote required');
 for(const k of ['tokenDecimals','quoteDecimals'])ensure(Number.isInteger(f[k])&&f[k]>=0&&f[k]<=18,'Token decimal units required');
 for(const k of ['tokenAmount','quoteAmount'])ensure(typeof f[k]==='string'&&f[k].length>0&&f[k].length<=100&&!/[^0-9.]/.test(f[k]),'Plain decimal funding amount required');
 const token=BigInt(parseDecimalAmount(f.tokenAmount,f.tokenDecimals)),quote=BigInt(parseDecimalAmount(f.quoteAmount,f.quoteDecimals)),tokenIs0=BigInt(f.token)<BigInt(f.quote);
 const m=fullRangeLiquidity(tokenIs0?token:quote,tokenIs0?quote:token,BigInt(launchRange.sqrtLower),BigInt(launchRange.sqrtUpper));
 ensure(m.liquidity<=BigInt(launchRange.maxLiquidity),'Funding exceeds full-range per-tick liquidity limit');
 ensure(m.amount0<(1n<<127n)&&m.amount1<(1n<<127n),'Funding exceeds signed v4 balance delta limit');
 const amountToken=tokenIs0?m.amount0:m.amount1,amountQuote=tokenIs0?m.amount1:m.amount0;
 return Object.freeze({
  currency0:tokenIs0?f.token:f.quote,currency1:tokenIs0?f.quote:f.token,quote:f.quote,token:f.token,tokenIs0,
  sqrtPriceX96:m.sqrtPriceX96.toString(),tickSpacing:launchRange.tickSpacing,
  position:Object.freeze({tickLower:launchRange.tickLower,tickUpper:launchRange.tickUpper,salt:'0x'+'0'.repeat(64),liquidity:m.liquidity.toString()}),
  maxAmount0:m.amount0.toString(),maxAmount1:m.amount1.toString(),
  fundedTokenRaw:amountToken.toString(),fundedQuoteRaw:amountQuote.toString(),unusedTokenRaw:(token-amountToken).toString(),unusedQuoteRaw:(quote-amountQuote).toString(),
  // Exact requested human-unit ratio; no conversion to a floating-point price.
  quotePerToken:Object.freeze({numerator:(quote*10n**BigInt(f.tokenDecimals)).toString(),denominator:(token*10n**BigInt(f.quoteDecimals)).toString()}),
  scope:'initial-full-range-funding',sourcePrincipalExit:'migrate-first-with-both-keys'
 });
}
