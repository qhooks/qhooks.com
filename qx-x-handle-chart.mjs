// A selected post's exact indexed launch history. No provider fetches, wallet,
// execution authority or independent poller. Prices remain in their indexed quote.
import {chainById} from './chains.mjs';
const ADDRESS=/^0x[0-9a-f]{40}$/i, SOL=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export function xHandleChartAsset(input){
 const chainId=String(input?.chainId||''),raw=input?.token||input?.address;if(chainId!=='solana'&&!chainById(chainId)||typeof raw!=='string'||input?.family&&input.family!==(chainId==='solana'?'solana':'evm')||input?.kind&&!['launch','token'].includes(input.kind))return null;
 const valid=chainId==='solana'?SOL.test(raw):ADDRESS.test(raw)&&!/^0x0{40}$/i.test(raw);if(!valid)return null;
 const token=chainId==='solana'?raw:raw.toLowerCase();if(input.token&&input.address&&(chainId==='solana'?input.address:input.address.toLowerCase())!==token)return null;
 const controller=ADDRESS.test(input.controller||'')&&!/^0x0{40}$/i.test(input.controller)?input.controller.toLowerCase():null;
 if(input.kind==='launch'&&!controller)return null;
 return {chainId,token,kind:input.kind==='launch'&&controller?'launch':'token',controller:input.kind==='launch'?controller:null,symbol:String(input.symbol||'').replace(/[\x00-\x1f\x7f]/g,'').slice(0,32)};
}
const clock=(v,now)=>Number.isSafeInteger(v)&&v>0&&v<=now+5000?v:null;
export function xHandleChartView(body,asset,now=Date.now()){
 if(body?.version!==1||!Array.isArray(body.bars)||body.timeframe!==1)return {status:'unavailable',bars:[],label:'Indexed chart data could not be read.'};
 if(body.bars.length&&(!body.asset||body.status!=='available')||body.asset&&(String(body.asset.chainId)!==asset.chainId||String(body.asset.token).toLowerCase()!==asset.token||String(body.asset.controller).toLowerCase()!==asset.controller))return {status:'unavailable',bars:[],label:'The chart does not match this token.'};
 const seen=new Set(),bars=[];for(const b of body.bars.slice(0,600)){
  if(!Number.isSafeInteger(b?.time)||b.time<=0||b.time>now/1000+5||seen.has(b.time)||!['open','high','low','close'].every(k=>Number.isFinite(b[k])&&b[k]>0)||!Number.isFinite(b.volume)||b.volume<0||b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close)||b.low>b.high)continue;
  seen.add(b.time);bars.push({time:b.time,open:b.open,high:b.high,low:b.low,close:b.close,volume:b.volume});
 }
 bars.sort((a,b)=>a.time-b.time);const observedAt=clock(body.observedAt,now),seconds=observedAt?Math.max(0,Math.floor((now-observedAt)/1000)):null,stale=body.stale===true||seconds===null||seconds>300;
 const age=seconds===null?'time unavailable':seconds<60?seconds+'s':seconds<3600?Math.floor(seconds/60)+'m':Math.floor(seconds/3600)+'h';
 const label=bars.length?(stale?'Refreshing · ':'Live · ')+age+(seconds===null?'':' ago'):(body.status==='disabled'?'Tracker data is not connected.':body.reason||'No indexed one-second history is available.');
 return {status:bars.length?'available':body.status||'empty',bars,label,observedAt,stale,unit:typeof body.unit==='string'?body.unit.slice(0,24):'quote',partial:body.coverage?.partial===true};
}
export async function mountXHandleChart(host,input,{document:doc=host?.ownerDocument||globalThis.document,fetcher=(...a)=>fetch(...a),signal,isCurrent=()=>true,now=Date.now,loadChart=()=>import('./vendor/lightweight-charts/lightweight-charts.standalone.production.mjs')}={}){
 if(!host||!doc)throw Error('A chart target is required.');const asset=xHandleChartAsset(input);let dead=false,generation=0,pending=null,chart=null,series=null,volume=null,last=null;
 const make=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
 const root=make('section',null,'qxh-chart'),head=make('div',null,'qxh-chart-head'),title=make('strong',(asset?.symbol||'Token')+' · 1s'),refreshButton=make('button','Refresh chart'),status=make('p','Loading indexed history…','qxh-chart-status'),canvas=make('div',null,'qxh-chart-canvas'),foot=make('div',null,'qxh-chart-foot');
 root.setAttribute('aria-label','Indexed token chart');status.setAttribute('role','status');refreshButton.type='button';canvas.style.height='280px';canvas.style.minWidth='0';canvas.style.width='100%';canvas.hidden=true;head.append(title,refreshButton);root.append(head,status,canvas,foot);host.replaceChildren(root);
 const link=asset?make('a','Open token →'):null;if(link){link.href='/terminal#'+(asset.kind==='launch'?'m='+asset.chainId+':'+asset.controller:'t='+asset.chainId+':'+asset.token);foot.append(link);}
 const current=mine=>!dead&&!signal?.aborted&&mine===generation&&isCurrent();
 function dispose(){if(dead)return;dead=true;generation++;pending?.abort();pending=null;chart?.remove();chart=null;refreshButton.removeEventListener('click',clicked);signal?.removeEventListener('abort',dispose);root.remove();}
 async function refresh(){
  if(dead||signal?.aborted||!isCurrent()||doc.hidden)return {skipped:true};const mine=++generation;pending?.abort();pending=new AbortController();const control=pending,timer=setTimeout(()=>control.abort(),5000);refreshButton.disabled=true;
  if(!asset||asset.chainId==='solana'||asset.kind!=='launch'||!asset.controller){clearTimeout(timer);refreshButton.disabled=false;status.textContent='One-second history is available for indexed launches. Open this token for its available chart.';return {status:'unsupported'};}
  if(!last)status.textContent='Loading indexed history…';
  try{
   const response=await fetcher('/api/x-tracker/chart?'+new URLSearchParams({chain:asset.chainId,controller:asset.controller,token:asset.token,tf:'1'}),{credentials:'omit',redirect:'error',cache:'no-store',signal:control.signal});
   if(!current(mine))return {cancelled:true};if(!response.ok)throw Error('Indexed chart data could not be read.');const body=await response.json();if(!current(mine))return {cancelled:true};const view=xHandleChartView(body,asset,now());
   last=view;status.textContent=view.label+(view.bars.length?' · '+view.unit+' per token'+(view.partial?' · received history':''):'');
   if(!view.bars.length){canvas.hidden=true;chart?.remove();chart=null;return view;}
   const library=await loadChart();if(!current(mine))return {cancelled:true};
   if(!chart){const styles=doc.defaultView?.getComputedStyle(root),text=styles?.getPropertyValue('--qa-tx-2').trim()||'#b8b8ad',rule=styles?.getPropertyValue('--qa-rule').trim()||'#30362d';
    chart=library.createChart(canvas,{autoSize:true,layout:{background:{color:'transparent'},textColor:text,fontSize:12,attributionLogo:true},grid:{vertLines:{color:rule},horzLines:{color:rule}},timeScale:{timeVisible:true,secondsVisible:true},rightPriceScale:{borderColor:rule}});
    series=chart.addCandlestickSeries({upColor:'#84cda3',downColor:'#e69b91',borderVisible:false,wickUpColor:'#84cda3',wickDownColor:'#e69b91',priceFormat:{type:'custom',formatter:v=>Number.isFinite(v)?Number(v).toPrecision(5):'',minMove:1e-12}});
    volume=chart.addHistogramSeries({priceScaleId:'volume',priceFormat:{type:'volume'},lastValueVisible:false,priceLineVisible:false});chart.priceScale('volume').applyOptions({scaleMargins:{top:.85,bottom:0}});
    foot.querySelector('.qxh-chart-attribution')?.remove();const attribution=make('a','Charts by TradingView');attribution.href='https://www.tradingview.com/';attribution.target='_blank';attribution.rel='noopener noreferrer';attribution.className='qxh-chart-attribution';foot.append(attribution);
   }
   canvas.hidden=false;series.setData(view.bars.map(({volume,...bar})=>bar));volume.setData(view.bars.map(b=>({time:b.time,value:b.volume,color:b.close>=b.open?'#84cda344':'#e69b9144'})));chart.timeScale().fitContent();return view;
  }catch(error){if(current(mine)){status.textContent=control.signal.aborted?'Chart read timed out. Retry.':error.message||'Chart unavailable. Retry.';return {status:'unavailable'};}return {cancelled:true};}
  finally{clearTimeout(timer);if(current(mine)){refreshButton.disabled=false;pending=null;}}
 }
 const clicked=()=>void refresh();refreshButton.addEventListener('click',clicked);signal?.addEventListener('abort',dispose,{once:true});if(signal?.aborted)dispose();const ready=refresh();return {refresh,dispose,ready};
}
