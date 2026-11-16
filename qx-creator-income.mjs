// Demand-only browser reader. Existing keyless endpoints; never Worker/provider fallback.
import {PNL_CHAINS} from './qx-wallet-pnl.mjs';
import {INCOME_ABI,RELEASED_TOPIC,incomeRaw,decodeIncomeConfig,appendIncomeLogs,incomeSnapshot} from './qx-creator-income-core.mjs';
const A=/^0x[0-9a-f]{40}$/i,H=/^0x[0-9a-f]{64}$/i,Z='0x'+'0'.repeat(40),hx=n=>'0x'+n.toString(16),MINUTE=60000;
const blockNumber=v=>{if(!/^0x[0-9a-f]+$/i.test(v||''))throw Error('invalid_block');const n=Number(BigInt(v));if(!Number.isSafeInteger(n)||n<0)throw Error('invalid_block');return n;};
function symbol(data,address){try{
  if(!/^0x(?:[0-9a-f]{2})+$/i.test(data||''))throw Error();const b=new Uint8Array(data.slice(2).match(/../g).map(v=>parseInt(v,16)));let s;
  if(b.length===32)s=new TextDecoder().decode(b).replace(/\0+$/,'');else{const off=Number(BigInt('0x'+data.slice(2,66))),len=Number(BigInt('0x'+data.slice(2+off*2,66+off*2)));if(off!==32||len<1||len>24||b.length<off+32+len)throw Error();s=new TextDecoder().decode(b.subarray(off+32,off+32+len));}return /^[A-Za-z0-9.$_-]{1,24}$/.test(s)?s:address.slice(0,6)+'…'+address.slice(-4);
}catch{return address.slice(0,6)+'…'+address.slice(-4);}}
async function boundedJson(response){
  if(!response.ok)throw Object.assign(Error('public_rpc_unavailable'),{status:response.status});if(Number(response.headers.get('content-length'))>2000000)throw Error('response_limit');
  const reader=response.body.getReader(),parts=[];let size=0;for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>2000000){await reader.cancel();throw Error('response_limit');}parts.push(r.value);}const b=new Uint8Array(size);let at=0;for(const p of parts){b.set(p,at);at+=p.length;}return JSON.parse(new TextDecoder().decode(b));
}
const validHeader=(h,n)=>h&&blockNumber(h.number)===n&&H.test(h.hash||'')&&/^0x[0-9a-f]+$/i.test(h.timestamp||'');
export function createCreatorIncomeReader({fetchImpl=globalThis.fetch,storage=(()=>{try{return globalThis.localStorage;}catch{return null;}})(),now=Date.now,chains=PNL_CHAINS}={}){
  const memory=new Map(),latest=new Map(),flights=new Map(),attempts=new Map(),endpointBackoff=new Map(),windows=new Map();let queue=Promise.resolve();
  async function batch(cfg,calls){
    if(!/^https:\/\//.test(cfg.rpc)||/alchemy|[?&](?:key|apikey|api_key)=/i.test(cfg.rpc))throw Error('paid_endpoint_refused');
    if(now()<(endpointBackoff.get(cfg.rpc)||0))throw Object.assign(Error('public_rpc_backoff'),{status:429});
    const r=await fetchImpl(cfg.rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(calls.map(([method,params],id)=>({jsonrpc:'2.0',id,method,params}))),signal:AbortSignal.timeout(8000)});
    if(r.status===429)endpointBackoff.set(cfg.rpc,now()+5*MINUTE);const data=await boundedJson(r);
    if(!Array.isArray(data)||data.length!==calls.length)throw Error('invalid_rpc_batch');const ids=new Set();for(const v of data){if(!Number.isInteger(v.id)||v.id<0||v.id>=calls.length||ids.has(v.id))throw Error('invalid_rpc_ids');ids.add(v.id);}
    return calls.map((c,id)=>{const v=data.find(v=>v.id===id);if(v.error){if(c[2]==='optional')return null;throw Object.assign(Error('public_rpc_error'),{rpcCode:v.error.code});}if(!Object.hasOwn(v,'result'))throw Error('missing_rpc_result');return v.result;});
  }
  function stored(key,source){
    try{const v=memory.get(key)||JSON.parse(storage?.getItem(key)||'null');if(!v||v.schema!==1||v.birthVerified!==true||v.identity!==source.chainId+':'+source.address||v.token!==source.token||v.quote!==source.quote||v.fromBlock!==source.fromBlock||!Number.isSafeInteger(v.cursor)||v.cursor<source.fromBlock-1||v.cursor>=source.fromBlock&&!H.test(v.anchorHash||'')||!v.released||!v.paid)return null;
      for(const n of [...Object.values(v.released),...Object.values(v.paid)])incomeRaw(n);return v;
    }catch{return null;}
  }
  function save(key,value,source){
    const newer=stored(key,source);if(newer&&(newer.cursor>value.cursor||newer.cursor===value.cursor&&newer.observedAt>value.observedAt))return newer;
    memory.set(key,value);try{const body=JSON.stringify(value);if(body.length>16000)throw Error('cache_limit');storage?.setItem(key,body);}catch{}return value;
  }
  async function run(raw){
    const source={...raw,chainId:String(raw.chainId),address:String(raw.address).toLowerCase(),token:String(raw.token).toLowerCase(),quote:String(raw.quote).toLowerCase()},cfg=chains[source.chainId];
    if(!cfg||![source.address,source.token,source.quote].every(a=>A.test(a)&&a!==Z)||source.token===source.quote)throw Error('unsupported_income_source');
    const key='qhooks:creator-income:v1:'+source.chainId+':'+source.address,hasBirth=Number.isSafeInteger(source.fromBlock)&&source.fromBlock>=0;
    let prior=hasBirth?stored(key,source):null;const last=latest.get(key)||prior?.snapshot,until=attempts.get(key)||0;if(now()<until)return last?now()-last.observedAt<MINUTE?last:{...last,status:'Refreshing',stale:true}:null;
    attempts.set(key,now()+MINUTE);let attemptedSpan=0;
    try{
      const [id,head]=await batch(cfg,[['eth_chainId',[]],['eth_blockNumber',[]]]);if(blockNumber(id)!==Number(source.chainId))throw Error('wrong_chain');
      const target=Math.max(0,blockNumber(head)-(source.chainId==='4663'?128:64)),tag=hx(target),call=(to,data,optional=false)=>['eth_call',[{to,data},tag],...(optional?['optional']:[])];
      if(prior&&prior.cursor>target)throw Error('head_behind_snapshot');
      const checkCursor=prior&&prior.cursor>=source.fromBlock;
      const calls=[['eth_getBlockByNumber',[tag,false]],call(source.address,INCOME_ABI.config),call(source.address,INCOME_ABI.quote),call(source.address,INCOME_ABI.token),call(source.quote,'0x313ce567'),call(source.token,'0x313ce567'),call(source.quote,'0x95d89b41',true),call(source.token,'0x95d89b41',true),call(source.address,INCOME_ABI.buybackPot,true),call(source.address,INCOME_ABI.lastBuyback,true),...(checkCursor?[['eth_getBlockByNumber',[hx(prior.cursor),false]]]:[])];
      // A controller may be a successor reusing older blocks. Its birth alone is
      // not a proof of complete income history. Check the bucket's code before it.
      if(hasBirth&&source.fromBlock>0&&!source.birthProven)calls.push(['eth_getCode',[source.address,hx(source.fromBlock-1)],'optional']);
      const values=await batch(cfg,calls),[header,encoded,qPending,tPending,qDec,tDec,qSym,tSym,buybackPot,lastBuyback]=values,cursorHeader=checkCursor?values[10]:null;
      const codeBefore=hasBirth&&source.fromBlock>0&&!source.birthProven?values.at(-1):null;
      if(!validHeader(header,target)||blockNumber(header.timestamp)*1000>now()+300000)throw Error('invalid_snapshot_header');
      const config=decodeIncomeConfig(encoded,source),decimals=[qDec,tDec].map(v=>Number(incomeRaw(v)));if(decimals.some(v=>!Number.isInteger(v)||v<0||v>36))throw Error('unsupported_decimals');
      if(prior?.configFingerprint&&prior.configFingerprint!==config.fingerprint)throw Error('unsupported_config_change');
      // A fork invalidates this local journal; rescan its exact birth without reusing totals.
      if(checkCursor&&(!validHeader(cursorHeader,prior.cursor)||cursorHeader.hash.toLowerCase()!==prior.anchorHash)){memory.delete(key);latest.delete(key);try{storage?.removeItem(key);}catch{}prior=null;}
      const birthVerified=hasBirth&&(source.birthProven===true||source.fromBlock===0||prior?.birthVerified===true||codeBefore==='0x');
      let state=prior||{schema:1,identity:source.chainId+':'+source.address,token:source.token,quote:source.quote,fromBlock:source.fromBlock,cursor:hasBirth?source.fromBlock-1:-1,released:{},paid:{},configFingerprint:config.fingerprint,birthVerified};
      if(hasBirth&&target<source.fromBlock)throw Error('launch_not_final');
      if(birthVerified&&state.cursor<target){
        const cap=Math.min(cfg.span||10000,1000000);let window=windows.get(key);if(!window)try{window=Number(storage?.getItem(key+':window'));}catch{}
        if(!Number.isSafeInteger(window)||window<1||window>cap)window=cap;
        const from=state.cursor+1,to=Math.min(target,from+window-1);attemptedSpan=to-from+1;
        const [logs,end,after]=await batch(cfg,[['eth_getLogs',[{address:source.address,topics:[RELEASED_TOPIC],fromBlock:hx(from),toBlock:hx(to)}]],['eth_getBlockByNumber',[hx(to),false]],...(to!==target?[['eth_getBlockByNumber',[tag,false]]]:[])]);
        if(!validHeader(end,to)||!validHeader(after||end,target)||(after||end).hash.toLowerCase()!==header.hash.toLowerCase())throw Error('snapshot_reorg');
        state=appendIncomeLogs(state,logs,{...source,payees:config.payees,from,to});state.anchorHash=end.hash.toLowerCase();
      }
      const complete=birthVerified&&state.cursor===target,snapshot=incomeSnapshot(state,{quotePending:qPending,tokenPending:tPending,config,token:source.token,quote:source.quote,complete,block:target,blockHash:header.hash,timestamp:blockNumber(header.timestamp)*1000});
      for(const [i,asset]of snapshot.currencies.entries()){asset.decimals=decimals[i];asset.symbol=symbol(i===0?qSym:tSym,asset.address);}
      Object.assign(snapshot,{chainId:source.chainId,address:source.address,fromBlock:source.fromBlock,observedAt:now(),stale:false,historyAvailable:birthVerified,buyback:{enabled:config.buybackEnabled,pot:buybackPot==null?null:incomeRaw(buybackPot).toString(),last:lastBuyback==null?null:incomeRaw(lastBuyback).toString(),cooldown:config.cfg.buybackCooldown??null,shareBps:config.cfg.buybackShareBps??null}});
      if(!birthVerified)snapshot.status=hasBirth?'History needs a verified start':'History not indexed';state.snapshot=snapshot;state.observedAt=now();if(birthVerified)state=save(key,state,source);latest.set(key,state.snapshot);return state.snapshot;
    }catch(error){
      attempts.set(key,now()+(error.status===429?5*MINUTE:MINUTE));
      if(attemptedSpan&&(['log_limit','response_limit'].includes(error.message)||error.rpcCode===-32005)){const next=Math.max(1,Math.floor(attemptedSpan/2));windows.set(key,next);try{storage?.setItem(key+':window',String(next));}catch{}}
      if(error.message==='unsupported_config_change'){memory.delete(key);latest.delete(key);try{storage?.removeItem(key);}catch{}throw error;}
      const kept=latest.get(key)||prior?.snapshot;if(kept)return {...kept,status:'Refreshing',stale:true};throw error;
    }
  }
  return {read(source){const key=String(source?.chainId)+':'+source?.address;if(flights.has(key))return flights.get(key);const job=queue.then(()=>run(source));queue=job.catch(()=>{});flights.set(key,job);return job.finally(()=>flights.delete(key));}};
}
