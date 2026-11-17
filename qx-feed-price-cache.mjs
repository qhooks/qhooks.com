import{assetPriceFields,priceState,priceObservation,isQhooksPriceAsset}from'./qx-price-state.mjs';
import{capDiscoveryObservations}from'./qx-discovery-freshness.mjs';
const KEY='qhooks:feed:prices:v1',identity=r=>String(r.chainId)+':'+(r.chainId==='solana'?r.token?.address:String(r.token?.address||'').toLowerCase());
const priceOnly=value=>({priceUsd:value.priceUsd,priceAt:value.priceAt,priceSource:value.priceSource,pricePoolId:value.pricePoolId});
// The original observation time survives reloads, list changes and incomplete refreshes.
export function createFeedPriceCache({storage,now=Date.now}={}){
 const prices=new Map();try{for(const[key,value]of JSON.parse(storage?.getItem(KEY)||'[]'))if(value&&priceState(value.priceAt,now()).usable)prices.set(key,priceOnly(value));}catch{}
 return {reconcile(data){if(!data?.rows)return data;const rows=data.rows.filter(row=>row&&row.token&&typeof row.token.address==='string').map(row=>{
  const at=now(),key=identity(row),capped=capDiscoveryObservations(row,{fallbackAt:null,now:at}),live=assetPriceFields(capped,{chainId:row.chainId,token:row.token?.address,at:priceObservation(capped,null),now:at}),saved=prices.get(key),prior=saved?assetPriceFields(saved,{chainId:row.chainId,token:row.token?.address,now:at}):null;
  const finish=value=>capDiscoveryObservations(value,{fallbackAt:null,now:at});
  const borrow=refreshing=>{
   const value={...live,...priceOnly(prior),pricesRefreshing:refreshing};
   // A cached USD observation does not carry the incoming native quote's clock.
   if(isQhooksPriceAsset(row.chainId,row.token?.address)&&live.priceAt!==prior.priceAt){if('priceQuote'in value)value.priceQuote=null;if(value.quoteAmounts?.unit==='WETH')value.quoteAmounts={...value.quoteAmounts,price:null};}
   return finish(value);
  };
  if(Number.isFinite(live.priceUsd)&&live.priceUsd>0){if(prior&&Number.isFinite(prior.priceUsd)&&prior.priceAt>live.priceAt)return borrow(true);if(!prior||live.priceAt>=prior.priceAt)prices.set(key,priceOnly(live));return finish(live);}
  if(!prior||!Number.isFinite(prior.priceUsd)||prior.priceUsd<=0||!priceState(prior.priceAt,at).usable)return finish(live);
  // Token identity remains the current row. Never borrow a price across tokens or chains.
  return borrow(!!live.pricesRefreshing||priceState(prior.priceAt,at).refreshing);
 });try{const keep=[...prices].filter(([,v])=>priceState(v.priceAt,now()).usable).sort((a,b)=>b[1].priceAt-a[1].priceAt).slice(0,240);storage?.setItem(KEY,JSON.stringify(keep));}catch{}return {...data,rows};}};
}
