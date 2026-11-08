import {TRENDING_URL,LAUNCHES_URL,trendingTokens,newestLaunch,readPublicJSON,tokenRows} from './qx-market-live.mjs';
import {feedSourceLabel} from './qx-terminal-feed-core.mjs';

// Once per page visit, as soon as the tab is visible.
// No interval, per-token requests or hidden-tab polling.
export function mountHomeLive(root,{document:doc=globalThis.document,fetcher=globalThis.fetch}={}){
 if(!root)return null;
 const trending=root.querySelector('[data-home-trending]'),list=root.querySelector('[data-home-tokens]'),launch=root.querySelector('[data-home-launch]'),link=root.querySelector('[data-home-launch-link]');
 const status=root.querySelector('[data-home-live-status]'),source=root.querySelector('[data-home-source]');
 let started=false,disposed=false;
 const controller=new AbortController();
 async function load(){
  if(started||disposed||doc.hidden)return;started=true;
  await Promise.allSettled([
   readPublicJSON(TRENDING_URL,{fetcher,signal:controller.signal}).then(body=>{
    if(disposed)return;const rows=trendingTokens(body);list.replaceChildren(...tokenRows(doc,rows,{logos:true}));trending.hidden=false;
    if(source)source.textContent=feedSourceLabel(body.source)||'Market snapshot · 24h';
    if(status){status.hidden=!!rows.length;status.textContent=rows.length?'':'No live tokens right now.';}
   }).catch(()=>{if(!disposed){trending.hidden=false;if(status){status.hidden=false;status.textContent='Market snapshot unavailable right now.';}}}),
   readPublicJSON(LAUNCHES_URL,{fetcher,signal:controller.signal}).then(body=>{
    if(disposed)return;const row=newestLaunch(body);launch.hidden=!row;if(row){link.textContent=row.symbol;link.href=row.href;link.title=row.name;}
   }).catch(()=>{if(!disposed)launch.hidden=true;})
  ]);
 }
 const visible=()=>{void load();};doc.addEventListener('visibilitychange',visible);
 void load();
 return{load,dispose(){disposed=true;controller.abort();doc.removeEventListener('visibilitychange',visible);}};
}
