// Community hub (/community), System A. Feed first: calls read like posts with their result, callers' records up front,
// boards as live rooms. Every read is an existing public endpoint; every write is an existing flow (picker, follow store,
// thanks, reactions, rankings, callout points). Nothing moves unless a real event moved it.
import {mountCommunityPicker,COMMUNITY_CHAINS,communityPath} from '/qx-community-intent.mjs';
import {createCommunityActivityReader,activityQuery,createCommunitySeen,newerThan} from '/qx-community-activity.mjs';
import {communityFollowing,mountCommunityFollowButton} from '/qx-community-follow.mjs';
import {mountCallerRankings} from './qx-community-empty.mjs';
import {boardUrl} from './qx-board-address.mjs';
import {ambient,setArt,sectionHead,tabs,state,skeletonRows,toast,avatar,inView} from '/qx-a/components.mjs';
import {h,fmt,RM,laneShell,QHOOKS_ART,face,nameTag,callPost,hydrateReactions,readMarkets,onMarkets,tokenMark,tickAges,visiblePoll,person,viewer,onWallet,moveOf} from '/qx-a/pages/community-common.mjs';

const $=id=>document.getElementById(id);
laneShell({active:'community'});
document.body.prepend(ambient());setArt({blur:QHOOKS_ART.blur});

/* ---------- make a call: the composer row opens the token picker ---------- */
const picker=$('cx-token-picker');if(picker)mountCommunityPicker(picker);
const compose=$('cx-compose'),wrap=$('cx-picker-wrap');
function openPicker(focus=true){if(!wrap)return;wrap.hidden=false;compose?.setAttribute('aria-expanded','true');if(focus)requestAnimationFrame(()=>$('cx-token-picker-query')?.focus({preventScroll:true}));}
compose?.addEventListener('click',()=>{if(wrap.hidden)openPicker();else{wrap.hidden=true;compose.setAttribute('aria-expanded','false');}});
document.querySelectorAll('[data-cx-compose]').forEach(a=>a.addEventListener('click',()=>openPicker(false)));
const me=$('cx-me');
const paintMe=()=>{if(!me)return;const w=viewer();me.replaceChildren(w?face(w,'md',{link:false}):avatar('', 'md'));};paintMe();onWallet(paintMe);
if(location.hash==='#make-a-call')openPicker(false);

/* ---------- the feed ---------- */
const feed=$('cx-community-activity'),note=$('cx-feed-note'),more=$('cx-more'),counts=$('cx-counts'),faces=$('cx-faces'),callersBox=$('cx-callers-now');
const reader=createCommunityActivityReader(),seen=createCommunitySeen();
let view=location.hash==='#following'?'following':'recent',chain='all',body=null,serial=0;
const cards=new Map();
const viewTabs=tabs([{id:'recent',label:'Recent'},{id:'following',label:'Following'}],{active:view,label:'Calls',onChange:id=>selectView(id)});
const chainSel=h('select',{class:'qa-select cx-chain','aria-label':'Call chain'},h('option',{value:'all'},'All chains'),...COMMUNITY_CHAINS.map(([v,l])=>h('option',{value:v},l)));
chainSel.addEventListener('change',()=>{chain=chainSel.value;body=null;void load();});
$('cx-feed-bar')?.append(viewTabs.el,chainSel);
function selectView(id){if(view===id)return;view=id;viewTabs.set(id);body=null;void load();}
addEventListener('hashchange',()=>{if(location.hash==='#following')selectView('following');else if(location.hash==='#recent-calls')selectView('recent');});
const key=()=>[view,chain,'',''].join('|');

