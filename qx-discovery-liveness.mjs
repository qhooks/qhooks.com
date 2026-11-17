// Discovery observation labels only. Never a price, quote, cache or fetch clock.
export const DISCOVERY_LIVE_MS=30000;
export function discoveryLiveness(row,{now=Date.now(),originalObservedAt=null,failed=false}={}){
 const own=row&&typeof row==='object'&&!Array.isArray(row)&&Object.hasOwn(row,'observedAt');
 const original=own?row.observedAt:originalObservedAt;
 const knownNow=Number.isSafeInteger(now)&&now>0;
 const valid=Number.isSafeInteger(original)&&original>0;
 const future=knownNow&&valid&&original>now;
 const at=knownNow&&valid&&!future?original:null,age=at===null?null:now-at;
 const suppressed=!!failed||!!row?.stale||!!row?.refreshFailed||!!row?.pricesRefreshing;
 const live=age!==null&&age<=DISCOVERY_LIVE_MS&&!suppressed;
 // Exclusive deadline: a sample is still Live at exactly30s, then expires.
 const deadline=live?at+DISCOVERY_LIVE_MS+1:null;
 return {at,age,live,expiresAt:Number.isSafeInteger(deadline)?deadline:null,refreshing:!live,label:live?'Live · '+Math.floor(age/1000)+'s ago':'Refreshing',
  reason:!knownNow?'unknown-now':future?'future-observation':at===null?'unknown-observation':suppressed?'refresh-suppressed':live?'recent-observation':'old-observation',
  source:own?'row':originalObservedAt!==null?'original-fallback':null};
}
