// Provider observations and the terminal's read-only page adapters. No wallet calls.
const time=v=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0?v:null;
const utc=at=>new Date(at).toISOString().slice(11,16)+' UTC';
const age=(at,now)=>{const s=Math.max(0,Math.floor((now-at)/1000));return s<60?s+'s':s<3600?Math.floor(s/60)+'m':s<86400?Math.floor(s/3600)+'h':Math.floor(s/86400)+'d';};
export const plainMarketError=()=> 'Refreshing market data…';
export function freshnessState(data={},now=Date.now(),{fresh='Live · '}={}){
 const stamp=time(data?.observedAt),observedAt=stamp&&stamp<=now+5000?stamp:null;
 const stale=!!data?.stale||!!observedAt&&now-observedAt>120000;
 return {observedAt,stale,label:observedAt&&!stale?fresh+age(observedAt,now)+' ago':stale?'Refreshing…':''};
}
export function historyState(kind,{available,loading=false,observedAt=null,stale=false,lastEventAt=null}={},now=Date.now()){
 const panel=kind==='candles'?'Chart':'Trades',event=kind==='candles'?'candle':'trade';
 if(loading)return {stale:false,label:'Loading '+panel.toLowerCase()+'…'};
 if(available===false)return {stale:false,label:'Refreshing '+panel.toLowerCase()+'…'};
 // Staleness is the age of the data observation. A quiet market (no trade for minutes) is not stale data.
 const fresh=freshnessState({observedAt:time(observedAt)||time(lastEventAt),stale},now,{fresh:'updated '});
 return {...fresh,label:(time(lastEventAt)?'Last '+event+' '+age(lastEventAt,now)+' ago · ':'')+fresh.label};
}
export function safetyChecked(safety){
 return safety?.checked===true||typeof safety?.honeypot==='boolean'||[safety?.buyTax,safety?.sellTax].some(v=>typeof v==='number'&&Number.isFinite(v))||
  Array.isArray(safety?.checks)&&safety.checks.some(c=>c&&['ok','clear','pass','passed','caution','danger'].includes(c.status));
}
export async function loadExternalHeader({chainId,address,tf,signal,fetcher=globalThis.fetch}){
 const r=await fetcher(`/api/terminal/x/token/${chainId}/${address}`,{cache:'no-store',signal});
 if(!r.ok)throw Error(r.status===404?'No market found for this token.':plainMarketError());
 const t=await r.json(),token=chainId==='solana'?t.address:t.address?.toLowerCase();
 if(token!==address||(t.chainId!=null&&String(t.chainId)!==chainId))throw Error('Token metadata does not match this selection. Choose the token again.');
 return {ext:true,tf,token:t,receivedAt:Date.now(),safety:null,
  meta:{symbol:t.symbol,name:t.name,token,chainId,quoteSymbol:'USD',owner:null},
  summary:{price:t.priceUsd,change24:t.change24,mcap:t.mcapUsd??t.fdvUsd,supply:t.supply??null,fdv:t.fdvUsd,liquidity:t.liquidityUsd,volume24:t.volume24Usd,buys24:t.buys24,sells24:t.sells24,trades24:t.buys24!=null&&t.sells24!=null?t.buys24+t.sells24:null},
  candles:[],trades:[],holders:[],traders:[],synced:{behind:0,at:0,block:0},
  marketCoverage:{candles:'loading',trades:'loading'},historyFreshness:{candles:{loading:true},trades:{loading:true}}};
}
export async function loadExternalHistory({chainId,pool,tf,signal,fetcher=globalThis.fetch}){
 async function read(kind){
  if(!pool)return null;
  const controller=new AbortController(),abort=()=>controller.abort();
  if(signal?.aborted)controller.abort();else signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,12000);
  try{
   const response=await fetcher(`/api/terminal/x/${kind}/${chainId}/${pool}`+(kind==='candles'?'?tf='+tf:''),{cache:'no-store',signal:controller.signal});
   if(!response.ok)return null;const body=await response.json();if(!Array.isArray(body?.[kind]))return null;
   return {body,observedAt:time(Number(response.headers.get('x-qhooks-observed-at')))||time(body.observedAt),stale:response.headers.get('x-qhooks-stale')==='1'||body.stale===true};
  }catch{return null;}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
 }
 const [c,t]=await Promise.all([read('candles'),read('trades')]),candles=c?.body.candles||[],rawTrades=t?.body.trades||[];
 const newest=values=>values.filter(v=>Number.isFinite(v)&&v>0).reduce((a,b)=>Math.max(a,b),0)||null;
 return {candles,tradeCoverage:t?.body.coverage||null,
  trades:rawTrades.map(x=>({id:x.tx+':'+(x.index??x.logIndex??'')+':'+(x.wallet||'')+':'+x.ts,logIndex:x.index??x.logIndex,ts:Math.floor(x.ts/1000),buy:x.side==='buy',price:x.priceUsd,token:x.amountToken,quote:x.valueUsd,trader:chainId==='solana'?(x.wallet||''):(x.wallet||'').toLowerCase(),tx:x.tx,pool:0})),
  marketCoverage:{candles:c?'available':'unavailable',trades:t?'available':'unavailable'},
  historyFreshness:{candles:{available:!!c,observedAt:c?.observedAt||null,stale:!!c?.stale,lastEventAt:newest(candles.map(x=>x.time*1000))},trades:{available:!!t,observedAt:t?.observedAt||null,stale:!!t?.stale,lastEventAt:newest(rawTrades.map(x=>x.ts))}}};
}
