import {TRENDING_URL,trendingTokens,readPublicJSON,tokenRows} from './qx-market-live.mjs';
export function mountMarketFallback(host,{document:doc=globalThis.document,fetcher=globalThis.fetch}={}){
 const h=(tag,text)=>{const node=doc.createElement(tag);if(text)node.textContent=text;return node;};
 const heading=h('h2','Outside tokens · trending'),note=h('p','These tokens launched outside QHooks.'),status=h('p'),list=h('ul'),launch=h('a','Launch a token →'),retry=h('button','Retry outside tokens');
 launch.href='/create';retry.type='button';status.setAttribute('role','status');list.className='qm-outside-tokens';host.replaceChildren(heading,note,status,list,launch,retry);host.hidden=true;
 let rows=null,request=null,revision=0,selection={};
 function render(){
  const chain=selection.chainId||'all',query=(selection.query||'').trim().toLowerCase(),filtered=(rows||[]).filter(row=>(chain==='all'||row.chainId===chain)&&(!query||[row.symbol,row.name,row.address].some(v=>v.toLowerCase().includes(query))));
  list.replaceChildren(...tokenRows(doc,filtered));status.textContent=filtered.length?'Prices and changes cover the last 24 hours.':'No outside tokens match. Explore all tokens in the terminal.';
  if(!filtered.length){const terminal=h('a','Open the terminal →');terminal.href='/terminal';list.append(terminal);}
 }
 async function show(next={}){
  const mine=++revision;selection=next;host.hidden=false;retry.hidden=true;
  if(rows){render();return;}
  status.textContent='Reading outside tokens…';list.replaceChildren();
  try{
   request??=readPublicJSON(TRENDING_URL,{fetcher}).then(body=>trendingTokens(body,30)).finally(()=>{request=null;});
   const found=await request;if(mine!==revision)return;rows=found;render();
  }catch{if(mine!==revision)return;status.textContent='Outside tokens are refreshing. Launch a token or retry.';retry.hidden=false;}
 }
 retry.addEventListener('click',()=>void show(selection));
 return{show,hide(){revision++;host.hidden=true;},dispose(){revision++;host.hidden=true;}};
}