// The first Recent read was started in <head> by qx-community-early.mjs; take it once.
const valid=b=>b?.kind==='qhooks-community-activity'&&Array.isArray(b.calls)&&Array.isArray(b.callers);
async function early(extra){const e=globalThis.__qxActivityEarly;if(!e||view!=='recent'||chain!=='all'||Object.keys(extra).length||Date.now()-e.at>20000)return null;globalThis.__qxActivityEarly=null;const b=await e.body;return valid(b)?b:null;}
async function read(extra={}){if(view==='following')await communityFollowing.refresh?.().catch(()=>{});return(await early(extra))||reader.read(activityQuery({view,chain,limit:20,...extra}),{force:true});}
// The last Recent page this device saw paints at once (no animation) while the fresh read runs; prices are USD from the
// server, so nothing waits for the market feed. Stored for 10 min; never for Following.
const SAVED='qx.community.recent.v1';
const savedBody=()=>{try{const v=JSON.parse(localStorage.getItem(SAVED)||'null');return v&&Date.now()-v.at<600000&&valid(v.body)?v.body:null;}catch{return null;}};
const saveBody=b=>{try{if(view==='recent'&&chain==='all')localStorage.setItem(SAVED,JSON.stringify({at:Date.now(),body:b}));}catch{}};
async function load(){
  const mine=++serial;note.textContent='';more.hidden=true;
  const saved=view==='recent'&&chain==='all'?savedBody():null;
  if(saved){body=saved;render({animate:false});}else feed.replaceChildren(skeletonRows(3));
  try{const next=await read();if(mine!==serial)return;body=next;render({animate:!saved});saveBody(next);}
  catch(e){if(mine!==serial||saved)return;feed.replaceChildren(state('loading',{title:'Refreshing',body:e.message||'Calls are refreshing. Your follows and drafts are unchanged.',action:'Check now',onAction:()=>void load()}));}
}
function render({animate=true}={}){
  cards.clear();feed.replaceChildren();
  const calls=body?.calls||[];
  if(!calls.length){
    if(view==='following')feed.append(state('empty',{title:'Follow callers to fill this feed',body:communityFollowing.list().length?'No recent calls match these follows yet.':'Sign in and follow a token or caller to build your return feed.',action:'See recent calls',onAction:()=>selectView('recent')}));
    else feed.append(state('empty',{title:'No calls yet',body:'Choose a token and make the first call. It goes on your public record.',action:'Make a call',onAction:()=>{openPicker();$('make-a-call')?.scrollIntoView({block:'start'});}}));
  }
  const prior=seen.read(key()),fresh=prior?calls.filter(c=>newerThan(c,prior)).length:0;
  if(fresh)note.textContent=fresh+' new '+(fresh===1?'call':'calls')+' since you last looked on this device.';
  calls.forEach((c,i)=>{const el=callPost(c,{enter:animate&&!RM&&i<6});if(el.classList.contains('is-enter'))el.style.setProperty('animation-delay',(i*70)+'ms');cards.set(c.id,el);feed.append(el);});
  void hydrateReactions([...cards.values()]);
  more.hidden=!body?.nextCursor||calls.length>=80;
  seen.save(key(),body?.latestCursor);
  paintPeople();
}
more?.addEventListener('click',async()=>{if(!body?.nextCursor)return;more.disabled=true;
  try{const next=await read({before:body.nextCursor});const known=new Set(body.calls.map(c=>c.id)),add=next.calls.filter(c=>!known.has(c.id));body={...next,calls:[...body.calls,...add],callers:mergeCallers(body.callers,next.callers),latestCursor:body.latestCursor||next.latestCursor};
    const els=add.map(c=>{const el=callPost(c);cards.set(c.id,el);feed.append(el);return el;});void hydrateReactions(els);more.hidden=!body.nextCursor||body.calls.length>=80;paintPeople();}
  catch(e){note.textContent=e.message;}finally{more.disabled=false;}});
function mergeCallers(a=[],b=[]){const m=new Map(a.map(c=>[c.wallet,c]));for(const c of b)if(!m.has(c.wallet))m.set(c.wallet,c);return[...m.values()];}

// New calls drop in at the top with a gold flash; a toast says who called what.
async function poll(){
  if(!body)return;
  const next=await read();if(!next||next.latestCursor===body.latestCursor)return;
  const known=new Set(body.calls.map(c=>c.id)),add=next.calls.filter(c=>!known.has(c.id));
  body={...next,calls:[...add,...body.calls].slice(0,80),callers:mergeCallers(next.callers,body.callers)};
  if(feed.querySelector('.qa-state'))feed.replaceChildren();
  const els=add.reverse().map(c=>{const el=callPost(c,{enter:true});cards.set(c.id,el);feed.prepend(el);return el;});
  void hydrateReactions(els);
  for(const c of add.slice(0,2))person(c.author).then(p=>toast({kind:'call',ava:face(c.author,'',{link:false}),title:'New call',body:(p.name||fmt.short(c.author))+' called '+(c.board?.symbol?'$'+c.board.symbol:'a token'),tag:'Live'}));
  seen.save(key(),body.latestCursor);paintPeople();
}

/* ---------- live prices: a trade that moves a called token updates its result ---------- */
onMarkets(()=>{for(const el of cards.values())el.refresh(true);paintPeople();});
readMarkets().then(()=>{for(const el of cards.values())el.refresh(false);});
visiblePoll(async()=>{await readMarkets(true);},20000);
visiblePoll(poll,30000);
tickAges(document);

