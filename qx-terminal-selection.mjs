// Selection intent is admitted before metadata begins. A run owns its abort
// signal and ticket token; an older completion cannot repaint or enable it.
export function createTerminalSelection({ticket,onBegin=()=>{},onClear=()=>{},onFailure=()=>{},onBlocked=()=>{}}) {
 let run=null;
 function begin(target) {
  const intent=ticket.beginSelection(target);
  if(!intent){onBlocked();return null;}
  run?.controller.abort();
  const controller=new AbortController(),next={intent,target,controller};
  next.active=()=>run===next&&ticket.isSelection(intent);
  run=next;onBegin(target,next);return next;
 }
 return Object.freeze({
  async open(target,work) {
   const next=begin(target);if(!next)return false;
   try {const result=await work(next);if(next.active()&&result===false)throw Error('This token could not be prepared. Choose it again.');return next.active();}
   catch(error){if(!next.active())return false;next.controller.abort();ticket.failSelection(next.intent,error?.message||'Could not load this token. Try again.');onFailure(error,next);return false;}
  },
  clear(){const intent=ticket.beginSelection(null);if(!intent){onBlocked();return false;}run?.controller.abort();run=null;onClear();return true;},
  current:()=>run,
 });
}

// Prepare trading after the market has painted. A failed RPC read belongs to
// the ticket; it must not remove an already available chart or trade tape.
export function prepareNativeTicket({ticket,pool,run}) {
 const prepare=()=>{
  if(!run.active())return Promise.resolve(false);
  const ready=(async()=>{
   try{return !!await ticket.setPool(pool,undefined,run.intent)&&run.active();}
   catch{if(run.active())ticket.failSelection(run.intent,'Refreshing trade setup. Market data stays visible.',{retry:prepare});return false;}
  })();
  run.ticketReady=ready;return ready;
 };
 return prepare();
}

