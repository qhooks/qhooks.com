// No secret leaves this module through a server request, URL, log or browser storage.
import {discoverWallets} from './discover-wallets.mjs';
import {renderWalletSummary} from './wallet-summary.mjs';
import {renderKeyControls} from './key-controls.mjs';
export function bindWalletPage({loadModules,target=window,downloadFile=null}) {
const $=id=>document.getElementById(id),empty=Object.freeze({connected:null,keyId:null,publicKeyHex:null,backupVerified:false,busy:false,review:null,approval:null});
renderKeyControls($('wallet-key-controls'));
let workspace=null,providers=[],loading=false,view=empty,uiRevision=0,lastIdentity=null;
const password=$('qkey-password'),file=$('qkey-file'),form=$('enrollment-form');
function feedback(message,error=false){$('wallet-feedback').textContent=message;$('wallet-feedback').dataset.error=String(error);}
function clearInputs(){password.value='';file.value='';}
function render(state=empty){
  view=state;renderWalletSummary($('wallet-summary'),state);
  const identity=state.connected?state.connected.owner+':'+state.connected.chainId:null;
  if(identity!==lastIdentity){uiRevision++;clearInputs();lastIdentity=identity;}
  const busy=loading||state.busy,connected=!!state.connected,key=!!state.keyId;
  $('wallet-provider').disabled=busy;$('wallet-connect').disabled=busy||!providers.length;$('wallet-disconnect').disabled=!connected;
  $('qkey-create').disabled=busy||!connected||key;
  $('qkey-export').disabled=busy||!key;
  $('qkey-verify').disabled=busy||!key;
  $('qkey-restore').disabled=busy||!connected;
  password.disabled=busy;file.disabled=busy;
  $('enrollment-review').disabled=busy||!state.backupVerified;
  $('enrollment-sign').disabled=busy||!state.review;
  $('enrollment-download').disabled=busy||!state.approval;
  $('enrollment-preview').hidden=!state.review;
  $('enrollment-preview').textContent=state.review?JSON.stringify(state.review,null,2):'';
}
function download(value,name){
  if(downloadFile)return downloadFile(value,name);
  const blob=new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
async function loadWorkspace(){
  if(workspace)return workspace;
  const [flow,signer,session,approval,typed]=await loadModules();
  workspace=flow.createWorkspace({...signer,...session,...approval,...typed,onChange:render});return workspace;
}
async function action(fn,message){
  if(loading||view.busy)return;
  loading=true;render(view);feedback('Working locally…');const rev=uiRevision;
  try{await fn();if(rev===uiRevision)feedback(message);}
  catch{feedback('That step could not be completed. Check the selected local wallet, backup passphrase/file, or enrollment fields and try again.',true);}
  finally{password.value='';loading=false;render(workspace?.snapshot()||empty);}
}
async function backupText(){const selected=file.files?.[0];if(!selected||selected.size>16384)throw new Error('Select a bounded encrypted backup');return await selected.text();}
const discovery=discoverWallets(target,entries=>{
  providers=entries;const select=$('wallet-provider'),prior=select.value;select.replaceChildren();
  entries.forEach((entry,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=entry.name;select.appendChild(option);});
  if(prior!==''&&entries[Number(prior)])select.value=prior;render(view);
});
$('wallet-provider').addEventListener('change',()=>{uiRevision++;workspace?.disconnect();clearInputs();feedback('Wallet selection changed. Connect explicitly to continue.');});
$('wallet-connect').addEventListener('click',()=>action(async()=>{const p=providers[Number($('wallet-provider').value)]?.provider;if(!p)throw new Error();const rev=uiRevision,w=await loadWorkspace();if(rev!==uiRevision)throw new Error();await w.connect(p);feedback('Connected to local chain 31337.');},'Connected to local chain 31337.'));
$('wallet-disconnect').addEventListener('click',()=>{uiRevision++;workspace?.disconnect();clearInputs();feedback('Disconnected. Keys and pending approvals cleared.');});
$('qkey-lock').addEventListener('click',()=>{uiRevision++;workspace?.lock();clearInputs();feedback('Quantum key locked. Restore your encrypted backup to continue.');});
$('qkey-create').addEventListener('click',()=>action(()=>workspace.generate(),'Quantum key created. Download an encrypted backup before enrollment.'));
$('qkey-export').addEventListener('click',()=>action(async()=>{const rev=uiRevision,encrypted=await workspace.exportBackup(password.value);if(rev!==uiRevision)throw new Error();download(encrypted,'qhooks-encrypted-backup.json');},'Backup download requested. Select the saved file and verify it before enrollment.'));
for(const[id,method,message]of [['qkey-verify','verifyBackup','Backup restored and verified. You can review enrollment.'],['qkey-restore','restore','Quantum key restored and verified.']])$(id).addEventListener('click',()=>action(async()=>{const rev=uiRevision,pass=password.value,encrypted=await backupText();if(rev!==uiRevision)throw new Error();await workspace[method](encrypted,pass);},message));
form.addEventListener('input',()=>{uiRevision++;workspace?.invalidateAction();});
form.addEventListener('submit',e=>{e.preventDefault();try{workspace.reviewEnrollment(Object.fromEntries(['vault','policyHash','keyEpoch','validAfter','validUntil'].map(k=>[k,form.elements[k].value.trim()])));feedback('Review every field below before approving with both keys.');}catch{feedback('Connect, verify your backup and check the enrollment fields.',true);}});
$('enrollment-window').addEventListener('click',()=>{uiRevision++;workspace?.invalidateAction();const now=Math.floor(Date.now()/1000);form.elements.validAfter.value=String(now);form.elements.validUntil.value=String(now+900);});
$('enrollment-sign').addEventListener('click',()=>action(()=>workspace.approveEnrollment(),'Enrollment signed with both keys. It has not been submitted.'));
$('enrollment-download').addEventListener('click',()=>{const a=workspace?.snapshot().approval;if(a)download({schemaVersion:1,kind:'qhooks-enrollment-approval',submitted:false,approval:a},'qhooks-enrollment-approval.json');});
function dispose(){uiRevision++;discovery.stop();workspace?.dispose();clearInputs();}
target.addEventListener('pagehide',dispose);
render();
return Object.freeze({dispose});
}
