import {profileImage,PROFILE_LIMITS} from './qx-token-profile-core.mjs';
export const NEED_BANNER='Add a banner for your token.';
export const BANNER_HASH=/^[a-f0-9]{64}$/;
// Leave room for the hash, JSON fields and a UTF-8 description in sale metadata.
export const LAUNCH_ICON_LIMIT=2800;
export function requireBannerHash(banner){if(!BANNER_HASH.test(banner||''))throw new TypeError(NEED_BANNER);return banner;}
export function bannerFileCheck(file){
 if(!file||!/^image\/(png|jpeg|webp)$/.test(file.type))throw Error('Choose a PNG, JPEG or WebP banner.');
 if(file.size>=8000000)throw Error('Choose a banner under 8 MB.');
}
export function bannerCrop(width,height){const w=Math.min(width,height*3),h=w/3;return [(width-w)/2,(height-h)/2,w,h,0,0,1500,500];}
export async function prepareTokenBanner(file,{bitmap=globalThis.createImageBitmap,canvas=()=>document.createElement('canvas')}={}){
 bannerFileCheck(file);const image=await bitmap(file);
 try{
  const c=canvas();c.width=1500;c.height=500;const ctx=c.getContext('2d');
  ctx.drawImage(image,...bannerCrop(image.width,image.height));
  const webp=c.toDataURL('image/webp',.85).startsWith('data:image/webp;');
  if(!webp){ctx.globalCompositeOperation='destination-over';ctx.fillStyle='#0c100e';ctx.fillRect(0,0,1500,500);ctx.globalCompositeOperation='source-over';}
  for(const q of [.85,.7,.5,.3,.15]){const data=c.toDataURL(webp?'image/webp':'image/jpeg',q);if(data.length<=PROFILE_LIMITS.banner)return profileImage(data,'banner');}
  throw Error('Choose a simpler banner so it can fit.');
 }finally{image.close();}
}
export async function uploadTokenBanner(data,{fetcher=globalThis.fetch}={}){
 profileImage(data,'banner');if(!data)throw Error(NEED_BANNER);
 const [prefix,encoded]=data.split(','),bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
 const r=await fetcher('/api/token-banners',{method:'POST',headers:{'content-type':prefix.slice(5).split(';')[0]},body:bytes});
 const j=await r.json();if(!r.ok)throw Error(j.message||'Your banner did not save. Try again.');return requireBannerHash(j.sha256);
}
