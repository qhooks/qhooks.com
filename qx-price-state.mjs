// Observation age, never fetch/cache-write age. Shared display/value contract.
export const PRICE_REFRESH_MS=300000,PRICE_VALUE_MS=3600000;
export const priceTime=(n,now=Date.now())=>Number.isSafeInteger(n)&&n>0&&n<=now+5000?n:null;
export function priceState(at,now=Date.now()){
 const stamp=priceTime(at,now),age=stamp===null?null:Math.max(0,now-stamp),usable=age!==null&&age<=PRICE_VALUE_MS;
 return {at:stamp,age,usable,refreshing:!usable||age>PRICE_REFRESH_MS};
}
export const priceObservation=(value,fallback=null)=>value?.priceAt??value?.priceObservedAt??value?.summary?.priceAt??value?.observedAt??fallback;
export function priceFields(value,{at=null,now=Date.now()}={}){
 const state=priceState(priceObservation(value,at),now),out={...value,priceAt:state.at,pricesRefreshing:!!value?.pricesRefreshing||state.refreshing};
 if(!state.usable){for(const k of ['priceUsd','priceQuote','price','mcapUsd','marketCapUsd','fdvUsd','mcap','fdv','change24'])if(k in out)out[k]=null;if(out.cost)out.cost={...out.cost,pnlUsd:null,pnlQuote:null,unrealizedQuote:null};if('valueUsd' in out)out.valueUsd=typeof out.units==='number'&&out.units===0||out.balance==='0'?0:null;}
 return out;
}

export const QHOOKS_PRICE_IDENTITY=Object.freeze({chainId:'4663',token:'0x20429af7ca3b0ce4d99edbaa0693f26c5df05195',poolId:'0x007d77e43164a5d7d1251457f47f556c2be7f865942c7ec7a91c3cbbf50e53fe'});
export const isQhooksPriceAsset=(chain,token)=>String(chain)==='4663'&&typeof token==='string'&&token.toLowerCase()===QHOOKS_PRICE_IDENTITY.token;
export function assetPriceFields(value,{chainId,token,at=null,now=Date.now()}={}){
 const canonical=!isQhooksPriceAsset(chainId,token)||(value?.priceSource==='qhooks-main-pool'&&value?.pricePoolId===QHOOKS_PRICE_IDENTITY.poolId);
 return priceFields(canonical?value:{...value,priceAt:null,priceObservedAt:null,observedAt:null},{at:canonical?at:null,now});
}
