import {profileUrl} from './qx-profile-address.mjs';
import {clampInto} from '/qx-more-text.mjs';
import {COMMUNITY_CHAINS,communityTarget,communityKey,communityPath,callLinks} from './qx-community-intent.mjs';
import {communityFollowing,followingQuery,mountCommunityFollowButton} from './qx-community-follow.mjs';
import {firstCallPrompt,qualifiedCallers} from './qx-community-empty.mjs';
import {createMemberIdentityRenderer} from './qx-member-identity.mjs';
import {createMemberProfileClient} from './qx-member-profile.mjs';
const ENDPOINT='/api/community/activity',SEEN='qhooks:community-seen:v1',FOLLOW_EVENT='qhooks:community-following';
const cursorParts=value=>{const match=/^(\d{1,16})\.(p[0-9a-v]{12})$/.exec(value||'');return match?{at:Number(match[1]),id:match[2]}:null;};
// A launch's token also has a token board (t=chain:token); calls can sit on either, so a launch panel reads both.
export const boardKeys=board=>{const keys=[communityKey(board)];if(board?.kind==='launch'&&board.token)try{keys.push(communityKey({kind:'token',chainId:board.chainId,address:board.token}));}catch{}return[...new Set(keys)];};
export function activityQuery({view='recent',chain,board,caller,before,after,following=communityFollowing,limit=20}={}){
 const params=new URLSearchParams({view,limit:String(limit)});if(chain&&chain!=='all')params.set('chain',chain);if(board)params.set('board',boardKeys(board).join(','));if(caller)params.set('caller',caller.toLowerCase());if(before)params.set('before',before);if(after)params.set('after',after);
 if(view==='following'){const saved=followingQuery(following);if(saved.boards.length)params.set('boards',saved.boards.join(','));if(saved.callers.length)params.set('callers',saved.callers.join(','));}return params;
}
export function createCommunityActivityReader({fetcher=globalThis.fetch,now=Date.now,ttl=15000}={}){
 const cache=new Map();return{async read(params,{force=false,signal}={}){
  const key=params.toString(),cached=cache.get(key);if(!force&&cached&&cached.at<=now()&&now()<cached.at+ttl)return cached.body;
  const response=await fetcher(ENDPOINT+'?'+key,{cache:'no-store',signal}),body=await response.json().catch(()=>null);if(signal?.aborted)throw Object.assign(Error('Activity read cancelled.'),{name:'AbortError'});
  if(!response.ok||body?.kind!=='qhooks-community-activity'||!Array.isArray(body.calls)||!Array.isArray(body.callers))throw Error('Community activity is unavailable. Your follows and drafts are unchanged.');
  cache.set(key,{at:now(),body});if(cache.size>12)cache.delete(cache.keys().next().value);return body;
 }};
}
export function createCommunitySeen({storage=()=>localStorage,now=Date.now,ttl=30*86400000}={}){
 const rows=()=>{try{const saved=JSON.parse(storage().getItem(SEEN)||'[]');return Array.isArray(saved)?saved.filter(row=>typeof row.key==='string'&&row.key.length<200&&cursorParts(row.cursor)&&Number.isFinite(row.at)&&row.at<=now()+60000&&row.at>now()-ttl).slice(-32):[];}catch{return[];}};
 return{read:key=>rows().find(row=>row.key===key)?.cursor||null,save(key,cursor){if(!cursorParts(cursor))return;try{storage().setItem(SEEN,JSON.stringify([...rows().filter(row=>row.key!==key),{key,cursor,at:now()}].slice(-32)));}catch{}}};
}
export const newerThan=(call,cursor)=>{const previous=cursorParts(cursor);return!!previous&&(call.createdAt>previous.at||call.createdAt===previous.at&&call.id>previous.id);};
const labelFor=board=>board.symbol||board.name||((board.controller||board.address||'').slice(0,8)+'…');
const short=wallet=>wallet.slice(0,6)+'…'+wallet.slice(-4);
export function mountCommunityActivity(target,{board=null,caller=null,compact=false,initialView='recent',following=communityFollowing,fetcher=globalThis.fetch,document:doc=globalThis.document,events=globalThis.window,now=Date.now,pollMs=30000,reader=createCommunityActivityReader({fetcher,now}),seen=createCommunitySeen({now}),timers=globalThis}={}){
 // New calls on a launch go on its launch board (priced from the QHooks index, no outside provider); "Open board" shows
 // the token board, where earlier calls on the token were filed. The panel reads both.
 if(board)board={...board,...communityTarget(board)};const tokenBoard=board?.kind==='launch'&&board.token?{kind:'token',chainId:board.chainId,address:String(board.token).toLowerCase(),name:board.name,symbol:board.symbol}:null;
 const h=(tag,attrs={},...kids)=>{const node=doc.createElement(tag);for(const[key,value]of Object.entries(attrs)){if(value==null)continue;if(key==='class')node.className=value;else node.setAttribute(key,value);}node.append(...kids.flat().filter(value=>value!=null));return node;};
 const identities=createMemberIdentityRenderer({client:createMemberProfileClient({fetcher}),document:doc});
 let view=!compact&&initialView==='following'?'following':'recent',chain='all',body=null,pending=null,generation=0,controller=null,timer=null,disposed=false,copied='',ranked=null,followDisposers=[];
 const main=h('section',{class:'qcaf'+(compact?' qcaf-compact':''),'aria-label':compact?'Token conversation':'Community calls and following'}),toolbar=h('div',{class:'qcaf-toolbar'}),status=h('p',{class:'qcaf-status',role:'status','aria-live':'polite'}),feed=h('div',{class:'qcaf-feed'}),authors=h('aside',{class:'qcaf-callers'}),saved=h('div',{class:'qcaf-saved'}),more=h('button',{type:'button',class:'qcf-button'},'Older calls'),check=h('button',{type:'button',class:'qcf-button'},'Check now'),bar=h('div',{class:'qcaf-new',role:'status'}),show=h('button',{type:'button',class:'qcf-button'},'Show new calls');bar.hidden=true;bar.append(show);
 const heading=h(compact?'h3':'h2',{},compact?'Conversation':'Calls from the community');toolbar.append(heading);
 const tabs=[];if(!compact){for(const[value,label]of[['recent','Recent calls'],['following','Following']]){const button=h('button',{type:'button',class:'qcf-button','aria-pressed':String(view===value)},label);button.addEventListener('click',()=>selectView(value));tabs.push([value,button]);toolbar.append(button);}
  const select=h('select',{'aria-label':'Call chain'},h('option',{value:'all'},'All chains'),...COMMUNITY_CHAINS.map(([value,label])=>h('option',{value},label)));select.addEventListener('change',()=>{chain=select.value;body=null;refresh();});toolbar.append(select);
 }
 toolbar.append(check);main.append(toolbar,h('p',{class:'qcaf-note'},'Following is saved on this device. Updates are checked while this page is open; no push messages are enabled.'),bar,status,saved,h('div',{class:'qcaf-layout'},feed,authors),more);target.replaceChildren(main);
 let topicControl=null;if(board){const home=tokenBoard||board,context=h('div',{class:'qcaf-context'},h('a',{href:communityPath(home)},'Open board →'),h('a',{href:communityPath(board,{intent:true})},'Make a call →')),follow=h('span',{});context.append(follow);toolbar.after(context);topicControl=mountCommunityFollowButton(follow,{kind:'board',board,label:labelFor(board)},{store:following,document:doc,events});}
 const key=()=>[view,chain,board?communityKey(board):'',caller||''].join('|');
 const params=extra=>activityQuery({view,chain,board,caller,following,limit:compact?3:20,...extra});
 function selectView(value){if(compact||!['recent','following'].includes(value)||view===value)return;view=value;body=null;pending=null;bar.hidden=true;void refresh();}
 function cleanControls(){for(const dispose of followDisposers)dispose();followDisposers=[];}
 function followControl(host,subject){const control=mountCommunityFollowButton(host,subject,{store:following,document:doc,events});followDisposers.push(control.dispose);}
 function renderSaved(){saved.replaceChildren();if(view!=='following')return;const list=following.list();if(!list.length){saved.append(h('p',{},'Follow a token or caller to build your return feed. Those choices stay on this device.'));return;}
  saved.append(h('h3',{},'Following on this device'),...list.map(subject=>{const value=h('div',{class:'qcaf-saved-item'}),href=subject.kind==='caller'?profileUrl({wallet:subject.wallet,handle:subject.handle}):communityPath(subject.board),label=subject.label||(subject.kind==='caller'?short(subject.wallet):labelFor(subject.board)),control=h('span',{});value.append(h('a',{href},label),control);followControl(control,subject);return value;}));
 }
 function renderCalls(){
  cleanControls();renderSaved();feed.replaceChildren();authors.replaceChildren();for(const[value,button]of tabs)button.setAttribute('aria-pressed',String(value===view));
  if(!body?.calls.length){
   if(body?.nextCursor||view==='following')feed.append(h('p',{class:'qcaf-empty'},body?.nextCursor?'No readable calls in this batch. Use Older calls to continue.':'No recent calls match these follows. Open a saved board, or explore recent calls.'),h('a',{href:'/community#make-a-call'},'Make a call →'));
   else feed.append(firstCallPrompt(doc,{href:board?communityPath(board,{intent:true}):'/community#make-a-call',text:board?'No calls on this token yet. Put your thesis on record.':'No recent public calls yet. Choose a token and make the first call.'}));
   more.hidden=!body?.nextCursor;return;
  }
  const prior=seen.read(key()),newCount=body.calls.filter(call=>newerThan(call,prior)).length;
  if(prior&&newCount)status.textContent=newCount+' new '+(newCount===1?'call':'calls')+' in this view since you last opened it on this device.';
  for(const call of body.calls){let links;try{links=callLinks(call.board,call);}catch{continue;}const chainName=COMMUNITY_CHAINS.find(([id])=>id===call.board.chainId)?.[1]||call.board.chainId;
   const copy=h('button',{type:'button',class:'qcf-button'},'Copy call link'),follow=h('span',{}),text=clampInto(h('p',{class:'qcaf-thesis'}),call.text||''),record=h('article',{class:'qcaf-call'},h('div',{class:'qcaf-meta'},h('a',{href:links.path},labelFor(call.board)+' · '+chainName),h('time',{datetime:new Date(call.createdAt).toISOString()},new Date(call.createdAt).toLocaleString())),identities.mount(call.author,{className:'qcaf-author'}).element,text);
   if(call.folded){text.hidden=true;const reveal=h('button',{type:'button',class:'qcf-button','aria-expanded':'false'},call.folded==='reports'?'Reported call · show':'New wallet · show thesis');reveal.addEventListener('click',()=>{text.hidden=!text.hidden;reveal.setAttribute('aria-expanded',String(!text.hidden));});record.append(reveal);}
   if(Number.isFinite(call.call?.price))record.append(h('p',{class:'qcaf-entry'},'Recorded entry: '+Number(call.call.price).toLocaleString(undefined,{maximumSignificantDigits:6})+' '+(call.call.quoteSymbol||'')+' · open the call for updated checkpoints'));
   if(call.call?.labels?.includes('creator_call'))record.append(h('span',{class:'qcaf-label'},'Creator’s call'));
   if(call.call?.labels?.includes('linked'))record.append(h('span',{class:'qcaf-label'},'Linked to creator'));
   copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(links.permalink);copied='Call link copied.';}catch{copied='Copy this call link: '+links.permalink;}status.textContent=copied;});
   record.append(h('div',{class:'qcaf-actions'},h('a',{href:links.path},'Read call →'),h('a',{href:links.trade},'Trade this token →'),copy,follow));feed.append(record);followControl(follow,{kind:'board',board:call.board,label:labelFor(call.board)});
  }
  if(!compact){authors.append(h('h3',{},'Recent callers'),h('p',{class:'qcaf-note'},'Visible calls include people outside the qualified ranking. Counts below cover this view, not their whole history.'));
   for(const author of body.callers){const follow=h('span',{}),rank=ranked===null?'Ranking status unavailable':ranked.has(author.wallet)?'In the current qualified ranking':'Outside the current ranking',item=h('div',{class:'qcaf-caller'},identities.mount(author.wallet).element,h('p',{},author.callsInPage+' '+(author.callsInPage===1?'call':'calls')+' in this view · '+rank),follow);authors.append(item);followControl(follow,{kind:'caller',wallet:author.wallet});}
  }
  more.hidden=!body.nextCursor||body.calls.length>=80;seen.save(key(),body.latestCursor);
 }
 function schedule(){timers.clearTimeout(timer);if(!disposed&&!doc.hidden&&target.isConnected)timer=timers.setTimeout(()=>void checkNew(),pollMs);}
 async function request(extra={},force=true){controller?.abort();controller=new AbortController();const mine=++generation;const next=await reader.read(params(extra),{force,signal:controller.signal});return mine===generation&&!disposed&&!doc.hidden?next:null;}
 async function refresh(){
  if(disposed||doc.hidden||!target.isConnected)return;loadRanking();timers.clearTimeout(timer);status.textContent='Reading public call records…';check.disabled=true;
  try{const next=await request({},true);if(!next)return;body=next;pending=null;bar.hidden=true;status.textContent='Recent calls cover the last 30 days. Entry prices come from signed records; ranking rules are unchanged.';renderCalls();}catch(error){if(error.name!=='AbortError')status.textContent=error.message+' Use Check now to retry.';}finally{check.disabled=false;schedule();}
 }
 async function checkNew(){
  if(disposed||doc.hidden||!target.isConnected)return;loadRanking();
  try{const next=await request({},true);if(!next)return;if(!body){body=next;renderCalls();}else if(next.latestCursor!==body.latestCursor){pending=next;bar.hidden=false;show.textContent='New activity · show latest calls';}}catch(error){if(error.name!=='AbortError')status.textContent=error.message+' Use Check now to retry.';}finally{schedule();}
 }
 check.addEventListener('click',refresh);show.addEventListener('click',()=>{if(!pending)return;body=pending;pending=null;bar.hidden=true;status.textContent='Latest public calls loaded.';renderCalls();});
 more.addEventListener('click',async()=>{if(!body?.nextCursor)return;more.disabled=true;try{const next=await request({before:body.nextCursor});if(!next)return;const known=new Set(body.calls.map(call=>call.id)),calls=[...body.calls,...next.calls.filter(call=>!known.has(call.id))].slice(0,80),callers=new Map();for(const call of calls){const author=callers.get(call.author)||{wallet:call.author,callsInPage:0,lastCallAt:call.createdAt};author.callsInPage++;callers.set(call.author,author);}body={...next,calls,callers:[...callers.values()],latestCursor:body.latestCursor||next.latestCursor};renderCalls();}catch(error){status.textContent=error.message;}finally{more.disabled=false;schedule();}});
 const visibility=()=>{if(doc.hidden){controller?.abort();timers.clearTimeout(timer);generation++;}else void checkNew();},followingChanged=()=>{if(view==='following')void refresh();};doc.addEventListener('visibilitychange',visibility);events?.addEventListener?.(FOLLOW_EVENT,followingChanged);events?.addEventListener?.('storage',followingChanged);
 let rankingRequested=false;
 function loadRanking(){if(compact||doc.hidden||disposed||rankingRequested)return;rankingRequested=true;fetcher('/api/community/v2/callers',{cache:'no-store'}).then(async response=>{if(!response.ok)throw Error('ranking');const data=await response.json();if(!Array.isArray(data.callers)||data.coverage?.completeRecordSet!==true)throw Error('ranking');ranked=new Set(qualifiedCallers(data).map(row=>row.wallet));if(body&&!disposed&&!doc.hidden)renderCalls();}).catch(()=>{rankingRequested=false;});}

 Promise.resolve().then(()=>refresh());return{refresh,checkNew,selectView,dispose(){disposed=true;generation++;controller?.abort();timers.clearTimeout(timer);doc.removeEventListener?.('visibilitychange',visibility);events?.removeEventListener?.(FOLLOW_EVENT,followingChanged);events?.removeEventListener?.('storage',followingChanged);cleanControls();topicControl?.dispose();identities.dispose();},get state(){return{view,body,pending};}};
}
export function mountTokenConversation(target,board,options={}){return mountCommunityActivity(target,{...options,board,compact:true});}
