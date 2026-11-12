// QHooks profile v3: presentation only. The page's own scripts still read the data, draw the content and run every
// control (follow, edit, X sync, trading visibility). This file sets the page state, adds the profile address line,
// the proof strip and, on each call, the result since the call, the price checkpoints and the caller's own position.
// Everything it writes comes from the page's own endpoints and goes in as text, never as markup.
import {resolveProfileAddress,profileUrl} from './qx-profile-address.mjs';

const main=document.querySelector('main.pv3');
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;};
const pct=r=>{if(!Number.isFinite(r))return '';const v=r*100,a=Math.abs(v);return (v>0?'+':v<0?'−':'')+(a>=100?a.toFixed(0):a>=10?a.toFixed(1):a.toFixed(2))+'%';};
const tone=r=>!Number.isFinite(r)||r===0?'':r>0?'is-up':'is-down';
const SUB='₀₁₂₃₄₅₆₇₈₉';
const money=p=>{if(!(p>0))return '';if(p>=1)return '$'+p.toFixed(2);const z=Math.floor(-Math.log10(p));if(z<4)return '$'+p.toPrecision(4);return '$0.0'+String(z).split('').map(c=>SUB[+c]).join('')+String(Math.round(p*10**(z+4))).slice(0,4);};
const count=v=>!Number.isFinite(v)?'':v>=1e9?(v/1e9).toFixed(2)+'B':v>=1e6?(v/1e6).toFixed(2)+'M':v>=1e3?(v/1e3).toFixed(1)+'K':String(Math.round(v*100)/100);
const read=async url=>{const r=await fetch(url,{cache:'no-store',credentials:'omit'});if(!r.ok)throw Error('unavailable');return r.json();};
const cell=(big,label,cls)=>{const d=el('div'),b=el('b',cls||'',big);d.append(b,el('span','',label));return d;};

if(main)run().catch(()=>{main.dataset.pv3State='profile';});

