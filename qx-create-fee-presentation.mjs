// Presentation deadlines only: no fetch, producer retry, quote math or signing authority.
export function createFeePresentation({now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout,timeoutMs=8000,onChange=()=>{}}={}){
 let key=null,phase='reading',deadline=0,firstGeneration=0,timer=null,timerAt=0;
 const stop=()=>{if(timer!==null)clearTimer(timer);timer=null;timerAt=0;};
 const arm=at=>{if(timerAt===at)return;stop();if(!(at>0))return;timerAt=at;timer=setTimer(()=>{timer=null;timerAt=0;phase='unavailable';onChange();},Math.max(0,at-now()));};
 const reset=(next,generation)=>{stop();key=next;phase='reading';deadline=now()+timeoutMs;firstGeneration=generation;arm(deadline);};
 return{
  observe({key:next,generation=0,available=false,error='',errorCurrent=false,expiresAt=0,busy=false}={}){
   if(next!==key)reset(next,generation);
   if(available&&expiresAt>0&&expiresAt<=now()){phase='unavailable';stop();}
   else if(available){phase='available';arm(expiresAt>now()?expiresAt:0);}
   else if(error&&(errorCurrent||generation>firstGeneration)){phase='unavailable';stop();}
   else if(phase==='available'){reset(next,generation);}
   else if(phase!=='unavailable'&&now()>=deadline){phase='unavailable';stop();}
   const actionable=available&&expiresAt>0&&expiresAt<=now()?'Fee estimate expired. Retry.':error&&!/^Reading network fees\./.test(error)&& (errorCurrent||generation>firstGeneration)?error:'Fee estimate unavailable. Retry.';
   return {phase,message:phase==='reading'?'Reading fee estimate…':phase==='available'?'':actionable,canRetry:phase==='unavailable'&&!busy};
  },
  retry(next,generation=0){reset(next,generation);},
  hide(){stop();key=null;},
  dispose:stop,
 };
}
