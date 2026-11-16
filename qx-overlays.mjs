// Shared dismissal for the site's native surfaces. Closing a view never submits,
// resets a form, disconnects a wallet or cancels an operation. Owners retain their
// native cancel guards and close/recovery handlers; wallet confirmation stays above us.
const installs = new WeakMap(), HISTORY = 'qhooksOverlay';
// Bundled and plain ESM copies share the document, not their module-local WeakMaps.
const CONTROLLER = Symbol.for('qhooks.overlay-controller.v1');
const HEADERS = '.qhc-heading,.qmf-heading,.qpo-sheet-bar,.qpw-sheet-head,.qtl-head,.qv-head,header';
const CLOSE = '[data-qx-dismiss],button[aria-label^="Close"],button[aria-label^="close"],#qhc-close';
const INTERACTIVE = 'button,a,input,textarea,select,[contenteditable="true"]';
const FOCUSABLE = 'button:not([disabled]),a[href],input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
export function installOverlayDismissal({document:doc=globalThis.document,window:win=globalThis.window}={}) {
 if(!doc?.body||!win)return null;
 const shared=doc[CONTROLLER];
 if(shared?.version===1){installs.set(doc,shared.api);return shared.api;}
 if(shared!==undefined)throw Error('Unsupported QHooks overlay controller version');
 if(installs.has(doc))return installs.get(doc);
 const records=new Map(),stack=[];let serial=0,lock=null,lastOpener=null,pendingBack=null;
 const id=()=>win.crypto?.randomUUID?.()||'overlay-'+Date.now()+'-'+(++serial);
 const active=r=>r.kind==='custom'?r.options.isOpen():r.kind==='popover'?r.node.matches(':popover-open'):r.node.open;
 const top=()=>[...stack].reverse().find(r=>active(r)&&!r.node.dataset.qxUnder);
 const ownsLock=r=>r.kind!=='popover'&&r.options.lock!==false;
 const externalConfirm=()=>[...doc.querySelectorAll('[data-headlessui-portal] [role="dialog"],#privy-dialog,#privy-modal-content')].some(n=>n.getClientRects().length);
 function lockPage(){
  if(lock)return;const root=doc.documentElement,style=root.style;
  lock={overflow:style.overflow,priority:style.getPropertyPriority?.('overflow')||'',padding:style.paddingRight,gutter:style.scrollbarGutter};
  const gap=Math.max(0,win.innerWidth-root.clientWidth),stable=win.CSS?.supports?.('scrollbar-gutter','stable');
  if(stable)style.scrollbarGutter='stable';else if(gap)style.paddingRight=gap+'px';
  if(style.setProperty)style.setProperty('overflow','hidden','important');else style.overflow='hidden';
 }
 function unlockPage(){
  if(!lock||stack.some(r=>r.open&&ownsLock(r)))return;
  const style=doc.documentElement.style;
  Object.assign(style,{overflow:lock.overflow,paddingRight:lock.padding,scrollbarGutter:lock.gutter});
  style.setProperty?.('overflow',lock.overflow,lock.priority);lock=null;
 }
 const marker=()=>win.history.state?.[HISTORY]?.id;
 function claim(r){
  if(r.options.history===false)return;
  r.id=id();r.url=win.location.href;
  // Replacing an owner view can happen before our previous history.back settles.
  // Claim its new entry after that owned pop, so the pending pop cannot close it.
  if(pendingBack&&marker()===pendingBack){r.pendingClaim=true;return;}
  r.pendingClaim=false;
  const state=win.history.state;win.history.pushState({...state,[HISTORY]:{id:r.id}},'',r.url);
 }
 function opened(r){
  if(r.open)return;r.open=true;r.closing=false;r.gesture=null;
  const current=doc.activeElement;r.opener=current&&!r.node.contains(current)?current:r.opener;
  if(!r.opener&&r.node.id==='qhc-dialog')r.opener=doc.getElementById('qhc-trigger');
  if(r.node.dataset.qxOverlayOpener){r.opener=doc.getElementById(r.node.dataset.qxOverlayOpener)||r.opener;delete r.node.dataset.qxOverlayOpener;}
  if(r.options.opener)r.opener=r.options.opener()||r.opener;
  stack.push(r);claim(r);if(ownsLock(r))lockPage();
  if(r.kind==='custom'&&!externalConfirm())(r.options.initialFocus?.()||r.node.querySelector(CLOSE)||r.node)?.focus?.({preventScroll:true});
 }
 function closed(r,detached=false){
  // qx-confirm-top temporarily closes/reopens a sheet under a signing prompt.
  if(!r.open||!detached&&(active(r)||r.node.dataset.qxUnder))return;
  r.open=false;r.closing=false;r.gesture=null;const at=stack.indexOf(r);if(at>=0)stack.splice(at,1);unlockPage();
  if(r.options.history!==false&&marker()===r.id){
   if(win.location.href===r.url){pendingBack=r.id;win.history.back();}
   else {const state={...win.history.state};delete state[HISTORY];win.history.replaceState(state,'',win.location.href);}
  }
  if(externalConfirm())return;
  const surface=top()?.node,candidates=[r.opener,surface?.querySelector(FOCUSABLE),doc.getElementById('qhc-trigger'),doc.getElementById('qxt-connect')];
  const target=candidates.find(n=>n?.isConnected&&!n.disabled&&n.getClientRects?.().length&&(!surface||surface.contains(n)));
  target?.focus?.({preventScroll:true});
 }
 function dismiss(r,reason='dismiss',fromPop=false){
  if(!r||!active(r)||r.node.dataset.qxUnder)return false;
  if(r.kind==='custom'){
   if(externalConfirm()||r.options.close(reason)===false||active(r)){if(fromPop)claim(r);return false;}
   closed(r);return true;
  }
  if(typeof r.options.dismiss==='function')return r.options.dismiss(reason)!==false;
  if(r.kind==='dialog'){
   const event=new win.Event('cancel',{cancelable:true});r.checking=true;
   const allowed=r.node.dispatchEvent(event);r.checking=false;
   if(!active(r)){closed(r);return true;}
   if(!allowed){if(fromPop)claim(r);return false;}
  }
  r.closing=true;
  if(r.kind==='popover')r.node.hidePopover();else r.nativeClose('qx-dismiss:'+reason);
  closed(r);return true;
 }
 function accountBody(node){
  if(node.id!=='qhc-dialog'||node.querySelector('.qx-overlay-content'))return;
  const header=node.querySelector('.qhc-heading');if(!header)return;
  const body=doc.createElement('div');body.className='qx-overlay-content';
  for(const child of [...node.childNodes])if(child!==header)body.append(child);
  node.append(body);
 }
 function register(node,options={}){
  if(records.has(node)){const r=records.get(node);Object.assign(r.options,options);return r;}
  const kind=options.custom?'custom':node.tagName==='DIALOG'?'dialog':'popover';
  const r={node,kind,options:{...options},open:false,opener:lastOpener&&!node.contains(lastOpener)?lastOpener:null,id:null,gesture:null,nativeClose:kind==='dialog'?node.close.bind(node):null};records.set(node,r);
  // Quickview already owns history, focus and scroll; its explicit successor adapter configures it.
  if(node.id==='qhooks-quickview'||node.dataset.qxOverlayHistory==='external')r.options={history:false,lock:false,passive:true,...options};
  accountBody(node);
  if(kind==='custom'){if(!node.getAttribute('tabindex'))node.setAttribute('tabindex','-1');if(options.lock!==false)node.setAttribute('aria-modal','true');}
  const originalShow=kind==='custom'?null:kind==='dialog'?node.showModal:node.showPopover;
  if(typeof originalShow==='function')node[kind==='dialog'?'showModal':'showPopover']=function(...args){
   if(!r.open)r.opener=doc.activeElement;const result=originalShow.apply(this,args);if(active(r)&&!r.options.passive)opened(r);return result;
  };
  node.addEventListener('close',()=>closed(r));
  node.addEventListener('toggle',()=>{if(r.options.passive)return;if(active(r))opened(r);else closed(r);});
  node.addEventListener('click',event=>{
   if(r.options.passive||top()!==r)return;
   const button=event.target.closest?.(CLOSE);
   // Existing close buttons keep their owner callbacks. Reconcile their native
   // close below; only an otherwise unhandled Close button needs our fallback.
   if(button&&node.contains(button))return;
   if(event.target!==node)return;const rect=node.getBoundingClientRect();
   event.stopImmediatePropagation();
   if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom){event.preventDefault();dismiss(r,'backdrop');}
  },true);
  node.addEventListener('click',event=>{
   if(r.options.passive||!active(r)||top()!==r||event.defaultPrevented)return;
   const button=event.target.closest?.(CLOSE);
   if(button&&!button.disabled&&node.contains(button)){event.preventDefault();dismiss(r,'close');}
  });
  node.addEventListener('keydown',event=>{
   if(r.options.passive||top()!==r||event.key!=='Tab')return;
   const nodes=[...node.querySelectorAll(FOCUSABLE)].filter(n=>!n.hidden&&n.getClientRects().length&&!n.closest('[hidden],[inert]'));
   const first=nodes[0],last=nodes.at(-1);
   if(!first){event.preventDefault();node.focus?.();}
   else if(r.kind==='custom'&&(!node.contains(doc.activeElement)||doc.activeElement===node)){event.preventDefault();(event.shiftKey?last:first).focus();}
   else if(event.shiftKey&&doc.activeElement===first){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&doc.activeElement===last){event.preventDefault();first.focus();}
  });
  node.addEventListener('pointerdown',event=>{
   if(r.options.passive||top()!==r||!['touch','pen'].includes(event.pointerType)||event.target.closest?.(INTERACTIVE))return;
   const header=event.target.closest?.(HEADERS);if(!header||!node.contains(header))return;
   r.gesture={id:event.pointerId,x:event.clientX,y:event.clientY,at:Date.now(),dy:0,header};header.setPointerCapture?.(event.pointerId);
  });
  node.addEventListener('pointermove',event=>{
   const g=r.gesture;if(!g||g.id!==event.pointerId)return;g.dy=event.clientY-g.y;
   if(Math.abs(event.clientX-g.x)>Math.max(20,g.dy)){r.gesture=null;return;}
   if(g.dy>12)event.preventDefault();
  },{passive:false});
  const end=event=>{const g=r.gesture;if(!g||g.id!==event.pointerId)return;r.gesture=null;if(event.type!=='pointercancel'&&g.dy>80&&Date.now()-g.at<1200)dismiss(r,'swipe');};
  node.addEventListener('pointerup',end);node.addEventListener('pointercancel',end);
  if(active(r)&&!r.options.passive)opened(r);return r;
 }
 const scan=root=>{if(root.matches?.('dialog,[popover]'))register(root);for(const node of root.querySelectorAll?.('dialog,[popover]')||[])register(node);};
 const api={register:(node,options)=>register(node,options),
  registerCustom(node,options){
   if(typeof options?.isOpen!=='function'||typeof options?.close!=='function')throw TypeError('Custom surface needs explicit owner callbacks');
   const r=register(node,{...options,custom:true});
   return {sync(){if(active(r))opened(r);else closed(r);},requestClose:reason=>dismiss(r,reason),dispose(){closed(r,true);records.delete(node);}};
  },dismiss:(node,reason)=>dismiss(records.get(node),reason),get openCount(){return stack.length;}};
 // Publish before observer/scan setup: synchronous re-entry from another ESM copy
 // must reuse this API rather than wrap native methods or attach listeners twice.
 Object.defineProperty(doc,CONTROLLER,{value:Object.freeze({version:1,api})});
 installs.set(doc,api);
 doc.addEventListener('click',event=>{const node=event.target.closest?.(INTERACTIVE);if(node)lastOpener=node;},true);
 scan(doc);
 const observer=new win.MutationObserver(changes=>{
  for(const change of changes){
   if(change.type==='childList'){for(const node of change.addedNodes)scan(node);for(const [node,r]of records)if(!node.isConnected){closed(r,true);records.delete(node);}}
   else {const r=records.get(change.target);if(r&&!r.options.passive){if(active(r))opened(r);else closed(r);}}
  }
 });
 observer.observe(doc.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open','hidden']});
 win.addEventListener('keydown',event=>{
  const r=top();if(event.defaultPrevented||event.key!=='Escape'||r?.kind!=='custom'||externalConfirm()||r.options.escape?.(event)===false)return;
  event.preventDefault();event.stopImmediatePropagation();dismiss(r,'escape');
 },true);
 doc.addEventListener('click',event=>{
  const r=top();if(event.defaultPrevented||r?.kind!=='custom'||externalConfirm()||r.node.contains(event.target)||r.opener?.contains?.(event.target)||r.options.ignoreOutside?.(event))return;
  event.preventDefault();event.stopImmediatePropagation();dismiss(r,'outside');
 },true);
 win.addEventListener('popstate',()=>{
  if(pendingBack){
   pendingBack=null;
   for(const r of stack)if(r.open&&r.pendingClaim&&active(r))claim(r);
  }
  for(const r of [...stack].reverse()){
   if(!r.open||r.options.history===false)continue;if(marker()===r.id)break;
   if(r.node.dataset.qxUnder){claim(r);break;}
   if(!dismiss(r,'back',true))break;
  }
 });
 return api;
}
