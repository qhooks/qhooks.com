// QHooks home v3 ("the catch"). Presentation only: it draws what hangs from the lines.
// Data: one read of the launch feed per visit, as soon as the tab is visible (the same read the old snapshot made),
// and one read of the QHOOKS market when the Traders chapter comes near the screen. No interval, no hidden-tab polling.
// Token names and symbols come from the feed, so they only ever go in as text, never as markup.
import {LAUNCH_FEED_URL,launchTokens,readPublicJSON} from './qx-market-live.mjs';

const QH='0x20429af7ca3b0ce4d99edbaa0693f26c5df05195',QCHAIN='4663';
const doc=document,root=doc.documentElement,$=(s,r=doc)=>r.querySelector(s);
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
const el=(tag,cls,text)=>{const n=doc.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;};
const svg=(tag,attrs={})=>{const n=doc.createElementNS('http://www.w3.org/2000/svg',tag);for(const k in attrs)n.setAttribute(k,attrs[k]);return n;};
const hue=s=>{let h=7;for(const c of String(s))h=(h*31+c.charCodeAt(0))%360;return h;};
const usd=v=>v>=1e6?'$'+(v/1e6).toFixed(2)+'M':v>=1e3?'$'+(v/1e3).toFixed(v>=1e5?0:1)+'K':'$'+v.toFixed(v>=100?0:2);
const count=v=>v>=1e6?(v/1e6).toFixed(1)+'M':v>=1e3?(v/1e3).toFixed(1)+'K':String(Math.round(v));
const lower=v=>String(v||'').toLowerCase();

// Coins. A token with no image gets a minted letter coin; a missing profile image is remembered for the visit.
const missed=k=>{try{return sessionStorage.getItem('hv-noimg:'+k)==='1';}catch{return false;}};
const remember=k=>{try{sessionStorage.setItem('hv-noimg:'+k,'1');}catch{}};
function avatar(row){
 const a=el('span','hv-ava',String(row.symbol||'?').replace(/^\$/,'').slice(0,1).toUpperCase()||'?'),key=row.chainId+':'+lower(row.address);
 a.setAttribute('aria-hidden','true');a.style.setProperty('--h',hue(row.symbol+key));
 const profile=/^\d+$/.test(row.chainId)&&/^0x[0-9a-f]{40}$/.test(lower(row.address))&&!missed(key)?`/api/token-profiles/${row.chainId}/${lower(row.address)}/image`:null,src=row.logo||profile;
 if(src){const img=el('img');img.alt='';img.decoding='async';img.referrerPolicy='no-referrer';img.addEventListener('error',()=>{img.remove();if(!row.logo)remember(key);},{once:true});img.src=src;a.append(img);}
 return a;
}
const qcoin=()=>{const c=el('span','hv-coin hv-coin-q');c.setAttribute('aria-hidden','true');c.append(el('i'));return c;};

// Headline: his line, the last word turning through who it is for, then resting on "For the next generation."
{
 const title=$('.hv-title'),words=title?[...title.querySelectorAll('.hv-turn b')]:[];
 if(title&&words.length){
  const end=()=>{title.classList.add('is-ending');setTimeout(()=>title.classList.add('is-ended'),reduce?0:900);};
  if(reduce)end();
  else{
   let k=0;
   const step=()=>{const out=words[k];if(k===words.length-1)return end();out.className='out';k++;words[k].className='on';setTimeout(()=>{out.className='';},1200);setTimeout(step,2600);};
   const start=()=>setTimeout(step,2600);
   if(!doc.hidden)start();else doc.addEventListener('visibilitychange',function seen(){if(!doc.hidden){doc.removeEventListener('visibilitychange',seen);start();}});
  }
 }
}

