// Lead-owned presentation/action boundary. Injected accepted crypto loads on connect only.
import {discoverWallets} from './discover-wallets.mjs';
import {renderGraduationSetup} from './graduation-setup-summary.mjs';
import {readGraduationLabDraft,graduationLabStorageKey} from './graduation-lab-draft.mjs';
const ids=['manager','verifier','token','quote','controller'];
const fieldNames=['tokenName','symbol','decimals','totalSupply','quoteSupply','notice'];
export function bindGraduationPage({document:d=document,target=window,loadModules,getArtifacts,downloadFile=null}){
 const $=id=>d.getElementById('grad-'+id),ensure=(v)=>{if(!v)throw Error('Graduation setup could not be opened');};
 let providers=[],modules=null,provider=null,session=null,signer=null,setup=null,busy=false,dead=false,revision=0,review=null,timer=null;
 const feedback=(s,error=false)=>{$('feedback').textContent=s;$('feedback').dataset.error=String(error);};
 const nextId=state=>ids.find(id=>state?.stages[id]?.status!=='confirmed');
 const readyKey=()=>!!signer&&!signer.locked&&signer.backupVerified;
 function clearReview(){review=null;clearTimeout(timer);$('accept').checked=false;}
 function render(){
  if(dead)return;const s=setup?.snapshot(),working=busy||!!s?.busy,connected=session?.current?.chainId==='31337',id=nextId(s),phase=s?.stages[id]?.status;
  renderGraduationSetup($('summary'),s||null);
  $('provider').disabled=working;$('connect').disabled=working||!providers.length;$('disconnect').disabled=!session;
  for(const f of fieldNames)$(f).disabled=working||!!setup;
  $('lab-use').disabled=working||!!setup;
  $('key-status').textContent=signer?`Quantum key: ${signer.publicKeyHex} · ${signer.locked?'locked':signer.backupVerified?'backup verified':'verify your saved backup'}`:'No quantum key loaded.';
  $('key-password').disabled=working||!connected;$('key-file').disabled=working||!connected;
  $('key-create').disabled=working||!connected||!!setup||!!signer&&!signer.locked;
  $('key-export').disabled=working||!connected||!signer||signer.locked;
  $('key-verify').disabled=working||!connected||!signer||signer.locked;
  $('key-restore').disabled=working||!connected;$('key-lock').disabled=!signer||signer.locked;
  $('prepare').disabled=working||!connected||!!setup||!readyKey();
  for(const id of ['resume','journal-import'])$(id).disabled=working||!connected||!!setup;
  $('journal-file').disabled=working||!!setup;$('journal-download').disabled=!setup;$('close').disabled=working||!setup;
  $('review').textContent=id?`Review ${id} deployment`:'Setup complete';
  $('review').disabled=working||!connected||!setup||!readyKey()||!id||!['pending','rejected',undefined].includes(phase)||!!s.persistenceFailed;
  $('check').disabled=working||!connected||!setup||!!s.persistenceFailed;
  $('retry-save').hidden=!s?.persistenceFailed;$('retry-save').disabled=working||!setup;
  const valid=!!review&&s?.review===review&&Date.now()<review.expiresAt&&connected&&readyKey();
  $('review-details').hidden=!valid;$('review-text').textContent=valid?JSON.stringify(review,null,2):'';
  $('cost').textContent=valid?`Estimated network cost: ${review.estimatedNetworkFeeWei} wei (${review.estimatedGas} gas at ${review.gasPriceWei} wei/gas). Gas-limit estimate: ${review.gasLimitFeeEstimateWei} wei. Service fee: off. Your wallet confirms final fees.`:'Review a deployment for its current network estimate.';
  $('accept').disabled=working||!valid;$('send').disabled=working||!valid||!$('accept').checked;
  const unknown=ids.find(id=>s?.stages[id]?.status==='unknown');$('recovery').hidden=!unknown;$('recover').disabled=working||!connected||!unknown||!!s.persistenceFailed;
 }
 function lock(){revision++;clearReview();signer?.lock();setup?.invalidate();$('key-password').value='';$('key-file').value='';render();}
 function disconnect(){revision++;clearReview();setup?.dispose();setup=null;signer?.lock();signer=null;session?.dispose();session=null;provider=null;$('key-password').value='';$('key-file').value='';render();}
 async function run(fn,message){if(dead||busy||setup?.snapshot().busy)return;busy=true;render();feedback('Working locally…');try{await fn();if(!dead)feedback(message);}catch{if(!dead)feedback('Step stopped. Check your local wallet, backup and saved progress. Recover an interrupted broadcast by its exact hash; do not resend it.',true);}finally{busy=false;render();}}
 async function live(rev,connection){ensure(!dead&&rev===revision&&connection&&session?.current===connection);await session.refresh(connection);ensure(!dead&&rev===revision&&session?.current===connection);}
 function download(text,name){if(downloadFile)return downloadFile(text,name);const u=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=d.createElement('a');a.href=u;a.download=name;d.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),30000);}
 function save(text){const j=JSON.parse(text);ensure(text.length<=500000&&j.kind==='qhooks-graduation-setup-journal'&&/^0x[0-9a-f]{40}$/.test(j.profile.owner)&&/^(0|[1-9][0-9]{0,19})$/.test(j.profile.baseNonce));target.localStorage.setItem(`qhooks.graduation.setup.${j.profile.owner}.${j.profile.baseNonce}`,text);target.localStorage.setItem(`qhooks.graduation.latest.${j.profile.owner}`,j.profile.baseNonce);}
 function latest(){const owner=session.current.owner,n=target.localStorage.getItem(`qhooks.graduation.latest.${owner}`);ensure(typeof n==='string'&&/^(0|[1-9][0-9]{0,19})$/.test(n));const text=target.localStorage.getItem(`qhooks.graduation.setup.${owner}.${n}`);ensure(typeof text==='string');return text;}
 async function fileText(id,max){const f=$(id).files?.[0];ensure(f&&f.size>0&&f.size<=max);return f.text();}
 async function install(journal=null){
  ensure(!setup&&session?.current?.chainId==='31337');const rev=revision,connection=session.current;clearReview();const artifacts=await getArtifacts();await live(rev,connection);
  let profile=null;if(journal===null){ensure(readyKey());const nonce=await provider.request({method:'eth_getTransactionCount',params:[connection.owner,'pending']});await live(rev,connection);ensure(typeof nonce==='string'&&nonce.length<=18&&/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(nonce));profile={owner:connection.owner,baseNonce:BigInt(nonce).toString(),publicKey:signer.publicKeyHex,fields:Object.fromEntries(fieldNames.map(f=>[f,$(f).value]))};}
  const candidate=await modules.createGraduationSetup({provider,session,profile,...artifacts,signer,journal,save,onChange:render});
  try{await live(rev,connection);save(candidate.journal());}catch(e){candidate.dispose();throw e;}
  setup=candidate;for(const f of fieldNames)$(f).value=setup.snapshot().profile.fields[f];if(journal!==null)await setup.reconcile();render();
 }
 const discovery=discoverWallets(target,entries=>{providers=entries;const select=$('provider'),prior=select.value;select.replaceChildren();entries.forEach((entry,i)=>{const o=d.createElement('option');o.value=String(i);o.textContent=entry.name;select.appendChild(o);});if(prior!==''&&entries[Number(prior)])select.value=prior;render();});
 $('provider').addEventListener('change',()=>{disconnect();feedback('Wallet selection changed. Public progress is retained.');});
 $('connect').addEventListener('click',()=>run(async()=>{disconnect();const rev=revision,p=providers[Number($('provider').value)]?.provider;ensure(p);modules??=await loadModules();ensure(!dead&&rev===revision);provider=p;session=modules.createWalletSession(p,lock);await session.connect();ensure(session.current?.chainId==='31337');},'Connected to local chain 31337. Create or restore a graduation key.'));
 $('disconnect').addEventListener('click',()=>{disconnect();feedback('Disconnected and key locked. Public progress remains saved.');});
 $('key-lock').addEventListener('click',()=>{lock();feedback('Quantum key locked. Restore your backup to continue.');});
 $('key-create').addEventListener('click',()=>run(async()=>{ensure(session?.current?.chainId==='31337'&&!setup);const rev=revision,connection=session.current;await live(rev,connection);signer?.lock();signer=modules.createSigner();},'Quantum key created. Download its encrypted backup, then verify the saved file.'));
 $('key-export').addEventListener('click',()=>run(async()=>{const rev=revision,connection=session.current,current=signer,password=$('key-password').value;$('key-password').value='';ensure(current&&!current.locked);const text=await current.exportBackup(password);await live(rev,connection);ensure(signer===current&&!current.locked);download(text,'qhooks-graduation-encrypted-backup.json');},'Encrypted backup downloaded. Select that file and verify it.'));
 $('key-verify').addEventListener('click',()=>run(async()=>{const rev=revision,connection=session.current,current=signer,password=$('key-password').value;$('key-password').value='';const text=await fileText('key-file',4096);await live(rev,connection);ensure(current===signer&&!current.locked);await current.verifyBackup(text,password);await live(rev,connection);},'Saved backup verified. Keep it and its passphrase in separate safe places.'));
 $('key-restore').addEventListener('click',()=>run(async()=>{const rev=revision,connection=session.current,password=$('key-password').value;$('key-password').value='';const text=await fileText('key-file',4096);await live(rev,connection);let next=null;try{next=await modules.restoreSigner(text,password);await live(rev,connection);if(setup)setup.attachSigner(next);signer?.lock();signer=next;next=null;clearReview();}finally{next?.lock();}},'Graduation key restored and verified.'));
 $('prepare').addEventListener('click',()=>run(()=>install(),'Setup prepared. Review each deployment separately.'));
 $('lab-use').addEventListener('click',()=>{if(dead||busy||setup)return;try{const draft=readGraduationLabDraft(target.localStorage.getItem(graduationLabStorageKey));clearReview();for(const f of fieldNames)$(f).value=draft.setup[f];feedback('Lab setup fields loaded. Review them, then connect and verify a key. Liquidity settings are imported separately after setup.');}catch{feedback('Save a valid QGraduation draft in the Lab first.',true);}render();});
 $('resume').addEventListener('click',()=>run(()=>install(latest()),'Public setup loaded and receipts checked. Restore the matching key for new deployments.'));
 $('journal-import').addEventListener('click',()=>run(async()=>{const rev=revision,connection=session.current,text=await fileText('journal-file',500000);await live(rev,connection);await install(text);},'Public setup imported and checked. No transaction was sent.'));
 $('journal-download').addEventListener('click',()=>{if(setup)download(setup.journal(),'qhooks-public-graduation-setup.json');});
 $('close').addEventListener('click',()=>{if(busy)return;clearReview();setup?.dispose();setup=null;signer?.lock();signer=null;render();feedback('Setup closed and key locked. Saved public progress is retained.');});
 $('review').addEventListener('click',()=>run(async()=>{clearReview();const rev=revision,connection=session.current,r=await setup.review(nextId(setup.snapshot()));await live(rev,connection);ensure(setup.snapshot().review===r);review=r;timer=setTimeout(render,Math.max(0,r.expiresAt-Date.now()+1));$('review-details').open=true;},'Review this exact transaction and accept its estimated network cost.'));
 $('accept').addEventListener('change',render);
 $('send').addEventListener('click',()=>run(async()=>{const r=review;ensure(r&&r===setup.snapshot().review&&$('accept').checked&&Date.now()<r.expiresAt);setup.acceptFees(r);clearReview();await setup.submit(r);},'Deployment submitted. Check receipts before the next step.'));
 $('check').addEventListener('click',()=>run(()=>{clearReview();return setup.reconcile();},'Canonical deployment receipts checked.'));
 $('retry-save').addEventListener('click',()=>run(()=>setup.retrySave(),'Public progress saved.'));
 $('recover').addEventListener('click',()=>run(()=>{clearReview();const id=ids.find(id=>setup.snapshot().stages[id]?.status==='unknown');ensure(id);return setup.recover(id,$('hash').value.trim());},'Exact transaction recovered without resending.'));
 function dispose(){if(dead)return;dead=true;disconnect();discovery.stop();target.removeEventListener('pagehide',dispose);}
 target.addEventListener('pagehide',dispose);render();return Object.freeze({dispose});
}
