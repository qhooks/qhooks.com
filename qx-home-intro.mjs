import {mountVisibleScene} from '/qx-scene-lifecycle.mjs';

const CHAINS = ['Robinhood Chain', 'Base', 'BNB Chain', 'Arbitrum', 'Ethereum', 'Elysium', 'Monad', 'Solana'];
const mounted = new WeakMap();

// Presentation only. The existing homepage owns every market node and read.
export function mountHomeIntro({document:doc=globalThis.document,window:win=globalThis.window,mountGate=mountVisibleScene}={}) {
  const host=doc?.querySelector('[data-home-intro]');
  if(!host||!win)return null;
  if(mounted.has(host))return mounted.get(host);
  const chain=host.querySelector('[data-home-intro-chain]');
  const pause=host.querySelector('[data-home-intro-pause]');
  const preview=host.querySelector('[data-home-intro-preview]');
  if(!chain||!pause||!preview)return null;
  let controller=null,gate=null,dead=false;
  const api={dispose(){if(dead)return;gate?.dispose();cleanup();}};
  const cleanup=()=>{if(dead)return;dead=true;controller?.dispose();pause.hidden=true;mounted.delete(host);};
  mounted.set(host,api);
  gate=mountGate({host,
    async load({admitted}) {
      if(!admitted())return null;
      let index=0,timer=null,running=false,userPaused=false,disposed=false,rose=false,animation=null;
      const cancel=()=>{if(timer!==null)win.clearTimeout(timer);timer=null;};
      const paintControl=()=>{
        pause.setAttribute('aria-pressed',String(userPaused));
        pause.setAttribute('aria-label',userPaused?'Resume chain rotation':'Pause chain rotation');
        pause.title=userPaused?'Resume chain rotation':'Pause chain rotation';
        pause.setAttribute('data-paused',String(userPaused));
      };
      const schedule=()=>{
        cancel();
        if(!running||userPaused||disposed||doc.hidden||host.isConnected===false)return;
        timer=win.setTimeout(()=>{
          timer=null;
          if(!running||userPaused||disposed||doc.hidden||host.isConnected===false)return;
          index=(index+1)%CHAINS.length;chain.textContent=CHAINS[index];schedule();
        },3000);
      };
      const toggle=()=>{userPaused=!userPaused;paintControl();schedule();};
      pause.addEventListener('click',toggle);
      paintControl();
      controller={
        resume(){
          if(disposed||doc.hidden||host.isConnected===false)return;
          running=true;
          if(!rose){rose=true;animation=preview.animate?.([{transform:'translateY(18px)',opacity:.78},{transform:'none',opacity:1}],{duration:420,easing:'cubic-bezier(.2,.8,.2,1)'});}
          schedule();
        },
        pause(){running=false;cancel();animation?.cancel();animation=null;},
        dispose(){if(disposed)return;disposed=true;running=false;cancel();animation?.cancel();pause.removeEventListener('click',toggle);},
      };
      return controller;
    },
    onReady(){pause.hidden=false;},
    onFallback(){controller?.pause();pause.hidden=true;},
    onDispose:cleanup,
  });
  return api;
}

if(typeof document!=='undefined') {
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>mountHomeIntro(),{once:true});
  else mountHomeIntro();
}
