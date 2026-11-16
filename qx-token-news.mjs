import {mountDevUpdates} from './qx-news-l5.mjs';
import {node,empty,wireRows,visibleTask} from './qx-news-ui.mjs';
import {mountXEmbed} from './qx-x-embed.mjs';
import {newsworthy,NEWS_MIN_TRADE_USD} from './qx-news-policy.mjs';
let mounted=null;
export function hideTokenNews(){if(mounted){mounted.poll.stop();mounted.x?.dispose();mounted.dev?.dispose();mounted=null;}}
export function renderTokenNews(pane,meta){
 const chain=String(meta?.chainId||''),token=meta?.token||meta?.controller;if(!chain||!token){hideTokenNews();pane.replaceChildren(empty('Choose a token to see its news.'));return;}
 const controller=meta?.controller||token,id=chain+':'+token+':'+controller;if(mounted?.id===id&&pane.contains(mounted.root))return;hideTokenNews();
 if(!document.querySelector('link[href="/qx-news.css"]'))document.head.append(node('link',{rel:'stylesheet',href:'/qx-news.css'}));
 const root=node('div',{class:'qn-token'}),rows=node('div',{},empty('Reading this token’s stored activity…')),social=node('div'),note=node('p',{class:'qn-note'});root.append(rows,note,social,node('a',{class:'qn-panel-foot',href:'/news'},'Open the full news wire ↗'));pane.replaceChildren(root);
 const devRoot=node('section',{id:'token-dev-updates',hidden:''});root.prepend(devRoot);if(!document.querySelector('link[href="/qx-news-l5.css"]'))document.head.append(node('link',{rel:'stylesheet',href:'/qx-news-l5.css'}));
 const state={id,root,x:null,xUrl:null,poll:null,dev:mountDevUpdates(devRoot,{chain,controller})};mounted=state;
 state.poll=visibleTask(async signal=>{const r=await fetch('/api/news/token?chain='+encodeURIComponent(chain)+'&token='+encodeURIComponent(token)+'&controller='+encodeURIComponent(controller),{signal,cache:'no-store'});if(!r.ok){note.textContent='Token news is refreshing.';return;}const data=await r.json();if(signal.aborted||mounted!==state)return;const events=data.wire.items.filter(newsworthy);rows.replaceChildren(...(events.length?wireRows(events):[empty('No wire-worthy events for this token in the last day.')]));note.textContent=data.wire.status==='partial'?'Some event histories are still unavailable.':'Launches, flows and public updates · trades ≥$'+NEWS_MIN_TRADE_USD.toLocaleString('en-US');if(data.officialX?.url!==state.xUrl){state.x?.dispose();social.replaceChildren();state.xUrl=data.officialX?.url||null;if(state.xUrl)state.x=mountXEmbed(social,{url:state.xUrl,label:'the token’s linked account'});}},120000);
}
