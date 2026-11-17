// Selection/display evidence only. Never a quote, allowance, wallet or signing authority.
import{chainById}from'./chains.mjs';
import{solWallet}from'./qx-solana-identity.mjs';
const EVM=/^0x[0-9a-f]{40}$/i,MINT=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/,POOL=/^0x(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;
const MAINNET='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const SPL=new Set(['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA','TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb']);
const norm=(chain,value)=>chain==='solana'?String(value||''):String(value||'').toLowerCase();
const record=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
// Existence evidence needs a complete ABI result; the venue's forgiving display decoder is insufficient.
export function strictTokenSymbol(value){
 if(typeof value!=='string'||!/^0x(?:[0-9a-f]{2})+$/i.test(value))return null;
 const hex=value.slice(2);let text;
 if(hex.length===64){
  const bytes=hex.match(/../g),end=bytes.findIndex(b=>b==='00');
  if(end>=0&&bytes.slice(end).some(b=>b!=='00'))return null;
  text=bytes.slice(0,end<0?bytes.length:end).join('');
 }else{
  if(hex.length<192||hex.length%64||BigInt('0x'+hex.slice(0,64))!==32n)return null;
  const size=BigInt('0x'+hex.slice(64,128));
  if(size===0n||size>BigInt((hex.length-128)/2))return null;
  const length=Number(size),padded=Math.ceil(length/32)*64;
  if(hex.length!==128+padded||!/^(?:00)*$/.test(hex.slice(128+length*2)))return null;
  text=hex.slice(128,128+length*2);
 }
 try{const symbol=new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(text.match(/../g)||[],b=>parseInt(b,16))).trim();return symbol&&!/[\u0000-\u001f\u007f]/.test(symbol)?symbol.slice(0,24):null;}catch{return null;}
}
function validWatchedBody(body,{curve,chain,address}){
 if(!record(body))return false;
 if(curve)return norm(chain,body.token)===address&&String(body.chainId)===chain&&typeof body.phase==='string'&&record(body.venue)&&typeof body.venue.name==='string';
 return norm(chain,body.address)===address&&String(body.chainId)===chain&&(!Object.hasOwn(body,'pools')||Array.isArray(body.pools)&&body.pools.every(record));
}

