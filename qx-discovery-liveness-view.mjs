import {discoveryLiveness} from './qx-discovery-liveness.mjs';

const textPaint=(node,view)=>{node.textContent=view.label;};
// Bind metadata only. Numeric prices/caps, row order and original clocks stay
// with the caller. get() supplies source data, never a cache/fetch timestamp.
export function createDiscoveryLivenessView({document=globalThis.document,window=globalThis,now=Date.now,
 setTimeout=globalThis.setTimeout,clearTimeout=globalThis.clearTimeout}={}){
 const bindings=new Map();let timer=null,away=false,disposed=false,busy=false,again=false;
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
    let view;try{
     const input=binding.get();
     view=discoveryLiveness(input?.row,{now:stamp,originalObservedAt:input?.originalObservedAt??null,failed:!!input?.failed});
    }catch{view=discoveryLiveness(null,{now:stamp,failed:true});}
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
     const second=view.at+(Math.floor((stamp-view.at)/1000)+1)*1000;
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
 function dispose(){if(disposed)return;disposed=true;cancel();bindings.clear();document?.removeEventListener?.('visibilitychange',onVisibility);window?.removeEventListener?.('pagehide',onHide);window?.removeEventListener?.('pageshow',onShow);}
 document?.addEventListener?.('visibilitychange',onVisibility);window?.addEventListener?.('pagehide',onHide);window?.addEventListener?.('pageshow',onShow);
 return{
  bind(node,{get,paint=textPaint,fallback=textPaint}={}){
   if(disposed||!node||!connected(node))return()=>{};
   if(typeof get!=='function'||typeof paint!=='function'||typeof fallback!=='function')throw new TypeError('Liveness binding requires getter and painters');
   const binding={node,get,paint,fallback,last:null};bindings.set(node,binding);refresh();
   return()=>{if(bindings.get(node)!==binding)return;bindings.delete(node);refresh();};
  },refresh,dispose
 };
}