const EVM=/^0x[0-9a-f]{40}$/i,SOL=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
function tradeTarget(value){
 if(!value)return null;const chainId=String(value.chainId||''),kind=value.kind==='launch'||value.controller?'launch':'external';
 const normalize=address=>chainId==='solana'?address:String(address||'').toLowerCase();
 const controller=kind==='launch'?normalize(value.controller):null,token=normalize(value.token||value.address);
 if(!/^(?:[1-9]\d*|solana)$/.test(chainId)||kind==='launch'&&(chainId==='solana'||!EVM.test(controller))||token&&!(chainId==='solana'?SOL.test(token):EVM.test(token))||kind==='external'&&!token)return null;
 return{kind,chainId,controller,token:token||null,key:kind+':'+chainId+':'+(controller||token)};
}
// This gate belongs to an explicit action, never ordinary market paint. A
// disconnected owner is also captured: a later wallet must not inherit a press.
export async function withTerminalTradeReady({run,ticket,target,owner,getOwner,getSelection,action,onPending=()=>{},onUnavailable=()=>{},timeoutMs=12000}){
 if(typeof getOwner!=='function'||typeof getSelection!=='function'||typeof action!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw TypeError('Invalid trade action context.');
 const wanted=tradeTarget(target),normalizeOwner=value=>value==null?null:typeof value==='string'&&(wanted?.chainId==='solana'?SOL.test(value):EVM.test(value))?wanted?.chainId==='solana'?value:value.toLowerCase():false;
 const capturedOwner=normalizeOwner(owner);
 const context=()=>{
  if(!wanted||!run?.active()||run.controller?.signal.aborted||tradeTarget(run.target)?.key!==wanted.key)return false;
  const selected=getSelection(),current=tradeTarget(selected);
  return current?.key===wanted.key&&(!wanted.token||current.token===wanted.token)&&
   (selected?.revision==null||run.intent?.revision==null||selected.revision===run.intent.revision);
 };
 const available=()=>context()&&ticket.canSelect()&&capturedOwner!==false&&normalizeOwner(getOwner())===capturedOwner;
 const unavailable=reason=>{if(context())onUnavailable(reason);return false;};
 if(!available())return unavailable('context_changed');
 if(wanted.kind==='launch'){
  const ready=run.ticketReady;if(!ready)return unavailable('unavailable');
  onPending();let timer,abort;const signal=run.controller?.signal;
  const stopped=new Promise(resolve=>{timer=setTimeout(()=>resolve(false),timeoutMs);abort=()=>resolve(false);signal?.addEventListener('abort',abort,{once:true});});
  let prepared=false;
  try{prepared=await Promise.race([Promise.resolve(ready).catch(()=>false),stopped]);}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  if(!prepared||run.ticketReady!==ready)return unavailable('unavailable');
 }
 if(!available())return unavailable('context_changed');
 return action();
}

function interactiveTarget(node){
 for(let current=node;current;current=current.parentElement||current.parentNode){
  if(/^(?:INPUT|TEXTAREA|SELECT|BUTTON|A|SUMMARY|IFRAME|DIALOG)$/.test(String(current.tagName||'').toUpperCase()))return true;
  const editable=current.getAttribute?.('contenteditable'),role=current.getAttribute?.('role');
  if(current.isContentEditable||editable!=null&&editable!=='false'||/^(?:button|link|textbox|combobox|slider|spinbutton|listbox|menuitem|tab|checkbox|radio|switch)$/.test(role||''))return true;
 }
 return false;
}
// Native control activation and an open dialog own their keys. The amount
// input retains its ticket-local Enter handler; body shortcuts stay deliberate.
export function createTerminalShortcutHandler({document=globalThis.document,isDisabled=()=>false,onShortcut}){
 if(typeof onShortcut!=='function')throw TypeError('A terminal shortcut action is required.');
 return event=>{
  if(event.defaultPrevented||event.metaKey||event.ctrlKey||event.altKey||isDisabled()||document.querySelector('dialog[open], [role="dialog"]:not([hidden])'))return;
  const active=document.activeElement;
  if(/^(?:INPUT|TEXTAREA|SELECT)$/.test(active?.tagName||'')&&event.key==='Escape'){active.blur?.();return;}
  const path=event.composedPath?.()||[event.target];
  if([...path,active].some(interactiveTarget))return;
  onShortcut(event);
 };
}

// A disclosure editor owns Escape before the terminal's capture-phase Back
// guard. Closing it must retain the selected asset and funded recovery.
export function closeTerminalOverlayOnEscape(event,document=globalThis.document){
 if(event.key!=='Escape'||event.defaultPrevented)return false;
 if(document.fullscreenElement){event.preventDefault();event.stopImmediatePropagation();void document.exitFullscreen().catch(()=>{});return true;}
 if(document.querySelector('dialog[open]'))return false;
 let details=null;
 for(let node=event.target;node;node=node.parentElement||node.parentNode)if(node.tagName==='DETAILS'&&node.open){details=node;break;}
 details||=document.querySelector('.qxt-settings[open], .qxfd-filter-details[open], .qxt-chart-tools details[open], .qxt-tape-tools details[open]');
 if(!details)return false;event.preventDefault();event.stopImmediatePropagation();details.open=false;details.querySelector('summary')?.focus();return true;
}

// A traded token can have external market metadata without native launch pools.
export function tradeAddressLabel(address,{meta,owner,tracked={}}={}) {
 if(!address||!meta)return null;
 if(address===owner)return 'You';
 if(tracked[address])return tracked[address];
 if(address===meta.owner)return 'Creator';
 if(address===meta.manager)return 'Uniswap pool';
 if(address==='0x000000000000000000000000000000000000dead'||address==='0x0000000000000000000000000000000000000000')return 'Burned';
 for(const [key,label] of [['controller','Launch contract'],['engine','Blocks engine'],['locks','Team locks'],['auction','Opening auction']])if(address===meta[key])return label;
 return Array.isArray(meta.pools)&&meta.pools.some(pool=>pool?.label==='eth'&&pool.key?.hooks===address)?'ETH pool':null;
}
