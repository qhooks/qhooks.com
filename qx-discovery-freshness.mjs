import {priceState,isQhooksPriceAsset,QHOOKS_PRICE_IDENTITY} from './qx-price-state.mjs';
const own=(value,key)=>Object.hasOwn(value,key);
const clear=(out,keys)=>{for(const key of keys)if(own(out,key))out[key]=null;};
const blankValues=value=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).map(key=>[key,null])):null;
/** Cap discovery observations by their original source clocks. fallbackAt must be
 * an ORIGINAL pool/source observation, never a request/cache/serve timestamp.
 * This is expiry only; callers retain the assetPriceFields canonical USD guard.
 * Clocks, identity, holder/safety/index facts and refresh-failure flags are retained.
 */
export function capDiscoveryObservations(row,{fallbackAt=null,now=Date.now()}={}){
 if(!row||typeof row!=='object'||Array.isArray(row))return row;
 const out={...row},providerAt=own(row,'observedAt')?row.observedAt:fallbackAt;
 const priceAt=own(row,'priceAt')?row.priceAt:own(row,'priceObservedAt')?row.priceObservedAt:providerAt;
 const providerUsable=priceState(providerAt,now).usable,priceUsable=priceState(priceAt,now).usable;
 const address=typeof row.token==='string'?row.token:row.token?.address||row.address||row.controller;
 const canonical=isQhooksPriceAsset(row.chainId,address)&&row.priceSource==='qhooks-main-pool'&&typeof row.pricePoolId==='string'&&row.pricePoolId.toLowerCase()===QHOOKS_PRICE_IDENTITY.poolId;
 if(!priceUsable)clear(out,['priceUsd']);
 // The canonical flat-row overlay refreshes USD/native price, not flat MC/FDV
 // or provider window statistics. A new USD price cannot renew those values.
 if(!providerUsable){
  clear(out,['marketCapUsd','mcapUsd','fdvUsd','valueUsd','liquidityUsd','volume24Usd','buys24','sells24','price','priceNative','mcap','fdv']);
  for(const key of ['volumeUsd','change','makers'])if(own(row,key))out[key]=blankValues(row[key]);
  if(own(row,'txns'))out.txns=row.txns&&typeof row.txns==='object'&&!Array.isArray(row.txns)?Object.fromEntries(Object.entries(row.txns).map(([window,counts])=>[window,counts&&typeof counts==='object'&&!Array.isArray(counts)?{...counts,...Object.fromEntries(['buys','sells'].filter(k=>own(counts,k)).map(k=>[k,null]))}:null])):null;
 }
 if(own(row,'change24')&&!priceState(own(row,'changeAt')?row.changeAt:providerAt,now).usable)out.change24=null;
 if(own(row,'priceQuote')&&!(canonical?priceUsable:providerUsable))out.priceQuote=null;
 if(row.quoteAmounts&&typeof row.quoteAmounts==='object'&&!Array.isArray(row.quoteAmounts)){
  out.quoteAmounts={...row.quoteAmounts};
  if(!providerUsable)clear(out.quoteAmounts,['price','mcap','volume','liquidity']);
  // Only this proven overlay also refreshed the WETH quote price itself.
  if(canonical&&row.quoteAmounts.unit==='WETH'&&priceUsable&&own(row.quoteAmounts,'price'))out.quoteAmounts.price=row.quoteAmounts.price;
  if(!priceUsable&&canonical)clear(out.quoteAmounts,['price']);
 }
 return out;
}
