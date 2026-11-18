import {fetchRead} from './qx-community-retry.mjs';
import {xPost} from './qx-x-core.mjs';
import {node,empty,visibleTask} from './qx-news-ui.mjs';
import {iconFromBlob,blobFromDataUrl} from './qcaster-handoff.mjs';
import {prepareTokenBanner} from './qx-token-banner.mjs';
import {topicId,blockedTopicText,googleTopicPolicy} from './qx-news-policy.mjs';
export function trendReference(location=globalThis.location,store=globalThis.sessionStorage,now=Date.now()){
 const ref=new URL(location.href).searchParams.get('trend');if(!/^[a-f0-9-]{36}$/.test(ref||''))return null;
 try{const v=JSON.parse(store.getItem('qhooks:trend:'+ref)||'null');if(!v||v.version!==2||!topicId(v.topicId)||(v.topicId.startsWith('xpost:')&&(!xPost(v.sourcePost)||'xpost:'+xPost(v.sourcePost).id!==v.topicId))||(v.animalStory&&/^(google|xpost):/.test(v.topicId)?googleTopicPolicy(v.topic,v.animalHeadline||'').blocked:blockedTopicText(v.topic))||v.at>now||now-v.at>3600000||typeof v.name!=='string'||!v.name.trim()||v.name.length>32||/[<>\p{C}]/u.test(v.name)||!/^[A-Z0-9]{1,10}$/.test(v.ticker)||typeof v.description!=='string'||v.description.length>1000)return null;return {...v,ref};}catch{return null;}
}
const css=()=>{if(!document.querySelector('link[href="/qx-news.css"]'))document.head.append(node('link',{rel:'stylesheet',href:'/qx-news.css'}));};
export function openTrendDraft(initialTopic,{verifyTopic=null,title='Draft from this trend'}={}){
 let topic=initialTopic;
 css();const dialog=node('dialog',{class:'qn-draft-dialog','aria-label':'Draft an original launch'}),status=node('p',{role:'status','aria-live':'polite'},'QCaster is drafting an original idea and art…'),name=node('input',{maxlength:32,value:topic.name||topic.topic.slice(0,32)}),ticker=node('input',{maxlength:10,value:topic.ticker}),description=node('textarea',{maxlength:1000,rows:3},topic.description),preview=node('div',{class:'qn-draft-preview'}),close=node('button',{class:'qn-button',type:'button'},'Close'),go=node('button',{class:'qn-button',type:'button',disabled:true},'Review in Create →');
 const field=(text,input)=>node('label',{},text,input);dialog.append(node('h2',{},title),...(topic.theme?[node('p',{class:'qn-draft-theme'},topic.theme)]:[]),node('p',{},'QCaster draws original art. Review the name, ticker and description before continuing.'),field('Token name',name),field('Ticker',ticker),field('Description',description),preview,status,node('div',{class:'qn-draft-actions'},go,close));document.body.append(dialog);dialog.showModal();
 let image='',banner='',disposed=false,verifiedTopic=false;const controller=new AbortController();close.onclick=()=>dialog.close();dialog.addEventListener('close',()=>{disposed=true;controller.abort();dialog.remove();},{once:true});
 ticker.addEventListener('input',()=>{ticker.value=ticker.value.toUpperCase();});
 async function post(path,body){const r=await fetchRead('/api/qcaster/'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:controller.signal});const j=await r.json();if(!r.ok)throw Error(j.answer||'QCaster is unavailable.');return j;}
 go.onclick=()=>{if(!name.value.trim()||name.value.length>32||/[<>\p{C}]/u.test(name.value)||!/^[A-Z0-9]{1,10}$/.test(ticker.value)){status.textContent='Use a printable name and 1–10 letters or digits for the ticker.';return;}
  const ref=crypto.randomUUID();try{sessionStorage.setItem('qhooks:trend:'+ref,JSON.stringify({version:2,topicId:topic.id,topic:topic.topic,...(topic.sourcePost?{sourcePost:topic.sourcePost}:{}),...(topic.animalStory?{animalStory:true,animalHeadline:topic.news?.title||''}:{}),name:name.value.trim(),ticker:ticker.value,description:description.value.trim(),image,banner,at:Date.now()}));}catch{status.textContent='This browser could not save the draft. Enable storage and try again.';return;}location.assign('/create?trend='+ref);
 };
 void(async()=>{try{
  let checked;if(verifyTopic)checked={topic:await verifyTopic(topic,{signal:controller.signal})};else{const verified=await fetchRead('/api/news/topic?id='+encodeURIComponent(topic.id),{signal:controller.signal,cache:'no-store'});if(!verified.ok)throw Error('topic_unavailable');checked=await verified.json();}if(!checked.topic||checked.topic.id!==topic.id)throw Error('topic_unavailable');topic=checked.topic;verifiedTopic=true;
  const inspiration='a playful '+((topic.tags||[]).join(' / ')||'abstract')+' theme';
  const design=await post('design',{chainId:'4663',text:'An original community token sparked by '+inspiration+'. Give it an independent name and ticker, starting from '+topic.name+' / '+topic.ticker+'. Look: '+topic.look+'. Use abstract motifs without names, likenesses or allegations. No real people, brands, existing characters or news incidents.'});if(disposed)return;
  const art=design.plan?.art;if(art?.name&&String(art.name).length<=32&&!/[<>\p{C}]/u.test(art.name))name.value=art.name;if(/^[A-Z0-9]{1,10}$/.test(art?.ticker||''))ticker.value=art.ticker;
  if(design.limited||design.mode==='limit'||design.mode==='off'){status.textContent='QCaster has reached its limit. Continue with this idea and upload your own art in Create.';return;}
  const result=await post('art',{name:name.value,look:topic.look,which:['image','banner']});if(disposed)return;
  if(result.mode!=='model'){status.textContent=(result.answer||'Art is unavailable.')+' Continue with this idea and upload art in Create.';return;}
  if(result.image)image=await iconFromBlob(blobFromDataUrl(result.image));if(result.banner)banner=await prepareTokenBanner(blobFromDataUrl(result.banner));if(disposed)return;
  if(image)preview.append(node('img',{src:image,alt:'Original token image',width:72,height:72}));if(banner)preview.append(node('img',{src:banner,alt:'Original token banner',style:'max-width:240px;max-height:100px;object-fit:cover'}));status.textContent=image&&banner?'Your original image and banner are ready.':'Some art is unavailable. You can upload it in Create.';
 }catch(e){if(!disposed)status.textContent=verifiedTopic?'QCaster could not finish the art. Continue with the idea and upload art in Create.':'This topic is no longer available. Close this draft and refresh Trends.';}finally{if(!disposed)go.disabled=!verifiedTopic;}})();
}
const TAGS=new Set(['Viral','Celeb','Tech','Meme','Animal']);
function trendCard(t,i){
 const tags=[...new Set(t.tags||[])].filter(t=>TAGS.has(t)).slice(0,1),youtube=t.source==='YouTube';
 return node('article',{class:'qn-trend'+(t.news||youtube?' qn-trend-pop':''),'data-person':t.person?'true':'false'},
  node('div',{class:'qn-trend-tags'},...tags.map(tag=>node('span',{'data-tag':tag},tag))),
  node('span',{class:'qn-trend-code'},String(i+1).padStart(2,'0')+' / '+(t.geo||(youtube?'VIDEO':'DAILY VIEWS'))),
  node('h3',{},t.topic),node('p',{class:'qn-trend-traffic'},t.traffic?'Approx. '+t.traffic+' searches · '+t.geo:youtube?t.channel:t.reason),
  youtube?node('a',{class:'qn-link qn-youtube-credit',href:t.url,target:'_blank',rel:'noopener noreferrer'},node('img',{src:'/assets/youtube-source.svg',alt:'YouTube',width:29,height:20}),node('span',{},'Watch on YouTube ↗')):node('a',{class:'qn-link',href:t.url,target:'_blank',rel:'noopener noreferrer'},'Data source: '+t.source+' ↗'),
  ...(t.news?[node('a',{class:'qn-trend-story',href:t.news.url,target:'_blank',rel:'noopener noreferrer'},node('span',{},t.news.source),node('strong',{},t.news.title+' ↗'))]:[]),
  node('button',{type:'button',onClick:()=>openTrendDraft(t)},'Launch on this ↗'));
}
export function mountTrends(target,{autoLoad=true}={}){
 css();let poll=null,videoPoll=null,lastGood=null,expiry=null;const list=node('div',{class:'qn-trends','aria-label':'Trending topics; swipe to explore',tabindex:0}),note=node('p',{class:'qn-note',role:'status'}),videos=node('section',{class:'qn-youtube',hidden:true}),videoList=node('div',{class:'qn-trends','aria-label':'Recent animal and meme videos',tabindex:0}),videoNote=node('p',{class:'qn-note',role:'status'});videos.append(node('h3',{},'Recent animal & meme videos'),videoList,videoNote);target.append(list,note,videos);
 const acceptable=t=>topicId(t.id)&&!(t.id.startsWith('google:')?googleTopicPolicy(t.topic,t.news?.title||'',{adultVerified:t.adultVerified===true}).blocked:blockedTopicText(t.topic+' '+(t.news?.title||'')));
 function secondary(enabled){videos.hidden=!enabled;if(!enabled){videoPoll?.stop();videoPoll=null;videoList.replaceChildren();return;}if(!videoPoll)videoPoll=visibleTask(async signal=>{try{const r=await fetchRead('/api/news/youtube',{signal,cache:'no-store'});if(!r.ok)throw Error('video_unavailable');const data=await r.json(),items=(data.items||[]).filter(acceptable);videoList.replaceChildren(...items.map(trendCard));videoNote.textContent=items.length?'YouTube titles & channels · QHooks tags & launch drafts. Recent picks, not an official chart.':'No eligible videos right now.';}catch(e){if(e.name!=='AbortError')videoNote.textContent='Recent videos are refreshing.';}},900000);}
 const MAX_AGE=21600000,usable=s=>s&&Number.isFinite(s.at)&&s.at<=Date.now()+300000&&Date.now()-s.at<MAX_AGE;
 function refreshing(){clearTimeout(expiry);if(!usable(lastGood)){lastGood=null;list.replaceChildren(empty('Refreshing. No eligible trends to show yet.'));}else expiry=setTimeout(refreshing,Math.max(1,lastGood.at+MAX_AGE-Date.now()));note.textContent='Refreshing. '+(lastGood?'Showing the last good trends snapshot.':'Try again shortly.');}
 function update(data){const items=(data.items||[]).filter(acceptable),at=Number(data.asOf);if(items.length&&usable({at})){lastGood={items,at};list.replaceChildren(...items.map(trendCard));clearTimeout(expiry);expiry=setTimeout(refreshing,Math.max(1,at+MAX_AGE-Date.now()));note.textContent=(data.stale||data.refreshing?'Refreshing. ':'')+(data.note||'Source topics and linked headlines. Open the publisher for the story.');}else refreshing();secondary(data.secondary?.youtube===true);}
 const visibility=()=>{if(!document.hidden&&lastGood&&!usable(lastGood))refreshing();};document.addEventListener('visibilitychange',visibility);
 if(autoLoad)poll=visibleTask(async signal=>{try{const r=await fetchRead('/api/news/trends',{signal});if(r.ok)update(await r.json());else refreshing();}catch(e){if(e.name!=='AbortError')refreshing();}},900000);
 return {update,dispose(){poll?.stop();videoPoll?.stop();clearTimeout(expiry);document.removeEventListener('visibilitychange',visibility);}};
}
export function mountCreateTrends(){
 const main=document.getElementById('qa-main')||document.getElementById('main')||document.querySelector('main');if(!main)return;
 const section=node('details',{class:'qn-create-trending'},node('summary',{},'Trending → Launch · Find an idea'),node('p',{class:'qn-note'},'Original topics and art, drafted only when you tap.')),slot=node('div');section.append(slot);main.append(section);let control;section.addEventListener('toggle',()=>{if(section.open&&!control)control=mountTrends(slot);if(!section.open&&control){control.dispose();control=null;slot.replaceChildren();}});return section;
}
export function mountTrendDraftApply({target,getState,onApply}){
 const value=trendReference();if(!value)return;css();const box=node('section',{class:'qn-create-trending'}),button=node('button',{class:'qn-button',type:'button'},'Use this idea'),status=node('p',{role:'status'},'Your existing launch settings stay in place until you choose this idea.');box.append(node('h2',{},'From Trends: '+value.name),status,button);target.prepend(box);
 button.onclick=()=>{const state=getState();if(state.busy||state.record){status.textContent='Finish or close the active launch before using this idea.';return;}try{onApply(value);sessionStorage.removeItem('qhooks:trend:'+value.ref);box.remove();}catch{status.textContent='The saved idea could not be applied. Your draft is unchanged.';}};
}
