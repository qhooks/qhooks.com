// Read-only history presentation. Receipt time never makes an old event current.
import {historyState} from './qx-terminal-data.mjs';
const newest=(rows,field,scale,now)=>rows.reduce((at,row)=>Number.isFinite(row?.[field])&&row[field]>0&&row[field]*scale<=now+5000?Math.max(at,row[field]*scale):at,0)||null;
const duration=(at,now)=>{const minutes=Math.max(1,Math.floor((now-at)/60000));return minutes<60?minutes+' min':Math.floor(minutes/60)+' h';};
const dollars=value=>'$'+value.toLocaleString('en-US',{maximumSignificantDigits:5});
export function chartHistoryState(data,{now=Date.now(),formatPrice=dollars}={}){
 const bars=data?.candles||[],details=data?.historyFreshness?.candles||{};
 const lastEventAt=newest(bars,'time',1000,now)||details.lastEventAt;
 const status=historyState('candles',{...details,...(bars.length?{loading:false,available:true}:{}),lastEventAt},now),stale=!!bars.length&&status.stale;
 const minutes=lastEventAt?Math.max(0,Math.floor((now-lastEventAt)/60000)):null;
 const age=minutes==null?'':minutes<1?'just now':minutes<60?minutes+'m ago':minutes<1440?Math.floor(minutes/60)+'h ago':Math.floor(minutes/1440)+'d ago';
 return {stale,bars,message:stale?'Refreshing'+(lastEventAt?' · last candle '+age:''):''};
}
// Retained history keeps its source clocks while the next header/history pair is read.
export function retainHistoryFreshness(details={}) {
 return {...details,...Object.fromEntries(['candles','trades'].map(kind=>[kind,{...details[kind],loading:false,stale:true,retained:true}]))};
}
// A history packet's metadata can lag merged curve/pool rows. Receipt time and native transfers are not swaps.
export function tradeHistoryState(data,{rows=data?.trades||[],now=Date.now()}={}) {
 const swaps=rows.filter(row=>row?.via!=='eth'&&typeof row?.tx==='string'&&row.tx.length>0);
 const lastEventAt=newest(swaps,'ts',1000,now)||data?.historyFreshness?.trades?.lastEventAt||null;
 return historyState('trades',{...data?.historyFreshness?.trades,lastEventAt},now);
}
export function renderChartHistory({element,message,data,now,formatPrice}){
 const view=chartHistoryState(data,{now,formatPrice});element.dataset.historyStale=String(view.stale);message.dataset.stale=String(view.stale);
 if(view.stale)message.textContent=view.message;
 // A retained chart has one quiet corner status; its candles remain unobscured.
 if(view.bars.length)message.hidden=true;
 return view;
}
export function tapeHistoryState(rows,{now=Date.now()}={}){
 const lastEventAt=newest(rows,'ts',1000,now),collapsed=!!lastEventAt&&now-lastEventAt>900000;
 return {collapsed,label:collapsed?'Last trade '+duration(lastEventAt,now)+' ago · show older trades':''};
}
export function renderTapeHistory({h,pane,content,rows,key,now}){
 const state=tapeHistoryState(rows,{now}),previous=pane.querySelector('details[data-older-trades]');
 if(!state.collapsed){pane.replaceChildren(content);return state;}
 const details=h('details',{class:'qxt-older-trades','data-older-trades':key},h('summary',{},state.label),content);
 details.open=previous?.dataset.olderTrades===key&&previous.open||false;
 pane.replaceChildren(details);return state;
}
// Re-evaluate retained views even if the next provider read fails. Uses the
// terminal's existing visible-tab clock; this starts no requests or timers.
export function refreshHistoryPresentation({data,chartElement,message,tapeElement,pane,rows,renderChart,renderTape,now=Date.now(),formatPrice}){
 if(!data)return;
 const chart=chartHistoryState(data,{now,formatPrice});
 if(chart.stale!==(chartElement.dataset.historyStale==='true')||chart.stale&&message.textContent!==chart.message)renderChart();
 if(!pane)return;
 const tape=tapeHistoryState(rows,{now});
 if(tape.collapsed!==(tapeElement.dataset.historyStale==='true')||tape.collapsed&&pane.querySelector('details[data-older-trades]')?.querySelector('summary')?.textContent!==tape.label)renderTape();
}
