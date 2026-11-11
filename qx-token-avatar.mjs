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
// The letter stays visible until an image has decoded. A failed profile walks
// the launch/legacy sources, then removes the image rather than covering it up.
export function bindTokenAvatar(img,market={},fallback=[]){
  const sources=tokenAvatarSources(market,fallback);let next=0,stopped=false;
  const advance=()=>{
    if(stopped)return;img.hidden=true;
    if(next>=sources.length){img.removeAttribute('src');img.dataset.avatarState='letter';return;}
    img.dataset.avatarState='loading';img.src=sources[next++];
  };
  const loaded=()=>{if(stopped)return;if(img.naturalWidth>0){img.hidden=false;img.dataset.avatarState='image';}else advance();};
  img.addEventListener('error',advance);img.addEventListener('load',loaded);advance();
  return ()=>{stopped=true;img.removeEventListener('error',advance);img.removeEventListener('load',loaded);};
}
