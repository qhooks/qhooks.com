import {getWalletHub} from './wallet-hub-fresh.mjs';
import {createStampVaultSetup,STAMP} from './qx-stamp-vault-core.mjs';
import {verifySource} from './qx-stamp-vault-verification.mjs';
import {mountSetup} from './qx-a/pages/setup-ui.mjs';
const $=id=>document.getElementById(id),hub=getWalletHub(window);
let app,timer=null,polls=0,lastWallet=null,verificationBusy=false,autoVerified=null;
const explorer='https://robinhoodchain.blockscout.com';
async function sourceVerification(){
  const s=app.snapshot();if(s.phase!=='done'||verificationBusy)return;verificationBusy=true;$('stamp-verify').disabled=true;$('stamp-verify-status').textContent='Checking source verification on Blockscout…';
  try{const result=await verifySource(s.address);$('stamp-verify-status').textContent=result==='verified'?'Source verified on Blockscout.':'Source submitted to Blockscout. Open the explorer to confirm when indexing completes.';if(result==='verified')$('stamp-verify').hidden=true;}
  catch(e){$('stamp-verify-status').textContent=e.message||'Blockscout could not be reached. Download the source JSON and use the manual verification link.';}
  finally{verificationBusy=false;$('stamp-verify').disabled=false;}
}
function render(s){
  $('stamp-root').dataset.state=s.phase;$('stamp-status').textContent=s.message;$('stamp-readiness').replaceChildren(...(s.checklist||[]).map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
  const current=hub.snapshot().current,wrong=current&&String(current.chainId)!=='4663';
  $('stamp-go').hidden=['done','pending','ambiguous','wallet'].includes(s.phase);$('stamp-go').disabled=s.busy||!!current&&!wrong&&s.phase!=='ready';$('stamp-go').textContent=s.busy?'Checking vault readiness…':!current?'Connect wallet':wrong?'Switch to Robinhood Chain':s.phase!=='ready'?'Complete the checks below':'Deploy stamp vault';
  $('stamp-retry').disabled=s.busy;$('stamp-retry').hidden=s.phase==='wallet';$('stamp-retry').textContent=s.phase==='pending'?'Check deployment':'Refresh check';
  $('stamp-track').hidden=!['ambiguous','pending','ready','error'].includes(s.phase);
  $('stamp-tx').hidden=!s.hash;if(s.hash){$('stamp-tx').href=explorer+'/tx/'+s.hash;$('stamp-tx').textContent='View deployment transaction';}
  $('stamp-result').hidden=s.phase!=='done';
  if(s.phase==='done'){
    $('stamp-address').textContent=s.address;$('stamp-codehash').textContent=s.codeHash;$('stamp-explorer').href=explorer+'/address/'+s.address+'?tab=contract';$('stamp-manual').href=explorer+'/address/'+s.address+'/verify-via-standard-json-input/new';
    $('stamp-checks').replaceChildren(...Object.entries(s.checks).map(([name,value])=>{const li=document.createElement('li');li.textContent=name+': '+value;return li;}));
    if(autoVerified!==s.address){autoVerified=s.address;$('stamp-verify-status').textContent='Deployment verified. Check source verification on Blockscout or use Verify source below.';}
  }
  clearTimeout(timer);if(s.phase==='pending'&&!s.busy&&polls++<20)timer=setTimeout(()=>app.check(),5000);
}
app=createStampVaultSetup({hub,onChange:render});
$('stamp-template-hash').textContent=STAMP.templateHash;$('stamp-init-hash').textContent=STAMP.initCodeHash;
for(const[name,value]of Object.entries(STAMP.config)){const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=name;dd.className='setup-address stamp-value';dd.textContent=value;row.append(dt,dd);$('stamp-args').append(row);}
$('stamp-go').addEventListener('click',async()=>{const c=hub.snapshot().current;if(!c){hub.open();return;}if(String(c.chainId)!=='4663'){try{await hub.switchChain('4663');await app.check();}catch{$('stamp-status').textContent='Network switch was not completed. Nothing was sent.';}return;}await app.deploy();});
$('stamp-retry').addEventListener('click',()=>{polls=0;app.check();});$('stamp-track-go').addEventListener('click',()=>app.track($('stamp-hash').value.trim()));$('stamp-verify').addEventListener('click',sourceVerification);
hub.subscribe(s=>{const c=s.current,identity=c?[c.owner,String(c.chainId),c.entry.provider]:null;if(lastWallet&&(lastWallet[0]!==identity?.[0]||lastWallet[1]!==identity?.[1]||lastWallet[2]!==identity?.[2]))app.walletChanged();lastWallet=identity;render(app.snapshot());});
mountSetup({title:'Stamp vault',back:'/taps'});app.check();window.addEventListener('pagehide',()=>clearTimeout(timer));
