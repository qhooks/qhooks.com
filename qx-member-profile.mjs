import {memberWallet,memberWalletKey} from './qx-member-wallet.mjs';
import {normalizeMemberProfile,memberProfilePath,CALLER_METHOD} from './qx-member-profile-core.mjs';
export const memberProfileError=value=>({sign_in:'Sign in with this wallet again.',not_the_wallet:'Connect the wallet that owns this profile.',profile_changed:'This profile changed in another tab. Reload it before saving again.',profile_unavailable:'Profiles are unavailable right now. Your edits are still here.',wrong_origin:'Open QHooks directly to edit your profile.'})[value?.error]||value?.message||'The profile could not be saved. Your edits are still here.';
export function createMemberProfileClient({fetcher=(...args)=>globalThis.fetch(...args)}={}){
 async function request(wallet,options={}){
  const path=memberProfilePath(wallet),response=await fetcher(path,{cache:'no-store',credentials:'omit',redirect:'error',...options}),body=await response.json().catch(()=>null);
  if(!response.ok)throw Error(memberProfileError(body));
  if(body?.version!==1||body.wallet!==memberWalletKey(wallet)||!body.profile||typeof body.profile.shareHoldings!=='boolean'||body.updatedAt!==null&&(!Number.isSafeInteger(body.updatedAt)||body.updatedAt<=0))throw Error('The profile response did not match this wallet.');
  const image=body.profile.image||'';if(image){const url=new URL(image,'https://qhooks.com');if(url.pathname!==path+'/image'||url.search||url.hash||!['https:','http:'].includes(url.protocol))throw Error('The profile picture response was invalid.');}
  // Never trust a remote picture URL: the request origin serves its controlled image.
  const profile=normalizeMemberProfile({...body.profile,image:''});return{...body,profile:{...profile,image:image?path+'/image?v='+body.updatedAt:''}};
 }
 return{read:wallet=>request(wallet),async save(wallet,value,{updatedAt=null,auth,connection}={}){
  const clean=normalizeMemberProfile({...value,image:value.image||''});if(!Object.hasOwn(value,'image'))delete clean.image;
  connection?.assertCurrent();if(connection?.owner!==memberWalletKey(wallet)||!auth?.authorization)throw Error('Sign in with the wallet that owns this profile.');
  await connection.check();connection.assertCurrent();const result=await request(wallet,{method:'PUT',headers:{'content-type':'application/json','if-match':String(updatedAt??0),...auth},body:JSON.stringify(clean)});connection.assertCurrent();return result;
 }};
}
export function callerMethodElement(doc=globalThis.document){
 const details=doc.createElement('details');details.className='qmp-method';const summary=doc.createElement('summary');summary.textContent='How caller records are counted';details.append(summary);
 for(const text of CALLER_METHOD.notes){const p=doc.createElement('p');p.textContent=text;details.append(p);}return details;
}
// Crop and re-encode locally: no remote image URLs, metadata or tracking embeds.
export async function memberImageFile(file,{document:doc=globalThis.document,decode=globalThis.createImageBitmap}={}){
 if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>10*1024*1024)throw Error('Choose a PNG, JPEG or WebP up to 10 MB.');
 const image=await decode(file);try{
  if(!image.width||!image.height||image.width>20000||image.height>20000)throw Error('Choose a smaller picture.');
  const canvas=doc.createElement('canvas');canvas.width=canvas.height=512;const scale=Math.max(512/image.width,512/image.height),ctx=canvas.getContext('2d');if(!ctx)throw Error('Pictures cannot be edited in this browser.');
  ctx.drawImage(image,(512-image.width*scale)/2,(512-image.height*scale)/2,image.width*scale,image.height*scale);
  return normalizeMemberProfile({image:canvas.toDataURL('image/webp',.8)}).image;
 }finally{image.close();}
}
export function mountMemberProfileEditor(target,{hub,sessions,client=createMemberProfileClient(),document:doc=globalThis.document,onPublished=()=>{},imageFile=memberImageFile,idPrefix='qmp'}={}){
 if(!/^[a-z][a-z0-9-]{0,24}$/.test(idPrefix))throw TypeError('Use a valid editor identifier.');
 const fieldId=name=>idPrefix+'-'+name;
 const h=(tag,attrs={},...kids)=>{const node=doc.createElement(tag);for(const[key,value]of Object.entries(attrs)){if(key==='class')node.className=value;else node.setAttribute(key,value);}node.append(...kids);return node;};
 const current=()=>hub.snapshot().current,owner=()=>memberWalletKey(current()?.owner);
 let wallet=null,record=null,generation=0,disposed=false,picture,dirty=false,imageRevision=0,imagePending=false,saving=false,previewSource='';
 const details=h('details',{class:'qmp-editor'}),summary=h('summary',{},'Edit profile & privacy'),content=h('div',{class:'qmp-editor-body'}),status=h('p',{role:'status','aria-live':'polite'}),form=h('form',{'aria-label':'Edit your public profile'}),fields=h('fieldset'),name=h('input',{id:fieldId('name'),maxlength:'32',autocomplete:'nickname'}),bio=h('textarea',{id:fieldId('bio'),rows:'3',maxlength:'280'}),file=h('input',{id:fieldId('picture'),type:'file',accept:'image/png,image/jpeg,image/webp'}),preview=h('img',{class:'qmp-preview',alt:'Profile picture preview'}),remove=h('button',{type:'button',class:'qa-btn'},'Remove picture'),sharing=h('input',{id:fieldId('holdings'),type:'checkbox','aria-describedby':fieldId('holdings-help')+' '+fieldId('holdings-state')}),privacy=h('p',{id:fieldId('holdings-state'),class:'qmp-privacy-state','aria-live':'polite'}),save=h('button',{type:'submit',class:'qa-btn qa-btn-primary'},'Save public profile'),reload=h('button',{type:'button',class:'qa-btn'},'Reload saved profile');
 for(const[label,id,node]of[['Display name',fieldId('name'),name],['Bio',fieldId('bio'),bio],['Profile picture',fieldId('picture'),file]])fields.append(h('label',{for:id},label,node));
 const sharingLabel=h('label',{for:fieldId('holdings'),class:'qmp-sharing'},sharing,'Show my current QHooks holdings on this profile'),sharingHelp=h('p',{id:fieldId('holdings-help'),class:'qmp-help'},'Off by default. This shares current indexed EVM holdings on QHooks, not your full wallet, trade history or profit and loss. Blockchain activity remains public.');
 fields.append(h('div',{class:'qmp-picture-tools'},preview,remove),sharingLabel,sharingHelp,privacy,h('div',{class:'qmp-editor-actions'},save));
 const intro=h('p',{},'Add a name, picture and a short bio. Your wallet stays visible so people can check who made each call.');
 form.append(fields,h('div',{class:'qmp-editor-actions qmp-reload'},reload));content.append(intro,form,status);details.append(summary,content);target.replaceChildren(details);
 const auth=sessions.createBoardSession({getConnection:current});
 function showPicture(source){previewSource=source||'';preview.hidden=!source;if(source)preview.src=source;else preview.removeAttribute('src');render();}
 function invalidateImage(){imageRevision++;imagePending=false;}
 function renderPrivacy(){privacy.textContent=!record?'Reading saved holdings visibility…':'Saved visibility: holdings '+(record.profile.shareHoldings?'shared.':'private.')+(sharing.checked!==record.profile.shareHoldings?' Your draft will make them '+(sharing.checked?'public':'private')+' only after you save.':'');}
 function render(){if(disposed)return;const native=memberWallet(wallet)?.family==='solana';sharingLabel.hidden=sharingHelp.hidden=privacy.hidden=native;sharing.disabled=native;intro.textContent=native?'Add a name, picture and a short bio to your Solana profile. Your full wallet address stays visible. This profile does not share holdings, trade history or profit and loss.':'Add a name, picture and a short bio. Your wallet stays visible so people can check who made each call.';details.hidden=!wallet||owner()!==wallet;fields.disabled=!record||saving;save.disabled=!record||saving||imagePending;reload.disabled=saving;remove.disabled=!previewSource&&!imagePending;save.textContent=auth.boardSession()?'Save public profile':'Sign in to edit';renderPrivacy();}
 async function read(){const mine=++generation;invalidateImage();saving=false;record=null;render();status.textContent='Reading your saved profile…';
  try{const next=await client.read(wallet);if(disposed||mine!==generation||owner()!==wallet)return;record=next;name.value=next.profile.name;bio.value=next.profile.bio;sharing.checked=next.profile.shareHoldings;picture=undefined;file.value='';dirty=false;showPicture(next.profile.image);status.textContent=memberWallet(wallet)?.family==='solana'?'Name, picture and bio become public only when you save. Solana holdings and trade history are not shared.':'Name, picture and bio are public when you save. Holdings are shared only if you turn them on.';}catch(error){if(mine===generation&&!disposed)status.textContent=error.message;}finally{render();}
 }
 async function setWallet(value){if(wallet===value&&record)return;wallet=value;generation++;invalidateImage();saving=false;record=null;picture=undefined;name.value=bio.value=file.value='';sharing.checked=false;showPicture('');render();if(wallet&&owner()===wallet)await read();}
 const stop=hub.subscribe(()=>{if(owner()!==wallet){generation++;invalidateImage();saving=false;record=null;fields.disabled=true;details.hidden=true;status.textContent='Wallet changed. Open your own profile to edit.';}else render();});
 form.addEventListener('input',()=>{dirty=true;});
 sharing.addEventListener('change',()=>{dirty=true;renderPrivacy();});
 file.addEventListener('change',async()=>{if(saving||!record||owner()!==wallet||disposed)return;const mine=generation,selected=file.files?.[0];invalidateImage();const version=imageRevision;if(!selected){render();return;}imagePending=true;render();status.textContent='Preparing your picture on this device…';const active=()=>!disposed&&mine===generation&&version===imageRevision&&owner()===wallet;
  try{const result=await imageFile(selected);if(!active())return;picture=result;dirty=true;showPicture(result);status.textContent='Picture ready. Save to publish it.';}catch(error){if(active())status.textContent=error.message;}finally{if(active()){imagePending=false;render();}}
 });
 remove.addEventListener('click',()=>{if(saving||!record||owner()!==wallet||disposed)return;invalidateImage();picture='';dirty=true;file.value='';showPicture('');status.textContent='Picture removed from this draft. Save to update your profile.';});
 reload.addEventListener('click',()=>void read());
 form.addEventListener('submit',async event=>{event.preventDefault();if(!record||owner()!==wallet||imagePending||saving||disposed)return;const mine=generation,who=wallet;saving=true;render();
  try{const connection=auth.capture();await connection.check();if(!auth.boardSession()){status.textContent='Sign in with a free message. This saves no profile and moves no funds.';await auth.signIn(connection);if(mine!==generation)return;status.textContent='Signed in. Review your profile, then save when you are ready.';render();return;}
   const draft={name:name.value,bio:bio.value,shareHoldings:memberWallet(who)?.family==='solana'?false:sharing.checked,...(picture!==undefined?{image:picture}:{})};status.textContent='Saving your public profile…';const next=await client.save(who,draft,{updatedAt:record.updatedAt,auth:auth.authHeaders(),connection});
   if(disposed||mine!==generation||owner()!==who)return;record=next;picture=undefined;dirty=false;showPicture(next.profile.image);status.textContent='Public profile saved.';onPublished(next);
  }catch(error){if(!disposed&&mine===generation)status.textContent=error.message;}finally{if(mine===generation){saving=false;render();}}
 });
 return{setWallet,open(){if(disposed||!wallet||owner()!==wallet)return false;details.open=true;summary.focus();details.scrollIntoView({block:'start'});return true;},dispose(){disposed=true;generation++;invalidateImage();stop();},get dirty(){return dirty;}};
}
