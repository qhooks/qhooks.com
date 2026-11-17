import {assetPriceFields,priceObservation,priceState,isQhooksPriceAsset,QHOOKS_PRICE_IDENTITY} from './qx-price-state.mjs';
import {capDiscoveryObservations} from './qx-discovery-freshness.mjs';
import {priceDigits} from './qx-price.mjs';
const positive=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;
const ago=ms=>{const s=Math.floor(ms/1000);return(s<60?s+'s':s<3600?Math.floor(s/60)+'m':s<86400?Math.floor(s/3600)+'h':Math.floor(s/86400)+'d');};
// Display only. Preserve source clocks and units; never a quote, stored value or ranking input.
export function feedRowPriceView(vm,{now=Date.now(),refreshing=false}={}){
 const source=vm?.row||{},chainId=String(vm?.chainId||source.chainId||''),token=vm?.address||source.token?.address;
 const row=assetPriceFields(capDiscoveryObservations(source,{now}),{chainId,token,now});
 const usdState=priceState(priceObservation(row),now),quote=row.quoteAmounts;
 const canonical=isQhooksPriceAsset(chainId,token)&&row.priceSource==='qhooks-main-pool'&&row.pricePoolId===QHOOKS_PRICE_IDENTITY.poolId;
 const quoteState=priceState(canonical&&quote?.unit==='WETH'?row.priceAt:row.observedAt,now);
 const usd=usdState.usable&&positive(row.priceUsd),native=!usd&&usdState.usable&&quoteState.usable&&positive(quote?.price)&&typeof quote.unit==='string'&&!!quote.unit.trim();
 const available=!!(usd||native),clock=usd?usdState:native?quoteState:usdState,value=usd?row.priceUsd:native?quote.price:null,unit=usd?'USD':native?quote.unit:null;
 const delayed=!!refreshing||!!row.pricesRefreshing||clock.refreshing;
 const status=available?(delayed?'Refreshing · '+ago(clock.age):'Live · '+ago(clock.age)+' ago'):clock.at?'No price · '+ago(clock.age):'Price unavailable';
 const capKnown=positive(row.marketCapUsd)||positive(row.fdvUsd)||positive(quote?.mcap)&&typeof quote?.unit==='string'&&!!quote.unit;
 return {text:available?(usd?'$'+priceDigits(value):priceDigits(value)+' '+unit):'—',status,available,refreshing:delayed,at:clock.at,unit,
  title:available?(usd?'$'+String(value):String(value)+' '+unit)+' · observed '+new Date(clock.at).toISOString():clock.at?'Price unavailable · last observation '+new Date(clock.at).toISOString():'Price unavailable · observation time unknown',
  cap:capKnown?vm.mcap:'—',capUnit:positive(row.marketCapUsd)||positive(row.fdvUsd)?'USD':positive(quote?.mcap)?quote.unit:null,capKind:!positive(row.marketCapUsd)&&positive(row.fdvUsd)?'FDV':'MC'};
}
