// UI adapter only. Production callers must load the fixed createConnectedSwap boundary.
import {readSwapForm} from './swap-form.mjs';
import {swapSummary} from './swap-summary.mjs';
import {normalizeSwapFields} from '../../packages/multichain-swap/swap-fields.mjs';

export function bindSwapPanel({document:d=document,target=window,connection=()=>null,loadSwap,clock=Date.now,downloadFile}={}){
 const ids=['side','amount','slippage','prepare','review','consent','send','check','save','download','hash','recover','new','status','summary','quote','fees','transaction'];
 const $=id=>d.getElementById('qs-'+id),ensure=(ok,m)=>{if(!ok)throw Error(m);};for(const id of ids)ensure($(id),'Missing swap control: '+id);
 let engine=null,bound=null,review=null,timer=null,busy=false,dead=false,epoch=0,release=null,prepared=false,archiveSerial=0;
 const listeners=[];
 const listen=(id,type,fn)=>{$(id).addEventListener(type,fn);listeners.push([$(id),type,fn]);};
 const state=()=>engine?.snapshot()||null;
 const keyFor=c=>'qhooks:swap:v1:'+c.chainId+':'+c.owner+':'+c.controller;
 const clearReview=()=>{review=null;target.clearTimeout(timer);$('consent').checked=false;};
 const note=(text,error=false)=>{if(!dead){$('status').textContent=text;$('status').dataset.error=String(error);}};
 const signature=c=>JSON.stringify([c.chainId,c.owner,c.controller,c.launch,c.tokenFields,c.quoteDecimals,c.policyText,c.toolkitText,c.metadataText]);
 function sameConnection(c){const current=connection();return !!current&&current.provider===c.provider&&current.session===c.session&&current.session.current===c.connection&&signature(current)===c.signature;}
 const active=()=>!!bound&&sameConnection(bound);
 function live(c,revision){ensure(!dead&&epoch===revision&&sameConnection(c),'Swap connection or pool changed');}
 const replaceable=s=>!s?.stage||['confirmed','reverted','rejected'].includes(s.stage.status)||(s.stage.status==='pending'&&!s.stage.hash);
 const format=(value,decimals)=>{const raw=BigInt(value).toString().padStart(decimals+1,'0');if(!decimals)return raw;const f=raw.slice(-decimals).replace(/0+$/,'');return raw.slice(0,-decimals)+(f?'.'+f:'');};
 function render(){
  if(dead)return;const c=connection(),s=state(),stage=s?.stage,working=busy||!!s?.busy,connected=!!c&&(!engine||active());
  if(s?.invalid||s?.saveFailed||s?.completed||engine&&!connected)clearReview();
  const usable=connected&&!working&&!s?.invalid&&!s?.saveFailed&&!s?.recoveryOnly&&!s?.completed;
  for(const id of ['side','amount','slippage'])$(id).disabled=!connected||working||!!engine;
  $('prepare').disabled=!usable||!!stage&&!['pending','rejected','confirmed'].includes(stage.status);
  $('review').disabled=!usable||!prepared;
  const valid=!!review&&review===s?.review&&clock()>=review.reviewedAt&&clock()<review.expiresAt&&usable&&stage?.status==='pending';
  $('consent').disabled=!valid;$('send').disabled=!(valid&&$('consent').checked);
  $('check').disabled=!engine||!connected||working||s?.invalid;
  $('save').disabled=!engine||working;$('download').disabled=!engine||working;
  $('recover').disabled=!engine||!connected||working||s?.invalid||s?.saveFailed||stage?.status!=='unknown';$('hash').disabled=$('recover').disabled;
  $('new').disabled=!engine||!connected||working||s?.invalid||s?.saveFailed||!replaceable(s);
  const summary=swapSummary(s);$('summary').textContent=summary.title+'. '+summary.detail;
  $('transaction').textContent=valid?JSON.stringify(review.transaction,null,2):stage?.transaction?JSON.stringify(stage.transaction,null,2):'';
  $('fees').textContent=valid?'Maximum network fee: '+format(review.maximumFee||review.totalWei,18)+' '+(c.nativeSymbol||'native')+'. This is separate from the trade amount.':'';
  if(s?.quote&&bound){
   const k=bound.launch.constructor,input=s.fields.zeroForOne?k.currency0:k.currency1,output=s.fields.zeroForOne?k.currency1:k.currency0;
   const units=asset=>asset===bound.token?Number(bound.tokenFields.decimals):bound.quoteDecimals;
   const symbol=asset=>asset===bound.token?bound.tokenFields.symbol:bound.quoteSymbol;
   $('quote').textContent='Pay '+format(s.fields.amountIn,units(input))+' '+symbol(input)+'\nReceive about '+format(s.quote.expectedAmount,units(output))+' '+symbol(output)+'\nMinimum received '+format(s.quote.minimumOut,units(output))+' '+symbol(output)+'\nTrading fees are included in this output quote.';
  }else $('quote').textContent='';
 }
 const changed=()=>render();
 async function run(fn,message){if(dead||busy)return;busy=true;render();note('Working…');try{await fn();if(message)note(message);}catch(error){clearReview();prepared=false;note(error?.message||'Swap stopped. Check saved progress.',true);}finally{busy=false;render();}}
 async function acquire(c,revision){
  ensure(target.navigator?.locks,'Web Locks support is required for safe wallet coordination');
  let resolve,reject;const ready=new Promise((a,b)=>{resolve=a;reject=b;});
  target.navigator.locks.request('qhooks-full-launch:'+c.chainId+':'+c.owner,{ifAvailable:true},lock=>{
   try{live(c,revision);ensure(lock,'This wallet is active in another launch or trade tab. Close it first');return new Promise(done=>{release=done;resolve();});}catch(error){reject(error);}
  }).catch(reject);await ready;
 }
 async function open(){
  ensure(!engine,'Existing trade must be recovered or explicitly archived first');const current=connection();ensure(current,'Connect a wallet and select a launched pool');
  const c={...current,connection:current.session.current,signature:signature(current)},revision=epoch,key=keyFor(c);
  ensure(c.connection?.owner===c.owner&&c.connection.chainId===c.chainId,'Connected trade wallet differs');
  const stored=target.localStorage.getItem(key);ensure(stored===null||typeof stored==='string'&&stored.length>0&&stored.length<=250000,'Invalid saved swap progress');
  const fields=stored===null?readSwapForm({side:$('side').value,amount:$('amount').value,slippageBps:$('slippage').value},{token:c.token,currency0:c.launch.constructor.currency0,currency1:c.launch.constructor.currency1,tokenDecimals:Number(c.tokenFields.decimals),quoteDecimals:c.quoteDecimals}):normalizeSwapFields(JSON.parse(stored).fields);
  try{
   await acquire(c,revision);const create=await loadSwap();live(c,revision);
   const save=async text=>{ensure(typeof text==='string'&&text.length<=250000,'Swap history is too large');target.localStorage.setItem(key,text);ensure(target.localStorage.getItem(key)===text,'Swap progress did not persist');};
   const next=await create({provider:c.provider,session:c.session,launch:c.launch,tokenFields:c.tokenFields,policyText:c.policyText,toolkitText:c.toolkitText,metadataText:c.metadataText,fields,saved:stored,save,onChange:changed,clock});
   try{live(c,revision);const s=next.snapshot();ensure(s.chainId===c.chainId&&s.owner===c.owner&&s.controller===c.controller,'Trade engine identity differs');}catch(error){next.dispose();throw error;}
   bound=c;engine=next;
  }catch(error){release?.();release=null;throw error;}
 }
 const download=(text,name)=>{if(downloadFile)return downloadFile(text,name,true);const url=target.URL.createObjectURL(new Blob([text],{type:'application/json'})),a=d.createElement('a');a.href=url;a.download=name;d.body.appendChild(a);a.click();a.remove();target.setTimeout(()=>target.URL.revokeObjectURL(url),30000);};
 listen('prepare','click',()=>run(async()=>{clearReview();prepared=false;if(!engine)await open();if(state().recoveryOnly){note('Saved trade restored for checking. It cannot resend transactions.');return;}ensure(active(),'Swap connection changed');await engine.prepareNext();prepared=true;},null));
 listen('review','click',()=>run(async()=>{ensure(active()&&prepared,'Prepare the next transaction first');clearReview();const q=await engine.review();ensure(active(),'Swap connection changed');review=q;timer=target.setTimeout(()=>{clearReview();render();note('Fee review expired. Review the next transaction again.');},Math.max(0,q.expiresAt-clock()));},'Review the quote, transaction and maximum network fee.'));
 listen('consent','change',render);
 listen('send','click',()=>run(async()=>{const s=state(),q=review;ensure(active()&&!s.invalid&&!s.saveFailed&&!s.recoveryOnly&&q&&q===s.review&&$('consent').checked&&clock()>=q.reviewedAt&&clock()<q.expiresAt,'Accept this exact current fee review');clearReview();prepared=false;engine.acceptFees(q);await engine.submit(q);},'Transaction checked. Prepare the next step if one remains.'));
 listen('check','click',()=>run(async()=>{ensure(active(),'Swap connection changed');clearReview();prepared=false;await engine.reconcile();},'Existing transaction checked. Nothing was resent.'));
 listen('recover','click',()=>run(async()=>{ensure(active(),'Swap connection changed');clearReview();prepared=false;await engine.recover($('hash').value.trim().toLowerCase());},'Original transaction recovered without resending.'));
 listen('save','click',()=>run(async()=>{clearReview();await engine.retrySave();},'Public swap progress saved.'));
 listen('download','click',()=>{if(!dead&&!busy&&engine)download(engine.journal(),'qhooks-swap-progress.json');});
 listen('new','click',()=>run(async()=>{
  ensure(active()&&replaceable(state())&&!state().saveFailed,'Finish or recover the current transaction first');
  const text=engine.journal(),key=keyFor(bound),archive=key+':archive:'+clock()+':'+(++archiveSerial);
  ensure(target.localStorage.getItem(archive)===null,'Trade archive already exists');target.localStorage.setItem(archive,text);ensure(target.localStorage.getItem(archive)===text,'Trade archive did not persist');
  const saved=target.localStorage.getItem(key);ensure(saved===null||saved===text,'Stored trade changed in another context');target.localStorage.removeItem(key);ensure(target.localStorage.getItem(key)===null,'Could not clear archived trade');reset();
 },'Previous trade archived locally. Enter your next trade.'));
 for(const id of ['side','amount','slippage'])listen(id,'input',()=>{clearReview();prepared=false;render();});
 function reset(){epoch++;clearReview();engine?.dispose();engine=null;bound=null;prepared=false;release?.();release=null;$('hash').value='';render();}
 function dispose(){if(dead)return;reset();dead=true;for(const [el,type,fn]of listeners)el.removeEventListener(type,fn);}
 render();return Object.freeze({render,reset,dispose,snapshot:()=>({busy,prepared,swap:state()})});
}
