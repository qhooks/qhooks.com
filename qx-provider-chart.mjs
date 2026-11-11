// Provider display only: no candle extraction, analytics, wallet or execution.
// Canonical surface contract: the index's provider-embed chart surface.
const CHAINS=Object.freeze({'8453':'base','1':'ethereum','56':'bsc','4663':'robinhood','42161':'arbitrum','99901':'elysium',solana:'solana'});
const SOL=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const TFS=Object.freeze({60:'1m',300:'5m',900:'15m',3600:'1h',14400:'4h',86400:'1d'});
const ADDRESS=/^0x[0-9a-f]{40}$/i,POOL=/^0x(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;
const stamp=value=>typeof value==='string'&&Number.isSafeInteger(Date.parse(value))&&Date.parse(value)>0?Date.parse(value):null;
const stale=value=>value.stale===true||['stale','retained','delayed'].includes(value.freshness_state)||['stale','retained','delayed'].includes(value.freshness?.state)||['stale','retained'].includes(value.delivery?.state);

// Kept equivalent to the index's constructor, including its closed interval map.
export function dexscreenerChartSurface({chain,pairAddress,tokenAddress,quoteAddress,timeframe='1m'}={}){
 if(!['solana','base','bsc','ethereum','robinhood','arbitrum','elysium'].includes(chain))throw Error('chart_embed_chain_unsupported');
 const address=chain==='solana'?/^[1-9A-HJ-NP-Za-km-z]{32,44}$/:/^0x[0-9a-fA-F]{40}$/;
 const pool=chain==='solana'?address:/^0x(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$/;
 if(!pool.test(pairAddress||'')||!address.test(tokenAddress||'')||!address.test(quoteAddress||''))throw Error('chart_embed_identity_invalid');
 const interval={'1m':'1','5m':'5','15m':'15','1h':'60','4h':'240','1d':'D'}[timeframe];
 if(!interval)throw Error('chart_embed_interval_unsupported');
 const normalize=value=>chain==='solana'?value:value.toLowerCase();
 const url=new URL(`https://dexscreener.com/${chain}/${normalize(pairAddress)}`);
 url.search=new URLSearchParams({embed:'1',theme:'dark',trades:'0',info:'0',interval,chartLeftToolbar:'0',loadChartSettings:'0',chartType:'usd'}).toString();
 return{schema_version:'qhooks.chart_surface.v1',kind:'provider_embed',provider:'dexscreener',chain,pool_address:normalize(pairAddress),token_address:normalize(tokenAddress),quote_address:normalize(quoteAddress),timeframe,url:url.href,candles_accessible_to_index:false};
}
function selected(value){
 const chainId=String(value?.chainId||''),{pool,token,quote,asset,tf}=value||{},sol=chainId==='solana';
 const idOk=v=>sol?SOL.test(v||''):ADDRESS.test(v||''),poolOk=sol?SOL.test(pool||''):POOL.test(pool||''),norm=v=>sol?v:v.toLowerCase();
 if(!CHAINS[chainId]||!poolOk||!idOk(token)||!idOk(quote)||typeof asset!=='string'||!asset||!TFS[tf]||norm(token)===norm(quote))return null;
 return{chainId,chain:CHAINS[chainId],pool:norm(pool),token:norm(token),quote:norm(quote),asset,tf:Number(tf),timeframe:TFS[tf]};
}
const args=s=>({chain:s.chain,pairAddress:s.pool,tokenAddress:s.token,quoteAddress:s.quote,timeframe:s.timeframe});
const key=s=>[s.chainId,s.pool,s.token,s.quote,s.tf].join(':');
function matchingSurface(raw,s){
 if(raw?.kind!=='provider_embed'||raw.provider!=='dexscreener'||raw.candles_accessible_to_index!==false)return null;
 const safe=dexscreenerChartSurface(args(s));
 return['schema_version','chain','pool_address','token_address','quote_address','timeframe','url'].every(field=>raw[field]===safe[field])?safe:null;
}
export function admitProviderChart(projection,selection){
 const s=selected(selection),p=projection,observedAt=stamp(p?.observed_at);
 if(!s||!observedAt||p.ok!==true||p.source!=='QHooks data'||p.provider_source!=='DexScreener'||p.source_type!=='provider_embed'||p.instrument_scope!=='exact_pool'||p.asset!==s.asset||p.timeframe!==s.timeframe||p.chain!==s.chain||p.pair_address!==s.pool||p.token_address!==s.token||p.quote_address!==s.quote||!Array.isArray(p.candles)||p.candles.length!==0)return null;
 const ready=p.chart_readiness;
 if(p.capabilities?.chart_embed!==true||p.capabilities.live_bars!==false||p.capabilities.index_candle_analytics!==false||ready?.schema_version!=='qhooks.exact_market_chart_readiness.v1'||ready.state!=='provider_managed'||ready.exact_market_verified!==true||ready.provider_id!=='dexscreener'||ready.timeframe!==s.timeframe||ready.bars!==null||ready.one_minute_requirement!=='provider_managed_not_measured')return null;
 if(p.attribution?.required!==true||p.attribution.label!=='Chart by DexScreener'||p.attribution.url!=='https://dexscreener.com/')return null;
 const surface=matchingSurface(p.chart_surface,s);if(!surface)return null;
 return Object.freeze({kind:'provider_embed',provider:'dexscreener',key:key(s),selection:Object.freeze(s),surface:Object.freeze(surface),observedAt,marketObservedAt:stamp(p.market_state?.observed_at)<=observedAt+60000?stamp(p.market_state?.observed_at):null,stale:stale(p),source:'QHooks data',attribution:'Chart by DexScreener'});
}
export function directProviderChart(selection,now=Date.now(),reason=null){
 const s=selected(selection);if(!s)return null;
 let surface;try{surface=dexscreenerChartSurface(args(s));}catch{return null;}
 return Object.freeze({kind:'provider_embed',provider:'dexscreener',key:key(s),selection:Object.freeze(s),surface:Object.freeze(surface),observedAt:now,marketObservedAt:null,stale:false,source:'direct',reason,attribution:'Chart by DexScreener'});
}
export function providerChartStatus(view,now=Date.now()){
 if(view?.reason==='refreshing')return'Live chart · Refreshing';
 if(view?.source==='direct')return'Live chart for this pool · QHooks has no candles for it yet';
 const at=view?.observedAt;if(!Number.isSafeInteger(at)||at<=0)return'Live chart';
 const clock=value=>{const date=new Date(value).toISOString(),day=new Date(now).toISOString().slice(0,10)===date.slice(0,10)?'':date.slice(0,10)+' ';return day+date.slice(11,19)+' UTC';};
 const snapshot=view.marketObservedAt;
 return'Live chart'+(view.stale||now-at>120000||snapshot&&now-snapshot>120000?' · refreshing…':'');
}
export function createProviderChartRenderer({document:doc=globalThis.document,nativeElement,now=Date.now}={}){
 if(!nativeElement||typeof now!=='function')throw TypeError('A native chart host is required.');
 const host=doc.createElement('section'),caption=doc.createElement('p'),open=doc.createElement('a');
 host.className='qxt-provider-chart';host.setAttribute('aria-label','Provider-rendered token chart');host.hidden=true;caption.className='qxt-provider-caption';caption.setAttribute('role','status');open.className='qxt-provider-open';open.target='_blank';open.rel='noopener noreferrer';open.textContent='Open full chart ↗';host.append(caption,open);nativeElement.before(host);
 let iframe=null,currentKey=null,currentView=null;
 const nativeStage=()=>nativeElement.closest('.qxt-chart-stage');
 function clear(){iframe?.remove();iframe=null;currentKey=null;currentView=null;host.hidden=true;nativeElement.hidden=false;const stage=nativeStage();if(stage)stage.hidden=false;}
 function render(view,selection){
  const s=selected(selection),own=selected(view?.selection);
  if(!s||!own||view?.kind!=='provider_embed'||view.provider!=='dexscreener'||!['QHooks data','direct'].includes(view.source)||view.key!==key(s)||key(own)!==key(s)||own.asset!==s.asset||!Number.isSafeInteger(view.observedAt)||!matchingSurface(view.surface,s)){clear();return false;}
  const safe=dexscreenerChartSurface(args(s));currentView=view;
  // Day/night (2026-11-10): the embed follows the site theme; a theme change reloads it.
  const light=doc.documentElement?.dataset?.theme==='light',src=light?safe.url.replace('theme=dark','theme=light'):safe.url,themedKey=view.key+(light?':light':':dark');
  if(currentKey!==themedKey){
   iframe?.remove();iframe=doc.createElement('iframe');iframe.className='qxt-provider-frame';iframe.setAttribute('sandbox','allow-scripts allow-same-origin');iframe.setAttribute('referrerpolicy','no-referrer');iframe.setAttribute('allow',"camera 'none'; microphone 'none'; geolocation 'none'; payment 'none'");iframe.setAttribute('loading','eager');iframe.setAttribute('src',src);host.append(iframe);currentKey=themedKey;void view.key;
   const frame=iframe;frame.addEventListener('error',()=>{if(iframe===frame&&currentView&&String(currentKey).startsWith(currentView.key+":"))caption.textContent=providerChartStatus(currentView,now())+' · If the chart is blocked, use Open full chart.';});
  }
  iframe.setAttribute('title',s.asset+' USD chart by DexScreener · '+s.chain+' · pool '+s.pool);
  caption.textContent=providerChartStatus(view,now());caption.title=(view.marketObservedAt?'Market snapshot: '+new Date(view.marketObservedAt).toISOString()+'. ':'')+'Provider chart content updates independently; QHooks does not read its candles.';
  open.href='https://dexscreener.com/'+s.chain+'/'+s.pool;host.hidden=false;nativeElement.hidden=true;const stage=nativeStage();if(stage)stage.hidden=true;return true;
 }
 return Object.freeze({render,clear,element:host,dispose(){clear();host.remove();}});
}
