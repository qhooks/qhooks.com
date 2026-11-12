// QHooks profile, System A: presentation only. The page's own scripts still read the data, draw the content and run every
// control (follow, edit, X sync, trading visibility, thanks). This file sets the page state and adds the person's banner
// (their own picture, blurred, as the room light), the verified X badge, the record strip, one Follow beside Copy trades,
// the Calls / Trades / Holdings / Launches / Boards tabs and, on each call, the result since the call and the caller's own
// position (only when the chain record is complete). Everything it writes is text from the page's own endpoints.
import {resolveProfileAddress,profileUrl} from './qx-profile-address.mjs';
import {ambient,setArt,tabs,xBadge,h,fmt,RM} from '/qx-a/components.mjs';
import {laneShell,QHOOKS_ART,person,outcome,checkpoints,positionBars,holdingTag,moveOf,readMarkets,livePrice} from '/qx-a/pages/community-common.mjs';

const main=document.querySelector('main.pv3');
const shell=laneShell({active:'community',mode:'detail',title:'Profile',back:'/community'});
document.body.prepend(ambient());setArt({blur:QHOOKS_ART.blur});
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;};
const read=async url=>{const r=await fetch(url,{cache:'no-store',credentials:'omit'});if(!r.ok)throw Error('refreshing');return r.json();};
const cell=(big,label,cls)=>h('div',null,h('b',{class:cls||''},big),h('span',null,label));
// the early paint (qx-profile-early.js): its caller read is taken once here, and this device's copy of the strip and the
// call rows (text only) is kept for the next visit's instant paint
const earlyRead=url=>{const e=globalThis.__qxProfileEarly;return e&&e.url===url?e.body.then(b=>b?structuredClone(b):read(url)):read(url);};
const dropEarly=()=>document.querySelectorAll('main.pv3 [data-qp-early]').forEach(n=>n.remove());
const SAVED='qx.profile.v1';
function remember(keys,value){try{const all=JSON.parse(localStorage.getItem(SAVED)||'{}');for(const k of keys)if(k)all[k]={...value,at:Date.now()};
 const keep=Object.entries(all).sort((a,b)=>(b[1]?.at||0)-(a[1]?.at||0)).slice(0,12);localStorage.setItem(SAVED,JSON.stringify(Object.fromEntries(keep)));}catch{}}

if(main)run().catch(()=>{main.dataset.pv3State='profile';});

