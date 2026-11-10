import {TRENDING_URL,LAUNCHES_URL,LAUNCH_FEED_URL,launchTokens,cleanTrending,newestLaunch,readPublicJSON,tokenRows} from './qx-market-live.mjs';
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
   // QHooks launches first (2026-11-10): the strip showed boosted outside tokens at −91% and Pump-reader repeats.
   // Under three launches, clean trending rows top it up.
   (async()=>{
    const launches=await readPublicJSON(LAUNCH_FEED_URL,{fetcher,signal:controller.signal}).then(b=>launchTokens(b,{fetcher})).catch(()=>[]);
    let rows=launches,label='QHooks launches · 24h';
    if(rows.length<3){const t=await readPublicJSON(TRENDING_URL,{fetcher,signal:controller.signal}).catch(()=>null);if(t){const seen=new Set(rows.map(r=>r.chainId+':'+String(r.address).toLowerCase()));rows=[...rows,...cleanTrending(t,8).filter(r=>!seen.has(r.chainId+':'+String(r.address).toLowerCase()))].slice(0,5);if(!launches.length)label=feedSourceLabel(t.source)||'Market snapshot · 24h';}}
    if(disposed)return;list.replaceChildren(...tokenRows(doc,rows,{logos:true}));trending.hidden=false;
    if(source)source.textContent=label;
    if(status){status.hidden=!!rows.length;status.textContent=rows.length?'':'Refreshing market snapshot…';}
   })().catch(()=>{if(!disposed){trending.hidden=false;if(status){status.hidden=false;status.textContent='Refreshing market snapshot…';}}}),
   readPublicJSON(LAUNCHES_URL,{fetcher,signal:controller.signal}).then(body=>{
    if(disposed)return;const row=newestLaunch(body);launch.hidden=!row;if(row){link.textContent=row.symbol;link.href=row.href;link.title=row.name;}
   }).catch(()=>{if(!disposed)launch.hidden=true;})
  ]);
 }
 const visible=()=>{void load();};doc.addEventListener('visibilitychange',visible);
 void load();
 return{load,dispose(){disposed=true;controller.abort();doc.removeEventListener('visibilitychange',visible);}};
}