// Sway only runs in the sections near the screen.
if('IntersectionObserver' in window){
 const near=new IntersectionObserver(es=>es.forEach(e=>e.target.classList.toggle('is-near',e.isIntersecting)),{rootMargin:'120px 0px'});
 doc.querySelectorAll('.hv-stage,.hv-line,.hv-band').forEach(s=>near.observe(s));
}else doc.querySelectorAll('.hv-stage,.hv-line,.hv-band').forEach(s=>s.classList.add('is-near'));
(doc.fonts?.ready||Promise.resolve()).then(()=>setTimeout(()=>root.classList.add('hv-go'),250));

let rows=[],raw=null,market=null;
const q=()=>rows.find(r=>lower(r.address)===QH)||null;
const summaryOf=address=>raw?.markets?.find(m=>lower(m?.token)===lower(address))?.summary||null;

// The QHOOKS price beside the hook, and in the Traders chapter.
function paintQ(){
 const row=q();
 doc.querySelectorAll('[data-hv-qp]').forEach(n=>{n.textContent=row?row.price:'';});
 doc.querySelectorAll('[data-hv-qc]').forEach(n=>{n.textContent=row?row.change:'';n.dataset.dir=String(row?row.direction:0);if(row)n.setAttribute('aria-label','24-hour change '+row.change);});
}

// Launches: clean tiles (rows on a phone), each opening its token in the terminal.
function drawLine(){
 const band=$('[data-hv-line]'),ul=band&&$('[data-hv-tiles]',band);if(!ul)return;
 const status=$('[data-hv-line-status]',band),list=rows.filter(r=>lower(r.address)!==QH).slice(0,5),n=list.length;
 if(status){status.hidden=!!n;if(!n)status.textContent='Refreshing market snapshot…';}
 ul.hidden=!n;if(!n)return;
 ul.replaceChildren(...list.map(r=>{
  const li=el('li','hv-tile'),a=el('a'),row=el('span','hv-row'),ch=el('span','hv-ch hv-num',r.change),s=summaryOf(r.address),t=Number(s?.trades24);
  a.href=r.href;if(r.name)a.title=r.name;
  ch.dataset.dir=String(r.direction);ch.setAttribute('aria-label','24-hour change '+r.change);
  row.append(el('small','hv-num',Number.isFinite(t)?t+(t===1?' trade':' trades'):''),ch);
  a.append(avatar(r),el('b','',r.symbol),el('span','hv-px hv-num',r.price),row);li.append(a);return li;
 }));
}

// Builders: your token, with launch blocks hanging from it.
function drawMobile(){
 const box=$('[data-hv-mobile]'),W=box?.clientWidth;if(!W)return;
 const small=W<420,cx=W/2,A=Math.min(236,W/2-58),top=small?26:96,d=small?84:124,armY=top+d+40;
 const tags=[['Anti-snipe','antiSnipe'],['Buyback and burn','buyback'],['Auto burn','autoBurn'],['Buy and sell tax','tax'],['King of the pool','king'],['Last buyer wins','clockPot']].slice(0,small?4:6);
 const lens=small?[30,104,54,140]:[44,138,72,184,108,40],armAt=x=>{const k=(x-(cx-A))/(2*A);return armY+12-2*k*(1-k)*24;};
 const s=svg('svg',{'aria-hidden':'true'});
 s.append(svg('path',{d:`M${cx} 0V${top}`}),svg('path',{d:`M${cx} ${top+d}V${armY-1}`}),svg('path',{d:`M${cx-A-14} ${armY+12}Q${cx} ${armY-12} ${cx+A+14} ${armY+12}`}));
 const yours=el('a','hv-yours');yours.href='/create';yours.append('Your',el('br'),'token');
 box.replaceChildren(s,yours,...tags.map(([label,id],i)=>{
  const x=cx-A+i*(2*A/(tags.length-1)),wrap=el('div','hv-mtag'),a=el('a');
  wrap.style.cssText=`left:${x.toFixed(1)}px;top:${armAt(x).toFixed(1)}px;--len:${lens[i]}px;--a:${(1.2+(i%3)*.5).toFixed(1)}deg;--t:${(2.6+lens[i]/80).toFixed(2)}s;--d:${(-i*.6).toFixed(1)}s`;
  a.href='/hooks#block-'+id;a.append(el('i'),el('span','',label));wrap.append(a);return wrap;
 }));
}

