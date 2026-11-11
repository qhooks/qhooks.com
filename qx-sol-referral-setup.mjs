import {solTreasuryReady,QHOOKS_SOL_TREASURY,SOL_TREASURY_WAIT} from './qx-sol-treasury.mjs';
import {solAddress,onSolChange} from './qx-solana.mjs';
import {setupSolWallet} from './qx-sol-setup-wallet.mjs';
import {solLaunchError} from './qx-sol-launch-errors.mjs';
import {solReferralRuntime,referralSetupAddresses,setupSolReferral,recordFinalizedSolReferral} from './qx-sol-referral-client.mjs';
import {waitSolFinalized} from './qx-sol-launch-confirm.mjs';
const $=id=>document.getElementById('qrs-'+id);
if(new URLSearchParams(location.search).get('go')==='solana'){
 $('gate').hidden=true;$('active').hidden=false;let busy=false,pending=null,unrecorded=false;
 const pendingKey='qhooks:sol-referral:pending:'+QHOOKS_SOL_TREASURY;
 try{pending=JSON.parse(localStorage.getItem(pendingKey)||'null');}catch{}
 const status=text=>{$('status').textContent=text;};
 function recovery(){const link=$('transaction');link.hidden=!pending;if(pending){link.textContent='Check transaction · '+pending.signature;link.href='https://solscan.io/tx/'+encodeURIComponent(pending.signature);}}
 const renderWallet=setupSolWallet($,status,()=>busy);
 function show(addresses,done=false){
  $('referral').textContent=addresses.referral;
  const values=Object.values(addresses.tokens);$('sol').textContent=values[0];$('usdc').textContent=values[1];$('addresses').hidden=false;
  if(done){$('result').textContent='Referral recorded. QHooks can now collect Solana platform fees.';$('result').hidden=false;status('Referral accounts finalized and recorded.');}
 }
 function save(){try{if(pending)localStorage.setItem(pendingKey,JSON.stringify(pending));else localStorage.removeItem(pendingKey);}catch{}}
 function render(){renderWallet();recovery();$('create').disabled=busy||!!pending;$('register').textContent='Record referral';$('register').hidden=!pending&&!unrecorded;$('register').disabled=busy;$('recovery').hidden=!pending&&!unrecorded;$('signature').value=pending?.signature||$('signature').value;$('signature').readOnly=!!pending;$('treasury').textContent=solTreasuryReady()?QHOOKS_SOL_TREASURY:SOL_TREASURY_WAIT;}
 async function record(){
  const signature=pending?.signature||$('signature').value.trim();if(!signature){status('Enter the confirmed referral creation transaction signature.');return;}
  if(pending&&!pending.confirmed){status('Checking your submitted transaction…');const r=await solReferralRuntime();try{await waitSolFinalized(r.connection,pending.signature,{lastValidBlockHeight:pending.lastValidBlockHeight});}catch(e){if(/^(Transaction failed on chain\.|The transaction expired without confirmation\.)/.test(e?.message||'')){pending=null;save();}throw e;}pending.confirmed=true;save();}
  status('Recording the finalized referral…');const addresses=await recordFinalizedSolReferral(signature);pending=null;unrecorded=false;save();show(addresses,true);
 }
 async function action(run){
  if(busy)return;if(!solTreasuryReady()){status(SOL_TREASURY_WAIT);return;}
  busy=true;render();try{await run();}catch(e){const message=e?.message||'';status(/^(Referral |The referral name |Could not record the referral\.)/.test(message)?message:solLaunchError(e,'Could not complete referral setup. Please try again.'));}finally{busy=false;render();}
 }
 $('register').onclick=()=>action(record);
 $('create').onclick=()=>action(async()=>{
  if(pending){await record();return;}
  if(solAddress()!==QHOOKS_SOL_TREASURY){status('Connect the QHooks treasury wallet.');return;}
  const addresses=await setupSolReferral({onStatus:status,onSent:value=>{pending={...value,confirmed:false};save();recovery();}});
  if(pending){pending.confirmed=true;save();await record();}
  else {const response=await fetch('/api/sol-referral',{cache:'no-store'}),recorded=await response.json();if(response.ok&&recorded.ready&&recorded.referral===addresses.referral)show(addresses,true);else{show(addresses);unrecorded=true;status('Enter the confirmed referral creation transaction signature, then tap Record referral.');}}
 });
 render();onSolChange(render);
 if(!solTreasuryReady())status(SOL_TREASURY_WAIT);
 else if(!pending)void import('/vendor/referral.mjs').then(r=>show(referralSetupAddresses(r.PublicKey))).catch(()=>status('Could not load Solana setup. Refresh this page.'));
}
