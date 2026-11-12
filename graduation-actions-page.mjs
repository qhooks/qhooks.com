// Lead-owned UI orchestration. Crypto comes only from the injected, accepted
// same-origin toolkit and is never loaded or run while the page is idle.
import {discoverWallets} from './discover-wallets.mjs';
import {renderGraduationActions} from './graduation-action-summary.mjs';
import {collectGraduationActionForm} from './graduation-action-form.mjs';
import {readGraduationLabDraft,graduationLabStorageKey,graduationBootstrapNames,graduationDraftMatchesSetup} from './graduation-lab-draft.mjs';
const formNames=['asset','amount','mode','threshold','source-fee','source-spacing','dest-fee','dest-spacing','price','liquidity','lower','upper','salt','max0','max1','min0','min1','min-liquidity','recipient','eta'];
const Z='0x'+'0'.repeat(40),Z32='0x'+'0'.repeat(64);
export function bindGraduationActionsPage({document:d=document,target=window,loadModules,getArtifacts,downloadFile=null}){
 const $=id=>d.getElementById('ga-'+id),ensure=(ok,message='Graduation action could not be prepared')=>{if(!ok)throw Error(message);};
 let providers=[],modules=null,provider=null,session=null,setup=null,context=null,state=null,signer=null,active=null,busy=false,dead=false,revision=0,draftRevision=0,review=null,timer=null,resumeRequired=false;
 const feedback=(text,error=false)=>{$('feedback').textContent=text;$('feedback').dataset.error=String(error);};
 const readyKey=()=>!!signer&&!signer.locked&&signer.backupVerified&&signer.publicKeyHex===context?.plan.profile.publicKey;
 const canReplace=()=>{const s=active?.snapshot();return !s?.journal||['pending','rejected','reverted'].includes(s.journal.status)||s.journal.status==='confirmed'&&!!s.outcome;};
 function clearReview(){review=null;clearTimeout(timer);$('accept').checked=false;}
 function clearActive(){ensure(canReplace(),'Recover the existing transaction first');clearReview();active?.dispose();active=null;}
 function groups(){const k=$('kind').value,policy=k==='bootstrap'||k==='announce',position=k==='bootstrap'||k==='migrate';
  for(const [id,show]of Object.entries({funding:k==='approve-token',policy,source:k==='bootstrap',destination:policy&&$('mode').value!=='2',position,max:position,min:['migrate','fees','exit'].includes(k),eta:k==='announce'}))$(id+'-group').hidden=!context||!show;
  $('threshold-label').hidden=!policy||$('mode').value!=='0';$('min-liquidity-label').hidden=k!=='migrate';
 }
 function render(){
  if(dead)return;const s=active?.snapshot(),connected=session?.current?.chainId==='31337',working=busy||!!s?.busy||!!setup?.snapshot().busy,replace=canReplace(),available=connected&&!!context;
  renderGraduationActions($('summary'),state,s);groups();
  $('provider').disabled=working;$('connect').disabled=working||!providers.length;$('disconnect').disabled=!session;
  for(const id of ['setup-file','setup-resume','setup-import'])$(id).disabled=working||!connected||!!setup;
  $('refresh').disabled=working||!available||!!s?.persistenceFailed;
  $('identity').textContent=context?`${context.plan.profile.fields.tokenName} (${context.plan.profile.fields.symbol}) · controller ${context.plan.graph.controller} · quantum public key ${context.plan.profile.publicKey}`:'No setup loaded. Wallet connection and transactions are always explicit.';
  $('key-status').textContent=signer?`Quantum key: ${signer.publicKeyHex} · ${signer.locked?'locked':'backup verified'}`:'No quantum key loaded.';
  for(const id of ['key-file','key-password','key-restore'])$(id).disabled=working||!available||!replace||!!s?.persistenceFailed||resumeRequired;
  $('key-lock').disabled=!signer||signer.locked;
  for(const id of ['kind',...formNames,'example'])$(id).disabled=working||!available||!replace||!!s?.persistenceFailed||resumeRequired;
  $('example').disabled=$('example').disabled||!state;
  $('lab-use').disabled=working||!available||!replace||!!s?.persistenceFailed||resumeRequired||state?.phase!=='0';
  const k=$('kind').value;
  $('action-help').textContent=!context?'Load a setup to choose an action.':k==='approve-token'?'An ordinary wallet approval funds the fixed escrow. Approve exact limits for each currency, or enter zero to revoke.':k==='bootstrap'?'Initialize the source pool once. Set both token allowances first.':k==='announce'?'Schedule a replacement policy after the immutable notice. A pending policy pauses graduation.':k==='cancel'?'Cancel the currently pending policy with both keys.':k==='apply'?'Apply the pending policy after its notice elapses.':k==='migrate'?'Move the complete owned source position to the committed destination. Limits and recipient are included in both approvals.':k==='fees'?'Claim accrued fees from the active position without removing its liquidity.':'Withdraw the complete destination position. Source principal cannot exit here.';
  $('notice').textContent=context?`At least ${context.plan.profile.fields.notice} seconds after the current chain timestamp. Applying the policy is a separate two-key action.`:'Must respect the setup’s policy notice.';
  if(resumeRequired)$('action-help').textContent='A saved action needs checking. Resume saved action below before starting another.';
  $('prepare').disabled=working||!available||!replace||!!s?.persistenceFailed||resumeRequired||(k!=='approve-token'&&!readyKey());
  $('clear').disabled=working||!active||!replace||!!s?.persistenceFailed;
  $('action-details').hidden=!active;$('action-text').textContent=active?JSON.stringify({fields:s.fields,action:s.action,request:s.request},null,2):'';
  $('approve').disabled=working||!available||!active||!s.action||s.recoveryOnly||!replace||!readyKey()||!!s.persistenceFailed;
  $('review').disabled=working||!available||!active||s.recoveryOnly||!replace||!!s.persistenceFailed||!!s.action&&(!s.approved||!readyKey());
  $('check').disabled=working||!available||!s?.journal||!!s.persistenceFailed;
  $('retry-save').hidden=!s?.persistenceFailed;$('retry-save').disabled=working||!available;
  const valid=!!review&&review===s?.review&&Date.now()<review.expiresAt&&available&&(!s.action||readyKey())&&!s.persistenceFailed;
  $('review-details').hidden=!valid;$('review-text').textContent=valid?JSON.stringify(review,null,2):'';
  $('cost').textContent=valid?`Estimated network cost: ${review.estimatedNetworkFeeWei} wei (${review.estimatedGas} gas at ${review.gasPriceWei} wei/gas). Gas-limit estimate: ${review.gasLimitFeeEstimateWei} wei. Service fee: off. Your wallet confirms final fees.`:'Prepare an action to review its current network estimate.';
  $('accept').disabled=working||!valid;$('send').disabled=working||!valid||!$('accept').checked;
  const unknown=s?.journal?.status==='unknown';$('recovery').hidden=!unknown;$('recover').disabled=working||!available||!unknown||!!s?.persistenceFailed;
  for(const id of ['journal-file','journal-resume','journal-import'])$(id).disabled=working||!available||!replace||!!s?.persistenceFailed;
  $('journal-download').disabled=!s?.journal;
 }
 function lock(){revision++;draftRevision++;clearReview();signer?.lock();active?.invalidate();state=null;$('key-password').value='';$('key-file').value='';render();}
 function disconnect(){revision++;draftRevision++;clearReview();active?.dispose();active=null;setup?.dispose();setup=null;context=null;state=null;resumeRequired=false;signer?.lock();signer=null;session?.dispose();session=null;provider=null;$('key-password').value='';$('key-file').value='';render();}
 async function live(rev,connection){ensure(!dead&&rev===revision&&connection&&session?.current===connection);await session.refresh(connection);ensure(!dead&&rev===revision&&session?.current===connection);}
 async function run(fn,message){if(dead||busy||active?.snapshot().busy||setup?.snapshot().busy)return;busy=true;render();feedback('Working locally…');try{await fn();if(!dead)feedback(message);}catch{clearReview();if(!dead)feedback('Step stopped. Check the action, exact amounts, backup and local wallet. Recover an interrupted send by its exact hash before preparing another.',true);}finally{busy=false;render();}}
 function download(text,name){if(downloadFile)return downloadFile(text,name);const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=d.createElement('a');a.href=url;a.download=name;d.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
 async function fileText(id,max){const file=$(id).files?.[0];ensure(file&&file.size>0&&file.size<=max);return file.text();}
 function saveSetup(text){const j=JSON.parse(text);ensure(text.length<=500000&&j.kind==='qhooks-graduation-setup-journal'&&j.profile.owner===session?.current?.owner&&/^(0|[1-9][0-9]{0,19})$/.test(j.profile.baseNonce));target.localStorage.setItem(`qhooks.graduation.setup.${j.profile.owner}.${j.profile.baseNonce}`,text);target.localStorage.setItem(`qhooks.graduation.latest.${j.profile.owner}`,j.profile.baseNonce);}
 function savedSetup(){const owner=session.current.owner,n=target.localStorage.getItem(`qhooks.graduation.latest.${owner}`);ensure(typeof n==='string'&&/^(0|[1-9][0-9]{0,19})$/.test(n));const text=target.localStorage.getItem(`qhooks.graduation.setup.${owner}.${n}`);ensure(typeof text==='string');return text;}
 function saveAction(text){const j=JSON.parse(text);ensure(context&&text.length<=250000&&j.kind==='qhooks-graduation-action-journal'&&j.setupPlanId===context.plan.id);target.localStorage.setItem('qhooks.graduation.action.'+context.plan.id,text);}
 async function refresh(rev,connection){
  ensure(context&&setup);const binding=await setup.binding();await live(rev,connection);ensure(binding.setupPlanId===context.plan.id);
  const fresh=await modules.readGraduationState({provider,plan:context.plan,binding,live:()=>live(rev,connection)});await live(rev,connection);context.binding=binding;state=fresh;
 }
 async function installSetup(text){
  ensure(!setup&&session?.current?.chainId==='31337');const rev=revision,connection=session.current,artifacts=await getArtifacts();await live(rev,connection);
  const candidate=await modules.createGraduationSetup({provider,session,...artifacts,journal:text,signer:null,save:saveSetup,onChange:render});
  try{
   await live(rev,connection);const binding=await candidate.binding();await live(rev,connection);
   const plan=await modules.prepareGraduationSetup(binding.profile,artifacts.graduationText,artifacts.tokenText);await live(rev,connection);ensure(plan.id===binding.setupPlanId);
   const fresh=await modules.readGraduationState({provider,plan,binding,live:()=>live(rev,connection)});await live(rev,connection);
   const hasSaved=target.localStorage.getItem('qhooks.graduation.action.'+plan.id)!==null;
   saveSetup(candidate.journal());setup=candidate;context={plan,binding,artifacts};state=fresh;resumeRequired=hasSaved;
   $('asset').replaceChildren();[plan.constructor.currency0,plan.constructor.currency1].forEach((asset,i)=>{const o=d.createElement('option');o.value=String(i);o.textContent=`Currency ${i} · ${asset===plan.graph.token?plan.profile.fields.symbol:'QLQ'} · ${asset}`;$('asset').appendChild(o);});$('asset').value='0';
  }catch(error){candidate.dispose();throw error;}
 }
 async function fieldsFromForm(form,rev,connection,version){
  const isLive=()=>!dead&&rev===revision&&version===draftRevision&&session?.current===connection;
  const descriptor=async(prefix,start='0')=>{const value=await modules.findGraduationDescriptor(context.plan,{fee:form[prefix+'-fee'],tickSpacing:form[prefix+'-spacing'],start},isLive);await live(rev,connection);ensure(isLive());return value;};
  const position=()=>({tickLower:form.lower,tickUpper:form.upper,salt:form.salt,liquidity:form.liquidity});
  const empty=()=>({key:{currency0:Z,currency1:Z,fee:'0',tickSpacing:'0',hooks:Z},hookSalt:Z32});
  if(form.kind==='approve-token')return {kind:form.kind,asset:form.asset==='0'?context.plan.constructor.currency0:context.plan.constructor.currency1,amount:form.amount};
  if(form.kind==='bootstrap'||form.kind==='announce'){
   const source=form.kind==='bootstrap'?await descriptor('source'):state.source.descriptor;
   const destination=form.mode==='2'?empty():await descriptor('dest',(BigInt(source.hookSalt)+1n).toString());
   const policy=modules.graduationPolicyFor(context.plan,context.binding,{mode:form.mode,threshold:form.mode==='0'?form.threshold:'0',destination});
   if(form.kind==='announce')return {kind:form.kind,policy,destination,eta:form.eta};
   return {kind:form.kind,bootstrap:{source,sqrtPriceX96:form.price,position:position(),maxAmount0:form.max0,maxAmount1:form.max1,policy,destination}};
  }
  if(form.kind==='cancel'||form.kind==='apply')return {kind:form.kind};
  const withdrawal={minAmount0:form.min0,minAmount1:form.min1,recipient:form.recipient};
  if(form.kind==='fees'||form.kind==='exit')return {kind:form.kind,withdrawal};
  ensure(form.kind==='migrate');return {kind:form.kind,migration:{sourceLiquidity:state.source.position.liquidity,sqrtPriceX96:form.price,destinationPosition:position(),limits:{minRemoved0:form.min0,minRemoved1:form.min1,maxAdded0:form.max0,maxAdded1:form.max1,minLiquidity:form['min-liquidity'],recipient:form.recipient}}};
 }
 async function installAction(saved=null){
  ensure(context&&canReplace()&&!active?.snapshot().persistenceFailed&&(saved!==null||!resumeRequired));const rev=revision,connection=session.current,version=draftRevision,form=saved===null?collectGraduationActionForm($('kind').value,k=>$(k).value):null;
  clearActive();await refresh(rev,connection);ensure(version===draftRevision);
  const fields=form?await fieldsFromForm(form,rev,connection,version):undefined;await live(rev,connection);ensure(version===draftRevision);
  const candidate=await modules.createGraduationExecution({provider,session,setup,...context.artifacts,fields,signer:saved===null?signer:null,saved,save:saveAction,onChange:render});
  try{await live(rev,connection);ensure(version===draftRevision);active=candidate;resumeRequired=false;if(saved!==null)await active.reconcile();$('action-details').open=true;}catch(error){if(active!==candidate)candidate.dispose();throw error;}
 }
 function edit(){draftRevision++;clearReview();if(!busy&&active&&canReplace()&&!active.snapshot().persistenceFailed){active.dispose();active=null;}render();}
 const discovery=discoverWallets(target,entries=>{providers=entries;const prior=$('provider').value;$('provider').replaceChildren();entries.forEach((p,i)=>{const o=d.createElement('option');o.value=String(i);o.textContent=p.name;$('provider').appendChild(o);});if(prior!==''&&entries[Number(prior)])$('provider').value=prior;render();});
 $('provider').addEventListener('change',()=>{disconnect();feedback('Wallet selection changed. Saved public progress is retained.');});
 $('connect').addEventListener('click',()=>run(async()=>{disconnect();const rev=revision,p=providers[Number($('provider').value)]?.provider;ensure(p);modules??=await loadModules();ensure(!dead&&rev===revision);provider=p;session=modules.createWalletSession(p,lock);await session.connect();ensure(session.current?.chainId==='31337');},'Connected locally. Load your completed graduation setup.'));
 $('disconnect').addEventListener('click',()=>{disconnect();feedback('Disconnected and key locked. Public progress remains saved.');});
 $('setup-resume').addEventListener('click',()=>run(()=>installSetup(savedSetup()),'Setup loaded and position checked.'));
 $('setup-import').addEventListener('click',()=>run(async()=>{const rev=revision,c=session.current,text=await fileText('setup-file',500000);await live(rev,c);await installSetup(text);},'Setup imported and checked. No transaction was sent.'));
 $('refresh').addEventListener('click',()=>run(()=>refresh(revision,session.current),'Position refreshed from the local chain.'));
 $('key-lock').addEventListener('click',()=>{lock();feedback('Quantum key locked. Restore its backup to approve another action.');});
 $('key-restore').addEventListener('click',()=>run(async()=>{ensure(context&&canReplace()&&!active?.snapshot().persistenceFailed);const rev=revision,c=session.current,password=$('key-password').value;$('key-password').value='';const text=await fileText('key-file',4096);await live(rev,c);let next=null;try{next=await modules.restoreSigner(text,password);await live(rev,c);ensure(next.publicKeyHex===context.plan.profile.publicKey);clearActive();signer?.lock();signer=next;next=null;}finally{next?.lock();}},'Matching graduation key restored and backup verified.'));
 for(const id of ['kind',...formNames])$(id).addEventListener(id==='kind'||id==='mode'||id==='asset'?'change':'input',edit);
 $('example').addEventListener('click',()=>{if(busy||!context||!state||!canReplace()||resumeRequired||active?.snapshot().persistenceFailed)return;edit();const liquid=state.phase==='1'&&state.source?.position?.liquidity?BigInt(state.source.position.liquidity):1000000000000000000n,amount=(liquid>1n?liquid/2n:liquid).toString();for(const[k,v]of Object.entries({'source-fee':'3000','source-spacing':'60','dest-fee':'500','dest-spacing':'60',price:'79228162514264337593543950336',liquidity:amount,lower:'-887220',upper:'887220',salt:Z32,max0:liquid.toString(),max1:liquid.toString(),min0:'0',min1:'0','min-liquidity':amount,recipient:session.current.owner,amount:liquid.toString(),threshold:liquid.toString(),eta:(BigInt(state.timestamp)+BigInt(context.plan.profile.fields.notice)+60n).toString()}))$(k).value=v;render();feedback('Local example filled. Review every raw-unit value before preparing.');});
 $('prepare').addEventListener('click',()=>run(()=>installAction(),'Exact action prepared. Protected actions need both approvals before fee review.'));
 $('lab-use').addEventListener('click',()=>{if(dead||busy||active?.snapshot().busy||setup?.snapshot().busy)return;try{
  ensure(context&&session?.current?.chainId==='31337'&&state?.phase==='0'&&canReplace()&&!resumeRequired&&!active?.snapshot().persistenceFailed);
  const draft=readGraduationLabDraft(target.localStorage.getItem(graduationLabStorageKey));ensure(graduationDraftMatchesSetup(draft,context.plan.profile.fields));
  edit();$('kind').value='bootstrap';for(const k of graduationBootstrapNames)$(k).value=draft.bootstrap[k]??'';render();feedback('Matching Lab liquidity settings loaded. Check the currency order and fund both escrow allowances separately before preparing initialization.');
 }catch{feedback('Import requires a matching Lab draft, an uninitialized setup, and no unresolved transaction or save failure.',true);}});
 $('clear').addEventListener('click',()=>{if(busy||active?.snapshot().persistenceFailed)return;try{clearActive();feedback('Draft cleared. No transaction was sent.');}catch{feedback('Check or recover the existing transaction first.',true);}render();});
 $('approve').addEventListener('click',()=>run(async()=>{clearReview();ensure(active&&readyKey()&&!active.snapshot().recoveryOnly);await active.approve();},'Both approvals collected for this exact action.'));
 $('review').addEventListener('click',()=>run(async()=>{clearReview();ensure(active&&!active.snapshot().recoveryOnly);const rev=revision,c=session.current,r=await active.review();await live(rev,c);ensure(active.snapshot().review===r);review=r;timer=setTimeout(render,Math.max(0,r.expiresAt-Date.now()+1));$('review-details').open=true;},'Review this exact transaction and accept its estimated network cost.'));
 $('accept').addEventListener('change',render);
 $('send').addEventListener('click',()=>run(async()=>{const r=review,engine=active,rev=revision,c=session.current;ensure(engine&&r&&r===engine.snapshot().review&&$('accept').checked&&Date.now()<r.expiresAt);engine.acceptFees(r);clearReview();await engine.submit(r);await live(rev,c);await refresh(rev,c);},'Action submitted. Check the transaction for its confirmed outcome.'));
 $('check').addEventListener('click',()=>run(async()=>{clearReview();ensure(active);const rev=revision,c=session.current;await active.reconcile();await live(rev,c);await refresh(rev,c);},'Transaction and current position checked.'));
 $('recover').addEventListener('click',()=>run(async()=>{clearReview();ensure(active);const rev=revision,c=session.current;await active.recover($('hash').value.trim());await live(rev,c);await refresh(rev,c);},'Exact transaction recovered without resending.'));
 $('retry-save').addEventListener('click',()=>run(()=>active.retrySave(),'Public action progress saved.'));
 $('journal-resume').addEventListener('click',()=>run(async()=>{ensure(context);const text=target.localStorage.getItem('qhooks.graduation.action.'+context.plan.id);ensure(typeof text==='string');await installAction(text);},'Public action loaded for recovery only. No signing or resend is enabled.'));
 $('journal-import').addEventListener('click',()=>run(async()=>{const rev=revision,c=session.current,text=await fileText('journal-file',250000);await live(rev,c);await installAction(text);},'Public action imported for recovery only. No transaction was sent.'));
 $('journal-download').addEventListener('click',()=>{if(active?.snapshot().journal)download(active.journal(),'qhooks-public-graduation-action.json');});
 function dispose(){if(dead)return;dead=true;disconnect();discovery.stop();target.removeEventListener('pagehide',dispose);}
 target.addEventListener('pagehide',dispose);render();return Object.freeze({dispose});
}
