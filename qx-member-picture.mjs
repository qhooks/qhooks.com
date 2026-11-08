// The member editor publishes still WebP; input PNG/JPEG/WebP is decoded and
// cropped by the browser before this seam. This is bounded header validation,
// not a second image decoder. Shared token artwork rules remain unchanged.
// Format: https://developers.google.com/speed/webp/docs/riff_container
// VP8 header: https://datatracker.ietf.org/doc/html/rfc6386#section-9.1
const fail=()=>{throw new TypeError('Choose a picture in the profile editor so it can be prepared safely.');};
export function memberPicture(value,{maxDimension=1024,maxLength=220000}={}){
 if(!value)return'';if(typeof value!=='string'||value.length>maxLength)return fail();
 const match=/^data:image\/webp;base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);if(!match)return fail();let text;try{text=atob(match[1]);}catch{return fail();}
 const bytes=Uint8Array.from(text,char=>char.charCodeAt(0)),view=new DataView(bytes.buffer),tag=at=>String.fromCharCode(...bytes.subarray(at,at+4)),u24=at=>bytes[at]|bytes[at+1]<<8|bytes[at+2]<<16;
 if(bytes.length<30||tag(0)!=='RIFF'||tag(8)!=='WEBP'||view.getUint32(4,true)!==bytes.length-8)return fail();
 const dimensions=(width,height)=>{if(!width||!height||width>maxDimension||height>maxDimension)return fail();return{width,height};};
 let at=12,canvas=null,image=null,alpha=false,icc=false,flags=0,chunks=0;
 while(at<bytes.length){
  if(++chunks>5||at+8>bytes.length)return fail();const kind=tag(at),size=view.getUint32(at+4,true),start=at+8,end=start+size;
  if(!size||end>bytes.length||size%2&&(end>=bytes.length||bytes[end]!==0))return fail();
  if(kind==='VP8X'){
   if(at!==12||size!==10||canvas||bytes[start]&~0x30||bytes[start+1]||bytes[start+2]||bytes[start+3])return fail();flags=bytes[start];canvas=dimensions(u24(start+4)+1,u24(start+7)+1);
  }else if(kind==='ICCP'){
   if(!canvas||!(flags&0x20)||image||alpha||icc||size>16384)return fail();icc=true;
  }else if(kind==='ALPH'){
   if(!canvas||!(flags&0x10)||image||alpha||size<2)return fail();alpha=true;
  }else if(kind==='VP8 '){
   if(image||size<11||bytes[start]&1||bytes[start+3]!==0x9d||bytes[start+4]!==0x01||bytes[start+5]!==0x2a)return fail();
   image=dimensions(view.getUint16(start+6,true)&0x3fff,view.getUint16(start+8,true)&0x3fff);
  }else if(kind==='VP8L'){
   if(image||alpha||size<6||bytes[start]!==0x2f)return fail();const bits=view.getUint32(start+1,true);if(bits>>>29)return fail();image=dimensions((bits&0x3fff)+1,((bits>>>14)&0x3fff)+1);
  }else return fail();
  at=end+(size%2);
 }
 if(at!==bytes.length||!image||canvas&&(canvas.width!==image.width||canvas.height!==image.height)||!!(flags&0x20)!==icc||alpha&&!(flags&0x10))return fail();
 return value;
}
