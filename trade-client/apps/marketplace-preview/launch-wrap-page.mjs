// Native-wrap panel binding.  It deliberately imports no wallet or crypto code.
import {wrapSummary} from './wrap-summary.mjs';

export function bindNativeWrap({document:d=document,target=window,loadWrap,connection=()=>null,downloadFile,clock=Date.now,onChange=()=>{},runAction=null,parentBusy=()=>false,parentHeld=()=>false}={}){
 const $=id=>d.getElementById('ql-wrap-'+id), ensure=(ok,message)=>{if(!ok)throw Error(message);};
 const ids=['amount','review','transaction','cost','consent','send','check','save','hash','recover','new','download','file','import','status','feedback'];
 for(const id of ids)ensure($(id),'Missing wrapping control: ql-wrap-'+id);
 let engine=null,review=null,timer=null,busy=false,dead=false,opening=false,epoch=0;
 const note=(text,error=false)=>{if(!dead){$('feedback').textContent=text;$('feedback').dataset.error=String(error);}};
 const clearReview=()=>{review=null;target.clearTimeout(timer);$('consent').checked=false;};
 const saveKey=()=>{const c=connection();ensure(c?.chainId&&c?.owner,'Connect a wallet first');return 'qhooks:native-wrap:v1:'+c.chainId+':'+c.owner.toLowerCase();};
 const save=async(text,key=saveKey())=>{ensure(typeof text==='string'&&text.length<=2000000,'Wrapping progress is too large');target.localStorage.setItem(key,text);ensure(target.localStorage.getItem(key)===text,'Wrapping progress did not persist');};
 const download=(text,name)=>{if(downloadFile)return downloadFile(text,name,true);const url=target.URL.createObjectURL(new Blob([text],{type:'application/json'})),a=d.createElement('a');a.href=url;a.download=name;d.body.appendChild(a);a.click();a.remove();target.setTimeout(()=>target.URL.revokeObjectURL(url),30000);};
 const file=async()=>{const f=$('file').files?.[0];ensure(f&&f.size<=2000000,'Select a wrapping JSON file smaller than 2000000 bytes');const text=await f.text();ensure(text.length<=2000000,'Wrapping file too large');return text;};
 const stage=()=>engine?.snapshot?.().stage||null;
 // A pending review with no hash was never broadcast. It may be explicitly
 // archived and replaced, including after a recovery-only restore. Any hash or
 // uncertain/broadcast status remains non-replaceable to prevent a resend.
 const replaceable=s=>!s||['confirmed','reverted','rejected'].includes(s.status)||(s.status==='pending'&&!s.hash);
 const setReview=q=>{clearReview();review=q;timer=target.setTimeout(()=>{clearReview();render();note('Wrapping fee review expired. Request a fresh estimate.');},Math.max(0,q.expiresAt-clock()));};
 function render(){
  const c=connection(),s=engine?.snapshot?.(),tx=stage(),held=parentHeld(),working=busy||parentBusy(),valid=!!review&&clock()<review.expiresAt&&!working&&!held&&!s?.invalid&&!s?.saveFailed&&!s?.recoveryOnly, enabled=!!c&&!!engine&&!working;
  $('panel').hidden=!c?.quote?.wrapNative;
  $('amount').disabled=!c||!!engine||working||opening;
  $('review').disabled=!c||working||opening||held||(!!engine&&(s.recoveryOnly||s.invalid||!!tx&&!['pending','rejected'].includes(tx.status)||s.saveFailed));
  $('consent').disabled=!valid;$('send').disabled=!(valid&&$('consent').checked&&enabled&&!s.recoveryOnly&&tx?.status==='pending');
  $('check').disabled=!enabled;$('save').disabled=!enabled;$('recover').disabled=!(enabled&&tx?.status==='unknown');$('hash').disabled=$('recover').disabled;
  $('new').disabled=!(!!c&&!working&&!opening&&!held&&replaceable(tx));$('download').disabled=!engine||working;
  $('import').disabled=!(!!c&&!engine&&!working&&!opening);$('file').disabled=$('import').disabled;
  $('status').textContent=wrapSummary(s).title+' · '+wrapSummary(s).detail;
  $('transaction').textContent=valid?JSON.stringify(review.transaction,null,2):tx?.transaction?JSON.stringify(tx.transaction,null,2):'';
  const fee=review?.maximumFeeNative||review?.quote?.maximumFeeNative||(()=>{const n=review?.maximumFee||review?.totalWei;if(n===undefined)return '';const raw=BigInt(n).toString().padStart(19,'0'),f=raw.slice(-18).replace(/0+$/,'');return raw.slice(0,-18)+(f?'.'+f:'');})();
  $('cost').textContent=valid?'Maximum reviewed network budget: '+fee+' '+(s?.nativeSymbol||'native'):'Every wrap needs a fresh network-fee review.';
 }
 const changed=()=>{render();onChange({snapshot:engine?.snapshot?.()||null,busy:busy||parentBusy(),review:review&&clock()<review.expiresAt?review:null,stage:stage()});};
 async function localRun(fn,message){if(dead||busy||parentBusy())return;busy=true;render();note('Working…');try{await fn();if(message)note(message);}catch(e){note(e?.message||'Wrapping stopped. Check saved progress.',true);}finally{busy=false;changed();}}
 const run=(fn,message)=>{if(dead||busy||parentBusy())return;return runAction?runAction(fn,message):localRun(fn,message);};
 async function open({saved=null}={}){
  ensure(!engine,'Existing wrapping progress cannot be replaced');const c=connection();ensure(c?.quote?.wrapNative,'Native wrapping is unavailable on this network');opening=true;render();
  const rev=epoch,key='qhooks:native-wrap:v1:'+c.chainId+':'+c.owner.toLowerCase(),live=()=>!dead&&epoch===rev&&connection()?.chainId===c.chainId&&connection()?.owner===c.owner;
  // A broadcast may race a wallet change: persist recovery state under the
  // original owner/chain key, never under whichever wallet is current later.
  const scopedSave=text=>save(text,key);
  try{const create=await loadWrap();ensure(live(),'Wrapping connection changed');const next=await create({provider:c.provider,session:c.session,chainId:c.chainId,amount:$('amount').value.trim(),saved,save:scopedSave,onChange:changed,clock,policyText:c.policyText});if(!live()){next?.dispose?.();throw Error('Wrapping connection changed');}engine=next;}
  finally{opening=false;changed();}
 }
 $('amount').addEventListener('input',()=>{clearReview();changed();});$('consent').addEventListener('change',changed);
 $('review').addEventListener('click',()=>run(async()=>{ensure(!parentHeld(),'Finish the existing launch transaction first');clearReview();if(!engine)await open();setReview(await engine.review());},'Review the exact wallet transaction and maximum network budget.'));
 $('send').addEventListener('click',()=>run(async()=>{const s=engine?.snapshot?.(),q=review;ensure(!parentHeld()&&!s?.invalid&&!s?.saveFailed&&!s?.recoveryOnly&&q&&$('consent').checked&&clock()<q.expiresAt,'Accept the current wrapping fee review');clearReview();engine.acceptFees(q);await engine.submit(q);},'Wrapping submission checked. No transaction was resent.'));
 $('check').addEventListener('click',()=>run(async()=>{clearReview();await engine.reconcile();},'Saved wrapping transaction checked. Nothing was resent.'));
 $('save').addEventListener('click',()=>run(()=>engine.retrySave?.()||engine.save?.(),'Wrapping progress saved.'));
 $('recover').addEventListener('click',()=>run(async()=>{clearReview();await engine.recover($('hash').value.trim().toLowerCase());},'Original wrapping transaction recovered without resending.'));
 $('download').addEventListener('click',()=>{if(engine)download(engine.journal(),'qhooks-native-wrap-progress.json');});
 $('new').addEventListener('click',()=>run(async()=>{ensure(!parentHeld(),'Finish the existing launch transaction first');const old=engine;ensure(replaceable(stage()),'A submitted, submitting, or uncertain wrapping transaction cannot be replaced');if(old){const archived=old.journal(),key=saveKey()+':archive:'+Date.now(),active=saveKey();target.localStorage.setItem(key,archived);ensure(target.localStorage.getItem(key)===archived,'Could not archive previous wrapping progress');download(archived,'qhooks-native-wrap-archived-progress.json');target.localStorage.removeItem(active);ensure(target.localStorage.getItem(active)===null,'Could not clear replaced wrapping progress');old.dispose();engine=null;}clearReview();$('amount').value='';$('hash').value='';changed();},'Previous wrapping progress archived. Enter the new amount, then request a fee review.'));
 $('import').addEventListener('click',()=>run(async()=>{clearReview();await open({saved:await file()});},'Wrapping progress imported for recovery only.'));
 function reset(){epoch++;clearReview();engine?.dispose();engine=null;$('amount').value='';$('hash').value='';$('file').value='';note('');render();}
 function dispose(){if(dead)return;dead=true;reset();}
 render();return Object.freeze({dispose,reset,clearReview,render,open,snapshot:()=>({busy,wrap:engine?.snapshot?.()||null})});
}
