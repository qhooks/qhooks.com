import {xPost,xTimeline} from './qx-x-core.mjs';
let widgets;
function loadWidgets(){
 if(globalThis.twttr?.widgets)return Promise.resolve(globalThis.twttr.widgets);
 if(widgets)return widgets;
 widgets=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src='https://platform.twitter.com/widgets.js';script.async=true;script.referrerPolicy='strict-origin-when-cross-origin';script.dataset.qxX='official';
  const timer=setTimeout(()=>{reject(Error('embed_unavailable'));widgets=null;},12000);
  script.onload=()=>{clearTimeout(timer);if(globalThis.twttr?.widgets)resolve(globalThis.twttr.widgets);else{widgets=null;reject(Error('embed_unavailable'));}};
  script.onerror=()=>{clearTimeout(timer);widgets=null;reject(Error('embed_unavailable'));};document.head.append(script);
 });return widgets;
}
export function mountXEmbed(target,{url,kind='timeline',label='Official X',document:doc=globalThis.document}={}){
 const source=kind==='post'?xPost(url):xTimeline(url);if(!source)return {dispose(){}};
 let active=true,loading=false;const box=doc.createElement('div'),status=doc.createElement('p'),actions=doc.createElement('div'),button=doc.createElement('button'),link=doc.createElement('a'),frame=doc.createElement('div');
 box.className='qn-x';status.className='qn-muted';status.textContent='Load '+label+' from X. X may use cookies.';button.type='button';button.className='qn-button';button.textContent='Load '+(kind==='post'?'post':'timeline');link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';link.className='qn-link';link.textContent='View on X ↗';frame.className='qn-x-frame';actions.className='qn-x-actions';actions.append(button,link);box.append(status,actions,frame);target.append(box);
 const visible=()=>active&&box.isConnected&&!doc.hidden&&box.getClientRects().length>0&&box.getBoundingClientRect().top<innerHeight&&box.getBoundingClientRect().bottom>0;
 button.addEventListener('click',async()=>{if(loading||!visible())return;loading=true;button.disabled=true;status.textContent='Loading from X…';
  try{const api=await loadWidgets();if(!visible())return;frame.replaceChildren();const options={theme:doc.documentElement.dataset.theme==='light'?'light':'dark',dnt:true,chrome:'noheader nofooter noborders transparent',height:390};const out=kind==='post'?await api.createTweet(source.id,frame,{...options,conversation:'none'}):await api.createTimeline(source,frame,options);if(!active)return;status.textContent=out?'Content from X · View on X if posts are unavailable.':'X could not show this feed. Open it on X.';}
  catch{if(active)status.textContent='X could not load. Open it on X.';}finally{loading=false;if(active){button.disabled=false;button.textContent='Reload from X';}}
 });
 const pause=()=>{if(doc.hidden&&frame.childNodes.length){frame.replaceChildren();status.textContent='X paused while this page is hidden. Reload to view posts.';}};doc.addEventListener('visibilitychange',pause);
 return {dispose(){active=false;doc.removeEventListener('visibilitychange',pause);box.remove();}};
}
