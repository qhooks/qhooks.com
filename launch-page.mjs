// Lead-owned UI integration. Private handles stay in this closure; only fixed
// public configuration goes to the compiler and public journals to storage.
import {discoverWallets} from './discover-wallets.mjs';
import {renderWalletSummary} from './wallet-summary.mjs';
import {renderKeyControls} from './key-controls.mjs';
import {renderLaunchSteps} from './launch-steps.mjs';
import {createLocalCostConsent} from './local-cost-consent.mjs';
import {renderCostBreakdown} from './cost-breakdown.mjs';
export function bindLaunchPage({loadModules,target=window,downloadFile=null,fetchPublic=(...args)=>fetch(...args)}){
 const $=id=>document.getElementById(id),fields=['projectName','tokenName','symbol','decimals','totalSupply','liquidityAllocation','feeBps','poolFee','tickSpacing','recipient'];
 const empty={connected:null,keyId:null,publicKeyHex:null,backupVerified:false,busy:false,review:null,approval:null};
 renderKeyControls($('wallet-key-controls'));
 const password=$('qkey-password'),backupFile=$('qkey-file'),form=$('launch-form');
 let wallet=null,keyHandle=null,walletSession=null,modules=null,provider=null,providers=[],walletView=empty,execution=null,plan=null,artifact=null,loading=false,revision=0,identity=null,buildAbort=null,dead=false;
 const costs=createLocalCostConsent();let costTimer=null,schemeOptIn=false;
 $('launch-select-mldsa').checked=false;$('launch-cost-accept').checked=false;
 function clearCosts(){costs.clear();clearTimeout(costTimer);costTimer=null;$('launch-cost-accept').checked=false;}
 function scheduleCostExpiry(quote){clearTimeout(costTimer);costTimer=setTimeout(()=>{if(!dead)render();},Math.max(0,quote.expiresAt-Date.now()+1));}
 const ensure=(ok,message='Local launch step unavailable')=>{if(!ok)throw new Error(message);};
 const feedback=(message,error=false)=>{ $('launch-feedback').textContent=message;$('launch-feedback').dataset.error=String(error); };
 const clearInputs=()=>{password.value='';backupFile.value='';};
 function latestJournal(){const id=target.localStorage.getItem('qhooks.launch.latest');if(!id)return null;ensure(/^0x[0-9a-f]{64}$/.test(id));return target.localStorage.getItem('qhooks.launch.public.'+id);}
 function saveJournal(text){
  // Controller exports only its closed public schema, not a user-provided file.
  const id=JSON.parse(text).planId;ensure(/^0x[0-9a-f]{64}$/.test(id));target.localStorage.setItem('qhooks.launch.public.'+id,text);target.localStorage.setItem('qhooks.launch.latest',id);
 }
 function download(value,name){
  if(downloadFile)return downloadFile(value,name);
  const blob=new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
 }
 function render(){
  if(dead)return;
  renderWalletSummary($('wallet-summary'),walletView);const state=execution?.snapshot(),busy=loading||walletView.busy||state?.busy,connected=walletView.connected?.chainId==='31337';
  const usable=connected&&(!plan||walletView.connected.owner===plan.profile.owner),ready=!!execution&&usable&&!busy;
  $('wallet-provider').disabled=busy;$('wallet-connect').disabled=busy||!providers.length;$('wallet-disconnect').disabled=!connected;
  $('qkey-create').disabled=busy||!connected||!schemeOptIn||!!walletView.keyId||!!plan;$('qkey-export').disabled=busy||!walletView.keyId;$('qkey-verify').disabled=busy||!walletView.keyId;$('qkey-restore').disabled=busy||!connected||!schemeOptIn;
  $('launch-select-mldsa').disabled=busy;
  password.disabled=busy;backupFile.disabled=busy;
  for(const name of fields)form.elements.namedItem(name).disabled=busy||!!plan;
  $('launch-build').disabled=busy||!connected||!schemeOptIn||!walletView.backupVerified||!!plan;$('launch-toolkit').disabled=busy||!artifact;
  $('launch-resume').disabled=busy||!connected;$('launch-import').disabled=busy||!connected;$('launch-journal-file').disabled=busy;
  $('launch-progress').hidden=!plan;
  const next=state?.stages.find(s=>s.id===state.nextId),protectedStep=!!state?.nextId&&modules?.[5].isProtectedStage(state.nextId);
  $('launch-approve').disabled=!ready||!schemeOptIn||!protectedStep||!walletView.backupVerified||walletView.keyId!==plan?.profile.keyId||!!state?.persistenceFailed||!['pending','rejected'].includes(next?.status);
  $('launch-review').disabled=!ready||!schemeOptIn||!!state?.attention||!!state?.complete||!!state?.persistenceFailed||(protectedStep&&!next?.approved);
  const costView=costs.snapshot();$('launch-cost-review').hidden=!costView.quote;renderCostBreakdown($('launch-cost-breakdown'),costView.quote);
  $('launch-cost-accept').checked=costView.accepted;$('launch-cost-accept').disabled=busy||!costView.quote||Date.now()>=costView.quote.expiresAt;
  $('launch-cost-state').textContent=costView.quote&&Date.now()>=costView.quote.expiresAt?'Estimate expired. Review this transaction again.':costView.accepted?'Cost estimate accepted for this transaction only.':'Review these costs and explicitly opt in before sending.';
  $('launch-send').disabled=!ready||!schemeOptIn||!state?.review||!!state?.persistenceFailed||!costs.canSubmit(state.review,walletView.connected);$('launch-check').disabled=!ready||!!state?.persistenceFailed;
  $('launch-journal-download').disabled=!execution;$('launch-save-retry').disabled=!ready||!state?.persistenceFailed;
  $('launch-recovery').hidden=next?.status!=='unknown';$('launch-recover').disabled=!ready||!!state?.persistenceFailed;
  $('launch-review-details').hidden=!state?.review;$('launch-review-text').textContent=state?.review?JSON.stringify(state.review,null,2):'';
  if(state){renderLaunchSteps($('launch-steps'),state.stages);$('launch-state').textContent=state.complete?'Local launch complete: pool, fee claim and protected payout confirmed.':state.attention?'Stopped for review: '+state.attention.replaceAll('-',' '):'Next: '+(state.nextId||'complete').replaceAll('-',' ');}
 }
 function walletChanged(view){
  walletView=view;const next=view.connected?view.connected.owner+':'+view.connected.chainId:null;
  if(next!==identity){revision++;buildAbort?.abort();clearInputs();clearCosts();identity=next;execution?.invalidate();}
  render();
 }
 async function load(){
  if(wallet)return;
  modules=await loadModules();ensure(!dead);
  const [flow,signer,session,approval,typed]=modules;
  wallet=flow.createWorkspace({...approval,...typed,
   createSigner(){keyHandle=signer.createSigner();return keyHandle;},
   async restoreSigner(text,pass){keyHandle=await signer.restoreSigner(text,pass);return keyHandle;},
   createWalletSession(p,onInvalidate){walletSession=session.createWalletSession(p,onInvalidate);return walletSession;},onChange:walletChanged});
 }
 async function action(fn,message){
  if(dead||loading||walletView.busy||execution?.snapshot().busy)return;loading=true;render();feedback('Working locally…');
  try{await fn();if(!dead)feedback(typeof message==='function'?message():message);}
  catch{if(!dead)feedback('Step stopped. Check the selected local account, backup, saved progress or transaction details before trying again.',true);}
  finally{password.value='';loading=false;if(!dead){walletView=wallet?.snapshot()||empty;render();}}
 }
 async function backupText(){const f=backupFile.files?.[0];ensure(f&&f.size<=16384);return f.text();}
 async function live(rev,connected){ensure(!dead&&rev===revision&&connected===walletSession?.current);await walletSession.refresh(connected);ensure(!dead&&rev===revision);}
 async function reviewCosts(review,rev,connected){
  const gasPrice=await provider.request({method:'eth_gasPrice'});await live(rev,connected);ensure(execution.snapshot().review===review);
  const quote=costs.create(review,connected,gasPrice);scheduleCostExpiry(quote);return quote;
 }
 async function compile(profile,rev,connected){
  const abort=new AbortController();buildAbort=abort;const signal=abort.signal;
  try{
   const response=await fetchPublic('/api/launch/build',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(profile.configuration),signal});
   let job=await response.json();ensure(response.ok&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(job.id)&&/^[a-f0-9]{64}$/.test(job.projectInputSha256));
   const id=job.id,digest=job.projectInputSha256,deadline=Date.now()+370000;
   while(job.status==='building'){
    await live(rev,connected);ensure(Date.now()<deadline);await new Promise(resolve=>setTimeout(resolve,750));
    const poll=await fetchPublic('/api/launch/build/'+id,{signal});job=await poll.json();ensure(poll.ok&&job.id===id&&job.projectInputSha256===digest);
   }
   ensure(job.status==='ready');const result=await fetchPublic('/api/launch/build/'+id+'/artifact',{signal});ensure(result.ok);
   const text=await result.text();ensure(text.length<=2500000);const built=JSON.parse(text);ensure(built.projectInputSha256===digest);await live(rev,connected);return built;
  }finally{if(buildAbort===abort)buildAbort=null;}
 }
 async function install(profile,saved,rev,connected){
  const built=await compile(profile,rev,connected),next=await modules[5].prepareLaunchPlan(profile,built,{yieldWork:()=>new Promise(resolve=>setTimeout(resolve,0))});await live(rev,connected);
  const candidate=modules[6].createLaunchExecution({provider,plan:next,saved,save:saveJournal,onChange:render});
  clearCosts();execution?.dispose();execution=candidate;plan=next;artifact=built;
  $('launch-plan-description').textContent=profile.fields.tokenName+' ('+profile.fields.symbol+') · 19 explicit local transactions';
  $('launch-plan').textContent=JSON.stringify({owner:profile.owner,chainId:profile.chainId,keyId:profile.keyId,policyHash:profile.policyHash,fields:profile.fields,addresses:next.graph},null,2);
  for(const name of fields)form.elements.namedItem(name).value=profile.fields[name];
  saveJournal(execution.exportJournal());if(saved!==null)await execution.reconcile();render();
 }
 async function restoreJournal(text){
  clearCosts();
  ensure(typeof text==='string'&&text.length<=1000000&&walletView.connected);const parsed=JSON.parse(text),profile=modules[5].makeLaunchProfile(parsed.profile);
  const rev=revision,connected=walletSession.current;ensure(connected.owner===profile.owner);await live(rev,connected);await install(profile,text,rev,connected);
 }
 const discovery=discoverWallets(target,entries=>{
  providers=entries;const select=$('wallet-provider'),prior=select.value;select.replaceChildren();
  for(const [i,entry]of entries.entries()){const option=document.createElement('option');option.value=String(i);option.textContent=entry.name;select.appendChild(option);}
  if(prior!==''&&entries[Number(prior)])select.value=prior;render();
 });
 $('launch-select-mldsa').addEventListener('change',()=>{schemeOptIn=$('launch-select-mldsa').checked===true;revision++;clearCosts();buildAbort?.abort();execution?.invalidate();render();feedback(schemeOptIn?'ML-DSA selected. Each transaction will require a separate cost review.':'ML-DSA not selected. No new launch transaction can be sent.');});
 $('launch-cost-accept').addEventListener('change',()=>{try{if($('launch-cost-accept').checked)costs.accept(costs.snapshot().quote);else costs.revoke();}catch{costs.revoke();}render();});
 $('wallet-provider').addEventListener('change',()=>{revision++;clearCosts();buildAbort?.abort();wallet?.disconnect();execution?.dispose();execution=null;plan=null;artifact=null;provider=null;clearInputs();render();feedback('Wallet selection changed. Saved launch journals are retained.');});
 $('wallet-connect').addEventListener('click',()=>action(async()=>{const p=providers[Number($('wallet-provider').value)]?.provider;ensure(p);const rev=revision;await load();ensure(rev===revision);await wallet.connect(p);provider=p;if(!form.elements.namedItem('recipient').value)form.elements.namedItem('recipient').value=wallet.snapshot().connected.owner;},'Connected to local chain 31337.'));
 $('wallet-disconnect').addEventListener('click',()=>{revision++;buildAbort?.abort();wallet?.disconnect();execution?.invalidate();clearInputs();feedback('Disconnected. Public progress is retained.');});
 $('qkey-lock').addEventListener('click',()=>{revision++;clearCosts();wallet?.lock();keyHandle=null;execution?.invalidate();clearInputs();feedback('Quantum key locked. Restore its encrypted backup before a new protected approval.');});
 $('qkey-create').addEventListener('click',()=>action(()=>{ensure(schemeOptIn);return wallet.generate();},'Quantum key created. Save and verify its encrypted backup.'));
 $('qkey-export').addEventListener('click',()=>action(async()=>{const rev=revision,encrypted=await wallet.exportBackup(password.value);ensure(rev===revision);download(encrypted,'qhooks-encrypted-backup.json');},'Select the downloaded backup and verify it before building your launch.'));
 for(const [id,method]of [['qkey-verify','verifyBackup'],['qkey-restore','restore']])$(id).addEventListener('click',()=>action(async()=>{ensure(schemeOptIn);const rev=revision,pass=password.value,text=await backupText();ensure(rev===revision);await wallet[method](text,pass);},'Quantum backup restored and verified.'));
 form.addEventListener('input',()=>{revision++;clearCosts();buildAbort?.abort();render();});
 form.addEventListener('submit',event=>{event.preventDefault();return action(async()=>{
  ensure(schemeOptIn&&!plan&&walletView.backupVerified);const rev=revision,connected=walletSession.current;await live(rev,connected);
  const pending=await provider.request({method:'eth_getTransactionCount',params:[connected.owner,'pending']}),latest=await provider.request({method:'eth_getTransactionCount',params:[connected.owner,'latest']});await live(rev,connected);
  ensure(typeof pending==='string'&&/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(pending)&&pending===latest);
  const profile=modules[5].makeLaunchProfile({owner:connected.owner,baseNonce:BigInt(pending).toString(),publicKeyHex:walletView.publicKeyHex,fields:Object.fromEntries(fields.map(k=>[k,form.elements.namedItem(k).value]))});
  await install(profile,null,rev,connected);
 },'Launch compiled. Review the first transaction when ready.');});
 $('launch-toolkit').addEventListener('click',()=>{if(artifact)download(artifact,'qhooks-launch-toolkit.json');});
 $('launch-resume').addEventListener('click',()=>action(()=>restoreJournal(latestJournal()),'Saved launch restored. Transaction receipts have been checked.'));
 $('launch-import').addEventListener('click',()=>action(async()=>{const f=$('launch-journal-file').files?.[0],rev=revision;ensure(f&&f.size<=1000000);const text=await f.text();ensure(rev===revision);await restoreJournal(text);},'Public launch journal restored.'));
 $('launch-approve').addEventListener('click',()=>action(()=>{ensure(schemeOptIn);clearCosts();return execution.approveNext({signer:keyHandle,session:walletSession});},'Protected action approved with both keys. No transaction has been sent.'));
 $('launch-review').addEventListener('click',()=>action(async()=>{ensure(schemeOptIn);clearCosts();const rev=revision,connected=walletSession.current;const review=await execution.reviewNext();await live(rev,connected);await reviewCosts(review,rev,connected);$('launch-review-details').open=true;},'Review the ML-DSA costs and opt in before sending this transaction.'));
 $('launch-send').addEventListener('click',()=>{let sent=false;return action(async()=>{
  const review=execution.snapshot().review,rev=revision,connected=walletSession.current;ensure(schemeOptIn&&costs.canSubmit(review,connected));
  const old=costs.snapshot().quote,gasPrice=await provider.request({method:'eth_gasPrice'});await live(rev,connected);ensure(schemeOptIn&&costs.canSubmit(review,connected));
  ensure(typeof gasPrice==='string'&&/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(gasPrice)&&gasPrice.length<=66);
  if(BigInt(gasPrice).toString()!==old.gasPriceWei){scheduleCostExpiry(costs.create(review,connected,gasPrice));return;}
  clearCosts();await execution.submitReviewed(review);sent=true;
 },()=>sent?'Transaction submitted. Check its receipt before proceeding.':'Network estimate changed. Review and accept the updated costs before sending.');});
 $('launch-check').addEventListener('click',()=>action(()=>{clearCosts();return execution.reconcile();},'Transaction receipts checked.'));
 $('launch-journal-download').addEventListener('click',()=>{if(execution)download(execution.exportJournal(),'qhooks-public-launch-journal.json');});
 $('launch-save-retry').addEventListener('click',()=>action(()=>execution.retrySave(),'Public progress saved.'));
 $('launch-recover').addEventListener('click',()=>action(()=>{clearCosts();return execution.recover($('launch-recovery-hash').value.trim());},'Transaction hash checked against this exact launch step.'));
 function dispose(){if(dead)return;dead=true;revision++;clearCosts();buildAbort?.abort();discovery.stop();wallet?.dispose();keyHandle=null;execution?.dispose();clearInputs();target.removeEventListener('pagehide',dispose);}
 target.addEventListener('pagehide',dispose);render();return Object.freeze({dispose});
}
