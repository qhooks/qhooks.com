import {createRowSale} from './qx-portfolio-sell-core.mjs';
import {externalTradingNote} from './qx-external-trading.mjs';
import {chainById} from './chains.mjs';
import {gasNote} from './qx-gas-preflight.mjs';
const EVM=/^0x[0-9a-f]{40}$/i;
// watch-only rows (qx-portfolio-watch.mjs) are read only: never a sell, whatever else holds
export const rowCanSell=(row,owner)=>!!row&&!row.watch&&EVM.test(owner||'')&&String(row.chainId)!=='solana'&&EVM.test(row.address||'')&&row.units>0&&!row.native&&!row.spam&&!!chainById(String(row.chainId))&&(!!row.qhooks?.controller||!externalTradingNote(String(row.chainId)));
// G3 (2026-11-18): the sell quote lives in an opaque sheet mounted on <body>, outside every row: a bottom sheet with a
// scrim on phones, a popover anchored to the tapped preset on desktop. Holdings refresh ticks rebuild rows freely; they
// never touch the sheet or the quote. The quote state is the per-sheet controller (qx-portfolio-sell-core.mjs, keyed by
// token+preset): Sell (Confirm) is enabled once a quote lands, a failed route shows the error with Retry, a stale quote
// re-quotes at most every 15 s, and closing cancels and aborts. The ticket, quote math, amounts, signer and submit path
// are unchanged.
const SHEET_CSS='/qx-sale-sheet.css';
const anySignal=(...signals)=>{const list=signals.filter(Boolean);if(list.length<2)return list[0];if(typeof AbortSignal.any==='function')return AbortSignal.any(list);const c=new AbortController();for(const s of list){if(s.aborted){c.abort(s.reason);break;}s.addEventListener('abort',()=>c.abort(s.reason),{once:true});}return c.signal;};
export function mountPortfolioSelling({h,getOwner,fetchImpl=globalThis.fetch,loadTicket=()=>import('./qx-terminal-trade.mjs'),doc=globalThis.document,desktop=()=>!!globalThis.matchMedia?.('(min-width: 760px)')?.matches}={}){
 const panel=h('div',{class:'pf-row-sale',role:'group','aria-label':'Sell holding'}),text=h('p',{role:'status','aria-live':'polite'}),preview=h('p',{class:'pf-row-sale__preview'}),actions=h('div',{class:'pf-row-sale__actions'}),engine=h('div',{class:'pf-row-sale__engine'});
 const gas=h('div',{class:'pf-row-sale__gas'});panel.append(text,preview,gas,actions,engine);
 // G4: the ticket's gas preflight; when short, the sheet shows the same note with Add gas and Confirm stays disabled.
 const paintGas=()=>{const g=ticket?.gasShort?.();gas.replaceChildren(...(g?[gasNote(h,g,{owner:getOwner()})]:[]));};let list=null,ticket=null,loading=null,observed=null,returnFocus=null;
 const title=h('b',{class:'qx-sale-sheet__title'},'Sell'),closeBtn=h('button',{type:'button',class:'qa-btn qa-btn--icon qx-sale-sheet__close','aria-label':'Close',onclick:()=>close()},'×');
 const sheet=h('div',{class:'qx-sale-sheet',role:'dialog','aria-modal':'false','aria-label':'Sell holding',hidden:true},h('div',{class:'qx-sale-sheet__head'},title,closeBtn),panel);
 const scrim=h('div',{class:'qx-sale-scrim',hidden:true,onclick:()=>close()});
 const mountSheet=()=>{if(!doc?.body)return;if(sheet.parentNode!==doc.body)doc.body.append(scrim,sheet);if(doc.head&&!doc.querySelector?.('link[data-qx-sale-sheet]')){const l=doc.createElement('link');l.rel='stylesheet';l.href=SHEET_CSS;l.setAttribute('data-qx-sale-sheet','');doc.head.append(l);}};
 const rowKey=s=>s.row?s.row.chainId+':'+String(s.row.address).toLowerCase():'';
 const trigger=s=>{if(returnFocus?.isConnected)return returnFocus;const row=[...(list?.querySelectorAll('[data-key]')||[])].find(n=>n.dataset.key===rowKey(s));return [...(row?.querySelectorAll('button')||[])].find(n=>n.getAttribute('aria-label')==='Sell '+s.percent+'% '+s.row.symbol)||null;};
 // Desktop: anchored under (or above) the preset. Phone: CSS pins it to the bottom; no inline position.
 const place=()=>{const s=sale.snapshot();if(sheet.hidden||!sheet.style)return;if(!desktop()){for(const k of ['top','left'])sheet.style[k]='';return;}
  const r=trigger(s)?.getBoundingClientRect?.();if(!r)return;const w=360,vw=globalThis.innerWidth||1440,vh=globalThis.innerHeight||900,below=r.bottom+8,height=sheet.offsetHeight||220;
  sheet.style.left=Math.max(8,Math.min(vw-w-8,r.right-w))+'px';sheet.style.top=(below+height>vh-8&&r.top-8-height>8?r.top-8-height:below)+'px';};
 const show=()=>{mountSheet();const was=sheet.hidden;sheet.hidden=false;scrim.hidden=desktop();if(was)place();};
 const hide=()=>{sheet.hidden=true;scrim.hidden=true;};
 function close(){const was=sale.close();hide();if(['preparing','undo','confirm','error','cancelled','sold','closed'].includes(was))(returnFocus?.isConnected?returnFocus:null)?.focus?.({preventScroll:true});}
 const onKey=e=>{if(e.key==='Escape'&&!sheet.hidden){e.preventDefault?.();close();}};
 const onMove=()=>place();
 doc?.addEventListener?.('keydown',onKey);globalThis.addEventListener?.('resize',onMove);globalThis.addEventListener?.('scroll',onMove,{passive:true,capture:true});
 const json=async(url,signal)=>{const r=await fetchImpl(url,{cache:'no-store',signal:anySignal(AbortSignal.timeout(15000),signal)});if(!r.ok)throw Error('The market is refreshing. Try again.');return r.json();};
 async function prepare(row,percent,owner,alive,signal){
  if(!rowCanSell(row,owner))throw Error('This holding is not available for a row sell.');
  if(!ticket){loading??=loadTicket().then(m=>m.mountTicket(engine,{rowMode:true}));ticket=await loading;
   const elements=ticket.rowElements();observed=new MutationObserver(()=>{if(sale.snapshot().phase==='submitting')text.textContent=elements.status.textContent||'Selling…';const confirm=actions.querySelector('[data-confirm]');if(confirm)confirm.disabled=elements.ready.disabled||!!sale.snapshot().requoting||!!sale.snapshot().stale;paintGas();});observed.observe(elements.status,{childList:true,subtree:true,characterData:true});observed.observe(elements.ready,{attributes:true,attributeFilter:['disabled']});}
  const assert=()=>{if(signal?.aborted||!alive()||getOwner()?.toLowerCase()!==owner.toLowerCase())throw Error('Your wallet changed. Review the sell again.');};assert();
  if(row.qhooks?.controller){
   const data=await json('/api/markets/'+row.chainId+'/'+row.qhooks.controller,signal);assert();const p=data.pool;
   if(String(p?.chainId)!==String(row.chainId)||p?.controller?.toLowerCase()!==row.qhooks.controller.toLowerCase())throw Error('Market identity changed. Refresh holdings.');
   if(!await ticket.setPool(p,data))throw Error('The trade ticket is busy.');
  }else{
   // Same outside-token metadata and curve reader as the terminal. Never turn an on-curve holding into a generic pool sell.
   const {loadExternalHeader}=await import('./qx-terminal-data.mjs');
   const data=await loadExternalHeader({chainId:String(row.chainId),address:row.address.toLowerCase(),tf:300,fetcher:fetchImpl,signal:anySignal(AbortSignal.timeout(20000),signal)});assert();const token=data.token;
   if(row.priceLabel==='on curve'&&!token.curve)throw Error('The curve is refreshing. Try again.');
   let safety=null;if(String(row.chainId)!=='99901')try{safety=await json('/api/terminal/x/safety/'+row.chainId+'/'+row.address,signal);}catch{}assert();
   if(!await ticket.setExternal({...token,safety,chainId:String(row.chainId),address:row.address,curve:token.curve||null,symbol:token.symbol||row.symbol,decimals:token.decimals??row.decimals}))throw Error('The trade ticket is busy.');
  }
  assert();ticket.setPriceUsd(!row.pricesRefreshing&&Number.isFinite(row.priceAt)&&Date.now()-row.priceAt<=300000?row.priceUsd:null);
  if(!await ticket.prefillSell({percent,owner,chainId:String(row.chainId),token:row.address,controller:row.qhooks?.controller,quoteNow:true}))throw Error(ticket.rowElements().status.textContent||'Could not prepare this sell.');
  assert();return ticket.sellReview();
 }
 const sale=createRowSale({owner:getOwner,prepare,send:(review,options)=>ticket.submitSell(review,options),onChange:s=>{
  if(s.phase==='closed'||s.phase==='idle'){hide();return;}
  title.textContent=s.row?'Sell '+s.percent+'% '+(s.row.symbol||'token'):'Sell';
  show();text.textContent=s.phase==='sold'?s.message+' · '+s.row.symbol:s.message;preview.textContent=s.review?((Number.isFinite(s.review.usd)?'≈ '+new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(s.review.usd)+' · ':'')+s.review.preview+' · '+s.review.slippageBps/100+'% slippage · '+(s.row.chainName||s.row.chainId)+(s.review.warning?' · '+s.review.warning:'')):'';
  text.classList?.toggle?.('pf-row-sale__error',s.phase==='error');
  actions.replaceChildren();const button=(label,fn,cls='qa-btn')=>h('button',{type:'button',class:cls,onclick:fn},label);
  if(s.phase==='confirm'){const confirm=button('Confirm',()=>void sale.confirm(),'qa-btn qa-btn--primary');confirm.dataset.confirm='';confirm.disabled=!!ticket?.rowElements().ready.disabled||!!s.requoting||!!s.stale;actions.append(confirm);
   if(s.stale)actions.append(button('Refresh quote',()=>sale.refresh()));}
  if(s.phase==='error'&&!s.hash&&s.row)actions.append(button('Retry',()=>sale.retry(),'qa-btn qa-btn--primary'));
  if(['preparing','confirm','undo'].includes(s.phase))actions.append(button(s.phase==='undo'?'Undo':'Cancel',()=>sale.cancel()));
  if(s.hash){const chain=chainById(s.row.chainId),url=chain?.explorer;if(url)actions.append(h('a',{href:url.replace(/\/$/,'')+'/tx/'+s.hash,target:'_blank',rel:'noopener',class:'qa-btn'},'View tx ↗'));}
  paintGas();panel.dataset.phase=s.phase;sheet.dataset.phase=s.phase;
 }});
 const changed=()=>sale.changed();doc?.addEventListener?.('qhooks:wallet-change',changed);
 return {
  begin(row,percent,trigger){returnFocus=trigger;void sale.begin(row,percent);},
  // Holdings repaint: the sheet is not in the list, so a rebuild cannot remove or restart it; only re-anchor on desktop.
  attach(root){list=root;place();},
  close,
  dispose(){sale.dispose();observed?.disconnect();sheet.remove();scrim.remove();doc?.removeEventListener?.('keydown',onKey);doc?.removeEventListener?.('qhooks:wallet-change',changed);globalThis.removeEventListener?.('resize',onMove);globalThis.removeEventListener?.('scroll',onMove,{capture:true});},
  snapshot:sale.snapshot,changed,sheet,
 };
}
