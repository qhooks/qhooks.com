// Safe state is shared on chain. This reader stores no signatures or wallet material.
import {FOUNDING, SAFE} from './founding-config.mjs';
import {safeHashCall, keccakHex} from './qdrops-core.mjs';
export const OWNERS = Object.freeze([
 {a:'0x88db60586866294409e47bbbb0b436104f09c1b5',name:'Qhooks 1'},
 {a:'0x9b13398df547c18e68d1cfe086ff1cb5f1a84127',name:'Qhooks2'},
]);
const pad=a=>a.toLowerCase().slice(2).padStart(64,'0');
const word=/^0x[0-9a-f]{64}$/i,hash=/^0x[0-9a-f]{64}$/i;
const READ=new Set(['eth_chainId','eth_getBlockByNumber','eth_call','eth_estimateGas','eth_getTransactionReceipt']);
const event=s=>keccakHex(new TextEncoder().encode(s));
export const SAFE_SUCCESS=event('ExecutionSuccess(bytes32,uint256)'),SAFE_FAILURE=event('ExecutionFailure(bytes32,uint256)');
export const exactWeth=value=>{const n=BigInt(value),whole=n/10n**18n,fraction=(n%10n**18n).toString().padStart(18,'0').replace(/0+$/,'');return whole+(fraction?'.'+fraction:'');};
export const proposalKey=s=>s?.tx&&s.hash?String(s.nonce)+':'+s.hash.toLowerCase():null;
export function proposalHint(search){
 const q=new URLSearchParams(search),nonce=q.get('nonce'),h=q.get('safeHash');
 if(nonce===null&&h===null)return null;
 if(!/^\d{1,30}$/.test(nonce||'')||!hash.test(h||''))throw Error('The proposal link is incomplete. Remove its nonce and safeHash to review current state.');
 return {nonce:BigInt(nonce),hash:h.toLowerCase()};
}
export function proposalLink(href,s){
 const u=new URL(href);u.searchParams.set('weth',exactWeth(s.tx.amount));u.searchParams.set('nonce',String(s.nonce));u.searchParams.set('safeHash',s.hash);return u.href;
}
export function executionConfirmed(receipt,expectedHash){
 if(receipt?.status!=='0x1')return false;
 const matches=topic=>(receipt.logs||[]).some(l=>l.address?.toLowerCase()===SAFE&&l.topics?.[0]?.toLowerCase()===topic&&(l.data?.slice(0,66).toLowerCase()===expectedHash.toLowerCase()||l.topics?.[1]?.toLowerCase()===expectedHash.toLowerCase()));
 return matches(SAFE_SUCCESS)&&!matches(SAFE_FAILURE);
}
function error(message,retry=false){return Object.assign(Error(message),{retry});}
export function createSafeReader({fetchImpl=globalThis.fetch,wallet=()=>null,now=Date.now,timeoutMs=10000}={}){
 let mode='relay',id=0;
 const bounded=async work=>{let timer;try{return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(error('On-chain read timed out. Retry or read through the connected owner wallet.',true)),timeoutMs);})]);}finally{clearTimeout(timer);}};
 async function batch(calls){
  if(!calls.length||calls.length>20||calls.some(([m])=>!READ.has(m)))throw Error('Only bounded Safe reads are allowed.');
  if(mode==='wallet'){
   const c=wallet();if(!c||String(c.chainId)!==FOUNDING.pay.chain)throw error('Connect an owner wallet on Robinhood Chain before using wallet reads.');
   const values=[];for(const [method,params] of calls)values.push(await bounded(Promise.resolve().then(()=>c.entry.provider.request({method,params}))));return values;
  }
  const requests=calls.map(([method,params])=>({jsonrpc:'2.0',id:++id,method,params}));
  const controller=new AbortController();let timer;
  try{
   timer=setTimeout(()=>controller.abort(),timeoutMs);
   const r=await fetchImpl('/api/rpc/'+FOUNDING.pay.chain,{method:'POST',cache:'no-store',headers:{'content-type':'application/json','x-qhooks-read-purpose':'transaction'},body:JSON.stringify(requests),signal:controller.signal});
   if(!r.ok)throw error('On-chain relay returned HTTP '+r.status+'. Retry or read through the connected owner wallet.',true);
   const text=await r.text();if(text.length>131072)throw error('On-chain reply was too large. Retry.',true);
   const rows=JSON.parse(text);
   if(!Array.isArray(rows)||rows.length!==requests.length||new Set(rows.map(x=>x?.id)).size!==rows.length)throw error('On-chain reply was incomplete. Retry.',true);
   return requests.map(q=>{const row=rows.find(x=>x.id===q.id);if(!row||row.jsonrpc!=='2.0'||row.error||!Object.hasOwn(row,'result'))throw error(row?.error?.message||'On-chain reply was incomplete. Retry.',true);return row.result;});
  }catch(e){if(e.name==='AbortError')throw error('On-chain read timed out. Retry or read through the connected owner wallet.',true);throw e;}finally{clearTimeout(timer);}
 }
 const rpc=async(method,params)=>(await batch([[method,params]]))[0];
 const call=(to,data,from,block='latest')=>rpc('eth_call',[{to,data,...(from?{from}:{})},block]);
 async function common(){
  const [chain,block]=await batch([['eth_chainId',[]],['eth_getBlockByNumber',['latest',false]]]);
  if(BigInt(chain)!==BigInt(FOUNDING.pay.chain)||!/^0x[0-9a-f]+$/i.test(block?.number||'')||!/^0x[0-9a-f]+$/i.test(block?.timestamp||''))throw Error('The read source is not a valid Robinhood Chain head.');
  const blockTag=block.number,at=Number(BigInt(block.timestamp));
  if(!Number.isSafeInteger(at)||at>now()/1000+30||now()/1000-at>120)throw Error('The chain head is not fresh. Retry and check this device’s clock before sending.');
  const [nonce,threshold,owners,...valid]=await batch([
   ['eth_call',[{to:SAFE,data:'0xaffed0e0'},blockTag]],['eth_call',[{to:SAFE,data:'0xe75235b8'},blockTag]],
   ['eth_call',[{to:SAFE,data:'0xa0e67e2b'},blockTag]],...OWNERS.map(o=>['eth_call',[{to:SAFE,data:'0x2f54bf6e'+pad(o.a)},blockTag]]),
  ]);
  if(!word.test(nonce)||!word.test(threshold)||!/^0x[0-9a-f]{256}$/i.test(owners||''))throw Error('The Safe owner/nonce read is incomplete.');
  const w=owners.slice(2).match(/.{64}/g),actual=w.slice(2).map(x=>'0x'+x.slice(24)).sort();
  if(BigInt(threshold)!==2n||BigInt('0x'+w[0])!==32n||BigInt('0x'+w[1])!==2n||actual.join(',')!==OWNERS.map(o=>o.a).sort().join(',')||valid.some(x=>!word.test(x)||BigInt(x)!==1n))throw Error('Safe owners or threshold changed. This page requires the two verified owners and threshold 2.');
  return {nonce:BigInt(nonce),now:at,blockTag,blockNumber:String(BigInt(blockTag)),readAt:now(),readSource:mode==='wallet'?'connected wallet':'QHooks read relay',threshold:2,ownersVerified:true};
 }
 async function withHash(s){
  if(!s.tx)return {...s,hash:null,approved:[false,false]};
  const h=await call(SAFE,safeHashCall(s.tx,s.nonce),null,s.blockTag);if(!hash.test(h||''))throw Error('The Safe transaction hash is unreadable.');
  const words=await batch(OWNERS.map(o=>['eth_call',[{to:SAFE,data:'0x7d832974'+pad(o.a)+h.slice(2)},s.blockTag]]));
  if(words.some(x=>!word.test(x)))throw Error('The Safe approval read is incomplete.');
  return {...s,hash:h.toLowerCase(),approved:words.map(x=>BigInt(x)!==0n)};
 }
 return {rpc,call,batch,common,withHash,get mode(){return mode;},setMode(value){if(!['relay','wallet'].includes(value))throw Error('Unknown read source');mode=value;}};
}
