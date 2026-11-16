export function node(tag,attrs={},...kids){const n=document.createElement(tag);for(const[k,v]of Object.entries(attrs)){if(v===null||v===undefined)continue;if(k==='class')n.className=v;else if(k==='onClick')n.addEventListener('click',v);else n.setAttribute(k,String(v));}n.append(...kids.flat().filter(k=>k!==null&&k!==undefined));return n;}
export const ago=at=>{if(!at)return 'Time unavailable';const age=Math.max(0,Date.now()-at);return age<60000?'Just now':age<3600000?Math.floor(age/60000)+'m ago':age<86400000?Math.floor(age/3600000)+'h ago':new Date(at).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});};
export const utc=at=>at?new Date(at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:'UTC'}):null;
export const usd=value=>Number.isFinite(value)&&value>0?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:value<1?6:2}).format(value):'Refreshing';
export function wireRows(items){return items.map(e=>node('a',{class:'qn-event',href:e.url},
 e.at?node('time',{class:'qn-event-time',datetime:new Date(e.at).toISOString(),title:new Date(e.at).toUTCString()},utc(e.at)):node('span',{class:'qn-event-time',title:'Block '+e.block},'#'+e.block),
 node('span',{class:'qn-event-chain',title:e.chainName},({'4663':'RH','8453':'Base','1':'ETH','42161':'ARB','56':'BNB','99901':'ELY','143':'MON',solana:'SOL'}[e.chain]||e.chainName)),
 node('span',{class:'qn-kind','data-kind':e.kind,title:e.kind},e.kind.replaceAll('_',' ')),
 node('strong',{class:'qn-event-symbol',title:e.symbol},e.symbol),
 node('span',{class:'qn-event-detail',title:e.quote?e.quote+' '+(e.quoteSymbol||'quote')+(e.valueUsd?' · '+usd(e.valueUsd):''):e.title},e.quote?new Intl.NumberFormat('en-US',{maximumSignificantDigits:6}).format(e.quote)+' '+(e.quoteSymbol||'quote')+(e.large?' · '+usd(e.valueUsd):''):e.valueUsd?usd(e.valueUsd):e.title)));}
export function empty(message){return node('p',{class:'qn-empty'},message);}
export function visibleTask(load,interval=30000){
 let timer=null,controller=null,stopped=false,running=false;
 async function run(){clearTimeout(timer);if(stopped||document.hidden||running)return;running=true;controller=new AbortController();try{await load(controller.signal);}catch(e){if(e.name!=='AbortError')console.warn('news refresh unavailable');}finally{running=false;controller=null;if(!stopped&&!document.hidden)timer=setTimeout(run,interval);}}
 const visibility=()=>{clearTimeout(timer);if(document.hidden)controller?.abort();else if(!running)void run();};
 document.addEventListener('visibilitychange',visibility);const stop=()=>{stopped=true;clearTimeout(timer);controller?.abort();document.removeEventListener('visibilitychange',visibility);};addEventListener('pagehide',stop,{once:true});void run();return {refresh:run,stop};
}