async function run(){
 const bare=/^\/profile(?:\.html)?\/?$/.test(location.pathname)&&!location.hash;
 let who=null;try{who=await resolveProfileAddress(location);}catch{}
 if(!who||who.notFound||!who.wallet){
  main.dataset.pv3State=bare?'lookup':'notfound';
  if(!bare){const box=el('section','pv3-none'),h=el('h2','','No profile at qhooks.com/profile/'+String(who?.handle||'').slice(0,48));
   box.append(h,el('p','','Check the spelling, or look up a profile or wallet below.'));main.prepend(box);}
  return;
 }
 main.dataset.pv3State='profile';
 const wallet=who.wallet;

 // the profile's own address, and Copy trades beside Follow
 const addr=document.getElementById('qp-addr');
 if(addr&&who.handle&&!main.querySelector('.pv3-handle')){const a=el('a','pv3-handle','qhooks.com'+profileUrl(who));a.href=profileUrl(who);addr.before(a);}
 const title=document.getElementById('qp-title'),named=()=>title?.classList.toggle('is-addr',/^(0x[0-9a-f]{3,6}|[1-9A-HJ-NP-Za-km-z]{3,6})(…|\.\.\.)/i.test((title.querySelector('.qmp-profile-name')||title).textContent.trim()));
 if(title){named();new MutationObserver(named).observe(title,{childList:true,subtree:true,characterData:true});}
 // trades kept private: one plain line; the owner's sharing controls stay one tap away
 read('/api/traders/profile?wallet='+encodeURIComponent(wallet)).then(t=>{const box=document.getElementById('qp-trading');if(!box||t?.publicTrades!==false)return;box.classList.add('pv3-private');
  if(!box.querySelector('.pv3-mine')){const b=el('button','pv3-mine','This is my wallet: show sharing settings');b.type='button';b.addEventListener('click',()=>{box.classList.remove('pv3-private');b.remove();});box.append(b);}}).catch(()=>{});
 const qco=document.getElementById('qco-profile');
 const acts=()=>{if(!qco||qco.querySelector('.pv3-acts'))return;const follow=qco.querySelector('.qco-follow');if(!follow)return;
  const row=el('div','pv3-acts'),copy=el('a','pv3-copy','Copy trades');copy.href='/copy?w='+encodeURIComponent(wallet);follow.before(row);row.append(follow,copy);};
 acts();if(qco)new MutationObserver(acts).observe(qco,{childList:true});

 // the caller record: proof strip, then each call
 let rec=null;try{rec=await read('/api/community/v2/caller/'+encodeURIComponent(wallet));}catch{}
 const calls=Array.isArray(rec?.calls)?rec.calls.filter(c=>c&&c.kind==='call'&&c.call):[],byId=new Map(calls.map(c=>[String(c.id),c]));
 const move=c=>{const a=Number(c.call?.price),b=Number(c.call?.priceNow);return a>0&&b>0?b/a-1:NaN;};
 if(rec?.stats&&Number(rec.stats.calls)>0&&!main.querySelector('.pv3-proof')){
  const s=rec.stats,strip=el('div','pv3-proof'),counted=Number(s.counted)||0,hits=Number(s.hits)||0,best=Math.max(...calls.map(move).filter(Number.isFinite),-Infinity);
  strip.append(cell(String(s.calls),Number(s.calls)===1?'call on record':'calls on record'));
  strip.append(cell(counted>0?Math.round(hits/counted*100)+'%':'—',counted>0?`hit rate · ${counted} timed`:'hit rate · none timed yet'));
  const held=rec.heldCalls;if(held&&Number(held.total)>0)strip.append(cell(`${Number(held.held)} of ${Number(held.total)}`,'held what they called'));
  if(Number.isFinite(best))strip.append(cell(pct(best),'best call, to now',tone(best)));
  (document.getElementById('qp-trading')||document.getElementById('qp-root'))?.before(strip);
 }
 const dress=line=>{
  if(line.dataset.pv3)return;const link=line.querySelector('a[href^="/call/"]');if(!link)return;
  const c=byId.get(decodeURIComponent(link.getAttribute('href').slice(6)));if(!c)return;line.dataset.pv3='1';
  const k=c.call,entry=Number(k.price),now=Number(k.priceNow),head=line.querySelector('.qb-postline-head'),thesis=line.querySelector('.qb-call-thesis'),sym=String(c.board?.symbol||'').slice(0,16);
  const m=move(c);
  if(Number.isFinite(m)&&head){const res=el('div','pv3-res');res.append(el('b',tone(m),pct(m)),el('span','','since the call'));head.after(res);}
  if(entry>0){
   const row=el('div','pv3-chk'),step=(p,label)=>{const v=Number(p);return v>0?cell(pct(v/entry-1),label,tone(v/entry-1)):cell('pending',label);};
   row.append(cell(money(entry),'called at'),step(k.price1h,'1 hour'),step(k.price24h,'24 hours'),cell(now>0?money(now):'—','now'));
   (thesis||head)?.after(row);line.classList.add('has-chk');
  }
  // their own position, read from the chain; shown only when the record says it is complete
  const pos=c.position;
  if(pos&&pos.complete===true&&pos.source==='chain'){
   const dec=Number(pos.atCall?.decimals)||0,u=x=>{const v=Number(x);return Number.isFinite(v)?v/10**dec:NaN;},at=u(pos.atCall?.units),cur=u(pos.now?.units),sold=u(pos.soldSinceCall?.units),soldPct=Number(pos.soldSinceCall?.pctOfAtCall);
   const strip=el('div','pv3-pos');strip.append(el('h4','','Their own position, read from the chain'));
   strip.append(cell(count(at),'held at the call'),cell(count(cur),'holds now'),cell(count(sold),'sold since',sold>0?'is-down':''));
   const first=Number(pos.firstBuyAt),when=pos.firstBuyVsCall;
   strip.append(cell(when==='never'?'never':Number.isFinite(first)&&first>0?span(Math.abs(Number(k.at)-first)):'—',when==='before'?'bought before calling':when==='after'?'bought after calling':'first buy'));
   (line.querySelector('.pv3-chk')||thesis||head)?.after(strip);
   if(head){const chip=el('span','pv3-held'+(sold>0?' is-sold':''),!pos.heldAtCall?'Not holding at the call':sold>0?(Number.isFinite(soldPct)?`Sold ${Math.round(soldPct*100)}% since`:'Sold some since'):'Still holding');head.append(chip);}
  }else if(Array.isArray(c.badges)&&c.badges.includes('holder')&&head)head.append(el('span','pv3-held','Held it when they called'));
  const buy=line.querySelector('.qa-actions a[href*="/terminal"]');
  if(buy&&sym){buy.title=buy.textContent.trim();buy.textContent='Buy $'+sym;buy.classList.add('pv3-buy');}
 };
 const root=document.getElementById('qp-root');
 if(root){const all=()=>root.querySelectorAll('article.qb-callline').forEach(dress);all();new MutationObserver(all).observe(root,{childList:true,subtree:true});}
}
function span(ms){const s=ms/1000;return s<3600?Math.max(1,Math.round(s/60))+' min':s<86400?Math.round(s/3600)+' h':Math.round(s/86400)+' days';}
