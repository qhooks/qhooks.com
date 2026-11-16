// Fast access to saved and recently searched/opened tokens. Trading stays in the existing selection flow.
import {officialLogo} from './qx-official.mjs';
import {bindTokenAvatar} from './qx-token-avatar.mjs';
import {chainById} from './chains.mjs';
import {createTokenListPrices,tokenListQuoteText} from './qx-token-list-prices.mjs';
const nameOf = row => row.symbol || row.name || short(row.token || row.controller);
const short = value => String(value || '').slice(0,6) + '…' + String(value || '').slice(-4);
const chainOf = row => row.chainId === 'solana' ? 'Solana' : chainById(row.chainId)?.short || row.chainId;
export function mountTokenLibrary(api, {document:doc=globalThis.document, discoveryHeading,marketRows=()=>[],fetchImpl=globalThis.fetch,storage=(()=>{try{return globalThis.localStorage;}catch{return null;}})(),now=Date.now}={}) {
 if (!api?.library || doc.getElementById('qxt-token-library')) return null;
 const library=api.library;
 const el=(tag,attrs={},...children)=>{const n=doc.createElement(tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,String(v));n.append(...children);return n;};
 const button=(label,attrs={})=>el('button',{type:'button',...attrs},label);
 const dialog=el('dialog',{id:'qxt-token-library',class:'qtl-dialog','aria-labelledby':'qtl-title','aria-describedby':'qtl-note'});
 const title=el('h2',{id:'qtl-title'},'Your tokens'),close=button('×',{'aria-label':'Close token lists',class:'qtl-close'});
 const note=el('p',{id:'qtl-note',class:'qtl-note'}),tabs=el('div',{role:'tablist','aria-label':'Saved token lists',class:'qtl-tabs'});
 const query=el('input',{type:'search',placeholder:'Filter tokens or contracts','aria-label':'Filter saved tokens',autocomplete:'off'});
 const chain=el('select',{'aria-label':'Filter saved tokens by chain'},el('option',{value:'all'},'All chains'));
 const clear=button('Clear recent',{class:'qtl-clear'}),status=el('p',{role:'status','aria-live':'polite',class:'qtl-status'});
 const list=el('ul',{class:'qtl-list',role:'tabpanel',id:'qtl-list'}),empty=el('p',{class:'qtl-empty',hidden:''});
 const tabButtons=new Map(),launchers=[];
 let mode='watch',opener=null,last='',pending=false,avatars=[];
 const prices=createTokenListPrices({fetchImpl,storage,now}),quoteNodes=new Map(),requested=new Set();
 let priceAbort=null,priceGeneration=0,priceQueued=false,ageTimer=null;
 function paintQuotes(){for(const {row,price,change,detail}of quoteNodes.values()){const q=tokenListQuoteText(prices.cached(row));price.textContent=q.price;change.textContent=q.change;change.className='qtl-change'+(q.direction>0?' is-positive':q.direction<0?' is-negative':'');detail.textContent=[q.onCurve?'on curve':'',q.refreshing?'Refreshing':''].filter(Boolean).join(' · ');detail.hidden=!detail.textContent;}}
 function requestVisible(){
  if(!dialog.open||doc.visibilityState==='hidden')return;
  const box=list.getBoundingClientRect(),rows=[...list.children].filter(li=>{const r=li.getBoundingClientRect();return r.bottom>box.top&&r.top<box.bottom;}).map(li=>quoteNodes.get(li.dataset.key)?.row).filter(r=>r&&!requested.has(r.key)).slice(0,24);
  if(!rows.length)return;for(const r of rows)requested.add(r.key);const generation=priceGeneration;
  void prices.read(rows,{signal:priceAbort?.signal}).then(()=>{if(dialog.open&&generation===priceGeneration)paintQuotes();});
 }
 function queuePrices(){if(priceQueued)return;priceQueued=true;queueMicrotask(()=>{priceQueued=false;requestVisible();});}
 for(const [key,label]of [['watch','Watchlist'],['recent','Recent']]){
  const b=button(label,{role:'tab',id:'qtl-tab-'+key,'aria-controls':'qtl-list','aria-selected':String(key===mode),tabindex:key===mode?0:-1});
  b.addEventListener('click',()=>{mode=key;last='';render();});
  b.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();mode=e.key==='Home'?'watch':e.key==='End'?'recent':mode==='watch'?'recent':'watch';last='';render();tabButtons.get(mode).focus();});
  tabButtons.set(key,b);tabs.append(b);
 }
 dialog.append(el('div',{class:'qtl-head'},title,close),note,tabs,el('div',{class:'qtl-filters'},query,chain),el('div',{class:'qtl-tools'},clear,status),list,empty);
 doc.body.append(dialog);
 function makeAccess(className){
  const slot=el('div',{class:'qtl-shortcuts '+className,'aria-label':'Your token lists'});
  for(const [key,label,mark]of [['watch','Watchlist','☆'],['recent','Recent','↺']]){
   const count=el('span',{class:'qtl-count'},'0'),b=button('',{'aria-haspopup':'dialog','aria-controls':dialog.id,class:'qtl-launch'});
   b.append(el('span',{'aria-hidden':'true',class:'qtl-glyph'},mark),el('span',{},label),count);b.addEventListener('click',()=>open(key,b));slot.append(b);launchers.push({key,label,count,button:b});
  }return slot;
 }
 discoveryHeading?.append(makeAccess('qtl-discovery-access'));
 const marketAccess=makeAccess('qtl-market-access');doc.getElementById('qxt-main').before(marketAccess);
 function snapshot(){const s=library.snapshot();return {...s,recent:s.recent||[],watched:s.watched||[]};}
 function render(){
  const s=snapshot();for(const {key,label,count,button:b}of launchers){const n=(key==='watch'?s.watched:s.recent).length;count.textContent=n;b.setAttribute('aria-label',label+', '+n+' token'+(n===1?'':'s'));}
  if(!dialog.open)return;
  prices.seed([...s.recent,...s.watched,...marketRows()]);
  note.textContent=s.synced?'Watchlist syncs with your account. Recent tokens stay on this device.':s.persistent?'Saved on this device. Recent fills as you search and open tokens.':'Kept for this session. Browser storage is unavailable.';
  for(const [key,b]of tabButtons){b.setAttribute('aria-selected',String(key===mode));b.tabIndex=key===mode?0:-1;}
  list.setAttribute('aria-labelledby','qtl-tab-'+mode);clear.hidden=mode!=='recent'||!s.recent.length;
  const all=mode==='watch'?s.watched:s.recent,ids=[...new Set(all.map(r=>r.chainId))];
  const currentChain=chain.value;if(JSON.stringify([...chain.options].map(o=>o.value))!==JSON.stringify(['all',...ids])){chain.replaceChildren(el('option',{value:'all'},'All chains'),...ids.map(id=>el('option',{value:id},chainOf({chainId:id}))));chain.value=ids.includes(currentChain)?currentChain:'all';}
  const q=query.value.trim().toLowerCase(),rows=all.filter(r=>(chain.value==='all'||r.chainId===chain.value)&&(!q||[r.symbol,r.name,r.token,r.controller,chainOf(r)].some(v=>String(v||'').toLowerCase().includes(q))));
  const signature=JSON.stringify([mode,q,chain.value,rows.map(r=>[r.key,r.name,r.symbol,r.openedAt,r.source,r.avatarSources,library.has(r)])]);
  if(signature===last)return;last=signature;
  const focused=doc.activeElement,focusedKey=focused?.closest('.qtl-row')?.dataset.key,focusedAction=focused?.dataset.action;
  avatars.forEach(dispose=>dispose());avatars=[];quoteNodes.clear();
  list.replaceChildren(...rows.map(row=>{
   const address=row.token||row.controller,label=nameOf(row),li=el('li',{class:'qtl-row','data-key':row.key});
   const openButton=button('',{class:'qtl-open-token','data-action':'open','aria-label':'Open '+label+' on '+chainOf(row)+' '+address});
   const info=el('span',{class:'qtl-token-info'},el('b',{},label),el('code',{title:address},short(address)),el('span',{class:'qtl-token-chain'},chainOf(row)));
   const price=el('b',{class:'qtl-price'}),change=el('span',{class:'qtl-change'}),detail=el('small',{class:'qtl-price-state'}),quote=el('span',{class:'qtl-quote','aria-label':'Price and 24 hour change'},price,change,detail);quoteNodes.set(row.key,{row,price,change,detail});
   const art=el('span',{class:'qtl-token-art','aria-hidden':'true'},label.slice(0,1).toUpperCase()),img=el('img',{alt:'',decoding:'async',width:'38',height:'38'});art.append(img);
   const profile=/^\d+$/.test(row.chainId)&&/^0x[0-9a-f]{40}$/i.test(address)?['/api/token-profiles/'+row.chainId+'/'+address.toLowerCase()+'/image']:[];
   avatars.push(bindTokenAvatar(img,row,[...(row.avatarSources||[]),officialLogo(row.chainId,address),...profile]));openButton.append(art,info,quote);
   openButton.addEventListener('click',async()=>{if(pending)return;pending=true;openButton.disabled=true;status.textContent='Opening '+label+'…';try{const result=row.kind==='launch'?await api.select(row.chainId,row.controller):await api.selectExternal(row.chainId,row.token);if(result===false){status.textContent='Could not open this token. If a trade is active, finish it first, then try again.';}else dialog.close();}catch{status.textContent='Could not open this token. Try again.';}finally{pending=false;openButton.disabled=false;}});
   const watched=library.has(row),watch=button(watched?'★':'☆',{class:'qtl-row-action','data-action':'watch','aria-pressed':String(watched),'aria-label':(watched?'Remove ':'Add ')+label+(watched?' from':' to')+' watchlist'});
   watch.addEventListener('click',async()=>{watch.disabled=true;try{await library.watch(row,!library.has(row));status.textContent='';last='';render();}catch(e){status.textContent=e.message||'Could not save this token.';}finally{watch.disabled=false;}});
   li.append(openButton,watch);
   if(mode==='recent'){const remove=button('×',{class:'qtl-row-action','data-action':'remove','aria-label':'Remove '+label+' from recent'});remove.addEventListener('click',()=>library.removeRecent(row));li.append(remove);}
   if(mode==='recent'&&row.openedAt){const seconds=Math.max(0,Math.floor((Date.now()-row.openedAt)/1000)),ago=seconds<60?'just now':seconds<3600?Math.floor(seconds/60)+'m ago':seconds<86400?Math.floor(seconds/3600)+'h ago':Math.floor(seconds/86400)+'d ago';info.append(el('small',{class:'qtl-seen'},(row.source==='searched'?'Searched ':'Viewed ')+ago));}
   return li;
  }));
  paintQuotes();queuePrices();
  empty.hidden=!!rows.length;empty.textContent=q||chain.value!=='all'?'No saved tokens match these filters.':mode==='watch'?'Star a token in the feed or token view to keep it here.':'Search for tokens or open a token to build your recent list.';
  if(focusedKey&&!focused.isConnected){const row=[...list.children].find(r=>r.dataset.key===focusedKey);(row?.querySelector('[data-action="'+focusedAction+'"]')||list.querySelector('button')||query).focus({preventScroll:true});}
 }
 function open(key,trigger){if(mode!==key){query.value='';chain.value='all';}mode=key;opener=trigger;status.textContent='';last='';if(!dialog.open){requested.clear();priceGeneration++;priceAbort=new AbortController();dialog.showModal();ageTimer=setInterval(paintQuotes,15000);}doc.body.classList.add('qtl-open');render();query.focus({preventScroll:true});}
 close.addEventListener('click',()=>dialog.close());
 dialog.addEventListener('close',()=>{priceGeneration++;priceAbort?.abort();priceAbort=null;clearInterval(ageTimer);ageTimer=null;doc.body.classList.remove('qtl-open');opener?.focus({preventScroll:true});});
 dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();});
 dialog.addEventListener('keydown',event=>event.stopPropagation());
 query.addEventListener('input',render);chain.addEventListener('change',render);clear.addEventListener('click',()=>{library.clearRecent();status.textContent='Recent tokens cleared. Your watchlist is unchanged.';render();});
 list.addEventListener('scroll',queuePrices,{passive:true});doc.addEventListener('visibilitychange',()=>{if(doc.visibilityState!=='hidden')queuePrices();});
 doc.addEventListener('qxt:library',render);render();return {open,render};
}
