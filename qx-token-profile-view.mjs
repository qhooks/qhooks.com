// Public creator-supplied token identity on the trading page. Never changes a trade ticket.
import {normalizeTokenProfile} from './qx-token-profile-core.mjs';
import {mountGetListed} from './qx-get-listed.mjs';
const head=document.getElementById('qxt-head');let revision=0;
const h=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
// Profiles change rarely: one read per market per 5 minutes, and a 404 (not listed) is kept for 10 minutes, so the
// market poll's qhooks:pool events don't re-ask every few seconds (2026-11-10).
const seen=new Map();
async function read(key){const c=seen.get(key);if(c&&Date.now()-c.at<(c.status===404?600000:300000))return c;const r=await fetch('/api/token-profiles/'+key,{cache:'no-store'});const v={at:Date.now(),status:r.status,body:r.ok?await r.json():null};if(r.ok||r.status===404)seen.set(key,v);return v;}
async function load(){
  const turn=++revision;
  const match=/^#m=(\d+):(0x[0-9a-fA-F]{40})$/.exec(location.hash);if(!head||!match){document.getElementById('qxt-token-profile')?.remove();return;}
  try{
    const got=await read(match[1]+'/'+match[2].toLowerCase());if(turn!==revision)return;const body=got.body;
    const shown=document.getElementById('qxt-token-profile');if(shown?.dataset.key===match[1]+':'+match[2].toLowerCase()&&body)return;shown?.remove();
    if(!body)return;
    const value=normalizeTokenProfile(body.profile||{}),section=h('section');section.id='qxt-token-profile';section.dataset.key=match[1]+':'+match[2].toLowerCase();section.className='qxt-token-profile';section.setAttribute('aria-label','Token artwork and community links');
    if(value.banner){const img=h('img');img.src=value.banner;img.alt=body.name+' banner';section.append(img);}
    const identity=h('div');identity.className='qxt-profile-identity';if(value.image){const img=h('img');img.src=value.image;img.alt=body.name+' profile picture';identity.append(img);}identity.append(h('strong',body.name));section.append(identity);
    if(value.description)section.append(h('p',value.description));
    const links=h('div');links.className='qxt-profile-links';for(const [key,label]of [['website','Website'],['x','X'],['discord','Discord'],['telegram','Telegram']]){if(value.links[key]){const a=h('a',label+' ↗');a.href=value.links[key];a.target='_blank';a.rel='ugc noopener noreferrer';links.append(a);}}
    section.append(links);const pool=window.__qhooksPool,panel=mountGetListed({chainId:body.chainId,token:body.token,pool:String(pool?.chainId)===match[1]&&pool?.controller?.toLowerCase()===match[2].toLowerCase()?pool.poolId:null,profile:value});if(panel)section.append(panel);head.after(section);
  }catch{}
}
if(head){addEventListener('hashchange',load);document.addEventListener('qhooks:pool',load);void load();}
