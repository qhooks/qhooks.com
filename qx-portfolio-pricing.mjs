// Portfolio-only retained valuations. Global trading/price expiry is unchanged.
import {assetPriceFields,isQhooksPriceAsset,QHOOKS_PRICE_IDENTITY,priceState,PRICE_REFRESH_MS} from './qx-price-state.mjs';
import {allocatePortfolioBasis} from './qx-holding-basis.mjs';
import {chainById} from './chains.mjs';
export const PORTFOLIO_PRICE_MAX_MS=7*86400000;
const known=n=>typeof n==='number'&&Number.isFinite(n),positive=n=>known(n)&&n>0;
const units=a=>known(a?.units)?a.units:typeof a?.balance==='string'&&/^\d+$/.test(a.balance)&&Number.isInteger(a.decimals)&&a.decimals>=0&&a.decimals<=36?Number(a.balance)/10**a.decimals:null;
const clock=(at,now)=>Number.isSafeInteger(at)&&at>0&&at<=now&&now-at<=PORTFOLIO_PRICE_MAX_MS;
export const portfolioAssetKey=(chainId,asset,{native=false}={})=>String(chainId)+':'+(native?'native':String(chainId)==='solana'?String(asset||''):String(asset||'').toLowerCase());
// Portfolio-only identity quarantine requested for RH USDG look-alikes. A symbol is not a stablecoin identity.
export function portfolioPriceQuarantined(asset,{chainId,token=asset?.address}={}){
 return String(chainId)==='4663'&&/^0x[0-9a-f]{40}$/i.test(String(token||''))&&String(token).toLowerCase()!=='0x5fc5360d0400a0fd4f2af552add042d716f1d168'&&String(asset?.symbol||'').trim().toUpperCase()==='USDG';
}
export function portfolioPriceFields(asset,{chainId,token=asset?.address,at=null,now=Date.now()}={}){
 // A retained snapshot/browser observation cannot revive a third-party pool
 // valuation for a token still identified as trading on its own curve.
 if(asset?.curve?.phase==='curve'){
  const curve=asset.curve.curve,own=(source,pool)=>source==='own-curve-state'&&typeof curve==='string'&&/^0x[0-9a-f]{40}$/i.test(curve)&&typeof pool==='string'&&pool.toLowerCase()===curve.toLowerCase();
  const current=own(asset.priceSource,asset.pricePoolId),retained=own(asset.lastKnownPriceSource,asset.lastKnownPricePoolId);
  asset={...asset,...current?{}:{priceUsd:null,priceAt:null,priceObservedAt:null,observedAt:null,priceSource:null,pricePoolId:null,priceEvidence:null,valueUsd:units(asset)===0?0:null,change24:null,changeAt:null,pricesRefreshing:true},
   ...retained?{}:{lastKnownPriceUsd:null,lastKnownPriceAt:null,lastKnownPriceSource:null,lastKnownPricePoolId:null},priceReference:null,valuationAssumption:null};
 }

 const sourceAt=Object.hasOwn(asset||{},'priceAt')?asset.priceAt:Object.hasOwn(asset||{},'priceObservedAt')?asset.priceObservedAt:asset?.observedAt??null;
 const out=assetPriceFields({...asset,priceAt:sourceAt},{chainId,token,at:null,now});
 if(portfolioPriceQuarantined(asset,{chainId,token}))return {...out,priceUsd:null,priceAt:null,priceSource:null,pricePoolId:null,
  lastKnownPriceUsd:null,lastKnownPriceAt:null,lastKnownPriceSource:null,lastKnownPricePoolId:null,
  valueUsd:units(asset)===0?0:null,change24:null,changeAt:null,priceStatus:'unpriced',pricesRefreshing:false,
  spam:true,spamReason:'Unrecognized stablecoin contract',unpricedReason:'Not an official USDG contract',
  ...(out.cost?{cost:{...out.cost,pnlUsd:null,pnlQuote:null,unrealizedQuote:null,quoteUsd:null}}:{})};
 // Explicit last-good evidence and old known evidence both keep their own clock.
 // A failed response's at / balanceAt / cache write can never date that evidence.
 const candidates=[{price:asset?.priceUsd,at:sourceAt,source:asset?.priceSource,pool:asset?.pricePoolId},
  {price:asset?.lastKnownPriceUsd,at:asset?.lastKnownPriceAt,source:asset?.lastKnownPriceSource,pool:asset?.lastKnownPricePoolId}]
  .filter(v=>positive(v.price)&&clock(v.at,now)&&(!isQhooksPriceAsset(chainId,token)||v.source==='qhooks-main-pool'&&v.pool===QHOOKS_PRICE_IDENTITY.poolId)).sort((a,b)=>b.at-a.at);
 const retained=candidates[0];
 if(!clock(sourceAt,now)&&!retained){out.priceUsd=null;out.priceAt=null;out.valueUsd=units(asset)===0?0:null;out.pricesRefreshing=true;}
 if(retained&&(!positive(out.priceUsd)||!clock(out.priceAt,now)||retained.at>out.priceAt)){
  Object.assign(out,{priceUsd:retained.price,priceAt:retained.at,priceSource:retained.source,pricePoolId:retained.pool,
   valueUsd:units(asset)===0?0:known(units(asset))?units(asset)*retained.price:null,
   pricesRefreshing:true,priceStatus:'last-known',lastKnownPriceUsd:retained.price,lastKnownPriceAt:retained.at,
   lastKnownPriceSource:retained.source,lastKnownPricePoolId:retained.pool,change24:null,changeAt:null});
 }
 if(known(out.priceAt)&&out.priceAt>now){out.priceUsd=null;out.valueUsd=asset?.units===0||asset?.balance==='0'?0:null;out.priceAt=null;out.pricesRefreshing=true;}
 if(out.spam===true&&out.spamReason==='No price available'&&positive(out.priceUsd)&&clock(out.priceAt,now)){out.spam=false;out.spamReason=null;}
 if(!priceState(out.priceAt,now).usable&&out.cost)out.cost={...out.cost,pnlUsd:null,pnlQuote:null,unrealizedQuote:null,quoteUsd:null};
 return out;
}
// Reuse existing basis math with *only fresh* prices, then restore dated values.
// A seven-day valuation is never an input to PnL or the quote conversion.
export function allocatePortfolioValuation(report,{now=Date.now()}={}){
 const held=[];
 for(const c of report.chains||[])for(const [index,a]of [[-1,c.native],...(c.tokens||[]).map((a,i)=>[i,a])])if(a&&!priceState(a.priceAt,now).usable){held.push({chain:c,index,price:a.priceUsd,value:a.valueUsd});a.priceUsd=null;a.valueUsd=units(a)===0?0:null;}
 allocatePortfolioBasis(report);
 for(const {chain,index,price,value}of held){const a=index===-1?chain.native:chain.tokens[index];a.priceUsd=price;a.valueUsd=value;if(a.cost)a.cost={...a.cost,pnlUsd:null,pnlQuote:null,unrealizedQuote:null,quoteUsd:null};}
 return report;
}
export function pricingCoverage(report,{now=Date.now(),pending=false}={}){
 const chains=report?.chains||[],rows=Array.isArray(report?.rows)?report.rows:chains.flatMap(c=>[...(c.native?[{...c.native,chainId:c.chainId,native:true}]:[]),...(c.tokens||[]).map(t=>({...t,chainId:c.chainId}))]);
 let unpriced=0,cachedPrices=0,liquidUnpriced=0,unknownOtherUnpriced=0;const clocks=[],seen=new Set();
 // Display classification only: exact registry/static identities, never symbols
 // or a guessed $1 value. These are existing official quote identities.
 const liquidIdentity=row=>{
  if(row.native===true)return true;
  const chain=String(row.chainId),address=String(row.address||''),c=chainById(chain);
  if(chain==='solana')return ['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v','Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB','So11111111111111111111111111111111111111112'].includes(address);
  const a=address.toLowerCase();
  return !!a&&([c?.usdc,c?.wrappedNative,c?.quote?.address].some(v=>typeof v==='string'&&v.toLowerCase()===a)||chain==='4663'&&a==='0x5fc5360d0400a0fd4f2af552add042d716f1d168');
 };
 for(const row of rows){if(!(Number(row.units)>0||Number(row.balance)>0))continue;
  const key=portfolioAssetKey(row.chainId,row.address,{native:row.native===true});if(seen.has(key))continue;seen.add(key);
  const price=portfolioPriceFields(row,{chainId:row.chainId,now});
  // Legacy price failures were labelled as spam. They still need to be counted
  // as unpriced holdings; actual liquidity/security exclusions remain separate.
  if(price.spam&&price.spamReason!=='No price available'&&!portfolioPriceQuarantined(price,{chainId:row.chainId,token:row.address}))continue;
  if(!positive(price.priceUsd)||!clock(price.priceAt,now)){
   unpriced++;
   const excluded=portfolioPriceQuarantined(price,{chainId:row.chainId,token:row.address})||price.spam&&price.spamReason!=='No price available';
   const liquidity=known(row.liquidityUsd)&&row.liquidityUsd>=0?row.liquidityUsd:null;
   if(!excluded&&(liquidIdentity(row)||liquidity!==null&&liquidity>=1000))liquidUnpriced++;
   else if(liquidity===null)unknownOtherUnpriced++;
   continue;
  }
  clocks.push(price.priceAt);if(price.priceStatus==='last-known'||now-price.priceAt>PRICE_REFRESH_MS)cachedPrices++;
 }
 const balancesPending=chains.some(c=>c.balancesRefreshing||c.positionsRefreshing||c.error==='balances_unavailable'),progress=report?.progress;
 const settled=!pending&&(!progress||progress.phase==='settled'||progress.transportTimedOut===true);
 const observedAt=clocks.length?Math.min(...clocks):null,pricedCount=clocks.length,otherUnpriced=unpriced-liquidUnpriced;
 const transportTimedOut=progress?.transportTimedOut===true;
 const balanceError=chains.some(c=>c.error==='balances_unavailable'||c.balancesUnavailable===true||c.positionsUnavailable===true||c.tokenBalancesComplete===false);
 const priceLive=settled&&!transportTimedOut&&pricedCount>0&&liquidUnpriced===0&&clocks.every(at=>now-at<30000);
 const age=observedAt===null?null:Math.max(0,Math.floor((now-observedAt)/1000));
 const ageText=age===null?null:age<60?age+'s':age<3600?Math.floor(age/60)+'m':age<86400?Math.floor(age/3600)+'h':Math.floor(age/86400)+'d';
 const priceLabel=liquidUnpriced?'Partial · prices for '+liquidUnpriced+' token'+(liquidUnpriced===1?'':'s'):pricedCount?(priceLive?'Live':'Read')+' · '+ageText+' ago':'Prices unavailable';
 // A settled priced share is independent of blanket partial/price-refresh
 // flags. Actual balance gaps and transport failure stay explicit separately.
 const label=!settled?'Updating holdings…':transportTimedOut||balanceError?'Partial · holdings coverage':priceLabel;
 return {settled,balancesPending,unpriced,cachedPrices,observedAt,label,liquidUnpriced,otherUnpriced,unknownOtherUnpriced,pricedCount,priceLive,priceLabel,balanceError,transportTimedOut};
}
