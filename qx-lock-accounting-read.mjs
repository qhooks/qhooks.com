import {TARGET,accountingSnapshot} from './qx-lock-accounting-core.mjs';
const word=n=>BigInt(n).toString(16).padStart(64,'0');
const addressWord=a=>a.slice(2).padStart(64,'0');
const quantity=h=>{if(typeof h!=='string'||!/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(h))throw Error('Incomplete chain quantity');return BigInt(h);};
const uint=h=>{if(typeof h!=='string'||!/^0x[0-9a-f]{64}$/i.test(h))throw Error('Incomplete on-chain amount');return BigInt(h);};
function blockOf(b){
 if(!b||!/^0x[0-9a-f]{64}$/i.test(b.hash||''))throw Error('Incomplete block identity');
 const number=quantity(b.number),timestamp=Number(quantity(b.timestamp));
 if(!Number.isSafeInteger(timestamp)||timestamp<=0)throw Error('Invalid block time');
 return {number:String(number),tag:'0x'+number.toString(16),hash:b.hash.toLowerCase(),timestamp};
}
export function createLockAccountingRead({fetchImpl=globalThis.fetch,now=Date.now,timeoutMs=8000}={}){
 let inFlight=null,nextId=0;
 async function batch(calls){
  if(!calls.length||calls.length>20||calls.some(([method])=>!['eth_chainId','eth_getBlockByNumber','eth_call'].includes(method)))throw Error('Invalid accounting read');
  const requests=calls.map(([method,params])=>({jsonrpc:'2.0',id:++nextId,method,params})),controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
   const response=await fetchImpl('/api/rpc/'+TARGET.chainId,{method:'POST',cache:'no-store',headers:{'content-type':'application/json','x-qhooks-read-purpose':'display'},body:JSON.stringify(requests),signal:controller.signal});
   if(!response.ok)throw Error('On-chain read unavailable');
   const text=await response.text();if(text.length>131072)throw Error('On-chain reply too large');
   const rows=JSON.parse(text);if(!Array.isArray(rows)||rows.length!==requests.length||new Set(rows.map(r=>r?.id)).size!==rows.length)throw Error('Incomplete accounting reply');
   return requests.map(q=>{const r=rows.find(r=>r.id===q.id);if(!r||r.jsonrpc!=='2.0'||r.error||!Object.hasOwn(r,'result'))throw Error('Incomplete accounting reply');return r.result;});
  }finally{clearTimeout(timer);}
 }
 async function load(){
  const [chain,rawBlock]=await batch([['eth_chainId',[]],['eth_getBlockByNumber',['latest',false]]]);
  if(quantity(chain)!==BigInt(TARGET.chainId))throw Error('Wrong read chain');
  const block=blockOf(rawBlock),age=now()/1000-block.timestamp;
  if(age< -30||age>120)throw Error('Chain head is not current');
  const stateBlock={blockHash:block.hash,requireCanonical:true};
  const call=(to,data)=>['eth_call',[{to,data},stateBlock]],calls=TARGET.ids.flatMap(id=>[
   call(TARGET.contract,'0x9507d39a'+word(id)),call(TARGET.contract,'0x968fb8ba'+word(id)),
  ]);
  calls.push(call(TARGET.contract,'0x9522a80a'+addressWord(TARGET.token)),call(TARGET.token,'0x70a08231'+addressWord(TARGET.contract)),['eth_getBlockByNumber',[block.tag,false]]);
  const result=await batch(calls),confirmed=blockOf(result[12]);
  if(confirmed.number!==block.number||confirmed.hash!==block.hash||confirmed.timestamp!==block.timestamp)throw Error('Source block changed; refresh again');
  const rawSummary=result[10];if(!/^0x[0-9a-f]{320}$/i.test(rawSummary||''))throw Error('Incomplete QLocks summary');
  const s=rawSummary.slice(2).match(/.{64}/g).map(w=>uint('0x'+w)),nextReady=Number(s[3]);
  if(!Number.isSafeInteger(nextReady)||nextReady<0||s[3]>=2n**64n)throw Error('Invalid notice time');
  const input={chainId:TARGET.chainId,contract:TARGET.contract,token:TARGET.token,block:{...block,statePin:'EIP-1898',requireCanonical:true},readAt:now(),rows:TARGET.ids.map((id,i)=>({id,blockTag:block.tag,get:result[i*2],vested:result[i*2+1]})),
   summary:{blockTag:block.tag,locked:String(s[0]),unlocked:String(s[1]),announced:String(s[2]),nextReady,locks:String(s[4])},balance:{blockTag:block.tag,amount:String(uint(result[11]))}};
  // Five token-bound get() rows plus summary's count prove their scope. Extra
  // QHOOKS lock IDs need no enumeration or additional reads to display these five.
  accountingSnapshot(input);return input;
 }
 return {read(){if(!inFlight)inFlight=load().finally(()=>{inFlight=null;});return inFlight;}};
}
