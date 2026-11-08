// Small read-only views over the terminal feed and the existing market directory.
import {CHAINS,money,percent} from './qx-terminal-feed-core.mjs';
import {officialLogo} from './qx-official.mjs';
export const TRENDING_URL='/api/terminal/market/feed?tab=trending&chain=all';
export const LAUNCHES_URL='/api/markets?chain=all&q=&offset=0&limit=24';
const address=(chain,value)=>typeof value==='string'&&(chain==='solana'?/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value):/^0x[0-9a-f]{40}$/i.test(value)&&BigInt(value)>0n);
const supported=chain=>CHAINS.some(([id])=>id!=='all'&&id===chain);
const logoURL=value=>{if(typeof value!=='string'||!/^https:\/\//i.test(value))return null;try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null;}catch{return null;}};
export function trendingTokens(body,limit=5){
 if(body?.version!==1||!Array.isArray(body.rows))throw Error('Invalid public feed');
 const seen=new Set();
 return body.rows.filter(row=>{
  const chain=String(row?.chainId),token=row?.token,id=chain+':'+(chain==='solana'?token?.address:String(token?.address).toLowerCase());
  if(!supported(chain)||!address(chain,token?.address)||seen.has(id))return false;
  seen.add(id);return true;
 }).slice(0,limit).map(row=>({symbol:row.token.symbol||row.token.name||'Token',name:row.token.name||'',address:row.token.address,chainId:String(row.chainId),
  href:'/terminal#t='+encodeURIComponent(String(row.chainId))+':'+encodeURIComponent(row.token.address),
  logo:logoURL(row.token.logo)||logoURL(officialLogo(row.chainId,row.token.address)),price:money(row.priceUsd,{precise:true}),change:percent(row.change?.h24),direction:typeof row.change?.h24==='number'&&Number.isFinite(row.change.h24)?Math.sign(row.change.h24):0}));
}
export function newestLaunch(body){
 if(body?.version!==1||body.kind!=='qhooks-market-directory'||!Array.isArray(body.rows))throw Error('Invalid launch directory');
 const row=body.rows.filter(row=>row&&supported(String(row.chainId))&&address(String(row.chainId),row.controller)&&Number.isSafeInteger(row.listedAt)&&row.listedAt>0)
  .sort((a,b)=>b.listedAt-a.listedAt)[0];
 return row?{symbol:row.symbol||row.tokenName||'Token',name:row.tokenName||'',href:'/terminal#m='+row.chainId+':'+row.controller}:null;
}
export async function readPublicJSON(url,{fetcher=globalThis.fetch,signal}={}){
 const response=await fetcher(url,{cache:'no-store',credentials:'omit',signal});
 if(!response.ok)throw Error('Public data unavailable');return response.json();
}
export function tokenRows(doc,rows,{className='qx-live-token',logos=false}={}){
 const node=(tag,cls,text)=>{const el=doc.createElement(tag);if(cls)el.className=cls;if(text!=null)el.textContent=text;return el;};
 return rows.map(row=>{
  const li=node('li'),link=node('a',className);link.href=row.href;
  if(logos){const avatar=node('span','qx-live-avatar',row.symbol.replace(/^\$/, '').slice(0,1).toUpperCase()||'?');avatar.setAttribute('aria-hidden','true');
   const logo=logoURL(row.logo);if(logo){const img=node('img');img.src=logo;img.alt='';img.width=32;img.height=32;img.decoding='async';img.referrerPolicy='no-referrer';img.addEventListener('error',()=>{img.hidden=true;},{once:true});avatar.append(img);}link.append(avatar);}
  const symbol=node('b','qx-live-symbol',row.symbol);symbol.title=row.name;
  const change=node('span','qx-live-change',row.change);change.dataset.direction=String(row.direction);change.setAttribute('aria-label','24-hour change '+row.change);
  link.append(symbol,node('span','qx-live-price',row.price),change);li.append(link);return li;
 });
}