// Traders: the QHOOKS price as a line, the latest trades hanging from it (newest on the right).
function drawTrades(){
 const band=$('.hv-traders'),box=$('[data-hv-tline]');if(!box||!market)return;
 const W=box.clientWidth;if(!W)return;
 // On wide screens the line runs the full width, so it starts below the words: the line never crosses the text.
 const small=W<500,say=$('.hv-say',band),yTop=small?96:Math.max(250,Math.round(say.getBoundingClientRect().bottom-band.getBoundingClientRect().top)+48);
 band.style.minHeight=small?'':(yTop+310)+'px';
 const H=box.clientHeight;if(!H)return;
 const pts=market.pts,lo=Math.min(...pts),hi=Math.max(...pts),span=(hi-lo)||1;
 const endX=W-(small?44:118),yBot=H-(small?150:136);
 const X=i=>(i/(pts.length-1))*endX,Y=v=>yBot-((v-lo)/span)*(yBot-yTop);
 const yAt=x=>{const f=(x/endX)*(pts.length-1),i=Math.min(pts.length-2,Math.floor(f));return Y(pts[i]+(pts[i+1]-pts[i])*(f-i));};
 const s=svg('svg',{'aria-hidden':'true'});s.append(svg('path',{d:pts.map((v,i)=>(i?'L':'M')+X(i).toFixed(1)+' '+Y(v).toFixed(1)).join('')}));
 const tr=market.tr.slice(0,small?3:7).reverse(),mx=Math.max(1,...tr.map(t=>t.usd)),from=small?.22:.47,to=small?.84:.93;
 const tags=tr.map((t,i)=>{
  const x=(from+(to-from)*(tr.length>1?i/(tr.length-1):.5))*endX,y=yAt(x);
  let len=22+Math.sqrt(t.usd/mx)*(small?70:120)+(small&&i%2?34:0);len=Math.max(14,Math.min(len,H-y-52));
  const tag=el('div','hv-ttag '+(t.buy?'is-up':'is-down')),lab=el('span','',t.buy?'Buy ':'Sell ');
  tag.setAttribute('aria-hidden','true');lab.append(el('b','hv-num',usd(t.usd)));
  tag.style.cssText=`left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;--len:${len.toFixed(0)}px;--a:${(1+(i%3)*.4).toFixed(1)}deg;--t:${(2.4+len/90).toFixed(2)}s;--d:${(-i*.5).toFixed(1)}s`;
  tag.append(el('i'),lab);return tag;
 });
 const end=el('div','hv-tcoin');end.style.cssText=`left:${endX}px;top:${Y(pts[pts.length-1]).toFixed(1)}px`;end.append(qcoin());
 const read=el('div','hv-tread'),row=q(),price=el('b','hv-num',row?row.price:''),chg=el('em','hv-num',row?row.change:'');
 price.dataset.hvQp='';chg.dataset.hvQc='';chg.dataset.dir=String(row?row.direction:0);
 read.append(el('span','','QHOOKS'),price,chg);
 box.replaceChildren(s,...tags,end,read);
}
async function loadTrades(){
 const band=$('.hv-traders'),note=$('[data-hv-tnote]'),stop=new AbortController(),timer=setTimeout(()=>stop.abort(),9000);
 try{
  // The same address and timeframe the terminal asks for first, so visitors share the server's cache.
  const m=await readPublicJSON(`/api/terminal/market/${QCHAIN}/${QH}?tf=60`,{signal:stop.signal});
  const all=(Array.isArray(m?.candles)?m.candles:[]).filter(c=>Number.isFinite(Number(c?.close))&&Number(c.close)>0&&Number.isFinite(Number(c?.time)));
  const last=all.length?Number(all[all.length-1].time):0,day=all.filter(c=>Number(c.time)>last-86400),stepN=Math.max(1,Math.floor(day.length/96));
  const pts=day.filter((c,i)=>(day.length-1-i)%stepN===0).map(c=>Number(c.close));
  if(pts.length<8)throw Error('short');
  const tr=(Array.isArray(m?.trades)?m.trades:[]).map(t=>({buy:!!t?.buy,usd:Number(t?.valueUsd)})).filter(t=>Number.isFinite(t.usd)&&t.usd>=1).slice(0,7);
  market={pts,tr};if(note)note.hidden=true;band?.classList.remove('no-line');drawTrades();
 }catch{band?.classList.add('no-line');if(note)note.hidden=false;}
 finally{clearTimeout(timer);}
}

