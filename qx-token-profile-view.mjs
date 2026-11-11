// Public creator-supplied token identity on the trading page. Never changes a trade ticket.
import {tokenProfilePresentation,needsCreatorArtwork} from './qx-token-profile-presentation.mjs';
import {getWalletHub} from './wallet-hub-fresh.mjs';
import {chainById} from './chains.mjs';
import {mountGetListed} from './qx-get-listed.mjs';
const head=document.getElementById('qxt-head');let revision=0;
const h=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
// Profiles change rarely: one read per market per 5 minutes, and a 404 (not listed) is kept for 10 minutes, so the
// market poll's qhooks:pool events don't re-ask every few seconds (2026-11-10).
const seen=new Map();
let current=null,creatorRevision=0;
const hub=getWalletHub(window);
async function creatorCard(){
  const turn=++creatorRevision;document.getElementById('qxt-finish-token')?.remove();
  const c=hub.snapshot().current,b=current?.body;if(!c||!b||b.chainId==='solana'||b.profile?.image&&b.profile?.banner)return;
  let creator=b.creator;
  if(!creator)try{
    const r=await fetch(chainById(b.chainId).rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_call',params:[{to:b.controller,data:'0xb387ef92'},'latest']})});const j=await r.json();
    if(r.ok&&/^0x0{24}[a-fA-F0-9]{40}$/.test(j.result||''))creator='0x'+j.result.slice(-40);
  }catch{return;}
  if(turn!==creatorRevision||hub.snapshot().current!==c||!needsCreatorArtwork(b.profile,creator,c.owner))return;
  const card=h('aside');card.id='qxt-finish-token';card.className='qtp-publish';card.append(h('strong','Finish your token: add its icon and banner'));
  const a=h('a','Add icon and banner →');a.href='/token-profile?m='+b.chainId+':'+b.controller;card.append(a);current.section.append(card);
}
async function read(key){const c=seen.get(key);if(c&&Date.now()-c.at<(c.status===404?600000:300000))return c;const r=await fetch('/api/token-profiles/'+key,{cache:'no-store',signal:AbortSignal.timeout(10000)});const v={at:Date.now(),status:r.status,body:r.ok?await r.json():null};if(r.ok||r.status===404)seen.set(key,v);return v;}
async function load(){
  const turn=++revision;
  const match=/^#(?:m|t)=(\d+|solana):([A-Za-z0-9]+)$/.exec(location.hash);if(!head||!match){current=null;creatorRevision++;document.getElementById('qxt-token-profile')?.remove();return;}
  const address=match[1]==='solana'?match[2]:match[2].toLowerCase(),key=match[1]+':'+address;
  let section=document.getElementById('qxt-token-profile');
  if(section?.dataset.key===key&&current?.body)return;
  if(section?.dataset.key!==key){section?.remove();section=h('section');section.id='qxt-token-profile';section.dataset.key=key;section.className='qxt-token-profile';section.setAttribute('aria-label','Token artwork and community links');
    const reserve=h('img');reserve.width=1500;reserve.height=500;reserve.alt='';reserve.style.visibility='hidden';section.append(reserve);head.after(section);current=null;}
  try{
    const got=await read(match[1]+'/'+address);if(turn!==revision)return;const body=got.body;
    if(!body){section.remove();return;}
    const {profile:value,banner}=tokenProfilePresentation(body);section.replaceChildren();
    if(banner){const img=h('img');img.width=1500;img.height=500;img.src=banner;img.alt=body.name+' banner';section.append(img);}
    const identity=h('div');identity.className='qxt-profile-identity';if(value.image){const img=h('img');img.src=value.image;img.alt=body.name+' profile picture';identity.append(img);}identity.append(h('strong',body.name));section.append(identity);
    if(value.description)section.append(h('p',value.description));
    const links=h('div');links.className='qxt-profile-links';for(const [key,label]of [['website','Website'],['x','X'],['discord','Discord'],['telegram','Telegram']]){if(value.links[key]){const a=h('a',label+' ↗');a.href=value.links[key];a.target='_blank';a.rel='ugc noopener noreferrer';links.append(a);}}
    section.append(links);const pool=window.__qhooksPool,panel=mountGetListed({chainId:body.chainId,token:body.token,pool:String(pool?.chainId)===match[1]&&pool?.controller===address?pool.poolId:null,profile:value});if(panel)section.append(panel);current={body,section};void creatorCard();
  }catch{if(turn===revision)section.remove();}
}
if(head){addEventListener('hashchange',load);document.addEventListener('qhooks:pool',load);hub.subscribe(()=>void creatorCard());void load();}
