// Read-only history: prefer a quick first-party answer, start the existing
// fallback when it is slow, and stop whichever read is no longer needed.
export function readHistoryPanel({primary, fallback, useful, signal, delayMs=250, limitMs=12000}) {
  return new Promise((resolve,reject) => {
    const main=new AbortController(), spare=new AbortController();
    let done=false, started=false, mainDone=false, spareDone=false, timer, deadline;
    const cleanup=()=>{clearTimeout(timer);clearTimeout(deadline);signal?.removeEventListener('abort',abort);main.abort();spare.abort();};
    const finish=value=>{if(done)return;done=true;cleanup();resolve(value);};
    const abort=()=>{if(done)return;done=true;cleanup();reject(signal?.reason||new DOMException('Aborted','AbortError'));};
    const settle=(which,value)=>{
      if(done)return;
      if(useful(value)){finish(value);return;}
      if(which==='main'){mainDone=true;startFallback();}else spareDone=true;
      if(mainDone&&spareDone)finish(null);
    };
    const startFallback=()=>{
      if(done||started)return;started=true;clearTimeout(timer);
      Promise.resolve().then(()=>fallback(spare.signal)).then(v=>settle('spare',v),()=>settle('spare',null));
    };
    if(signal?.aborted){abort();return;}
    signal?.addEventListener('abort',abort,{once:true});
    timer=setTimeout(startFallback,delayMs);deadline=setTimeout(()=>finish(null),limitMs);
    Promise.resolve().then(()=>primary(main.signal)).then(v=>settle('main',v),()=>settle('main',null));
  });
}