/* ---------- people: faces in the hero, callers with their records in the rail ---------- */
const followers=[];
function paintPeople(){
  const calls=body?.calls||[],callers=body?.callers||[];
  counts.textContent='Community · '+calls.length+(body?.hasMore?'+':'')+' '+(calls.length===1?'call':'calls')+' · '+callers.length+' '+(callers.length===1?'caller':'callers')+(boardCount!=null?' · '+boardCount+' '+(boardCount===1?'board':'boards'):'');
  const kf=$('cx-kicker-faces');if(kf)kf.replaceChildren(...(callers.length?[h('span',{class:'qa-ava-stack'},callers.slice(0,4).map(c=>face(c.wallet,'',{link:false})))]:[]));
  if(faces){faces.hidden=!callers.length;faces.replaceChildren(h('span',{class:'qa-ava-stack'},callers.slice(0,6).map(c=>face(c.wallet,'md'))),h('span',{class:'cx-faces__t'},callers.length===1?'1 caller on record':callers.length+' callers on record'));}
  if(!callersBox)return;
  for(const f of followers.splice(0))f.dispose?.();
  if(!callers.length){callersBox.replaceChildren(h('p',{class:'cx-quiet'},'Callers show here with their record once they call.'));return;}
  const best=new Map();for(const c of calls){const m=moveOf(Number(c.call?.price),Number(c.call?.priceNow));if(Number.isFinite(m)&&(!best.has(c.author)||m>best.get(c.author)))best.set(c.author,m);}
  callersBox.replaceChildren(...callers.slice(0,8).map(c=>{
    const held=c.heldCalls&&Number(c.heldCalls.total)>0?Number(c.heldCalls.held)+' of '+Number(c.heldCalls.total)+' held what they called':null;
    const m=best.get(c.wallet),follow=h('span',{class:'cx-follow'});
    const row=h('div',{class:'qa-caller qa-caller--row cx-caller'},face(c.wallet,'lg'),
      h('div',{class:'cx-caller__main'},h('div',{class:'qa-caller__name'},nameTag(c.wallet,{cls:'cx-caller__n'})),
        h('div',{class:'qa-caller__sub'},h('span',null,c.callsInPage+' '+(c.callsInPage===1?'call':'calls')),held?h('span',{class:'cx-held'},held):null)),
      h('div',{class:'cx-caller__end'},Number.isFinite(m)?h('span',{class:'cx-caller__x '+(m>=1?'qa-up':'qa-down'),title:'Best call in view, since the call'},m>=2?fmt.mult(m):fmt.pct(m-1)):null,follow));
    followers.push(mountCommunityFollowButton(follow,{kind:'caller',wallet:c.wallet},{noun:''}));
    return row;
  }));
}

/* ---------- boards: each a live room for its token ---------- */
let boardCount=null;
const boardsBox=$('cx-board-list');
if(boardsBox){
  const kinds=[['launch','QHooks launches'],['token','All tokens']],cache=new Map();
  const bar=tabs(kinds.map(([id,label])=>({id,label})),{active:'launch',label:'Boards',onChange:id=>show(id)});
  const list=h('div',{class:'qa-list cx-boards','aria-live':'polite'});
  boardsBox.replaceWith(h('div',{id:'cx-board-list'},bar.el,list));
  fetch('/api/community/boards',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(j=>{if(Array.isArray(j?.boards)){boardCount=j.boards.length;paintPeople();}}).catch(()=>{});
  async function show(kind){
    if(!cache.has(kind))cache.set(kind,fetch('/api/community/boards?kind='+kind,{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null));
    list.replaceChildren(skeletonRows(2));
    const j=await cache.get(kind);await readMarkets();
    if(!Array.isArray(j?.boards)){list.replaceChildren(state('loading',{title:'Refreshing',body:'The boards did not answer.',action:'Try again',onAction:()=>{cache.delete(kind);show(kind);}}));return;}
    if(!j.boards.length){list.replaceChildren(h('p',{class:'cx-quiet'},kind==='launch'?'No QHooks launch board has posts yet.':'No token board has posts yet.'));return;}
    list.replaceChildren(...j.boards.slice(0,6).map(boardRow));
  }
  show('launch');
}
function boardRow(b){
  const fresh=b.lastPostAt&&Date.now()-b.lastPostAt<3600000;
  const age=b.lastPostAt?h('time',{datetime:new Date(b.lastPostAt).toISOString()},fmt.age((Date.now()-b.lastPostAt)/1000)):null;if(age)age.dataset.ts=b.lastPostAt;
  return h('a',{class:'qa-row cx-board-row',href:boardUrl(b)},tokenMark(b,b.logo,40),
    h('span',{class:'qa-row__main'},h('span',{class:'qa-row__t'},b.name||b.symbol,' ',h('span',{class:'cx-sym'},'$'+b.symbol)),
      h('span',{class:'qa-row__s'},[chainLabel(b.chainId),b.kind==='token'?'Token board':'QHooks launch',b.gate?'Holders post':null].filter(Boolean).join(' · '))),
    h('span',{class:'qa-row__v'},fmt.tok(b.posts)+' '+(b.posts===1?'post':'posts'),h('small',{class:fresh?'qa-up':'qa-muted'},fresh?'Live now':age?['latest ',age]:'')));
}
const chainLabel=id=>COMMUNITY_CHAINS.find(([c])=>c===String(id))?.[1]||(String(id)==='99901'?'Elysium':'Chain '+id);

/* ---------- ranking (fills itself at 5 timed calls) and the changelog link ---------- */
const callers=$('cx-caller-list'),rankNote=$('cx-ranking-note');
if(callers&&rankNote){const rankings=mountCallerRankings(callers,rankNote);addEventListener('pagehide',()=>rankings.dispose(),{once:true});}
const changelog=$('cx-changelog');
if(changelog)fetch('/changelog',{method:'HEAD',cache:'no-store'}).then(r=>{if(r.ok)changelog.hidden=false;}).catch(()=>{});

void load();
// Links to /community#boards, #callers or #make-a-call land on the section once it has filled in.
if(/^#(boards|callers|make-a-call|callout-points|qx-traders)$/.test(location.hash))addEventListener('load',()=>setTimeout(()=>document.querySelector(location.hash)?.scrollIntoView({block:'start'}),600));