// Holders: QHOOKS supply as a ring (locked, burned), from the feed's own summary.
function drawRing(){
 const band=$('.hv-holders'),box=$('[data-hv-ring]'),s=summaryOf(QH);if(!box)return;
 const locked=Number(s?.locked),burned=Number(s?.burned),total=Number(s?.supply)+(Number.isFinite(burned)?burned:0);
 if(!s||!(total>0)||!Number.isFinite(locked)){if(raw||tries>1)band.classList.add('no-ring');return;}
 const r=150,C=2*Math.PI*r,lp=Math.min(1,Math.max(0,locked/total)),bp=Number.isFinite(burned)?Math.max(0,burned/total):0;
 const ring=el('div','hv-ring'),g=svg('svg',{viewBox:'0 0 330 330','aria-hidden':'true'});
 g.append(svg('circle',{class:'hv-ring-track',cx:165,cy:165,r}),svg('circle',{class:'hv-ring-lock',cx:165,cy:165,r,'stroke-dasharray':`${(lp*C).toFixed(1)} ${C.toFixed(1)}`}));
 if(bp>0)g.append(svg('circle',{class:'hv-ring-burn',cx:165,cy:165,r,'stroke-dasharray':`${Math.max(bp*C,3).toFixed(1)} ${C.toFixed(1)}`,'stroke-dashoffset':(-(lp*C+16)).toFixed(1)}));
 ring.append(g,qcoin());
 const leg=el('div','hv-rleg hv-num'),item=(c,big,text)=>{const d=el('div');d.style.setProperty('--c',c);d.append(el('b','',big),text);return d;};
 leg.append(item('var(--hv-gold)',Math.round(lp*100)+'%','of QHOOKS locked in QLocks'));
 if(bp>0)leg.append(item('#f08a4b',count(burned),'QHOOKS burned'));
 if(Number.isFinite(Number(s.holders)))leg.append(item('var(--hv-ink3)',String(Number(s.holders)),'holders'));
 box.replaceChildren(ring,leg);band.classList.remove('no-ring');
}

// One feed read per visit, once the tab is visible. If it fails, one more try a few seconds later, then it rests.
let started=false,tries=0;
async function load(){
 if(started||doc.hidden)return;started=true;tries++;
 try{raw=await readPublicJSON(LAUNCH_FEED_URL);rows=await launchTokens(raw,{limit:8});}
 catch{rows=[];if(tries<2)setTimeout(()=>{started=false;void load();},5000);}
 paintQ();drawLine();drawRing();if(market)drawTrades();
}
doc.addEventListener('visibilitychange',()=>{void load();});
drawMobile();drawLine();void load();

const traders=$('.hv-traders');
if(traders){
 if('IntersectionObserver' in window){const io=new IntersectionObserver(es=>{if(es.some(e=>e.isIntersecting)){io.disconnect();void loadTrades();}},{rootMargin:'400px 0px'});io.observe(traders);}
 else void loadTrades();
}

// Redraw the drawn parts when the width changes.
let lastW=innerWidth,raf=0;
addEventListener('resize',()=>{if(innerWidth===lastW||raf)return;raf=requestAnimationFrame(()=>{raf=0;lastW=innerWidth;drawMobile();drawLine();drawTrades();});});
