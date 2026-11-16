import {node,ago,empty,visibleTask} from './qx-news-ui.mjs';
export function mountAggregator(section){
 const rows=section.querySelector('[data-aggregator-rows]'),status=section.querySelector('[role=status]');let poll=null;
 function update(data){
  const items=data.items||[];status.textContent=data.stale?'OLDER SNAPSHOT':data.status==='available'?'DELAYED / INDEXED':data.status==='empty'?'NO MATCHES':'REFRESHING';
  rows.replaceChildren(...(items.length?items.map(e=>node('a',{class:'qn-headline',href:e.url,target:'_blank',rel:'noopener noreferrer'},node('span',{class:'qn-headline-meta'},node('span',{},e.source),node('time',{datetime:new Date(e.indexedAt).toISOString(),title:'Indexed by GDELT at '+new Date(e.indexedAt).toUTCString()},'Indexed '+ago(e.indexedAt))),node('strong',{},e.title+' ↗'))):[empty(data.status==='empty'?'No recent crypto coverage matched. Explore markets and Trends.':'Crypto headlines are refreshing. Explore movers, new launches and Trends.')]));
 }
 return {setEnabled(enabled){section.hidden=!enabled;section.parentElement.classList.toggle('has-aggregator',enabled);if(!enabled){poll?.stop();poll=null;rows.replaceChildren();return;}if(!poll){rows.replaceChildren(empty('Reading indexed crypto coverage…'));poll=visibleTask(async signal=>{try{const r=await fetch('/api/news/aggregator',{signal,cache:'no-store'});if(!r.ok)throw Error('unavailable');update(await r.json());}catch(e){if(e.name!=='AbortError')update({status:'unavailable',items:[]});}},900000);}},dispose(){poll?.stop();poll=null;}};
}
