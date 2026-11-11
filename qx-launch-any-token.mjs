// The terminal's chain-scoped EVM search, with an eligibility check before a quote is admitted.
import {chainById} from './chains.mjs';
import {createWorkspaceSearch} from './qx-terminal-workspace.mjs';
const ADDRESS=/^0x[0-9a-f]{40}$/i;
export const ANY_TOKEN_NOTE='Traded against your token in its own pool. Only tokens with no transfer fee and enough liquidity can be added.';
const stock=(chain,address)=>(chain.simpleLaunchMulti?.quotes||[]).some(q=>q[4]==='stock'&&q[2].toLowerCase()===address.toLowerCase());
export function checkedAddressQuote({chainId,address,check,stocksAllowed,selected=[],now=Date.now()}){
 const c=chainById(chainId),a=String(address||'').toLowerCase();
 if(!c||!ADDRESS.test(a)||BigInt(a)<256n)throw Error('Choose a token address on this chain.');
 if(stock(c,a)&&!stocksAllowed)throw Error('Stock-token pools aren’t available in your region.');
 if(a===c.quote.address.toLowerCase())throw Error('Use the main pair for this token.');
 if(selected.some(v=>v.toLowerCase()===a))throw Error('This pool is already selected.');
 if(check?.ok!==true)throw Error(check?.reasons?.[0]||'This token cannot be added.');
 if(typeof check.symbol!=='string'||!check.symbol.trim()||check.symbol.length>32||!Number.isInteger(check.decimals)||check.decimals<0||check.decimals>36||!Number.isFinite(check.usd)||check.usd<=0)throw Error('Token details could not be read.');
 return {index:a,address:a,symbol:check.symbol,decimals:check.decimals,risk:stock(c,a)?'stock':'custom',usd:check.usd,checkedAt:now};
}
export function mountAnyTokenPicker(host,{chainId,stocksOk,selected,onAdd,enabled=()=>true,fetchImpl=(...a)=>fetch(...a),doc=document,searchFactory=createWorkspaceSearch}={}){
 const el=(tag,attrs={},...kids)=>{const n=doc.createElement(tag);for(const[k,v]of Object.entries(attrs)){if(k in n)n[k]=v;else n.setAttribute(k,v);}n.append(...kids);return n;};
 const input=el('input',{type:'search',id:'qq-any-token',placeholder:'Search or paste an address',autocomplete:'off',spellcheck:false}),message=el('p',{class:'qq-start-note',role:'status','aria-live':'polite'}),results=el('div',{class:'qq-any-results'}),paste=el('button',{type:'button',hidden:true},'Check address');
 host.replaceChildren(el('label',{htmlFor:'qq-any-token'},'Add any token'),input,paste,message,results,el('p',{class:'qq-start-note'},ANY_TOKEN_NOTE));
 let id=String(chainId()),revision=0,checking=false,rows=[];
 const allowed=row=>String(row.chainId)===id&&ADDRESS.test(row.address||'')&&(!stock(chainById(id),row.address)||stocksOk());
 const draw=()=>{paste.hidden=!ADDRESS.test(input.value.trim());paste.disabled=checking||!enabled();results.replaceChildren(...rows.filter(allowed).slice(0,8).map(row=>{const b=el('button',{type:'button',disabled:checking||!enabled()},(row.symbol||row.name||'Token')+' · '+row.address.slice(0,6)+'…'+row.address.slice(-4));b.addEventListener('click',()=>void choose(row.address));return b;}));};
 const search=searchFactory({fetchImpl,browserSearch:null,onChange:value=>{if(value.chain!==id)return;rows=value.results;draw();}});
 async function choose(address){
  if(checking||!enabled())return false;const mine=++revision,chain=id;
  try{checkedAddressQuote({chainId:chain,address,check:{ok:true,symbol:'Token',decimals:18,usd:1},stocksAllowed:stocksOk(),selected:selected()});}catch(e){message.textContent=e.message;return false;}
  checking=true;message.textContent='Checking token…';draw();
  try{const response=await fetchImpl('/api/launch/quote-check?'+new URLSearchParams({chain,token:address.toLowerCase()}),{cache:'no-store',signal:AbortSignal.timeout(10000)}),check=response.ok?await response.json():null;
   if(mine!==revision||chain!==id||!enabled())return false;
   const quote=checkedAddressQuote({chainId:chain,address,check,stocksAllowed:stocksOk(),selected:selected()});await onAdd(quote);input.value='';rows=[];search.search('',id);message.textContent=quote.symbol+' pool added.';return true;
  }catch(e){if(mine===revision)message.textContent=e.message||'Token checks could not be read.';return false;}
  finally{if(mine===revision){checking=false;draw();}}
 }
 input.addEventListener('input',()=>{revision++;checking=false;message.textContent='';draw();search.search(input.value,id);});input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();if(ADDRESS.test(input.value.trim()))void choose(input.value.trim());}});paste.addEventListener('click',()=>void choose(input.value.trim()));
 return {choose,input,message,setChain(next){next=String(next);if(next!==id){revision++;id=next;checking=false;input.value='';message.textContent='';rows=[];search.search('',id);}draw();},dispose(){revision++;search.dispose();}};
}
