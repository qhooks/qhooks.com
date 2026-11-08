import {renderMarketHolders,holderSource} from './qx-terminal-holders.mjs';
export function createExternalHolderPanel({h,who,link,short,pct,fetcher=(...a)=>fetch(...a),now=Date.now}){
 const root=h('section',{class:'qxt-external-holders',ariaLabel:'Largest token accounts'}),cache=new Map();let key=null,chain=null,mint=null,market={},pending=null,generation=0,value=null,error=null,retryAfter=0;
 function render(){
  const refresh=h('button',{type:'button',class:'qxt-context-action',disabled:!!pending,onclick:()=>load(true)},pending?'Refreshing…':'Refresh holders');
  const header=h('div',{class:'qxt-data-heading'},h('b',{},'Largest token accounts'),refresh);
  const intro=h('p',{class:'qxt-data-scope'},holderSource(value?.coverage?.description,'Read the largest Solana token accounts and their on-chain owners.'));
  if(!value){root.replaceChildren(header,intro,h('p',{class:'qxt-empty'},pending?'Reading holder snapshot…':error||'Holder data is unavailable.'),link(chain,'/token/'+mint,'View token on explorer ↗'));return;}
  const slots=value.coverage.slots||[],scope=h('p',{class:'qxt-data-scope'},value.rows.length+' accounts · '+new Set(value.rows.map(r=>r.owner)).size+' observed owners'+(slots.length?(value.coverage.sameSlot?' · slot '+slots[0]:' · slots '+Math.min(...slots)+'–'+Math.max(...slots)):''));
  root.replaceChildren(header,intro,...(error?[h('p',{role:'status'},'Showing the previous snapshot. '+error)]:[]),scope,...renderMarketHolders({h,who,link,short,chainId:chain,market,snapshot:value,now:now()}));
 }
 async function load(force=false){
  if(pending)return;if(!force&&now()<retryAfter){render();return;}if(!force&&value&&now()-value.observedAt<60000){render();return;}
  const mine=generation,controller=new AbortController(),requestedKey=key;pending=controller;error=null;render();
  const timer=setTimeout(()=>controller.abort(),12000);
  try{const response=await fetcher('/api/terminal/market/holders/'+chain+'/'+mint,{cache:'no-store',signal:controller.signal}),body=await response.json();if(mine!==generation)return;if(!response.ok||!['available','partial'].includes(body.status)||body.token!==mint||body.chainId!==chain||!Array.isArray(body.rows)||!body.coverage)throw Error('Holder reads are unavailable right now. Use the token explorer or retry.');value=body;cache.set(requestedKey,value);if(cache.size>30)cache.delete(cache.keys().next().value);}catch(e){if(mine===generation){retryAfter=now()+60000;error=e.name==='AbortError'?'Holder read timed out.':e.message||'Holder read unavailable.';}}finally{clearTimeout(timer);if(mine===generation){pending=null;render();}}
 }
 return {show(container,c,m,data={}){market=data;const next=c+':'+m;if(next!==key){pending?.abort();pending=null;generation++;key=next;chain=c;mint=m;value=cache.get(key)||null;error=null;retryAfter=0;}if(root.parentNode!==container)container.replaceChildren(root);load();},clear(){generation++;pending?.abort();pending=null;key=null;value=null;error=null;},element:root};
}
