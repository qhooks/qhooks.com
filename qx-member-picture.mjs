// The member editor publishes still WebP, or canvas JPEG on WebKit; input is decoded
// and cropped by the browser before this seam. This is bounded header validation,
// not a second image decoder. Shared token artwork rules remain unchanged.
// Format: https://developers.google.com/speed/webp/docs/riff_container
// VP8 header: https://datatracker.ietf.org/doc/html/rfc6386#section-9.1
const fail=()=>{throw new TypeError('Choose a picture in the profile editor so it can be prepared safely.');};
// WebKit's canvas JPEG adds platform EXIF/Photoshop segments. Drop metadata on the
// device before validation/upload; the public validator below still rejects raw metadata.
export function memberCanvasPicture(value,options={}){
 if(typeof value!=='string'||value.length>(options.maxLength||220000))return fail();
 if(value.startsWith('data:image/webp;'))return memberPicture(value,options);
 const match=/^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);if(!match)return fail();let bytes;try{bytes=Uint8Array.from(atob(match[1]),c=>c.charCodeAt(0));}catch{return fail();}
 if(bytes.length<30||bytes[0]!==255||bytes[1]!==216)return fail();const view=new DataView(bytes.buffer),parts=[bytes.subarray(0,2)];let at=2,segments=0,scan=false;
 while(at<bytes.length){if(++segments>64||at+4>bytes.length||bytes[at]!==255)return fail();const marker=bytes[at+1],size=view.getUint16(at+2),end=at+2+size;if(size<2||end>bytes.length)return fail();if(marker===218){parts.push(bytes.subarray(at));scan=true;break;}if(!(marker>=225&&marker<=239||marker===254))parts.push(bytes.subarray(at,end));at=end;}
 if(!scan)return fail();const clean=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const part of parts){clean.set(part,offset);offset+=part.length;}let text='';for(let i=0;i<clean.length;i+=8192)text+=String.fromCharCode(...clean.subarray(i,i+8192));
 return memberPicture('data:image/jpeg;base64,'+btoa(text),options);
}
function jpeg(bytes,maxDimension){
 if(bytes.length<30||bytes[0]!==255||bytes[1]!==216)return fail();
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let at=2,segments=0,frame=null,quant=false,huffman=false,jfif=false,icc=false;
 while(at<bytes.length){
  if(++segments>64||at+4>bytes.length||bytes[at]!==255)return fail();const marker=bytes[at+1],size=view.getUint16(at+2),start=at+4,end=at+2+size;if(size<2||end>bytes.length)return fail();
  if(marker===224){
   // Canvas JFIF has no thumbnail or arbitrary application data.
   if(jfif||at!==2||size!==16||String.fromCharCode(...bytes.subarray(start,start+5))!=='JFIF\0'||bytes[start+5]!==1||bytes[start+6]>2||bytes[start+7]>2||!view.getUint16(start+8)||!view.getUint16(start+10)||bytes[start+12]||bytes[start+13])return fail();jfif=true;
  }else if(marker===226){
   // One small standard color profile is allowed; EXIF/XMP/COM and other APP data are not.
   if(icc||size<148||size>16384||String.fromCharCode(...bytes.subarray(start,start+12))!=='ICC_PROFILE\0'||bytes[start+12]!==1||bytes[start+13]!==1)return fail();
   const data=start+14,length=end-data,tag=offset=>String.fromCharCode(...bytes.subarray(data+offset,data+offset+4));
   if(view.getUint32(data)!==length||tag(36)!=='acsp'||!['RGB ','GRAY'].includes(tag(16))||!['XYZ ','Lab '].includes(tag(20)))return fail();const count=view.getUint32(data+128);if(count>64||132+count*12>length)return fail();for(let p=data+132;p<data+132+count*12;p+=12){const offset=view.getUint32(p+4),bytes=view.getUint32(p+8);if(offset<132+count*12||bytes<8||offset+bytes>length)return fail();}icc=true;
  }else if(marker===219){
   if(start===end)return fail();let p=start;while(p<end){const table=bytes[p++],precision=table>>4;if(precision>1||(table&15)>3||p+64*(precision+1)>end)return fail();p+=64*(precision+1);}if(p!==end)return fail();quant=true;
  }else if(marker===196){
   if(start===end)return fail();let p=start;while(p<end){if(p+17>end||bytes[p]>>4>1||(bytes[p]&15)>3)return fail();p++;let symbols=0;for(let n=0;n<16;n++)symbols+=bytes[p++];if(!symbols||symbols>256||p+symbols>end)return fail();p+=symbols;}if(p!==end)return fail();huffman=true;
  }else if(marker===192){
   if(frame||size<11||bytes[start]!==8)return fail();const height=view.getUint16(start+1),width=view.getUint16(start+3),count=bytes[start+5];
   if(!width||!height||width>maxDimension||height>maxDimension||![1,3].includes(count)||size!==8+3*count)return fail();const ids=new Set();for(let p=start+6;p<end;p+=3){if(ids.has(bytes[p])||bytes[p+1]>>4<1||bytes[p+1]>>4>4||(bytes[p+1]&15)<1||(bytes[p+1]&15)>4||bytes[p+2]>3)return fail();ids.add(bytes[p]);}frame={count,ids};
  }else if(marker===221){if(size!==4)return fail();
  }else if(marker===218){
   if(!frame||!quant||!huffman||size!==6+2*frame.count||bytes[start]!==frame.count)return fail();const ids=new Set();for(let p=start+1;p<end-3;p+=2){if(!frame.ids.has(bytes[p])||ids.has(bytes[p])||bytes[p+1]>>4>3||(bytes[p+1]&15)>3)return fail();ids.add(bytes[p]);}if(bytes[end-3]!==0||bytes[end-2]!==63||bytes[end-1]!==0)return fail();
   // Baseline canvas JPEG has one interleaved scan; only stuffed bytes/restarts and final EOI follow.
   let entropy=0;for(let p=end;p<bytes.length;p++){if(bytes[p]!==255){entropy++;continue;}const next=bytes[++p];if(next===0){entropy++;continue;}if(next>=208&&next<=215)continue;if(next===217&&p===bytes.length-1&&entropy>0)return;return fail();}return fail();
  }else return fail();
  at=end;
 }
 return fail();
}
export function memberPicture(value,{maxDimension=1024,maxLength=220000}={}){
 if(!value)return'';if(typeof value!=='string'||value.length>maxLength)return fail();
 const match=/^data:image\/(webp|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);if(!match)return fail();let text;try{text=atob(match[2]);}catch{return fail();}
 const bytes=Uint8Array.from(text,char=>char.charCodeAt(0)),view=new DataView(bytes.buffer),tag=at=>String.fromCharCode(...bytes.subarray(at,at+4)),u24=at=>bytes[at]|bytes[at+1]<<8|bytes[at+2]<<16;
 if(match[1]==='jpeg'){jpeg(bytes,maxDimension);return value;}
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
