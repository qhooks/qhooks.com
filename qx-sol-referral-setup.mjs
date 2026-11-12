import {solTreasuryReady,QHOOKS_SOL_TREASURY,SOL_TREASURY_WAIT} from './qx-sol-treasury.mjs';
import {solAddress,solWallets,onSolChange} from './qx-solana.mjs';
import {setupSolWallet} from './qx-sol-setup-wallet.mjs';
import {solLaunchError} from './qx-sol-launch-errors.mjs';
import {solReferralRuntime,referralSetupAddresses,setupSolReferral,setupSolReferralFeeAccounts,previewSolReferralFeeAccounts,solFeeAccountCostText,recordFinalizedSolReferral} from './qx-sol-referral-client.mjs';
import {solReferralSetupState} from './qx-sol-referral-setup-state.mjs';
import {waitSolFinalized} from './qx-sol-launch-confirm.mjs';
const $=id=>document.getElementById('qrs-'+id);
const FEE_SHORT=QHOOKS_SOL_TREASURY.slice(0,4)+'…'+QHOOKS_SOL_TREASURY.slice(-4);
function feeHint(off,tapped){const el=$('fee-hint');if(!el)return;const me=solAddress();let text='',link=false;
 if(!off){el.hidden=true;return;}
 if(!me&&!solWallets().length){text='Open this page in Phantom first, then connect '+FEE_SHORT+'.';link=true;}
 else if(!me)text='Connect the treasury wallet '+FEE_SHORT+' first.';
 else if(me!==QHOOKS_SOL_TREASURY)text='This wallet is not the treasury. Connect '+FEE_SHORT+'.';
 else text=tapped?'Checking account rent. Try again in a moment.':'';
 el.textContent=text;
 if(link){const a=document.createElement('a');a.href='https://phantom.app/ul/browse/'+encodeURIComponent(location.href)+'?ref='+encodeURIComponent(location.origin);a.textContent='Open in Phantom';a.className='qsc-fee-hint-link';el.append(' ',a);}
 el.hidden=!text;if(tapped&&text)el.scrollIntoView({block:'nearest'});}
