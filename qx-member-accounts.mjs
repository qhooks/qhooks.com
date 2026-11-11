// Public verified metadata only. Never turn a user-entered link into a verified account.
import {normalizeMemberLinks} from './qx-member-profile-core.mjs';
export const MEMBER_ACCOUNT_LABELS=Object.freeze({x:'X',telegram:'Telegram',discord:'Discord',farcaster:'Farcaster'});
const plainHandle=value=>typeof value==='string'&&value.length<=100&&!/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069\u200e\u200f\u200b-\u200d\u2060\ufeff]/.test(value)&&value.trim()===value&&value.length>0;
function styles(doc){if(!doc.getElementById?.('qmi-style')){const style=doc.createElement('link');style.id='qmi-style';style.rel='stylesheet';style.href='/qx-member-identity.css';doc.head?.append(style);}}
export function normalizeMemberAccounts(value){
 if(!Array.isArray(value))return[];
 const out=[],seen=new Set();
 for(const row of value.slice(0,100)){
  if(!row||!Object.hasOwn(MEMBER_ACCOUNT_LABELS,row.kind)||row.verified!==true||row.visible===false||!plainHandle(row.handle)||typeof row.url!=='string')continue;
  let url;try{url=new URL(row.url);}catch{continue;}
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash)continue;
  const expected={x:'https://x.com/',telegram:'https://t.me/',farcaster:'https://warpcast.com/'}[row.kind];
  if(expected?row.url!==expected+encodeURIComponent(row.handle.replace(/^@/,'')):url.origin!=='https://discord.com'||!/^\/users\/[A-Za-z0-9_-]{1,200}$/.test(url.pathname))continue;
  const key=row.kind+':'+row.url;if(seen.has(key))continue;seen.add(key);
  out.push({kind:row.kind,handle:row.handle,url:row.url,verified:true});
 }
 return out;
}
export function appendMemberAccountChips(target,value,{document:doc=globalThis.document,compact=false,linked=true}={}){
 const accounts=normalizeMemberAccounts(value).filter(row=>!compact||row.kind==='x'||row.kind==='farcaster');
 if(!accounts.length)return null;
 styles(doc);
 const group=doc.createElement('span');group.className='qma-chips';group.setAttribute('aria-label','Verified linked accounts');
 for(const row of accounts){
  const chip=doc.createElement(linked?'a':'span'),label=MEMBER_ACCOUNT_LABELS[row.kind];
  chip.className='qma-chip';chip.setAttribute('data-account-kind',row.kind);chip.title='Verified '+label+' @'+row.handle;
  chip.textContent='✓ '+label+(compact?'':' @'+row.handle);
  if(linked){chip.setAttribute('href',row.url);chip.setAttribute('target','_blank');chip.setAttribute('rel','noopener noreferrer nofollow ugc');}
  group.append(chip);
 }
 target.append(group);return group;
}
export function appendUnverifiedMemberLinks(target,value,{document:doc=globalThis.document}={}){
 let links;try{links=normalizeMemberLinks(value);}catch{return null;}
 if(!links.length)return null;
 styles(doc);
 const group=doc.createElement('div');group.className='qma-plain-links';
 for(const row of links){const item=doc.createElement('p'),link=doc.createElement('a'),label=doc.createElement('span');link.textContent=row.url;link.setAttribute('href',row.url);link.setAttribute('target','_blank');link.setAttribute('rel','noopener noreferrer nofollow ugc');label.textContent=' · Unverified';item.append(link,label);group.append(item);}
 target.append(group);return group;
}
