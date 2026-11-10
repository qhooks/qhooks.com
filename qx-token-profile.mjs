import {normalizeTokenProfile, profileImage, PROFILE_LIMITS, hasTokenProfile, poolFromShareLink} from './qx-token-profile-core.mjs';
import {createProfileDraftStore, profileBackup, readProfileBackup} from './qx-token-profile-draft.mjs';
const bus = new EventTarget();
// Each launch attempt keeps its picture under its own scope. When the browser's storage is full, drafts from
// other (abandoned) launch attempts are cleared first, then the save is retried once.
function pruneProfileDrafts(keep=''){for(let i=localStorage.length-1;i>=0;i--){const k=localStorage.key(i);if(k&&/^qhooks:token-profile-draft:v1:[\w-]+:create-[a-z0-9-]+$/i.test(k)&&!(keep&&k.endsWith(':'+keep)))localStorage.removeItem(k);}}
function saveWithRoom(key,value,keep=''){try{localStorage.setItem(key,value);}catch(error){pruneProfileDrafts(keep);localStorage.setItem(key,value);}}
const store=createProfileDraftStore({storage:()=>({getItem:key=>localStorage.getItem(key),setItem:(key,value)=>saveWithRoom(key,value)}),onChange:detail=>bus.dispatchEvent(new CustomEvent('change',{detail:{...detail,scope:''}}))});
const scopedStores=new Map();
function scopedStore(scope=''){
 if(!scope)return store;if(typeof scope!=='string'||!/^[a-z0-9-]{1,80}$/i.test(scope))throw Error('Profile draft scope is invalid.');
  const setScoped=(key,value)=>saveWithRoom(key+':'+scope,value,scope);
 if(!scopedStores.has(scope))scopedStores.set(scope,createProfileDraftStore({storage:()=>({getItem:key=>localStorage.getItem(key+':'+scope),setItem:setScoped}),onChange:detail=>bus.dispatchEvent(new CustomEvent('change',{detail:{...detail,scope}}))}));
 return scopedStores.get(scope);
}
const draft = chain => store.get(chain), update = (chain,patch) => store.update(chain,patch);
const h = (tag, attrs = {}, ...children) => { const e = document.createElement(tag); for (const [k,v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2),v); else e.setAttribute(k,v); } e.append(...children.flat().filter(x => x != null)); return e; };
const storageNotice = 'This profile is only in this tab. Download a backup to keep your artwork and links.';
export const tokenProfileDraft=(chain,scope='')=>normalizeTokenProfile(scopedStore(scope).get(String(chain)));
export const editableTokenProfileDraft=(chain,scope='')=>scopedStore(scope).get(String(chain));
export const setTokenProfileDraft=(chain,value,scope='')=>scopedStore(scope).replace(String(chain),value);
export function onTokenProfileDraft(listener) {
  const receive=event=>listener(event.detail);
  bus.addEventListener('change',receive);
  return ()=>bus.removeEventListener('change',receive);
}
async function imageFile(file, kind) {
  if (!file) throw Error('Choose a picture.');
  if (file.size > 20 * 1024 * 1024) throw Error('That picture is over 20 MB. Choose a smaller PNG or JPEG.');
  if (file.type && !file.type.startsWith('image/')) throw Error('That file is not a picture. Choose a PNG or JPEG.');
  // Any format this browser can read is accepted (it is re-encoded below). Chrome on a Mac can't read iPhone HEIC photos.
  let image;try{image=await createImageBitmap(file);}catch{throw Error(/hei[cf]/i.test(file.type+file.name)?'This browser can\'t read iPhone HEIC photos. Open it in Preview, choose File → Export → JPEG, then choose that file.':'This browser can\'t read that picture. Choose a PNG or JPEG.');}
  const canvas = document.createElement('canvas');
  try {
    const width = kind === 'banner' ? 1500 : 512, height = kind === 'banner' ? 500 : 512;
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d'); const scale = Math.max(width/image.width,height/image.height);
    ctx.drawImage(image,(width-image.width*scale)/2,(height-image.height*scale)/2,image.width*scale,image.height*scale);
    let data;
    // iPhone/iPad browsers (WebKit) can't encode WebP and silently return PNG, which is usually over the size cap.
    // Use WebP where the browser really makes it, otherwise JPEG (dark background fill so transparent PNGs stay clean).
    const webp = canvas.toDataURL('image/webp', .85).startsWith('data:image/webp');
    if (!webp) { ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = '#0c100e'; ctx.fillRect(0, 0, width, height); ctx.globalCompositeOperation = 'source-over'; }
    for (const quality of [.85,.7,.5,.3]) { data = canvas.toDataURL(webp ? 'image/webp' : 'image/jpeg',quality); if (data.length <= PROFILE_LIMITS[kind]) break; }
    return profileImage(data,kind);
  } finally { image.close(); }
}
export function mountTokenProfileEditor({id,chain = () => document.getElementById('ql-chain')?.value || '8453',name = () => document.getElementById('ql-name')?.value || 'Your token',symbol = () => document.getElementById('ql-symbol')?.value || 'TICKER',scope=()=>'',imageRequired=false} = {}) {
  const scopeKey=()=>String(scope()||''),localStore=()=>scopedStore(scopeKey()),draft=chain=>localStore().get(String(chain)),update=(chain,patch)=>localStore().update(String(chain),patch);
  const status = h('p',{class:'qtp-status',role:'status','aria-live':'polite'}), fields = h('div',{class:'qtp-fields'});
  const banner = h('img',{alt:'Token banner preview',class:'qtp-preview-banner'}), avatar = h('img',{alt:'Token profile picture preview',class:'qtp-preview-avatar'});
  const title = h('strong'), ticker = h('span'), description = h('p'), preview = h('div',{class:'qtp-preview'},banner,h('div',{class:'qtp-preview-identity'},avatar,h('div',{},title,ticker)),description);
  const inputs = {};
  for (const [key,label,placeholder] of [['description','Description','What is your token about?'],['website','Website','https://yourproject.com'],['x','X','@yourproject'],['discord','Discord','https://discord.gg/yourinvite'],['telegram','Telegram','https://t.me/yourgroup']]) {
    const input = h(key === 'description' ? 'textarea' : 'input',{id:id+'-'+key,placeholder,maxlength:key==='description'?'1000':'500',...(key==='description'?{rows:'3'}:{type:'text',autocomplete:'off',spellcheck:'false'})});
    inputs[key] = input;
    input.addEventListener('input',()=>{const current=draft(String(chain())); update(String(chain()),key==='description'?{description:input.value}:{links:{...current.links,[key]:input.value}});});
    fields.append(h('label',{for:id+'-'+key},label,input));
  }
  const uploads = h('div',{class:'qtp-uploads'});
  for (const [kind,label,hint] of [['image','Profile picture',imageRequired?'Square · PNG or JPEG · required':'Square · PNG or JPEG'],['banner','Token banner','Wide, 3:1 · optional']]) {
    const file=h('input',{id:id+'-'+kind,type:'file',accept:'image/*'}),remove=h('button',{type:'button',class:'qtp-remove'},'Remove'); let revision=0;
    file.addEventListener('change',async()=>{const turn=++revision,c=String(chain()),s=scopeKey(); status.textContent='Preparing your '+label.toLowerCase()+'…';try { const data=await imageFile(file.files?.[0],kind);if(turn!==revision||c!==String(chain())||s!==scopeKey())return;const saved=update(c,{[kind]:data});status.textContent=saved?'Image ready. Your token profile is saved in this browser.':storageNotice; } catch(e) { status.textContent=e.message; } finally {if(turn===revision)file.value='';} });
    remove.addEventListener('click',()=>{revision++;update(String(chain()),{[kind]:''});status.textContent=label+' removed.';});
    uploads.append(h('div',{class:'qtp-upload'},h('label',{for:id+'-'+kind},label,h('small',{},hint),file),remove));
  }
  const download=h('button',{type:'button',class:'qtp-remove'},'Download profile backup');
  const restore=h('input',{id:id+'-restore',type:'file',accept:'.json,application/json'});
  const undo=h('button',{type:'button',class:'qtp-remove',hidden:''},'Undo profile restore');
  let previous=null;
  download.addEventListener('click',()=>{
    try {
      const text=profileBackup(draft(String(chain())),{chain:chain(),name:name(),symbol:symbol()});
      const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));
      const link=h('a',{href:url,download:'qhooks-profile-'+String(chain())+'.json'});
      link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
      status.textContent='Profile backup downloaded. Keep your launch configuration and quantum key backup too.';
    } catch(e) { status.textContent=e.message; }
  });
  restore.addEventListener('change',async()=>{
    const file=restore.files?.[0],c=String(chain()),s=scopeKey(),revision=localStore().version(c);
    if(!file)return;
    try {
      if(file.size>PROFILE_LIMITS.body+2048)throw Error('Choose a QHooks profile backup under 700 KB.');
      const value=readProfileBackup(await file.text(),c);
      if(c!==String(chain())||s!==scopeKey()||revision!==localStore().version(c))throw Error('Your draft changed while the file was being read. Choose the backup again to restore it.');
      previous={chain:c,scope:s,value:draft(c)};
      const saved=localStore().replace(c,value);undo.hidden=false;
      status.textContent='Artwork and socials restored. Your launch settings are unchanged.'+(saved?'':(' '+storageNotice));
    } catch(e) { status.textContent=e.message; } finally { restore.value=''; }
  });
  undo.addEventListener('click',()=>{
    if(!previous||previous.chain!==String(chain())||previous.scope!==scopeKey())return;
    const saved=localStore().replace(previous.chain,previous.value);previous=null;undo.hidden=true;
    status.textContent='Previous profile restored.'+(saved?'':(' '+storageNotice));
  });
  const backup=h('details',{class:'qtp-backup'},h('summary',{},'Back up artwork & socials'),h('p',{},'Save this token profile separately from your launch configuration and quantum key backup.'),download,h('label',{for:id+'-restore'},'Restore profile backup',restore),undo);
  const root=h('section',{id,class:'qtp-editor','aria-labelledby':id+'-title'},h('div',{class:'qtp-head'},h('div',{},h('p',{class:'qx-eyebrow'},'Make it yours'),h('h3',{id:id+'-title'},'Your token’s first impression.'),h('p',{},imageRequired?'Add a profile picture (required to launch), a banner and the places your community can find you.':'Add a profile picture, banner and the places your community can find you. Everything is optional.'))),h('div',{class:'qtp-layout'},h('div',{},uploads,fields),preview),backup,status);
  const render = event => {
    const c=String(chain());if(event?.detail&&(event.detail.chain!==c||(event.detail.scope||'')!==scopeKey()))return;const value=draft(c);
    for(const [key,input]of Object.entries(inputs)){const text=key==='description'?value.description:value.links?.[key];if(document.activeElement!==input)input.value=typeof text==='string'?text:'';}
    for(const [el,key]of [[banner,'banner'],[avatar,'image']]){try{const src=profileImage(value[key],key);el.hidden=!src;if(src)el.src=src;else el.removeAttribute('src');}catch{el.hidden=true;el.removeAttribute('src');}}
    title.textContent=name()||'Your token';ticker.textContent='$'+(symbol()||'TICKER');description.textContent=value.description||'Your community starts here.';
    undo.hidden=!previous||previous.chain!==c||previous.scope!==scopeKey();
    if(!localStore().saved(c))status.textContent=storageNotice;
  };
  bus.addEventListener('change',render);document.addEventListener('input',render);document.addEventListener('change',render);render();
  return root;
}
const errorMessage = j => ({not_the_creator:'Connect the wallet that currently owns this launch.',owner_unavailable:'Could not check the launch owner. Your draft is saved; try again.',wait_a_moment:'Wait a moment before publishing again.',store_unavailable:'Profile publishing is unavailable. Your launch and draft are safe.'})[j.error]||j.message||'The profile did not publish. Your draft is saved; try again.';
export function profilePublicationControl({chain=()=>document.getElementById('ql-chain')?.value,share=()=>document.getElementById('qj-share')?.value,profile=()=>tokenProfileDraft(chain()),onPublished=()=>{},getConnection}={}) {
  const button=h('button',{type:'button',class:'workspace-button qtd-primary'},'Publish token profile'),status=h('p',{role:'status','aria-live':'polite'});
  button.addEventListener('click',async()=>{
    button.disabled=true;
    try {
      const value=normalizeTokenProfile(profile());if(!hasTokenProfile(value))throw Error('Add a profile picture, banner, description or community link first.');
      const pool=poolFromShareLink(share());
      if(String(pool.chainId)!==String(chain()))throw Error('The launch chain changed. Return to the matching chain to publish its profile.');
      const sessions=await import('./qx-board-session.mjs'),auth=getConnection?sessions.createBoardSession({getConnection}):sessions,connection=auth.capture?auth.capture():null;
      await connection?.check();status.textContent='Checking your launch…';
      const listed=await fetch('/api/markets/'+pool.chainId+'/'+pool.controller,{cache:'no-store'});
      await connection?.check();if(listed.status===404){const added=await fetch('/api/markets',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(pool)});if(!added.ok)throw Error('The launch could not be listed yet. Your profile draft is saved; try again.');}
      else if(!listed.ok)throw Error('The launch directory is unavailable. Try again in a moment.');
      if(!auth.boardSession()){status.textContent='Sign in with your creator wallet. This free signature moves no funds.';await auth.signIn(connection||undefined);}
      await connection?.check();const headers=auth.authHeaders();if(!headers.authorization)throw Error('Sign in with your current creator wallet again.');connection?.assertCurrent();
      status.textContent='Publishing your token profile…';
      const response=await fetch('/api/token-profiles/'+pool.chainId+'/'+pool.controller.toLowerCase(),{method:'PUT',headers:{'content-type':'application/json',...headers},body:JSON.stringify(value)});
      const j=await response.json();if(!response.ok)throw Error(errorMessage(j));
      status.replaceChildren('Token profile published. ',h('a',{href:'/terminal#m='+pool.chainId+':'+pool.controller},'View your token →'));
      try{onPublished(j);}catch{}
    }catch(e){status.textContent=e.message||'Publishing stopped. Your profile draft is saved.';}finally{button.disabled=false;}
  });
  return h('section',{class:'qtp-publish'},h('h3',{},'Give your launch its identity.'),h('p',{},'Publish your artwork and links with a free creator-wallet signature. You can update them later.'),button,status);
}
const tokenPanel=document.getElementById('qtd-token-panel');
// Expert Studio: a token image is required to launch (2026-11-10). Continue and Prepare launch workspace stay blocked
// with a plain note until the profile picture is ready.
if(tokenPanel&&!document.getElementById('ql-profile')){const actions=tokenPanel.querySelector('.qtd-actions');actions?.before(mountTokenProfileEditor({id:'ql-profile',imageRequired:true}));
  const chainOf=()=>document.getElementById('ql-chain')?.value||'8453',hasImage=()=>{try{return !!tokenProfileDraft(chainOf()).image;}catch{return false;}};
  const note=h('p',{id:'ql-need-image',class:'qtd-need-image',role:'status','data-error':'true'},'Add an image for your token.');actions?.prepend(note);
  const begin=document.getElementById('ql-begin'),note2=h('p',{id:'ql-need-image-begin',class:'qtd-need-image',role:'status','data-error':'true'},'Add an image for your token. Add it under “Make it yours” in Token details.');begin?.after(note2);
  const sync=()=>{const ok=hasImage();note.hidden=ok;note2.hidden=ok;for(const id of ['qj-next-token','ql-begin'])document.getElementById(id)?.setAttribute('aria-disabled',String(!ok));};
  for(const id of ['qj-next-token','ql-begin'])document.getElementById(id)?.addEventListener('click',e=>{if(hasImage())return;e.preventDefault();e.stopImmediatePropagation();sync();document.getElementById('ql-profile-image')?.focus();},true);
  onTokenProfileDraft(sync);document.getElementById('ql-chain')?.addEventListener('change',sync);sync();}
const success=document.getElementById('qj-success');if(success)success.append(profilePublicationControl());
