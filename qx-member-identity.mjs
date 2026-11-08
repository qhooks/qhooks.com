import {memberWallet,memberWalletKey} from './qx-member-wallet.mjs';
// Compact public identity for author/caller rows. This reads profiles only; wallet identity stays visible.
import {createMemberProfileClient} from './qx-member-profile.mjs';
import {normalizeMemberProfile,memberProfilePath} from './qx-member-profile-core.mjs';

const address=memberWalletKey;
const short=value=>value.length>16?value.slice(0,6)+'…'+value.slice(-4):value;
const bounded=(value,min,max,label)=>{if(!Number.isSafeInteger(value)||value<min||value>max)throw TypeError('Invalid '+label);return value;};
function styles(doc){
  if(doc.getElementById('qmi-style'))return;
  const link=doc.createElement('link');link.id='qmi-style';link.rel='stylesheet';link.href='/qx-member-identity.css';doc.head?.append(link);
}
function publicIdentity(value,wallet){
  if(value?.version!==1||value.wallet!==wallet||!value.profile||value.updatedAt!==null&&(!Number.isSafeInteger(value.updatedAt)||value.updatedAt<=0))return null;
  const profile=normalizeMemberProfile({...value.profile,image:''});
  const image=Number.isSafeInteger(value.updatedAt)&&value.updatedAt>0&&value.profile.image===memberProfilePath(wallet)+'/image?v='+value.updatedAt?value.profile.image:'';
  return{name:profile.name,image};
}

/** One reader per page: at most 4 concurrent and 128 cached/queued wallets by default, with no polling.
 * mount(wallet,{linked:false}) fits inside an existing profile link. Pass the existing addressMark as `mark`.
 * Mount the returned element synchronously; `ready` settles after the optional public profile read.
 */
export function createMemberIdentityRenderer({client=createMemberProfileClient(),document:doc=globalThis.document,clock=Date.now,maxEntries=128,maxConcurrent=4,ttlMs=60000,failureTtlMs=10000}={}){
  bounded(maxEntries,1,256,'identity cache size');bounded(maxConcurrent,1,8,'identity read concurrency');
  bounded(ttlMs,1000,300000,'identity cache lifetime');bounded(failureTtlMs,1000,60000,'identity retry lifetime');
  if(!doc?.createElement||typeof client?.read!=='function')throw TypeError('A public profile reader and document are required.');
  const cache=new Map(),queue=[];let active=0,dead=false;
  function pump(){
    while(!dead&&active<maxConcurrent&&queue.length){
      const entry=queue.shift();
      if(![...entry.readers].some(isCurrent=>isCurrent())){cache.delete(entry.wallet);entry.resolve(null);continue;}
      active++;
      Promise.resolve().then(()=>client.read(entry.wallet)).then(value=>publicIdentity(value,entry.wallet)).catch(()=>null).then(value=>{
        entry.value=value;entry.settled=true;entry.expires=clock()+(value?ttlMs:failureTtlMs);entry.resolve(value);
      }).finally(()=>{active--;pump();});
    }
  }
  function read(wallet,isCurrent){
    let entry=cache.get(wallet);
    if(entry?.settled&&entry.expires<=clock()){cache.delete(wallet);entry=null;}
    if(!entry){
      if(cache.size>=maxEntries){const victim=[...cache].find(([,row])=>row.settled);if(!victim)return Promise.resolve(null);cache.delete(victim[0]);}
      entry={wallet,readers:new Set(),settled:false};entry.promise=new Promise(resolve=>entry.resolve=resolve);cache.set(wallet,entry);queue.push(entry);
    }
    entry.readers.add(isCurrent);queueMicrotask(pump);
    return entry.promise.finally(()=>entry.readers.delete(isCurrent));
  }
  function mount(value,{linked=true,mark=null,className='',getWallet=()=>value}={}){
    if(dead)throw Error('This identity renderer is disposed.');
    if(typeof getWallet!=='function')throw TypeError('A current wallet getter is required.');
    styles(doc);
    const wallet=address(value),shown=wallet||String(value||'').slice(0,80),element=doc.createElement(linked&&wallet?'a':'span'),avatar=doc.createElement('span'),fallback=mark||doc.createElement('span'),words=doc.createElement('span'),name=doc.createElement('span'),code=doc.createElement('code');
    let disposed=false;const identity=memberWallet(wallet),display=identity?.address||shown;
    element.className='qmi'+(className?' '+className:'');element.title=display;element.setAttribute('data-wallet',shown);
    if(linked&&wallet)element.href='/profile#'+wallet;
    avatar.className='qmi-avatar';avatar.setAttribute('aria-hidden','true');
    if(!mark){fallback.className='qmi-default';fallback.textContent=shown.slice(-2).toUpperCase();}
    avatar.append(fallback);words.className='qmi-words';name.className='qmi-name';name.hidden=true;code.className='qmi-wallet';code.textContent=short(display)+(identity?.family==='solana'?' · Solana':'');code.title=display;words.append(name,code);element.append(avatar,words);
    const isCurrent=()=>{try{return!dead&&!disposed&&element.isConnected&&element.getAttribute('data-wallet')===shown&&address(getWallet())===wallet;}catch{return false;}};
    const ready=wallet?read(wallet,isCurrent).then(profile=>{
      if(!profile||!isCurrent())return;
      if(profile.name){name.textContent=profile.name;name.hidden=false;element.setAttribute('aria-label',profile.name+' · '+display+(identity?.family==='solana'?' · Solana':''));}
      if(profile.image){
        const image=doc.createElement('img');image.className='qmi-photo';image.alt='';image.width=image.height=28;image.loading='lazy';image.decoding='async';image.referrerPolicy='no-referrer';
        image.addEventListener('load',()=>{if(isCurrent()){image.hidden=false;image.setAttribute('data-ready','true');fallback.hidden=true;}});
        image.addEventListener('error',()=>{if(isCurrent()){image.hidden=true;image.setAttribute('data-ready','false');fallback.hidden=false;}});
        image.src=profile.image;avatar.append(image);
      }
    }):Promise.resolve();
    return Object.freeze({element,ready,dispose(){disposed=true;}});
  }
  return Object.freeze({mount,dispose(){dead=true;for(const entry of queue)entry.resolve(null);queue.length=0;cache.clear();}});
}

let shared;
/** Render-only convenience for synchronous board/row builders; detached rows never receive late profile data. */
export function memberIdentity(wallet,options){shared??=createMemberIdentityRenderer();return shared.mount(wallet,options).element;}
