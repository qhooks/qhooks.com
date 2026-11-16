import {createRowSale} from './qx-portfolio-sell-core.mjs';
import {externalTradingNote} from './qx-external-trading.mjs';
import {chainById} from './chains.mjs';
const EVM=/^0x[0-9a-f]{40}$/i;
export const rowCanSell=(row,owner)=>!!row&&EVM.test(owner||'')&&String(row.chainId)!=='solana'&&EVM.test(row.address||'')&&row.units>0&&!row.native&&!row.spam&&!!chainById(String(row.chainId))&&(!!row.qhooks?.controller||!externalTradingNote(String(row.chainId)));
export function mountPortfolioSelling({h,getOwner,fetchImpl=globalThis.fetch,loadTicket=()=>import('./qx-terminal-trade.mjs')}={}){
 const panel=h('div',{class:'pf-row-sale',role:'group','aria-label':'Sell holding',hidden:true}),text=h('p',{role:'status','aria-live':'polite'}),preview=h('p',{class:'pf-row-sale__preview'}),actions=h('div',{class:'pf-row-sale__actions'}),engine=h('div',{class:'pf-row-sale__engine'});
 panel.append(text,preview,actions,engine);let list=null,ticket=null,loading=null,observed=null,returnFocus=null;
 const attach=()=>{const s=sale.snapshot();if(!list||!s.row)return;const node=[...list.querySelectorAll('[data-key]')].find(n=>n.dataset.key===s.row.chainId+':'+String(s.row.address).toLowerCase());if(node){node.append(panel);panel.hidden=false;}else{list.append(panel);panel.hidden=false;}};
 const json=async url=>{const r=await fetchImpl(url,{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('The market is refreshing. Try again.');return r.json();};
 async function prepare(row,percent,owner,alive){
  if(!rowCanSell(row,owner))throw Error('This holding is not available for a row sell.');
  if(!ticket){loading??=loadTicket().then(m=>m.mountTicket(engine,{rowMode:true}));ticket=await loading;
   const elements=ticket.rowElements();observed=new MutationObserver(()=>{if(sale.snapshot().phase==='submitting')text.textContent=elements.status.textContent||'Selling…';const confirm=actions.querySelector('[data-confirm]');if(confirm)confirm.disabled=elements.ready.disabled;});observed.observe(elements.status,{childList:true,subtree:true,characterData:true});observed.observe(elements.ready,{attributes:true,attributeFilter:['disabled']});}
  const assert=()=>{if(!alive()||getOwner()?.toLowerCase()!==owner.toLowerCase())throw Error('Your wallet changed. Review the sell again.');};assert();
  if(row.qhooks?.controller){
   const data=await json('/api/markets/'+row.chainId+'/'+row.qhooks.controller);assert();const p=data.pool;
   if(String(p?.chainId)!==String(row.chainId)||p?.controller?.toLowerCase()!==row.qhooks.controller.toLowerCase())throw Error('Market identity changed. Refresh holdings.');
   if(!await ticket.setPool(p,data))throw Error('The trade ticket is busy.');
  }else{
   // Same outside-token metadata and curve reader as the terminal. Never turn an on-curve holding into a generic pool sell.
   const {loadExternalHeader}=await import('./qx-terminal-data.mjs');
   const data=await loadExternalHeader({chainId:String(row.chainId),address:row.address.toLowerCase(),tf:300,fetcher:fetchImpl,signal:AbortSignal.timeout(20000)});assert();const token=data.token;
   if(row.priceLabel==='on curve'&&!token.curve)throw Error('The curve is refreshing. Try again.');
   let safety=null;if(String(row.chainId)!=='99901')try{safety=await json('/api/terminal/x/safety/'+row.chainId+'/'+row.address);}catch{}assert();
   if(!await ticket.setExternal({...token,safety,chainId:String(row.chainId),address:row.address,curve:token.curve||null,symbol:token.symbol||row.symbol,decimals:token.decimals??row.decimals}))throw Error('The trade ticket is busy.');
  }
  assert();ticket.setPriceUsd(!row.pricesRefreshing&&Number.isFinite(row.priceAt)&&Date.now()-row.priceAt<=300000?row.priceUsd:null);
  if(!await ticket.prefillSell({percent,owner,chainId:String(row.chainId),token:row.address,controller:row.qhooks?.controller,quoteNow:true}))throw Error(ticket.rowElements().status.textContent||'Could not prepare this sell.');
  assert();return ticket.sellReview();
 }
 const sale=createRowSale({owner:getOwner,prepare,send:(review,options)=>ticket.submitSell(review,options),onChange:s=>{
  attach();text.textContent=s.phase==='sold'?s.message+' · '+s.row.symbol:s.message;preview.textContent=s.review?((Number.isFinite(s.review.usd)?'≈ '+new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(s.review.usd)+' · ':'')+s.review.preview+' · '+s.review.slippageBps/100+'% slippage · '+(s.row.chainName||s.row.chainId)+(s.review.warning?' · '+s.review.warning:'')):'';
  actions.replaceChildren();const button=(label,fn)=>h('button',{type:'button',class:'qa-btn',onclick:fn},label);
  if(s.phase==='confirm'){const confirm=button('Confirm',()=>void sale.confirm());confirm.dataset.confirm='';confirm.disabled=!!ticket?.rowElements().ready.disabled;actions.append(confirm);}
  if(['preparing','confirm','undo'].includes(s.phase))actions.append(button(s.phase==='undo'?'Undo':'Cancel',()=>sale.cancel()));
  if(s.hash){const chain=chainById(s.row.chainId),url=chain?.explorer;if(url)actions.append(h('a',{href:url.replace(/\/$/,'')+'/tx/'+s.hash,target:'_blank',rel:'noopener',class:'qa-btn'},'View tx ↗'));}
  panel.dataset.phase=s.phase;if(['cancelled','error'].includes(s.phase))queueMicrotask(()=>{
   const row=[...(list?.querySelectorAll('[data-key]')||[])].find(n=>n.dataset.key===s.row.chainId+':'+String(s.row.address).toLowerCase());
   const target=returnFocus?.isConnected?returnFocus:[...(row?.querySelectorAll('button')||[])].find(n=>n.getAttribute('aria-label')==='Sell '+s.percent+'% '+s.row.symbol);
   target?.focus({preventScroll:true});
  });
 }});
 const changed=()=>sale.changed();globalThis.document?.addEventListener('qhooks:wallet-change',changed);
 return {begin(row,percent,trigger){returnFocus=trigger;void sale.begin(row,percent);},attach(root){list=root;attach();},dispose(){sale.dispose();observed?.disconnect();panel.remove();globalThis.document?.removeEventListener('qhooks:wallet-change',changed);},snapshot:sale.snapshot,changed};
}