if(new URLSearchParams(location.search).get('go')==='solana'){
 $('gate').hidden=true;$('active').hidden=false;let busy=false,pending=null,feePending=null,unrecorded=false,referralState=null,costKey='',costsReady=false;
 const pendingKey='qhooks:sol-referral:pending:'+QHOOKS_SOL_TREASURY;
 const feePendingKey='qhooks:sol-referral:fee-pending:'+QHOOKS_SOL_TREASURY;
 try{pending=JSON.parse(localStorage.getItem(pendingKey)||'null');}catch{}
 try{feePending=JSON.parse(localStorage.getItem(feePendingKey)||'null');}catch{}
 const status=text=>{$('status').textContent=text;};
 function recovery(){const item=pending||feePending,link=$('transaction');link.hidden=!item;if(item){link.textContent='Check transaction · '+item.signature;link.href='https://solscan.io/tx/'+encodeURIComponent(item.signature);}}
 const renderWallet=setupSolWallet($,status,()=>busy);
 function show(addresses,done=false){
  $('referral').textContent=addresses.referral;
  const values=Object.values(addresses.tokens);$('sol').textContent=values[0];$('usdc').textContent=values[1];$('addresses').hidden=false;
  if(done){referralState={ready:true,referral:addresses.referral,feeAccounts:addresses.tokens,feeAccountsReady:addresses.feeAccountsReady===true,missingFeeMints:addresses.missingFeeMints||[]};$('result').textContent=referralState.feeAccountsReady?'Referral recorded. Fee accounts are ready.':'Referral recorded. Create the missing fee accounts below.';$('result').hidden=false;status('Referral finalized and recorded.');}
 }
 function save(){try{if(pending)localStorage.setItem(pendingKey,JSON.stringify(pending));else localStorage.removeItem(pendingKey);}catch{}}
 function saveFee(){try{if(feePending)localStorage.setItem(feePendingKey,JSON.stringify(feePending));else localStorage.removeItem(feePendingKey);}catch{}}
 function render(){renderWallet();recovery();$('create').disabled=busy||!!pending||!!feePending||!referralState;$('create').hidden=referralState?.ready===true;$('register').textContent='Record referral';$('register').hidden=!pending&&!unrecorded;$('register').disabled=busy;$('recovery').hidden=!pending&&!unrecorded;$('signature').value=pending?.signature||$('signature').value;$('signature').readOnly=!!pending;$('treasury').textContent=solTreasuryReady()?QHOOKS_SOL_TREASURY:SOL_TREASURY_WAIT;
  const step=solReferralSetupState(referralState,solAddress(),{busy,pending:!!feePending});$('fee-step').hidden=!step.showFeeStep;{const off=!!(!step.canCreateFees||!costsReady);$('fee-create').setAttribute('aria-disabled',String(off));$('fee-create').classList.toggle('is-off',off);feeHint(off);}$('fee-check').hidden=!feePending;$('fee-check').disabled=busy||solAddress()!==QHOOKS_SOL_TREASURY;$('fee-missing').textContent=step.missing.map(m=>m.startsWith('So111')?'wrapped SOL':'USDC').join(' and ');
  $('fee-accounts').replaceChildren(...step.missing.map(mint=>{const p=document.createElement('p');p.textContent=(mint.startsWith('So111')?'Wrapped SOL (wSOL)':'USDC')+': '+referralState.feeAccounts[mint];return p;}));
 }
 async function reviewFeeCosts(){
  const step=solReferralSetupState(referralState,solAddress());if(!step.showFeeStep)return;
  const key=referralState.referral+':'+step.missing.join(',');if(key===costKey)return;costKey=key;costsReady=false;$('fee-costs').textContent='Checking account rent and network fee…';render();
  try{const costs=await previewSolReferralFeeAccounts({referral:referralState.referral});if(key!==costKey)return;$('fee-costs').textContent=solFeeAccountCostText(costs);costsReady=true;}
  catch{if(key!==costKey)return;costKey='';$('fee-costs').textContent='Could not check account costs. Refresh this page to retry.';}
  render();
 }
 async function refreshReferral(){const response=await fetch('/api/sol-referral',{cache:'no-store'}),state=await response.json();if(!response.ok)throw Error('Could not check referral fee accounts. Refresh this page.');referralState=state;if(state.ready){show({referral:state.referral,tokens:state.feeAccounts});if(state.feeAccountsReady){feePending=null;saveFee();$('result').textContent='Referral recorded. Fee accounts are ready.';$('result').hidden=false;}}render();void reviewFeeCosts();return state;}
 async function record(){
  const signature=pending?.signature||$('signature').value.trim();if(!signature){status('Enter the confirmed referral creation transaction signature.');return;}
  if(pending&&!pending.confirmed){status('Checking your submitted transaction…');const r=await solReferralRuntime();try{await waitSolFinalized(r.connection,pending.signature,{lastValidBlockHeight:pending.lastValidBlockHeight});}catch(e){if(/^(Transaction failed on chain\.|The transaction expired without confirmation\.)/.test(e?.message||'')){pending=null;save();}throw e;}pending.confirmed=true;save();}
  status('Recording the finalized referral…');const addresses=await recordFinalizedSolReferral(signature);pending=null;unrecorded=false;save();show(addresses,true);void reviewFeeCosts();
 }
 async function action(run){
  if(busy)return;if(!solTreasuryReady()){status(SOL_TREASURY_WAIT);return;}
  busy=true;render();let slow=setTimeout(()=>{if(/in your wallet/i.test($('status').textContent))status('Still waiting for your wallet. If no approval opened, close this tab and open the page again inside Phantom, then tap again.');},20000);try{await run();}catch(e){const message=e?.message||String(e||'');const shown=/^(Referral |The referral name |Could not record the referral\.)/.test(message)?message:solLaunchError(e,'Could not complete referral setup. Please try again.');status(shown+(message&&message!==shown?' Details: '+message.slice(0,240):''));console.error('[sol-referral-setup]',e);}finally{clearTimeout(slow);busy=false;render();}
 }
 $('register').onclick=()=>action(record);
 async function repairFeeAccounts(){
  if(solAddress()!==QHOOKS_SOL_TREASURY){status('Connect the QHooks treasury wallet.');return;}
  if(feePending){const r=await solReferralRuntime();try{await waitSolFinalized(r.connection,feePending.signature,{lastValidBlockHeight:feePending.lastValidBlockHeight});}catch(e){if(/^(Transaction failed on chain\.|The transaction expired without confirmation\.)/.test(e?.message||'')){feePending=null;saveFee();}throw e;}}
  else {const state=await refreshReferral();if(state.feeAccountsReady){status('Fee accounts are already ready.');return;}if(!solReferralSetupState(state,solAddress()).showFeeStep)throw Error('Referral fee account readiness is unavailable. Refresh this page.');
   await setupSolReferralFeeAccounts({referral:state.referral,onStatus:status,onCosts:costs=>{$('fee-costs').textContent=solFeeAccountCostText(costs);},onSent:value=>{feePending=value;saveFee();recovery();}});
  }
  const state=await refreshReferral();status(state.feeAccountsReady?'Fee accounts finalized and verified. Solana referral fees are ready.':'Waiting for finalized fee accounts. Tap Check fee accounts again.');
 }
 $('fee-create').onclick=()=>{if($('fee-create').getAttribute('aria-disabled')==='true'&&solAddress()!==QHOOKS_SOL_TREASURY){feeHint(true,true);return;}return action(repairFeeAccounts);};$('fee-check').onclick=()=>action(repairFeeAccounts);
 $('create').onclick=()=>action(async()=>{
  if(pending){await record();return;}
  if(solAddress()!==QHOOKS_SOL_TREASURY){status('Connect the QHooks treasury wallet.');return;}
  const addresses=await setupSolReferral({onStatus:status,onSent:value=>{pending={...value,confirmed:false};save();recovery();}});
  if(pending){pending.confirmed=true;save();await record();}
  else {const response=await fetch('/api/sol-referral',{cache:'no-store'}),recorded=await response.json();if(response.ok&&recorded.ready&&recorded.referral===addresses.referral)show({...addresses,feeAccountsReady:recorded.feeAccountsReady,missingFeeMints:recorded.missingFeeMints},true);else{show(addresses);unrecorded=true;status('Enter the confirmed referral creation transaction signature, then tap Record referral.');}}
 });
 render();onSolChange(render);
 if(!solTreasuryReady())status(SOL_TREASURY_WAIT);
 else if(!pending)void refreshReferral().then(async state=>{if(!state.ready){const r=await import('/vendor/referral.mjs');show(referralSetupAddresses(r.PublicKey));}}).catch(()=>status('Could not check Solana fee accounts. Refresh this page.'));
}