async function run(){
 const bare=/^\/profile(?:\.html)?\/?$/.test(location.pathname)&&!location.hash;
 let who=null;try{who=await resolveProfileAddress(location);}catch{}
 if(!who||who.notFound||!who.wallet){
  dropEarly();main.dataset.pv3State=bare?'lookup':'notfound';shell.setTitle('Profiles');
  if(!bare){const box=el('section','pv3-none'),t=el('h2','','No profile at qhooks.com/profile/'+String(who?.handle||'').slice(0,48));
   box.append(t,el('p','','Check the spelling, or look up a profile or wallet below.'));main.prepend(box);}
  return;
 }
 main.dataset.pv3State='profile';
 const wallet=who.wallet;
 void readMarkets();

 // banner: the person's own picture, blurred, lights the top of their page (the wallet's colours until it loads)
 const hero=document.querySelector('.qp-hero'),banner=h('div',{class:'pv-banner','aria-hidden':'true'},h('div',{class:'pv-banner__art'}),h('span',{class:'qa-stage__sheen'}));
 main.prepend(banner);
 const avatar=document.getElementById('qp-avatar');
 const paintBanner=()=>{const img=avatar?.querySelector('img');const src=img?.getAttribute('src');const art=banner.firstChild;
  if(src){art.style.setProperty('background-image',`url("${new URL(src,location.href).href}")`);art.classList.add('has-pic');setArt({blur:new URL(src,location.href).href});}
  else{const bg=avatar?.style.background||avatar?.style.backgroundImage;if(bg){art.style.setProperty('background',bg);art.classList.remove('has-pic');}}};
 if(avatar){paintBanner();new MutationObserver(paintBanner).observe(avatar,{childList:true,attributes:true,attributeFilter:['style']});}

 // the profile's own address
 const addr=document.getElementById('qp-addr');
 if(addr&&who.handle&&!main.querySelector('.pv3-handle')){const a=el('a','pv3-handle','qhooks.com'+profileUrl(who));a.href=profileUrl(who);addr.before(a);}
 const title=document.getElementById('qp-title');
 // the name, its verified X badge, and the short title in the phone header
 let xHandle=null;
 const named=()=>{
  if(!title)return;const nameNode=title.querySelector('.qmp-profile-name')||title;const text=nameNode.textContent.trim();
  title.classList.toggle('is-addr',/^(0x[0-9a-f]{3,6}|[1-9A-HJ-NP-Za-km-z]{3,6})(…|\.\.\.)/i.test(text));
  if(text)shell.setTitle(text);
  if(xHandle&&!title.querySelector('.pv-x')){const a=h('a',{class:'pv-x',href:'https://x.com/'+encodeURIComponent(xHandle),target:'_blank',rel:'noopener noreferrer nofollow ugc',title:'Verified X account @'+xHandle},xBadge('@'+xHandle));title.append(a);}
 };
 if(title){named();new MutationObserver(named).observe(title,{childList:true,subtree:true,characterData:true});}
 person(wallet).then(p=>{xHandle=p.x||null;named();});

 // trades kept private: one plain line; the owner's sharing controls stay one tap away
 read('/api/traders/profile?wallet='+encodeURIComponent(wallet)).then(t=>{const box=document.getElementById('qp-trading');if(!box||t?.publicTrades!==false)return;box.classList.add('pv3-private');
  if(!box.querySelector('.pv3-mine')){const b=el('button','pv3-mine','This is my wallet: show sharing settings');b.type='button';b.addEventListener('click',()=>{box.classList.remove('pv3-private');b.remove();});box.append(b);}}).catch(()=>{});

 // ONE Follow (the signed follow, the one server list) beside Copy trades
 const qco=document.getElementById('qco-profile');
 const acts=()=>{if(!qco||qco.querySelector('.pv3-acts'))return;const follow=qco.querySelector('.qco-follow');if(!follow)return;
  follow.classList.add('qa-btn--primary');
  const row=el('div','pv3-acts'),copy=el('a','pv3-copy qa-btn qa-btn--secondary','Copy trades');copy.href='/copy?w='+encodeURIComponent(wallet);follow.before(row);row.append(follow,copy);};
 acts();if(qco)new MutationObserver(acts).observe(qco,{childList:true});

 // the caller record: the strip, then the tabs, then each call
 let rec=null;try{rec=await earlyRead('/api/community/v2/caller/'+encodeURIComponent(wallet));}catch{}
 const calls=Array.isArray(rec?.calls)?rec.calls.filter(c=>c&&c.kind==='call'&&c.call):[],byId=new Map(calls.map(c=>[String(c.id),c]));
 const move=c=>moveOf(Number(c.call?.price),Number(livePrice(c.board,c.call?.quoteSymbol)??c.call?.priceNow));
 const anchor=document.getElementById('qp-trading')||document.getElementById('qp-root');
 main.querySelectorAll('.pv3-proof[data-qp-early]').forEach(n=>n.remove());
 if(rec?.stats&&Number(rec.stats.calls)>0&&!main.querySelector('.pv3-proof')){
  const s=rec.stats,counted=Number(s.counted)||0,hits=Number(s.hits)||0,moves=calls.map(move).filter(Number.isFinite),best=moves.length?Math.max(...moves):NaN;
  const strip=h('div',{class:'qa-record pv3-proof','aria-label':'Caller record'});
  strip.append(cell(String(s.calls),Number(s.calls)===1?'call on record':'calls on record'));
  let held=rec.heldCalls;if(!held)try{held=(await read('/api/callouts/profile/'+encodeURIComponent(wallet)))?.heldCalls;}catch{}
  if(held&&Number(held.total)>0)strip.append(cell(`${Number(held.held)} of ${Number(held.total)}`,'held what they called','qa-up'));
  strip.append(cell(counted>0?Math.round(hits/counted*100)+'%':'—',counted>0?`hit rate · ${counted} timed`:'hit rate · none timed yet'));
  // the best call shows only when it is up; a record with no call above its entry says so instead of a red number
  if(Number.isFinite(best)&&best>1)strip.append(cell(best>=2?fmt.mult(best):fmt.pct(best-1),'best call, to now','qa-up'));
  else if(moves.length)strip.append(cell('—','No winning call yet'));
  anchor?.before(strip);
  const nameText=(title?.textContent||'').trim(),named=nameText&&!title?.classList.contains('is-addr')?nameText.slice(0,48):'';
  const cells=[...strip.children].map(d=>{const b=d.querySelector('b');return[b?.textContent||'',d.querySelector('span')?.textContent||'',b?.classList.contains('qa-up')?'up':b?.classList.contains('qa-down')?'down':''];});
  const rows=calls.slice(0,8).map(c=>{const m=move(c);return{id:String(c.id),sym:String(c.board?.symbol||'').slice(0,16),text:String(c.text||'').slice(0,160),
   move:Number.isFinite(m)?(m>=2?fmt.mult(m):fmt.pct(m-1))+' since the call':'',dir:Number.isFinite(m)?(m>1?'up':m<1?'down':''):''};});
  remember([wallet,who.handle?'@'+who.handle:null],{name:named,cells,calls:rows});
 }else if(rec)remember([wallet,who.handle?'@'+who.handle:null],{name:'',cells:[],calls:[]});

 // tabs: Calls / Trades / Holdings / Launches / Boards over the sections the page already draws
 const root=document.getElementById('qp-root'),trading=document.getElementById('qp-trading');
 const TABS=[['calls','Calls'],['trades','Trades'],['holdings','Holdings'],['launches','Launches'],['boards','Boards']];
 let active=['calls','trades','holdings','launches','boards'].includes(location.hash.slice(1))?location.hash.slice(1):'calls';
 const bar=tabs(TABS.map(([id,label])=>({id,label})),{active,label:'Profile sections',onChange:id=>{active=id;apply();}});
 bar.el.classList.add('pv-tabs');anchor?.before(bar.el);
 const kindOf=sec=>{const id=sec.getAttribute('aria-labelledby')||'',t=(sec.querySelector('h2')?.textContent||'').trim();
  if(id==='qp-calls-h'||t==='Calls')return'calls';if(id==='qp-hold-h'||/^(Shared )?holdings$/i.test(t))return'holdings';if(id==='qp-launches-h'||t==='Launches')return'launches';
  if(id==='qp-posts-h'||id==='qp-badges-h'||t==='Recent posts'||t==='Badges')return'boards';return null;};
 const badges=h('div',{class:'pv-badges',id:'pv-badges'});document.getElementById('qp-member-identity')?.after(badges);
 function apply(){
  if(trading)trading.toggleAttribute('data-pv-off',active!=='trades');
  const counts={calls:calls.length||null,launches:0,boards:0,holdings:0};
  for(const sec of root?.children||[]){const k=kindOf(sec);if(!k)continue;sec.dataset.pvTab=k;sec.toggleAttribute('data-pv-off',k!==active);
   if(k==='launches')counts.launches+=sec.querySelectorAll('.qa-launch').length;if(k==='boards')counts.boards+=sec.querySelectorAll('.qb-postline').length;if(k==='holdings')counts.holdings+=sec.querySelectorAll('.qa-tr:not(.qa-th)').length;
   // badges are facts about the person: they move under the name
   const set=sec.querySelector('.qb-badgeset');if(set&&sec.getAttribute('aria-labelledby')==='qp-badges-h'){badges.replaceChildren(...set.childNodes);sec.dataset.pvMoved='1';}
   if(sec.dataset.pvMoved)sec.toggleAttribute('data-pv-off',true);
  }
  bar.el.querySelectorAll('.qa-tab').forEach(b=>{const n=counts[b.dataset.id];let c=b.querySelector('.qa-tab__n');if(n){if(!c){c=h('span',{class:'qa-tab__n'});b.append(c);}c.textContent=String(n);}else c?.remove();});
  bar.place();
 }
 if(root){apply();new MutationObserver(()=>{apply();root.querySelectorAll('article.qb-callline').forEach(dress);}).observe(root,{childList:true});}

 const dress=line=>{
  if(line.dataset.pv3)return;const link=line.querySelector('a[href^="/call/"]');if(!link)return;
  const c=byId.get(decodeURIComponent(link.getAttribute('href').slice(6)));if(!c)return;line.dataset.pv3='1';
  const k=c.call,head=line.querySelector('.qb-postline-head'),thesis=line.querySelector('.qb-call-thesis'),sym=String(c.board?.symbol||'').slice(0,16);
  const out=outcome(k,{live:livePrice(c.board,k.quoteSymbol)});
  const media=[out,checkpoints(k),positionBars(c.position,k.at||c.createdAt)].filter(Boolean);
  const box=h('div',{class:'pv-call-media'},media);
  (thesis||head)?.after(box);line.classList.add('has-chk');
  const tag=holdingTag(c.position)||(Array.isArray(c.badges)&&c.badges.includes('holder')?h('span',{class:'qa-tag qa-tag--new'},'Held it when they called'):null);
  if(head&&tag)head.append(tag);
  const buy=line.querySelector('.qa-actions a[href*="/terminal"]');
  if(buy&&sym){buy.title=buy.textContent.trim();buy.textContent='Buy $'+sym;buy.classList.add('pv3-buy');}
 };
 if(root)root.querySelectorAll('article.qb-callline').forEach(dress);
}
