import {profileUrl,resolveProfileAddress} from './qx-profile-address.mjs';
// Callouts on the site: "Call it" in the terminal, Follow on profiles, the callout inbox in My QHooks and
// the callout points board on Community. Mounts itself on whichever of those pages loads it.
import {clampInto} from '/qx-more-text.mjs';
import {boardSession,authHeaders,signIn,sessionWallet} from '/qx-board-session.mjs';
import {publishCommunityCall} from '/qx-community-intent.mjs';
import {connectedAddress,onWalletChange,signMessage} from '/qx-chain.mjs';
import {communityFollowing} from '/qx-community-follow.mjs';
import {memberIdentity} from './qx-member-identity.mjs';
import {captureCallRef,sendCallRefs} from './qx-call-ref.mjs';

const ADDRESS=/^0x[0-9a-fA-F]{40}$/;
const short=w=>w.slice(0,6)+'…'+w.slice(-4);
const num=n=>Number(n||0).toLocaleString('en-US');
export function h(tag,attrs={},...kids){const el=document.createElement(tag);for(const [k,v]of Object.entries(attrs||{})){if(v==null||v===false)continue;if(k==='class')el.className=v;else if(k.startsWith('on'))el.addEventListener(k.slice(2),v);else el.setAttribute(k,v===true?'':v);}for(const kid of kids.flat())if(kid!=null&&kid!==false)el.append(kid.nodeType?kid:String(kid));return el;}
export function ago(at,now=Date.now()){const s=Math.max(0,Math.round((now-at)/1000));if(s<60)return'just now';const m=Math.round(s/60);if(m<60)return m+' min ago';const hr=Math.round(m/60);if(hr<24)return hr+' h ago';return Math.round(hr/24)+' d ago';}
const ERR={sign_in:'Sign in again to continue.',call_open:'You already called this in the past 7 days.',call_limit:'Five calls a day. Try again tomorrow.',no_price:'This token needs a recent trade before you can call it.',
 gate:'This board asks for a minimum holding.',slow_down:'Slow down a little and try again.',follow_limit:'You follow 500 people. Unfollow someone first.',own_wallet:'That’s your own wallet.',blocked:'This wallet can’t post here.'};
export const errorText=e=>ERR[e?.code||e?.message]||(/user rejected|denied|cancel/i.test(e?.message||'')?'Signature cancelled.':e?.message&&e.message.length<120?e.message:'Something went wrong. Try again.');
async function call(path,{method='GET',body,base='/api/callouts'}={}){
 const r=await fetch(base+path,{method,cache:'no-store',headers:{...(body?{'content-type':'application/json'}:{}),...authHeaders()},...(body?{body:JSON.stringify(body)}:{})});
 const j=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(Error(j.message||j.error||'failed'),{code:j.error,status:r.status});return j;
}
const communityApi=(path,{method='GET',auth,body}={})=>call(path,{method,body,base:'/api/community'});
// The wallet comes from the site's wallet hub (System A pages have no connection line). No wallet: open the wallet
// dialog. A sign-in that doesn't open a session is an error, never a silent follow request without auth.
const viewerWallet=()=>sessionWallet()||connectedAddress();
async function ensureSession(status){if(boardSession())return true;if(!viewerWallet()){try{dispatchEvent(new Event('qa:wallet'));}catch{}throw Object.assign(Error('Connect your wallet to follow. The wallet window is open.'),{code:'connect'});}status?.('Sign in with a free signature. No transaction.');try{await signIn();}catch(e){throw Object.assign(Error(/user rejected|denied|cancel/i.test(e?.message||'')?'Signature cancelled. Nothing was saved.':'Sign-in failed: '+(e?.message||'try again')+'. Nothing was saved.'),{code:'sign_in_failed'});}if(!boardSession())throw Object.assign(Error('Sign-in did not finish. Nothing was saved. Try again.'),{code:'sign_in_failed'});return true;}

