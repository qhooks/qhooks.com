import {discoveryLiveness} from './qx-discovery-liveness.mjs';

const textPaint=(node,view)=>{node.textContent=view.label;};
// Bind metadata only. Numeric prices/caps, row order and original clocks stay
// with the caller. get() supplies source data, never a cache/fetch timestamp.
// S1 (2026-11-18, jitter): "Live · Ns ago" moves in 5 s steps (age floored to 5 s: never claims fresher than it is), and
// only rows on screen (IntersectionObserver, 200 px margin) are painted or woken; a row scrolled into view is painted at
// once. Rebinding the same node keeps its last painted state, and binds within one task share one refresh. The
// 30 s Live/Refreshing boundary itself is still exact (expiresAt), so D0's honesty rule is unchanged.
export const LIVENESS_STEP_MS=5000;
export function createDiscoveryLivenessView({document=globalThis.document,window=globalThis,now=Date.now,
 setTimeout=globalThis.setTimeout,clearTimeout=globalThis.clearTimeout,step=LIVENESS_STEP_MS,
 IntersectionObserver:IO=globalThis.IntersectionObserver,queue=globalThis.queueMicrotask?.bind(globalThis)||(fn=>Promise.resolve().then(fn))}={}){
 const bindings=new Map();let timer=null,away=false,disposed=false,busy=false,again=false,queued=false;
 const offscreen=new WeakSet();
 const io=typeof IO==='function'?new IO(entries=>{let shown=false;for(const e of entries){if(e.isIntersecting){if(offscreen.has(e.target)){offscreen.delete(e.target);shown=true;}}else offscreen.add(e.target);}if(shown)schedule();},{rootMargin:'200px 0px'}):null;
 const schedule=()=>{if(queued)return;queued=true;queue(()=>{queued=false;refresh();});};
 const connected=node=>node?.isConnected!==false;
 const visible=()=>!away&&!document?.hidden&&document?.visibilityState!=='hidden';
 const cancel=()=>{if(timer!==null){clearTimeout(timer);timer=null;}};
 const remove=binding=>{if(bindings.get(binding.node)===binding)bindings.delete(binding.node);};
 function refresh(){
  if(disposed)return;if(busy){again=true;return;}cancel();
  for(const [node]of bindings)if(!connected(node))bindings.delete(node);
  if(!visible()||!bindings.size)return;
  busy=true;let stamp;try{stamp=now();}catch{stamp=NaN;}let wake=null;
  try{
   for(const binding of [...bindings.values()]){
    if(bindings.get(binding.node)!==binding||!connected(binding.node)){remove(binding);continue;}
    if(offscreen.has(binding.node))continue;
    let view;try{
     const input=binding.get();
     view=discoveryLiveness(input?.row,{now:stamp,originalObservedAt:input?.originalObservedAt??null,failed:!!input?.failed});
    }catch{view=discoveryLiveness(null,{now:stamp,failed:true});}
    // Show the age in whole steps (floored), keeping the exact live flag and expiry from the real clock.
    if(view.live&&Number.isFinite(view.at)&&step>1000){try{const input=binding.get(),q=discoveryLiveness(input?.row,{now:view.at+Math.floor((stamp-view.at)/step)*step,originalObservedAt:input?.originalObservedAt??null,failed:!!input?.failed});if(q.live)view={...view,label:q.label};}catch{}}
    if(disposed||bindings.get(binding.node)!==binding||!connected(binding.node)){remove(binding);continue;}
    const key=JSON.stringify([view.label,view.at,view.live,view.expiresAt,view.reason,view.source]);
    if(key!==binding.last){
     binding.last=key;
     try{binding.paint(binding.node,view);}catch{
      // A title-only painter supplies a title-only fallback; never replace its
      // numeric contents with a generic text fallback.
      const unavailable=discoveryLiveness(null,{now:stamp,failed:true});
      try{binding.fallback(binding.node,unavailable);}catch{}
      remove(binding);continue;
     }
    }
    if(bindings.get(binding.node)!==binding||!connected(binding.node)){remove(binding);continue;}
    if(view.live&&Number.isSafeInteger(view.expiresAt)&&view.expiresAt>stamp){
     const second=view.at+(Math.floor((stamp-view.at)/step)+1)*step;
     const next=Math.min(second,view.expiresAt);wake=wake===null?next:Math.min(wake,next);
    }
   }
  }finally{busy=false;}
  if(!disposed&&visible()&&wake!==null)timer=setTimeout(()=>{timer=null;refresh();},Math.max(1,wake-stamp));
  if(again){again=false;refresh();}
 }
 const onVisibility=()=>refresh();
 const onHide=event=>{away=true;cancel();if(!event?.persisted)dispose();};
 const onShow=()=>{away=false;refresh();};
 function dispose(){if(disposed)return;disposed=true;cancel();bindings.clear();io?.disconnect();document?.removeEventListener?.('visibilitychange',onVisibility);window?.removeEventListener?.('pagehide',onHide);window?.removeEventListener?.('pageshow',onShow);}
 document?.addEventListener?.('visibilitychange',onVisibility);window?.addEventListener?.('pagehide',onHide);window?.addEventListener?.('pageshow',onShow);
 return{
  bind(node,{get,paint=textPaint,fallback=textPaint}={}){
   if(disposed||!node||!connected(node))return()=>{};
   if(typeof get!=='function'||typeof paint!=='function'||typeof fallback!=='function')throw new TypeError('Liveness binding requires getter and painters');
   const prior=bindings.get(node),binding={node,get,paint,fallback,last:prior?.last??null};bindings.set(node,binding);
   if(io&&!prior){offscreen.add(node);io.observe(node);}
   schedule();
   return()=>{if(bindings.get(node)!==binding)return;bindings.delete(node);io?.unobserve(node);offscreen.delete(node);};
  },refresh,dispose
 };
}
