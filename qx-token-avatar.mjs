export function avatarImage(value) {
  if(typeof value!=='string')return null;
  if(/^\/api\/token-profiles\/\d+\/0x[\da-f]{40}\/image(?:\?v=\d+)?$/i.test(value))return value;
  if(/^\/(?!\/)[\w./-]+\.(png|webp|jpe?g)(?:\?[^\s]*)?$/i.test(value))return value;
  if(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value))return value;
  try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}
}
export function tokenAvatar({profile,profileImage,launchMeta,launchImage,logo,image,logoURI,symbol='?'}={}) {
  return {src:avatarImage(profile?.image)||avatarImage(profileImage)||avatarImage(launchMeta?.image)||avatarImage(launchImage)||avatarImage(logo)||avatarImage(image)||avatarImage(logoURI),
    letter:(symbol||'?').replace(/^\$/,'').slice(0,1).toUpperCase()};
}
export function tokenAvatarSources(m={},fallback=[]){
  return [...new Set([m.profile?.image,m.profileImage,m.launchMeta?.image,m.launchImage,m.logo,m.image,m.logoURI,...fallback].map(avatarImage).filter(Boolean))];
}
// G2 (2026-11-18, logo flash): one session record of logo URLs that already loaded or failed. A known-good URL paints
// at once; a known-failed URL is skipped. The <img> stays visible (its own floor-coloured box) while it loads, so the
// letter underneath shows ONLY after a real error event on every source, never while loading. Binding the same img to
// the same sources again is a no-op: same element, same src, no reload.
const LOGO_KEY='qx:logo-state:v1',LOGO_MAX=800;
const logoStore=(()=>{try{return globalThis.sessionStorage||null;}catch{return null;}})();
const logoState=new Map();
try{const o=JSON.parse(logoStore?.getItem(LOGO_KEY)||'null');if(o&&typeof o==='object')for(const[k,v]of Object.entries(o))if(v==='ok'||v==='fail')logoState.set(k,v);}catch{}
let logoTimer=null;
function saveLogoState(){if(logoTimer||!logoStore)return;logoTimer=setTimeout(()=>{logoTimer=null;try{logoStore.setItem(LOGO_KEY,JSON.stringify(Object.fromEntries([...logoState].slice(-LOGO_MAX))));}catch{}},300);logoTimer?.unref?.();}
export function logoUrlState(url){return logoState.get(url)||null;}
export function markLogoUrl(url,state){if(typeof url!=='string'||!url||(state!=='ok'&&state!=='fail'))return;if(logoState.get(url)===state)return;logoState.delete(url);logoState.set(url,state);saveLogoState();}
export function resetLogoUrlStates(){logoState.clear();}
export function bindTokenAvatar(img,market={},fallback=[]){
  const all=tokenAvatarSources(market,fallback),key=all.join('\n');
  const prior=img.__qxAvatar;
  if(prior&&!prior.stopped&&prior.key===key)return prior.unbind;
  prior?.unbind();
  // Keep a layout box for native lazy loading (display:none/hidden would block lazy admission).
  if(!img.getAttribute('loading'))img.loading='lazy';
  if(!img.getAttribute('width'))img.width=40;
  if(!img.getAttribute('height'))img.height=40;
  const sources=all.filter(src=>logoState.get(src)!=='fail');
  const rec={key,stopped:false,unbind:null};let next=0,current=null;
  const show=src=>{current=src;img.hidden=false;img.style.visibility='';img.dataset.avatarState=logoState.get(src)==='ok'?'image':'loading';if(img.getAttribute('src')!==src)img.src=src;};
  const advance=()=>{
    if(rec.stopped)return;
    if(next>=sources.length){current=null;img.hidden=true;img.removeAttribute('src');img.dataset.avatarState='letter';return;}
    show(sources[next++]);
  };
  const failed=()=>{if(rec.stopped)return;if(current)markLogoUrl(current,'fail');advance();};
  const loaded=()=>{if(rec.stopped)return;if(img.naturalWidth>0){if(current)markLogoUrl(current,'ok');img.hidden=false;img.style.visibility='';img.dataset.avatarState='image';}else failed();};
  img.addEventListener('error',failed);img.addEventListener('load',loaded);
  // Re-binding an element that already shows the first good source keeps it as is (no src reset, no reload).
  if(sources.length&&img.getAttribute('src')===sources[0]&&img.complete&&img.naturalWidth>0){next=1;current=sources[0];img.hidden=false;img.dataset.avatarState='image';markLogoUrl(current,'ok');}
  else advance();
  rec.unbind=()=>{if(rec.stopped)return;rec.stopped=true;img.removeEventListener('error',failed);img.removeEventListener('load',loaded);if(img.__qxAvatar===rec)img.__qxAvatar=null;};
  img.__qxAvatar=rec;
  return rec.unbind;
}
// G2: bind only once the img is actually on screen. A row rendered for a keyed update whose art is then swapped for the
// on-screen art (same token, same sources) is never connected, so it never sets a src and never makes a request.
export function bindWhenPlaced(img,market={},fallback=[],{tries=8,schedule=globalThis.requestAnimationFrame?.bind(globalThis)||(fn=>setTimeout(fn,16))}={}){
  let n=0,unbind=null,cancelled=false;
  const go=()=>{if(cancelled||unbind||img.__qxDiscarded)return;if(img.isConnected){unbind=bindTokenAvatar(img,market,fallback);return;}if(++n<tries)schedule(go);};
  queueMicrotask(go);
  return ()=>{cancelled=true;unbind?.();};
}
// G2: the same deferral for fixed images (chain marks) inside a static part.
export function srcWhenPlaced(img,src,{tries=8,schedule=globalThis.requestAnimationFrame?.bind(globalThis)||(fn=>setTimeout(fn,16))}={}){
  let n=0;const go=()=>{if(img.__qxDiscarded||img.getAttribute('src'))return;if(img.isConnected){img.src=src;return;}if(++n<tries)schedule(go);};
  queueMicrotask(go);return img;
}
