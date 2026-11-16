import{assetPriceFields,priceState,priceObservation}from'./qx-price-state.mjs';
const KEY='qhooks:feed:prices:v1',identity=r=>String(r.chainId)+':'+(r.chainId==='solana'?r.token?.address:String(r.token?.address||'').toLowerCase());
// The original observation time survives reloads, list changes and incomplete refreshes.
export function createFeedPriceCache({storage,now=Date.now}={}){
 const prices=new Map();try{for(const[key,value]of JSON.parse(storage?.getItem(KEY)||'[]'))if(priceState(value.priceAt,now()).usable)prices.set(key,value);}catch{}
 return {reconcile(data){if(!data?.rows)return data;const rows=data.rows.filter(row=>row&&row.token&&typeof row.token.address==='string').map(row=>{
  const key=identity(row),live=assetPriceFields(row,{chainId:row.chainId,token:row.token?.address,at:priceObservation(row,data.observedAt),now:now()}),saved=prices.get(key),prior=saved?assetPriceFields(saved,{chainId:row.chainId,token:row.token?.address,now:now()}):null;
  if(Number.isFinite(live.priceUsd)&&live.priceUsd>0){if(prior&&Number.isFinite(prior.priceUsd)&&prior.priceAt>live.priceAt)return {...live,...prior,pricesRefreshing:true};if(!prior||live.priceAt>=prior.priceAt)prices.set(key,{priceUsd:live.priceUsd,priceAt:live.priceAt,priceSource:live.priceSource,pricePoolId:live.pricePoolId,marketCapUsd:live.marketCapUsd,fdvUsd:live.fdvUsd});return live;}
  if(!prior||!Number.isFinite(prior.priceUsd)||prior.priceUsd<=0||!priceState(prior.priceAt,now()).usable)return live;
  // Token identity remains the current row. Never borrow a price across tokens or chains.
  return {...live,...prior,pricesRefreshing:!!live.pricesRefreshing||priceState(prior.priceAt,now()).refreshing};
 });try{const keep=[...prices].filter(([,v])=>priceState(v.priceAt,now()).usable).sort((a,b)=>b[1].priceAt-a[1].priceAt).slice(0,240);storage?.setItem(KEY,JSON.stringify(keep));}catch{}return {...data,rows};}};
}
