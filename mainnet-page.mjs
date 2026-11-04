import {discoverWallets} from './discover-wallets.mjs';
import {createMainnetDeployment} from './mainnet-deploy.mjs';
import {deploymentSummary,formatWei} from './mainnet-format.mjs';
import {deploymentControls} from './mainnet-ui-state.mjs';
import {estimateGasUsd} from './gas-usd.mjs';
const el=id=>document.getElementById('deploy-'+id);
let wallets=[],controller=null,provider=null,owner=null,uiBusy=false,currentQuote=null,toolkit=null,releaseLock=null,quoteTimer=null;
const feedback=message=>{el('feedback').textContent=message;};
function draw(){
 const s=controller?.snapshot()||{status:'idle'};
 if(currentQuote!==s.quote){currentQuote=s.quote||null;el('consent').checked=false;clearTimeout(quoteTimer);if(currentQuote)quoteTimer=setTimeout(()=>{controller?.invalidateReview();feedback('Review expired. Request a fresh estimate.');},Math.max(0,currentQuote.expiresAt-Date.now()));}
 const controls=deploymentControls({connected:!!controller,busy:uiBusy||!!s.busy,status:s.status,hasQuote:!!currentQuote,consent:el('consent').checked,saveFailed:!!s.saveFailed,hasProvider:wallets.length>0,complete:!!s.pool});
 for(const [id,enabled]of Object.entries(controls))el(id).disabled=!enabled;
 el('provider').disabled=!!controller||uiBusy;el('import').disabled=!controller||uiBusy||s.busy;el('hash').disabled=!controls.recover;
 el('review').textContent=s.verifier?'Review pool deployment':'Review verifier deployment';
 el('summary').textContent=deploymentSummary(s).join('\n');
 el('transaction').textContent=currentQuote?JSON.stringify(currentQuote.transaction,null,2):'';
 if(currentQuote){try{const p=el('price').value;if(!/^(?:[1-9][0-9]{0,5})(?:\.[0-9]{1,2})?$/.test(p))throw Error();const [whole,fraction='']=p.split('.'),cents=(BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'))).toString();const cost=estimateGasUsd({gas:'0',gasPriceWei:'0',additionalFeeWei:currentQuote.totalWei,ethUsdCents:cents});el('cost').textContent=cost.usd+' estimated fee / '+formatWei(currentQuote.totalWei)+' · includes execution allowance and a 2× data/operator-fee buffer.';}catch{el('cost').textContent='Enter a valid USD reference price to see the dollar estimate.';el('send').disabled=true;}}
 else el('cost').textContent='Review for a fresh fee estimate. No automatic transaction or deposit.';
}
async function action(fn){if(uiBusy)return;uiBusy=true;draw();try{await fn();}catch(e){feedback(e.message||'Operation failed');}finally{uiBusy=false;draw();}}
function storageKey(){return 'qhooks:base-deployment:v1:'+owner;}
function persist(journal){const serialized=JSON.stringify(journal);localStorage.setItem(storageKey(),serialized);if(localStorage.getItem(storageKey())!==serialized)throw Error('Progress did not persist');}
async function lockWallet(address){
 if(!navigator.locks)throw Error('This browser cannot protect deployment progress across tabs. Use an up-to-date Chrome browser.');
 let acquired;
 const ready=new Promise((resolve,reject)=>{acquired={resolve,reject};});
 navigator.locks.request('qhooks-base-deploy:'+address,{ifAvailable:true},lock=>{
  if(!lock){acquired.reject(Error('This wallet’s deployment is open in another tab. Close that session first.'));return;}
  return new Promise(resolve=>{releaseLock=resolve;acquired.resolve();});
 }).catch(acquired.reject);
 return ready;
}
function disconnect(){controller?.dispose();controller=null;provider=null;owner=null;releaseLock?.();releaseLock=null;clearTimeout(quoteTimer);currentQuote=null;el('consent').checked=false;el('connection').textContent='Disconnected. Public deployment progress remains saved.';draw();}
async function start(saved){
 const next=await createMainnetDeployment({provider,owner,toolkitText:toolkit,saved,save:persist,onChange:()=>draw()});controller?.dispose();controller=next;await controller.reconcile();
}
el('connect').addEventListener('click',()=>action(async()=>{
 const selected=wallets.find(w=>w.uuid===el('provider').value);if(!selected)throw Error('Select an installed wallet');provider=selected.provider;
 try{
  const accounts=await provider.request({method:'eth_requestAccounts'});if(!Array.isArray(accounts)||!/^0x[0-9a-f]{40}$/i.test(accounts[0]||''))throw Error('Wallet did not provide an account');owner=accounts[0].toLowerCase();
  if(await provider.request({method:'eth_chainId'})!=='0x2105')throw Error('Select Base mainnet in your wallet, then connect again.');
  await lockWallet(owner);
  if(!toolkit){const response=await fetch('mainnet-toolkit.json',{cache:'no-store',redirect:'error'});if(!response.ok)throw Error('Deployment toolkit unavailable');toolkit=await response.text();}
  await start(localStorage.getItem(storageKey()));el('connection').textContent='Connected on Base: '+owner;feedback('Connected. Review the next deployment when you are ready.');
 }catch(e){disconnect();throw e;}
}));
el('disconnect').addEventListener('click',()=>{if(!uiBusy)disconnect();});
el('review').addEventListener('click',()=>action(async()=>{await controller.review();feedback('Review the exact transaction and fee. Nothing has been sent.');}));
el('check').addEventListener('click',()=>action(async()=>{await controller.reconcile();feedback(controller.snapshot().pool?'Both core deployments match the reviewed bytecode. Download your progress.':'Chain receipts checked.');}));
el('consent').addEventListener('change',draw);
el('price').addEventListener('input',()=>{controller?.invalidateReview();el('consent').checked=false;draw();});
el('send').addEventListener('click',()=>action(async()=>{
 if(!el('consent').checked||!currentQuote)throw Error('Review the fee and select the confirmation first');
 const selected=currentQuote;el('consent').checked=false;await controller.submit(selected);feedback('Wallet submission recorded. Check receipts to confirm the result.');
}));
el('recover').addEventListener('click',()=>action(async()=>{await controller.recover(el('hash').value.trim().toLowerCase());feedback('Matching transaction recovered and checked.');}));
el('save').addEventListener('click',()=>action(async()=>{await controller.save();feedback('Public progress saved.');}));
el('download').addEventListener('click',()=>{if(!controller)return;const url=URL.createObjectURL(new Blob([JSON.stringify(controller.journal(),null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='qhooks-base-deployment.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
el('import').addEventListener('change',()=>action(async()=>{
 const file=el('import').files?.[0];if(!file||file.size>500000)throw Error('Select a public progress JSON file under 500 KB');
 // Never replace in-flight progress with an imported empty or unrelated journal.
 if(controller.journal().stages.length)throw Error('Existing deployment progress must be preserved. Use its saved journal in this browser.');
 const text=await file.text();await start(text);await controller.save();feedback('Imported public progress checked against Base.');
}));
const discovery=discoverWallets(window,entries=>{wallets=[...entries];const selected=el('provider').value;el('provider').replaceChildren();for(const entry of wallets){const option=document.createElement('option');option.value=entry.uuid;option.textContent=entry.name;el('provider').append(option);}if(wallets.some(w=>w.uuid===selected))el('provider').value=selected;draw();});
setTimeout(()=>{if(!wallets.length){el('provider').replaceChildren(new Option('No installed wallet detected',''));el('connection').textContent='No wallet detected. Open this page in Chrome with your EVM wallet installed, select Base, then refresh.';}draw();},800);
window.addEventListener('pagehide',()=>{discovery.stop();controller?.dispose();releaseLock?.();clearTimeout(quoteTimer);});draw();