export function validTokenTarget(chain,address){chain=String(chain);return chain==='solana'?!!solWallet(String(address)):!!chainById(chain)&&EVM.test(String(address));}
export function hasTokenLinkIntent(hash){const p=new URLSearchParams(String(hash||'').replace(/^#/,''));return p.has('t')||p.has('m');}
export function resolutionError(code='unavailable',reason='Token data could not be loaded. Retry.'){
 return Object.assign(Error(code==='not_found'?'Token not found.':reason),{resolution:true,code,view:code==='not_found'?'Token not found':'Unable to load',retryable:code!=='not_found'});
}
function metadataProof(data,{chainId,address}){
 const chain=String(chainId),t=data?.token,m=data?.meta;
 if(!t||norm(chain,t.address)!==address||String(t.chainId)!==chain||norm(chain,m?.token)!==address||String(m?.chainId)!==chain)throw resolutionError('unavailable','The returned token does not match this link. Retry.');
 const c=t.curve;
 if(c&&norm(chain,c.token)===address&&String(c.chainId)===chain&&['curve','graduating','pool','rescued'].includes(c.phase)&&c.venue&&
  (chain==='solana'?!!solWallet(c.curve||c.historyPool||c.token):EVM.test(c.curve||'')||POOL.test(c.pool?.id||c.pool?.address||'')))return 'curve';
 if(Array.isArray(t.pools)&&t.pools.some(p=>chain==='solana'?!!solWallet(p.address||''):POOL.test(p.address||'')&&!/^0x0+$/.test(p.address)))return 'pool';
 return null;
}
export const inspectTokenMetadata=metadataProof;
async function jsonRpc(fetcher,path,calls,signal){
 const controller=new AbortController(),abort=()=>controller.abort(),timer=setTimeout(abort,8000);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)controller.abort();
 let response,body;
 try{response=await fetcher(path,{method:'POST',headers:{'content-type':'application/json','x-qhooks-read-purpose':'display'},body:JSON.stringify(calls),cache:'no-store',signal:controller.signal});if(!response.ok)throw resolutionError('unavailable','Token verification is unavailable'+(response.status===429?' (rate limited)':'')+'. Retry.');body=await response.json();}
 catch(e){if(signal?.aborted||e.resolution)throw e;throw resolutionError('unavailable','Token verification timed out or could not be loaded. Retry.');}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
 const items=Array.isArray(body)?body:[body],out=new Map();
 for(const x of items){if(x?.jsonrpc!=='2.0'||out.has(x.id))throw resolutionError();out.set(x.id,x);}
 return calls.map(c=>{const v=out.get(c.id);if(!v||v.error||!Object.hasOwn(v,'result'))return {error:true};return {value:v.result};});
}
export function createTokenExistenceProbe({fetcher=(...args)=>globalThis.fetch(...args),now=Date.now}={}){
 const cache=new Map();
 return async function probe({chainId,address,signal}){
  const chain=String(chainId);if(!validTokenTarget(chain,address))throw resolutionError('not_found');
  address=norm(chain,address);const key=chain+':'+address,old=cache.get(key);
  if(old&&now()-old.at>=0&&now()-old.at<60000)return {...old};
  let result;
  if(chain==='solana'){
   const calls=[{jsonrpc:'2.0',id:1,method:'getGenesisHash',params:[]},{jsonrpc:'2.0',id:2,method:'getAccountInfo',params:[address,{encoding:'jsonParsed',commitment:'confirmed'}]}];
   const [genesis,account]=await jsonRpc(fetcher,'/api/sol-launch/rpc',calls,signal);
   if(genesis.error||genesis.value!==MAINNET||account.error||!account.value||!Object.hasOwn(account.value,'value'))throw resolutionError();
   const mint=account.value.value;
   if(mint===null)result={exists:false,source:'Solana mainnet mint account'};
   else{
    if(!record(mint)||!solWallet(mint.owner))throw resolutionError();
    const data=mint.data?.parsed,decimals=data?.info?.decimals;
    if(!SPL.has(mint.owner)||['account','multisig'].includes(data?.type))throw resolutionError('not_found');
    if(data?.type!=='mint'||!Number.isInteger(decimals)||decimals<0||decimals>255)throw resolutionError('unavailable','This address could not be verified as a token mint. Retry.');
    result={exists:true,decimals,symbol:null,source:'Solana mainnet parsed mint account'};
   }
  }else{
   const calls=[{jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]},{jsonrpc:'2.0',id:2,method:'eth_getCode',params:[address,'latest']},
    ...[['0x95d89b41',3],['0x313ce567',4]].map(([data,id])=>({jsonrpc:'2.0',id,method:'eth_call',params:[{to:address,data},'latest']}))];
   const [id,code,symbol,decimals]=await jsonRpc(fetcher,'/api/rpc/'+chain,calls,signal);
   if(id.error||typeof id.value!=='string'||!/^0x[0-9a-f]+$/i.test(id.value)||BigInt(id.value)!==BigInt(chain)||code.error||typeof code.value!=='string'||!/^0x(?:[0-9a-f]{2})*$/i.test(code.value))throw resolutionError();
   if(code.value==='0x')result={exists:false,source:'EVM chain and empty contract code'};
   else{
    const s=!symbol.error?strictTokenSymbol(symbol.value):null,d=!decimals.error&&typeof decimals.value==='string'&&/^0x[0-9a-f]{64}$/i.test(decimals.value)?Number(BigInt(decimals.value)):null;
    if(!s||!Number.isInteger(d)||d<0||d>36)throw resolutionError('unavailable','Token metadata is unavailable. Retry.');
    result={exists:true,symbol:s,decimals:d,source:'EVM contract code and ERC-20 metadata'};
   }
  }
  if(signal?.aborted)throw new DOMException('The read was cancelled.','AbortError');
  result={...result,chainId:chain,address,at:now()};cache.set(key,result);if(cache.size>64)cache.delete(cache.keys().next().value);
  return {...result};
 };
}
function unpricedHeader(proof,tf){
 const {chainId,address}=proof,symbol=proof.symbol||address.slice(0,6)+'…'+address.slice(-4);
 const token={chainId,address,symbol,name:'',decimals:proof.decimals,pools:[],observedAt:proof.at,priceAt:null,priceUsd:null};
 return {ext:true,tf,token,meta:{chainId,token:address,symbol,name:'',quoteSymbol:'USD',owner:null},summary:{price:null,priceUsd:null,priceAt:null},candles:[],trades:[],holders:[],traders:[],
  marketCoverage:{candles:'unavailable',trades:'unavailable'},historyFreshness:{candles:{available:false},trades:{available:false}},synced:{at:0,block:0,behind:0},resolution:{state:'unpriced',proof}};
}
export function createResolvedTokenLoader({loadHeader,fetcher=(...args)=>globalThis.fetch(...args),probe=createTokenExistenceProbe({fetcher})}={}){
 return async function load({chainId,address,tf,signal}){
  const chain=String(chainId);if(!validTokenTarget(chain,address))throw resolutionError('not_found');address=norm(chain,address);
  const watched=['/api/terminal/x/token/'+chain+'/'+address,'/api/curve/'+chain+'/'+address];let failed=false,blocked=false;
  const observedFetch=async(input,init)=>{const path=new URL(typeof input==='string'?input:input.url,globalThis.location?.origin||'https://qhooks.com').pathname;const watch=watched.includes(path);
   try{const r=await fetcher(input,init);if(watch&&!r.ok&&r.status!==404)failed=true;if(watch&&[401,403,451].includes(r.status))blocked=true;
    // Observe the consumer's own parse, without consuming/cloning the response or adding a read.
    if(!watch||!r.ok)return r;
    return new Proxy(r,{get(target,key){
     if(key==='json')return async()=>{try{const body=await target.json();if(!validWatchedBody(body,{curve:path===watched[1],chain,address}))throw resolutionError();return body;}catch(error){failed=true;throw error;}};
     const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
    }});
   }catch(e){if(watch)failed=true;throw e;}};
  let data,cause;
  try{data=await loadHeader({chainId:chain,address,tf,signal,fetcher:observedFetch});}catch(e){cause=e;}
  if(signal?.aborted)throw cause||new DOMException('The read was cancelled.','AbortError');
  if(blocked)throw resolutionError('unavailable','Token data is unavailable. Retry.');
  if(data&&metadataProof(data,{chainId:chain,address}))return data;
  if(cause&&/metadata does not match/i.test(cause.message))throw resolutionError('unavailable','The returned token does not match this link. Retry.');
  if(failed)throw resolutionError('unavailable','Token data is unavailable. Retry.');
  let evidence;try{evidence=await probe({chainId:chain,address,signal});}catch(e){if(signal?.aborted||e.resolution)throw e;throw resolutionError();}
  if(evidence?.exists===false)throw resolutionError('not_found');
  if(evidence?.exists!==true)throw resolutionError();
  return unpricedHeader(evidence,tf);
 };
}
