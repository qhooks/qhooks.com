// Display-only admission. Primary content/actions never wait for this helper.
export function sceneMotionAllowed() {
 return !matchMedia('(prefers-reduced-motion: reduce)').matches&&!matchMedia('(prefers-reduced-data: reduce)').matches&&!navigator.connection?.saveData&&!(navigator.deviceMemory&&navigator.deviceMemory<=4);
}
export function createSceneFrames(draw,{fps=30}={}){
 const interval=1000/Math.min(30,Math.max(1,fps));let raf=0,running=false,dead=false,last=-Infinity;
 function frame(now){raf=0;if(!running||dead)return;if(now-last+.01>=interval){const dt=Number.isFinite(last)?Math.min(.1,(now-last)/1000):1/30;last=now;draw(now,dt);}if(running&&!dead)raf=requestAnimationFrame(frame);}
 return{resume(){if(running||dead)return;running=true;last=-Infinity;raf=requestAnimationFrame(frame);},pause(){running=false;cancelAnimationFrame(raf);raf=0;},dispose(){this.pause();dead=true;},get running(){return running;}};
}
export function mountVisibleScene({host,load,onReady=()=>{},onFallback=()=>{},onDispose=()=>{},enabled=()=>true}){
 if(!host||typeof IntersectionObserver!=='function'){onFallback();return{dispose(){},update(){}};}
 const motion=matchMedia('(prefers-reduced-motion: reduce)'),data=matchMedia('(prefers-reduced-data: reduce)');
 let visible=false,scene=null,loading=false,failed=false,dead=false,idle=null,active=false,pageAway=false;
 const allowed=()=>sceneMotionAllowed()&&enabled();
 const inViewport=()=>{if(host.isConnected===false)return false;if(typeof host.getBoundingClientRect!=='function')return true;const r=host.getBoundingClientRect(),s=getComputedStyle(host);return r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth&&s.visibility!=='hidden'&&s.visibility!=='collapse';};
 const admitted=()=>!dead&&!pageAway&&visible&&!document.hidden&&allowed()&&inViewport();
 const cancelIdle=()=>{if(idle===null)return;if(globalThis.cancelIdleCallback)cancelIdleCallback(idle);else clearTimeout(idle);idle=null;};
 function update(){
  if(dead)return;if(host.isConnected===false){api.dispose();return;}
  if(!admitted()){cancelIdle();scene?.pause?.();active=false;if(!allowed()||failed)onFallback();return;}
  if(failed){onFallback();return;}
  if(scene){if(!active){active=true;onReady(scene);scene.resume?.();}return;}
  if(loading||idle!==null)return;
  const start=async()=>{idle=null;if(!admitted())return;loading=true;
   try{const result=await load({admitted});if(!result){if(admitted())failed=true;return;}if(dead){result.dispose?.();return;}scene=result;}
   catch{failed=true;if(!dead)onFallback();}
   finally{loading=false;if(!dead)update();}
  };
  idle=globalThis.requestIdleCallback?requestIdleCallback(start,{timeout:1200}):setTimeout(start,80);
 }
 const observer=new IntersectionObserver(entries=>{visible=entries.some(e=>e.isIntersecting);update();},{threshold:0});
 const hide=event=>{pageAway=true;cancelIdle();scene?.pause?.();active=false;if(!event.persisted)api.dispose();};
 const show=()=>{pageAway=false;update();};
 const api={update,dispose(){if(dead)return;dead=true;cancelIdle();observer.disconnect();scene?.dispose?.();scene=null;document.removeEventListener('visibilitychange',update);motion.removeEventListener('change',update);data.removeEventListener('change',update);navigator.connection?.removeEventListener?.('change',update);removeEventListener('pagehide',hide);removeEventListener('pageshow',show);try{onDispose();}catch{}}};
 observer.observe(host);document.addEventListener('visibilitychange',update);motion.addEventListener('change',update);data.addEventListener('change',update);navigator.connection?.addEventListener?.('change',update);addEventListener('pagehide',hide);addEventListener('pageshow',show);if(!allowed())onFallback();return api;
}
