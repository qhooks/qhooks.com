// Public creator-supplied token identity on the trading page. Never changes a trade ticket.
import {tokenProfilePresentation,needsCreatorArtwork} from './qx-token-profile-presentation.mjs';
import {getWalletHub} from './wallet-hub-fresh.mjs';
import {chainById} from './chains.mjs';
import {mountGetListed} from './qx-get-listed.mjs';
import {shown} from './qx-shown.mjs';
const head=document.getElementById('qxt-head');let revision=0;
const h=(tag,text)=>{const e=document.createElement(tag);const t=shown(text);if(t)e.textContent=t;return e;}; // walletpos: never the text "null"
// Profiles change rarely: one read per market per 5 minutes, and a 404 (not listed) is kept for 10 minutes, so the
// market poll's qhooks:pool events don't re-ask every few seconds (2026-11-10).
const seen=new Map();
let current=null,creatorRevision=0;
const hub=getWalletHub(window);
// newcomerA (2026-11-12): the "Get your logo into wallets" form is for the token's creator only. Creator identity is
// the one this card already used: the profile's creator, else the launch controller's creator() (selector 0xb387ef92),
// compared with the connected wallet. Read once per token; anyone else sees the token's links without the form.
const creators=new Map();
async function creatorOf(b){
  const key=b.chainId+':'+b.controller;if(b.creator)return b.creator;if(creators.has(key))return creators.get(key);
  let creator=null;
  try{
    const r=await fetch(chainById(b.chainId).rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_call',params:[{to:b.controller,data:'0xb387ef92'},'latest']})});const j=await r.json();
    if(r.ok&&/^0x0{24}[a-fA-F0-9]{40}$/.test(j.result||''))creator='0x'+j.result.slice(-40);
    creators.set(key,creator);
  }catch{}
  return creator;
}
async function creatorCard(){
  const turn=++creatorRevision;document.getElementById('qxt-finish-token')?.remove();current?.listing?.remove();
  const c=hub.snapshot().current,b=current?.body;if(!c||!b||b.chainId==='solana')return;
  const creator=await creatorOf(b);
  if(turn!==creatorRevision||hub.snapshot().current!==c||current?.body!==b||!creator||!c.owner||creator.toLowerCase()!==c.owner.toLowerCase())return;
  if(current.listing)current.section.append(current.listing);
  if(!needsCreatorArtwork(b.profile,creator,c.owner))return;
  const card=h('aside');card.id='qxt-finish-token';card.className='qtp-publish';card.append(h('strong','Finish your token: add its icon and banner'));
  const a=h('a','Add icon and banner →');a.href='/token-profile?m='+b.chainId+':'+b.controller;card.append(a);current.section.append(card);
}
async function read(key){const c=seen.get(key);if(c&&Date.now()-c.at<(c.status===404?600000:300000))return c;const r=await fetch('/api/token-profiles/'+key,{cache:'no-store',signal:AbortSignal.timeout(10000)});const v={at:Date.now(),status:r.status,body:r.ok?await r.json():null};if(r.ok||r.status===404)seen.set(key,v);return v;}
// System A token page (qx-a/pages/token-terminal.mjs) lights its stage from the same profile: banner, icon and links.
const announce=profile=>dispatchEvent(new CustomEvent('qxt:profile',{detail:{profile}}));
async function load(){
  const turn=++revision;
  const match=/^#(?:m|t)=(\d+|solana):([A-Za-z0-9]+)$/.exec(location.hash);if(!head||!match){current=null;creatorRevision++;document.getElementById('qxt-token-profile')?.remove();return;}
  const address=match[1]==='solana'?match[2]:match[2].toLowerCase(),key=match[1]+':'+address;
  let section=document.getElementById('qxt-token-profile');
  if(section?.dataset.key===key&&current?.body)return;
  if(section?.dataset.key!==key){section?.remove();section=h('section');section.id='qxt-token-profile';section.dataset.key=key;section.className='qxt-token-profile';section.setAttribute('aria-label','Token artwork and community links');
    const reserve=h('img');reserve.width=1500;reserve.height=500;reserve.alt='';reserve.style.visibility='hidden';section.append(reserve);const about=document.getElementById('ta-about');about?about.after(section):head.after(section);current=null;}
  try{
    const got=await read(match[1]+'/'+address);if(turn!==revision)return;const body=got.body;
    if(!body){section.remove();announce(null);return;}
    const {profile:value,banner}=tokenProfilePresentation(body);section.replaceChildren();
    const name=shown(body.name)||shown(body.symbol)||'';
    if(banner){const img=h('img');img.width=1500;img.height=500;img.src=banner;img.alt=(name?name+' ':'')+'banner';section.append(img);}
    const identity=h('div');identity.className='qxt-profile-identity';if(value.image){const img=h('img');img.src=value.image;img.alt=(name?name+' ':'')+'profile picture';identity.append(img);}if(name)identity.append(h('strong',name));section.append(identity);
    if(shown(value.description))section.append(h('p',value.description));
    const links=h('div');links.className='qxt-profile-links';for(const [key,label]of [['website','Website'],['x','X'],['discord','Discord'],['telegram','Telegram']]){if(value.links[key]){const a=h('a',label+' ↗');a.href=value.links[key];a.target='_blank';a.rel='ugc noopener noreferrer';links.append(a);}}
    section.append(links);const pool=window.__qhooksPool,panel=mountGetListed({chainId:body.chainId,token:body.token,pool:String(pool?.chainId)===match[1]&&pool?.controller===address?pool.poolId:null,profile:value});current={body,section,listing:panel||null};announce({...value,banner,image:value.image||'',links:value.links||{}});void creatorCard();
  }catch{if(turn===revision)section.remove();}
}
if(head){addEventListener('hashchange',load);document.addEventListener('qhooks:pool',load);hub.subscribe(()=>void creatorCard());void load();}
