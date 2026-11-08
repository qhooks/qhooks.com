// Native call entry observation over the existing public market route. No wallets, signing, polling or sends.
const ADDRESS=/^0x[0-9a-f]{40}$/i,CHAINS=new Set(['1','56','8453','42161','4663','5042']),AGE=6*3600000,FORWARD=15*60000;
function subject(board){
 const chainId=String(board?.chainId||''),controller=String(board?.controller||'').toLowerCase();
 if(board?.kind!=='launch'||!CHAINS.has(chainId)||!ADDRESS.test(controller))throw Error('A supported launch identity is required.');
 return{chainId,controller,...(ADDRESS.test(board.token||'')?{token:board.token.toLowerCase()}:{})};
}
export function callEntryMarketLink(board,referrer=''){
 const s=subject(board),ref=ADDRESS.test(referrer)?'?ref='+referrer.toLowerCase():'';
 return'/terminal'+ref+'#m='+s.chainId+':'+s.controller;
}
const details={
 no_quote:'A recent indexed trade is needed before this market can record a call entry quote. Your thesis stays saved.',
 stale:'The last indexed trade is older than six hours. Check the market, then check the entry quote again. Your thesis stays saved.',
 unavailable:'The call entry quote could not be verified from the public market response. Open the market or retry. Your thesis stays saved.'
};
export function classifyCallEntry(board,body,{now=Date.now()}={}){
 const s=subject(board),base={subject:s,source:'QHooks native market index',checkedAt:new Date(now).toISOString(),price:null,quoteSymbol:null,observedAt:null};
 const unavailable=()=>({...base,state:'unavailable',detail:details.unavailable});
 const m=body?.meta,q=body?.summary;
 if(body?.version!==1||String(m?.chainId)!==s.chainId||typeof m?.controller!=='string'||m.controller.toLowerCase()!==s.controller||!ADDRESS.test(m?.token||'')||BigInt(m.token)===0n||s.token&&m.token.toLowerCase()!==s.token||!q||typeof q!=='object')return unavailable();
 if(q.price===0&&q.lastTradeAt===null)return{...base,state:'no_quote',detail:details.no_quote};
 const ts=q.lastTradeAt,price=q.price;
 if(typeof price!=='number'||!Number.isFinite(price)||price<=0||!Number.isSafeInteger(ts)||ts<=0||ts*1000>now+FORWARD)return unavailable();
 const value={...base,price,quoteSymbol:typeof m.quoteSymbol==='string'?m.quoteSymbol.slice(0,24):null,observedAt:new Date(ts*1000).toISOString()};
 return now-ts*1000>AGE?{...value,state:'stale',detail:details.stale}:{...value,state:'ready',detail:'A recent indexed entry quote is available. The quote is checked again before your call signature; publication keeps its final price check.'};
}
export async function readCallEntry(board,{fetcher=globalThis.fetch,now=Date.now,signal,timeoutMs=7000}={}){
 const s=subject(board),controller=new AbortController(),abort=()=>controller.abort();
 signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();let timer;
 try{
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('Entry quote timeout'));},timeoutMs);});
  const body=await Promise.race([(async()=>{const response=await fetcher('/api/terminal/market/'+s.chainId+'/'+s.controller+'?tf=60',{method:'GET',cache:'no-store',credentials:'omit',signal:controller.signal});if(!response.ok)throw Error('Market unavailable');return response.json();})(),timeout]);
  if(signal?.aborted)throw Object.assign(Error('Entry check cancelled'),{name:'AbortError'});
  return classifyCallEntry(board,body,{now:now()});
 }catch(error){if(signal?.aborted)throw Object.assign(Error('Entry check cancelled'),{name:'AbortError'});return{subject:s,state:'unavailable',source:'QHooks native market index',checkedAt:new Date(now()).toISOString(),price:null,quoteSymbol:null,observedAt:null,detail:details.unavailable};}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);controller.abort();}
}
export const callEntryError=result=>Object.assign(Error(result.detail||details.unavailable),{code:'call_entry_'+result.state,entryQuote:result});
export function mountCallEntry({h,document:doc=globalThis.document,board,referrer='',fetcher=globalThis.fetch,current=()=>true,onChange=()=>{}}={}){
 subject(board);
 if(!doc.getElementById('qbc-entry-style'))doc.head.append(h('link',{id:'qbc-entry-style',rel:'stylesheet',href:'/qx-call-entry.css'}));
 const text=h('p',{class:'qbc-entry-status',role:'status','aria-live':'polite'},'The entry quote is checked before a call signature. Your thesis stays saved.'),observed=h('p',{class:'qbc-entry-observed'}),retry=h('button',{type:'button',class:'qb-link'},'Check entry quote'),market=h('a',{class:'qb-link',href:callEntryMarketLink(board,referrer)},'Open token market ↗');
 const element=h('section',{class:'qbc-entry','aria-label':'Call entry quote'},h('strong',{},'Call entry quote'),text,observed,h('div',{class:'qbc-entry-actions'},market,retry));
 let disposed=false,revision=0,controller=null,latest={state:'not_checked'};
 const active=()=>!disposed&&current()&&element.isConnected!==false;
 const present=result=>{if(!active())return;latest={...result,state:result?.state||'unavailable'};const value=typeof result?.detail==='string'?result.detail:details.unavailable;text.textContent=value;
  observed.textContent=result?.observedAt?'Observed '+result.observedAt+' · '+new Intl.NumberFormat('en-US',{maximumSignificantDigits:8}).format(result.price)+(result.quoteSymbol?' '+result.quoteSymbol:' · quote unit unavailable'):'';retry.textContent='Check again';onChange(latest);};
 async function refresh({isCurrent=()=>true}={}){
  if(!active()||!isCurrent())return null;const mine=++revision;controller?.abort();controller=new AbortController();retry.disabled=true;text.textContent='Checking the indexed call entry quote…';observed.textContent='';
  try{const result=await readCallEntry(board,{fetcher,signal:controller.signal});if(!active()||!isCurrent()||mine!==revision)return null;present(result);return result;}
  catch{return null;}finally{if(active()&&mine===revision)retry.disabled=false;}
 }
 const click=()=>void refresh();retry.addEventListener('click',click);
 return{element,refresh,present,snapshot:()=>({...latest}),dispose(){disposed=true;revision++;controller?.abort();retry.removeEventListener('click',click);}};
}
