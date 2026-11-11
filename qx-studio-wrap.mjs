// Optional quote funding only; native gas/launch fees never become pool liquidity.
import {optionalQuoteRaw} from './qx-guided-start-core.mjs';
export function studioWrapFunding({quoteAmount='0',quoteDecimals=18,wrapNative=false,quoteBalance=0n}={}){
 const requested=BigInt(optionalQuoteRaw(quoteAmount||'0',quoteDecimals)),balance=BigInt(quoteBalance);
 if(balance<0n)throw TypeError('Balance unavailable.');
 const raw=wrapNative&&requested>balance?requested-balance:0n;
 const whole=raw/10n**BigInt(quoteDecimals),fraction=(raw%10n**BigInt(quoteDecimals)).toString().padStart(quoteDecimals,'0').replace(/0+$/,'');
 return {needed:raw>0n,raw:String(raw),amount:String(whole)+(fraction?'.'+fraction:''),requested:String(requested)};
}
