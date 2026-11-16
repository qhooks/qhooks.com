import {mountLaunchAlerts} from './qx-news-t3.mjs';
import {mountDevUpdates} from './qx-news-l5.mjs';
import {mountQuickProof} from './qx-news-t4.mjs';
import {mountPastedPostLaunch} from './qx-x-launch.mjs';
import {laneShell} from './qx-a/pages/markets-shell.mjs';
import {node,ago,usd,empty,visibleTask} from './qx-news-ui.mjs';
import {mountTrends} from './qx-news-trends.mjs';
import {mountXEmbed} from './qx-x-embed.mjs';
import {mountAggregator} from './qx-news-aggregator.mjs';
const shell=laneShell({active:'news',mode:'app',title:'News',back:'/terminal',art:false});if(shell.footer)shell.footer.hidden=true;
// Use the shared wallet flow; only shorten its disconnected header label here.
const connectLabel=()=>{for(const button of shell.slots.wallet.querySelectorAll('button'))if(button.textContent.trim()==='Connect wallet'){button.textContent='Connect';if(button.getAttribute('aria-label')==='Connect wallet')button.setAttribute('aria-label','Connect');}};
const walletLabels=new MutationObserver(connectLabel);walletLabels.observe(shell.slots.wallet,{childList:true,characterData:true,subtree:true});connectLabel();
const $=id=>document.getElementById(id);let board=null,xSource=null,xControl=null;
const external=(href,attrs={},...kids)=>node('a',{href,target:'_blank',rel:'noopener noreferrer',...attrs},kids);
function filterHeadlines(){if(!board)return;const items=board.headlines.items;$('headline-rows').replaceChildren(...(items.length?items.map(e=>external(e.url,{class:'qn-headline'},node('span',{class:'qn-headline-meta'},node('span',{},e.source),node('time',{datetime:new Date(e.at).toISOString()},ago(e.at))),node('strong',{},e.title+' ↗'),node('span',{class:'qn-price-source'},e.licence))):[empty('Federal Reserve releases are refreshing. Explore the source links below.')]));}
const trends=mountTrends($('news-trends'));
const pastedPost=mountPastedPostLaunch($('news-x-post-launch'));
const aggregator=mountAggregator($('news-aggregator'));
function render(j){board=j;filterHeadlines();
 aggregator.setEnabled(j.aggregator?.enabled===true);$('news-headline-stack').hidden=j.aggregator?.enabled!==true;
 $('board-status').textContent='Updated '+new Date(j.asOf).toLocaleTimeString('en-GB',{timeZone:'UTC'})+' UTC';
 const marketRows=[...(j.markets.prices||[]),...(j.markets.stocks||[])];$('markets-strip').replaceChildren(...marketRows.map(m=>node('div',{class:'qn-market'},node('div',{class:'qn-market-name'},m.label||m.symbol,node('span',{},m.label?'RH / US '+({'US market open':'OPEN','US market closed':'CLOSED','Pre-market':'PRE','After hours':'AFTER'}[j.calendar.state]||'HOURS ?'):'USD / SPOT')),node('strong',{class:'qn-price','data-quote-at':m.observedAt||0},usd(m.price)),node('span',{class:'qn-price-source',title:m.source||''},m.observedAt?ago(m.observedAt)+' · '+(m.refreshing?'Refreshing':m.source||'Stored quote'):'No recent quote'))));
 $('headlines-status').textContent=j.headlines.status==='available'?'FEDERAL RESERVE':'REFRESHING';
 $('headline-sources').replaceChildren(...j.headlines.sources.map(s=>node('p',{},external(s.home||s.terms,{},s.name+' ↗'),' · '+(s.enabled?'Headline display enabled.':s.reason+'.'))));
 $('mover-rows').replaceChildren(...(j.markets.movers?.length?j.markets.movers.map((m,i)=>node('a',{href:m.url,class:'qn-mover','data-mover-at':m.observedAt||0},node('span',{class:'qn-mover-rank'},String(i+1).padStart(2,'0')),node('span',{class:'qn-mover-name'},m.symbol,node('small',{},({'4663':'Robinhood','8453':'Base',solana:'Solana'}[m.chain]||m.chain)+' · '+ago(m.observedAt))),node('b',{class:m.change>=0?'qn-up':'qn-down'},(m.change>=0?'+':'')+(m.change*100).toFixed(2)+'%'))):[empty('No recent mover quotes. Open markets to explore.')]));
 $('market-session').textContent=j.calendar.state;$('calendar-note').textContent=j.calendar.note;$('calendar-rows').replaceChildren(...j.calendar.events.slice(0,4).map(e=>external(e.url,{class:'qn-cal-row'},node('time',{datetime:new Date(e.at).toISOString()},new Date(e.at).toLocaleDateString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric'}),node('br'),new Date(e.at).toLocaleTimeString('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'})),node('div',{},node('strong',{},e.title),node('small',{},e.source)))));
 const nextSource=j.x.list?.url||j.x.fallback;if(nextSource!==xSource){xControl?.dispose();$('news-x').replaceChildren();xSource=nextSource;if(!j.x.list)$('news-x').append(node('p',{class:'qn-note'},'The curated QHooks list is coming. Follow QHooks while it is being assembled.'));xControl=mountXEmbed($('news-x'),{url:nextSource,label:j.x.list?'QHooks signal':'@qHooks_'});}
 clock();
}
const poll=visibleTask(async signal=>{try{const r=await fetch('/api/news/board',{signal,cache:'no-store'});if(!r.ok)throw Error('refresh_failed');const j=await r.json();if(!signal.aborted)render(j);}catch(e){if(e.name==='AbortError')return;$('board-status').textContent='Connection paused · tap Refresh to retry';if(!board)$('headline-rows').replaceChildren(empty('Headlines are refreshing. Try again in a moment.'));}},120000);
$('news-refresh').addEventListener('click',()=>void poll.refresh());
function clock(){if(document.hidden)return;$('news-clock').textContent=new Date().toLocaleTimeString('en-GB',{timeZone:'UTC'})+' UTC';for(const el of document.querySelectorAll('[data-quote-at]')){const at=Number(el.dataset.quoteAt);if(!at||at>Date.now()+30000||Date.now()-at>300000)el.textContent='Refreshing';}for(const el of document.querySelectorAll('[data-mover-at]')){const at=Number(el.dataset.moverAt);el.hidden=!at||at>Date.now()+30000||Date.now()-at>300000;}}document.addEventListener('visibilitychange',clock);clock();const ticker=setInterval(clock,1000);addEventListener('pagehide',()=>{clearInterval(ticker);trends.dispose();aggregator.dispose();xControl?.dispose();pastedPost.dispose();},{once:true});

mountQuickProof(document.getElementById("news-quick-proof"));

mountLaunchAlerts(document.getElementById("news-launch-alerts"));
mountDevUpdates(document.getElementById("news-dev-updates"));
addEventListener('pagehide',()=>walletLabels.disconnect(),{once:true});
