// Public creator-supplied token identity on the trading page. Never changes a trade ticket.
import {normalizeTokenProfile} from './qx-token-profile-core.mjs';
const head=document.getElementById('qxt-head');let revision=0;
const h=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
async function load(){
  const turn=++revision;document.getElementById('qxt-token-profile')?.remove();
  const match=/^#m=(\d+):(0x[0-9a-fA-F]{40})$/.exec(location.hash);if(!head||!match)return;
  try{
    const r=await fetch('/api/token-profiles/'+match[1]+'/'+match[2].toLowerCase(),{cache:'no-store'});if(!r.ok)return;const body=await r.json();if(turn!==revision||!body.profile)return;
    const value=normalizeTokenProfile(body.profile),section=h('section');section.id='qxt-token-profile';section.className='qxt-token-profile';section.setAttribute('aria-label','Token artwork and community links');
    if(value.banner){const img=h('img');img.src=value.banner;img.alt=body.name+' banner';section.append(img);}
    const identity=h('div');identity.className='qxt-profile-identity';if(value.image){const img=h('img');img.src=value.image;img.alt=body.name+' profile picture';identity.append(img);}identity.append(h('strong',body.name));section.append(identity);
    if(value.description)section.append(h('p',value.description));
    const links=h('div');links.className='qxt-profile-links';for(const [key,label]of [['website','Website'],['x','X'],['discord','Discord'],['telegram','Telegram']]){if(value.links[key]){const a=h('a',label+' ↗');a.href=value.links[key];a.target='_blank';a.rel='ugc noopener noreferrer';links.append(a);}}
    section.append(links);head.after(section);
  }catch{}
}
if(head){addEventListener('hashchange',load);document.addEventListener('qhooks:pool',load);void load();}
