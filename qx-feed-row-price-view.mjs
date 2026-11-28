import {assetPriceFields,priceObservation,priceState,isQhooksPriceAsset,QHOOKS_PRICE_IDENTITY} from './qx-price-state.mjs';
import {capDiscoveryObservations} from './qx-discovery-freshness.mjs';
import {priceDigits} from './qx-price.mjs';
import {discoveryLiveness} from './qx-discovery-liveness.mjs';
const positive=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;
// Display only. Preserve source clocks and units; never a quote, stored value or ranking input.
export function feedRowPriceView(vm,{now=Date.now(),refreshing=false}={}){
 const source=vm?.row||{},chainId=String(vm?.chainId||source.chainId||''),token=vm?.address||source.token?.address;
 const observed=capDiscoveryObservations(source,{now}),row=assetPriceFields(observed,{chainId,token,now});
 const usdState=priceState(priceObservation(row),now),quote=row.quoteAmounts;
 const canonical=isQhooksPriceAsset(chainId,token)&&row.priceSource==='qhooks-main-pool'&&row.pricePoolId===QHOOKS_PRICE_IDENTITY.poolId;
 const quoteState=priceState(canonical&&quote?.unit==='WETH'?row.priceAt:row.observedAt,now);
 const usd=usdState.usable&&positive(row.priceUsd),native=!usd&&usdState.usable&&quoteState.usable&&positive(quote?.price)&&typeof quote.unit==='string'&&!!quote.unit.trim();
 const available=!!(usd||native),clock=usd?usdState:native?quoteState:usdState,value=usd?row.priceUsd:native?quote.price:null,unit=usd?'USD':native?quote.unit:null;
 const liveness=discoveryLiveness(source,{now,failed:!available||!!refreshing||!!row.pricesRefreshing||clock.refreshing||clock.at>now});
 const delayed=!liveness.live;
 const status=available?liveness.label:''; // LAUNCHLIST: no endless 'Price syncing'; the price cell's dash says unknown
 // An original cap observation has its own expiry. An expired price does not
 // erase it, and a foreign QHOOKS price source cannot supply it.
 const capRow=priceState(observed.capAt,now).usable&&(!isQhooksPriceAsset(chainId,token)||canonical)?observed:row,capQuote=capRow.quoteAmounts;
 const capKnown=positive(capRow.marketCapUsd)||positive(capRow.fdvUsd)||positive(capQuote?.mcap)&&typeof capQuote?.unit==='string'&&!!capQuote.unit;
 return {text:available?(usd?'$'+priceDigits(value):priceDigits(value)+' '+unit):'—',status,available,refreshing:delayed,at:clock.at,unit,liveness,
  title:available?(usd?'$'+String(value):String(value)+' '+unit)+' · observed '+new Date(clock.at).toISOString():clock.at?'Price unavailable · last observation '+new Date(clock.at).toISOString():'Price unavailable · observation time unknown',
  cap:capKnown?vm.mcap:'—',capUnit:positive(capRow.marketCapUsd)||positive(capRow.fdvUsd)?'USD':positive(capQuote?.mcap)?capQuote.unit:null,capKind:!positive(capRow.marketCapUsd)&&positive(capRow.fdvUsd)?'FDV':'MC'};
}