// ---------- Terminal: Call it ----------
export function boardFromHash(hash=location.hash){const m=/(?:^#|&)([mt])=(\d{1,6}):(0x[0-9a-fA-F]{40})/.exec(hash||'');if(!m)return null;return m[1]==='m'?{kind:'launch',chainId:m[2],controller:m[3].toLowerCase()}:{kind:'token',chainId:m[2],address:m[3].toLowerCase()};}
const boardParam=b=>(b.kind==='launch'?'m=':'t=')+b.chainId+':'+(b.controller||b.address);
function mountTerminal(anchor){
 const button=h('button',{type:'button',id:'qco-call',class:'qxt-addr qco-call',hidden:true,title:'Tell your followers you’re backing this token'},'📣 Call it');
 const note=h('span',{class:'qco-note',role:'status','aria-live':'polite'});
 anchor.after(button,note);let state=null,serial=0;
 const wantCall=new URLSearchParams(location.search).get('callit')==='1';
 async function refresh(){
  const id=++serial,board=boardFromHash(),wallet=connectedAddress();state=null;
  if(!board){button.hidden=true;note.textContent='';return;}
  if(!wallet){button.hidden=!wantCall;button.disabled=false;button.textContent='📣 Call it';note.textContent=wantCall?'Connect your wallet to call this token.':'';return;}
  try{const r=await call('/can-call?board='+boardParam(board)+'&wallet='+wallet);if(id!==serial)return;state={board,wallet,...r};
   if(r.openCall){button.hidden=false;button.disabled=true;button.textContent='Called ✓';note.textContent='';return;}
   button.hidden=!r.holds;button.disabled=false;button.textContent='📣 Call it';
   note.textContent=!r.holds&&wantCall?'Calls are for tokens you hold. Buy first, then call it.':'';
   if(r.holds&&wantCall){button.classList.add('is-asked');button.scrollIntoView({block:'nearest'});}
  }catch{if(id===serial){button.hidden=true;}}
 }
 button.addEventListener('click',async()=>{
  const wallet=connectedAddress();if(!wallet){document.querySelector('[data-qa-connect],#qt-connect,.qhc-open')?.click();note.textContent='Connect your wallet first.';return;}
  if(!state||state.wallet!==wallet){await refresh();if(!state?.canCall)return;}
  button.disabled=true;const board=state.board,sym=state.symbol?'$'+state.symbol:'this token';
  try{
   await ensureSession(t=>note.textContent=t);
   const post=await publishCommunityCall({board:{...board,token:state.token},thesis:'Calling '+sym+'.',wallet,api:communityApi,signMessage:t=>signMessage(t),
    status:t=>note.textContent=t,current:()=>connectedAddress()===wallet&&boardParam(boardFromHash()||{})===boardParam(board)});
   button.textContent='Called ✓';note.replaceChildren('Called. Your followers are told. ',h('a',{href:'/board#'+boardParam(board)+'&post='+post.id},'Add your reasons on the board'));
  }catch(e){button.disabled=false;note.textContent=errorText(e);}
 });
 addEventListener('hashchange',refresh);onWalletChange(refresh);refresh();setTimeout(refresh,1500);
}

// ---------- Profile: Follow + counts ----------
export function mountFollow(target,wallet,{onChange}={}){
 const counts=h('span',{class:'qco-counts'}),button=h('button',{type:'button',class:'qa-btn qco-follow','aria-pressed':'false'},'Follow'),msg=h('span',{class:'qco-note',role:'status','aria-live':'polite'});
 target.replaceChildren(counts,button,msg);let data=null;
 const render=()=>{if(!data)return;counts.replaceChildren(h('b',{},num(data.followers)),data.followers===1?' follower':' followers',' · ',h('b',{},num(data.following)),' following',...(data.points?.total?[' · ',h('b',{},num(data.points.total)),' callout points']:[]));
  const own=data.viewer&&data.viewer===wallet||viewerWallet()===wallet;button.hidden=own;button.textContent=data.viewerFollows?'Following':'Follow';button.setAttribute('aria-pressed',String(!!data.viewerFollows));};
 async function load(){try{data=await call('/profile/'+wallet);render();}catch{counts.textContent='Refreshing…';}}
 button.addEventListener('click',async()=>{
  button.disabled=true;msg.textContent='';msg.classList.remove('qco-note--err');
  try{await ensureSession(t=>msg.textContent=t);const on=!data?.viewerFollows,r=await call('/follow',{method:'POST',base:'/api/wallets',body:{kind:'caller',wallet,on}});
   data={...data,...r,viewerFollows:r.following};await communityFollowing.refresh().catch(()=>{});render();msg.textContent=r.following?'You’ll see their calls in My QHooks and in @qhooks_bot.':'';onChange?.(r);await load();
  }catch(e){msg.textContent=['connect','sign_in_failed'].includes(e?.code)?e.message:'Follow did not save: '+errorText(e);msg.classList.add('qco-note--err');}finally{button.disabled=false;}
 });
 const changed=()=>{if(target.isConnected)void load();};globalThis.addEventListener?.('qhooks:community-following',changed);load();return{reload:load,dispose(){globalThis.removeEventListener?.('qhooks:community-following',changed);}};
}
function mountProfile(anchor){
 const box=h('div',{class:'qco-profile',id:'qco-profile',hidden:true});anchor.after(box);let current=null,revision=0;
 const update=async()=>{const mine=++revision;let w=null;try{const value=await resolveProfileAddress(location,{readWalletHandle:false});if(/^0x[0-9a-f]{40}$/.test(value.wallet||''))w=value.wallet;}catch{}if(mine!==revision||w===current)return;current=w;box.hidden=!w;box.replaceChildren();if(w)mountFollow(box,w);};
 addEventListener('hashchange',update);addEventListener('popstate',update);addEventListener('qhooks:profile-address',update);void update();
}

// ---------- My QHooks: callout inbox ----------
function mountInbox(before){
 const list=h('div',{class:'qco-inbox'}),status=h('p',{class:'qa-status',role:'status','aria-live':'polite'}),actions=h('div',{class:'qa-actions'});
 const section=h('section',{id:'qa-callouts',class:'qa-section qco-section','aria-labelledby':'qa-callouts-h'},
  h('div',{class:'qa-section-head'},h('h2',{id:'qa-callouts-h'},'Callouts'),h('p',{},'When someone you follow calls a token they hold, it shows up here and in @qhooks_bot.')),actions,status,list);
 before.before(section);
 document.querySelector('.qa-account-nav')?.prepend(h('a',{href:'#qa-callouts'},'Callouts'));
 async function load(){
  actions.replaceChildren();list.replaceChildren();
  if(!connectedAddress()){status.textContent='Connect your wallet to see callouts from people you follow.';return;}
  if(!boardSession()){status.textContent='';actions.append(h('button',{type:'button',class:'qa-btn qa-btn-primary',onclick:async e=>{e.target.disabled=true;try{await signIn();await load();}catch(err){status.textContent=errorText(err);e.target.disabled=false;}}},'Sign in to see callouts'));status.textContent='One free signature. No transaction.';return;}
  status.textContent='Refreshing…';
  try{
   const [inbox,me]=await Promise.all([call('/inbox'),call('/profile/'+connectedAddress())]);
   status.textContent=(me.following?'You follow '+num(me.following)+(me.following===1?' caller':' callers'):'You don’t follow anyone yet.')+' · '+num(me.followers)+(me.followers===1?' follower':' followers')+(me.points?.total?' · '+num(me.points.total)+' callout points':'');
   if(inbox.unread)actions.append(h('button',{type:'button',class:'qa-btn',onclick:async()=>{await call('/inbox/read',{method:'POST',body:{}});load();}},'Mark '+inbox.unread+' as read'));
   actions.append(h('a',{class:'qa-btn',href:'/community#callout-points'},'Callout points'));
   if(!inbox.items.length){list.append(h('p',{class:'qco-empty'},'No callouts yet. Find callers on ',h('a',{href:'/community#callers'},'Community'),' and tap Follow on their profile.'));return;}
   for(const it of inbox.items)list.append(h('article',{class:'qco-item'+(it.read?'':' is-unread')},
    h('div',{class:'qco-item-head'},h('a',{class:'qco-sym',href:it.links.terminal},it.board.symbol?'$'+it.board.symbol:'Token'),h('span',{},' called by '),h('a',{href:profileUrl({wallet:it.caller,handle:it.handle})},short(it.caller)),h('time',{datetime:new Date(it.at).toISOString()},ago(it.at))),
    clampInto(h('p',{class:'qco-text'}),it.text||''),h('div',{class:'qco-item-links'},h('a',{class:'qa-btn qa-btn-primary',href:it.links.terminal},'Open'),h('a',{class:'qa-btn',href:it.links.board},'Board'))));
  }catch{status.textContent='Refreshing…';setTimeout(load,15000);}
 }
 onWalletChange(load);load();setTimeout(load,1500);
}

// ---------- Community: callout points ----------
const dayString=offset=>new Date(Date.now()-offset*86400000).toISOString().slice(0,10);
const LABEL={diamond:'Diamond',still_holds:'Still holds',small_cap:'Small cap'};
// The holder bonus goes to wallets the flywheel counts as holders (isHolder), so its threshold is holderMin on chain.
function mountBoard(after){
 const body=h('div',{class:'qco-board'}),tabs=h('div',{class:'qco-tabs',role:'tablist','aria-label':'Choose a day'});
 const section=h('section',{class:'cx-sec',id:'callout-points','aria-labelledby':'cx-callout-points'},
  h('div',{class:'cx-sec-head'},h('h2',{id:'cx-callout-points',class:'cx-h2'},'Callout points.'),
   h('p',{},'Call a token you hold. When people buy it because of your call within 24 hours, you get points from what they made, marked at the next day’s close. Each day 10% of terminal fees is shared by points.')),
  tabs,body,h('details',{class:'qco-rules'},h('summary',{},'How points work'),h('ul',{},
   h('li',{},'1 point = 1 cent made by people who bought because of the call, after the adjustments below. Losing calls score zero.'),
   h('li',{},'They count when they bought through the call’s Buy button or link while signed in, or followed you at least a day before buying. Wallets must be at least a week old on QHooks and put in at least $10.'),
   h('li',{},'Your own wallets, wallets you funded, and calls on your own launch never count. Your own gain is not points.'),
   h('li',{},'Your first 3 calls a day count fully; later calls count less.'),
   h('li',{},'Small-cap calls count less. Diamond calls (market cap over $1M) count 1.5×, over $10M count 2×.'),
   h('li',{},'Still holding the token you called when the day is scored: 1.25×. Points are capped at 100,000 per caller per day.'),
   h('li',{},h('a',{href:'/callouts/how'},'The full method')))));
 after.after(section);
 const days=[['Today',0],['Yesterday',1],['2 days ago',2],['3 days ago',3]];let active=1;
 async function load(){
  tabs.replaceChildren(...days.map(([label,o],i)=>h('button',{type:'button',role:'tab','aria-selected':String(i===active),class:'qco-tab',onclick:()=>{active=i;load();}},label)));
  body.replaceChildren(h('p',{class:'qco-empty'},'Refreshing…'));
  try{
   const r=await call('/leaderboard?day='+dayString(days[active][1]));
   const settle=new Date(r.window.callsTo+86400000).toUTCString().slice(5,11);
   const head=h('p',{class:'qco-day'},'Calls made '+r.day+(r.status==='final'?' · Final':' · Live · settles '+settle+', 00:00 UTC'));
   if(!r.callers.length){body.replaceChildren(head,h('p',{class:'qco-empty'},'No points yet for this day. Points appear once followers buy a called token.'));return;}
   const table=h('table',{class:'qco-table'},h('thead',{},h('tr',{},h('th',{},'#'),h('th',{},'Caller'),h('th',{class:'n'},'Points'),h('th',{class:'n'},'Share of the day’s pool'),h('th',{class:'n'},'Buyers counted'),h('th',{class:'n'},'Calls'))),
    h('tbody',{},...r.callers.map((c,i)=>{const who=memberIdentity(c.wallet);
     return h('tr',{},h('td',{},String(i+1)),h('td',{},who,...c.labels.filter(l=>LABEL[l]).map(l=>h('span',{class:'qco-tag'},LABEL[l]))),h('td',{class:'n'},num(c.points)),h('td',{class:'n'},c.poolShare>0?(Math.round(c.poolShare*1000)/10)+'%':'—'),h('td',{class:'n'},num(c.followersCounted)),h('td',{class:'n'},num(c.calls)));})));
   body.replaceChildren(head,h('div',{class:'qco-table-wrap'},table));
  }catch{body.replaceChildren(h('p',{class:'qco-empty'},'Refreshing…'));setTimeout(load,15000);}
 }
 load();
}

function watchCallRefs(doc){
 try{captureCallRef(location);}catch{}
 const send=()=>{sendCallRefs({headers:authHeaders,wallet:sessionWallet}).catch(()=>{});};
 setTimeout(send,1500);doc.addEventListener('qhooks:traded',()=>setTimeout(send,500));
 try{onWalletChange(()=>setTimeout(send,1500));}catch{}
 addEventListener('storage',e=>{if(e.key==='qhooks:board-session:v1')send();});
}

export function mountCallouts(doc=document){
 watchCallRefs(doc);
 const share=doc.getElementById('qxt-share');if(share)mountTerminal(share);
 const identity=doc.getElementById('qp-member-identity');if(identity)mountProfile(identity);
 const root=doc.getElementById('qa-root');if(root&&doc.getElementById('qa-rewards'))mountInbox(root);
 const callers=doc.getElementById('callers');if(callers&&doc.querySelector('.cx-sec'))mountBoard(callers);
}
if(typeof document!=='undefined'&&!globalThis.__QCO_NO_AUTO__){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>mountCallouts());else mountCallouts();}
