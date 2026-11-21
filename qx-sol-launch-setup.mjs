import {solTreasuryReady,SOL_TREASURY_WAIT} from './qx-sol-treasury.mjs';
import {setupSolWallet} from './qx-sol-setup-wallet.mjs';
import {solLaunchError} from './qx-sol-launch-errors.mjs';
import {SOL_LAUNCH_CONFIG as C,SOL_LAUNCH_POLICY_NEXT,solPolicy} from './qx-sol-launch-config.mjs';
import {solReviewLines} from './qx-sol-launch-values.mjs';
import {solAddress,solWallets,onSolChange} from './qx-solana.mjs';
import {solApi,solRuntime,prepareSolTransaction,sendPreparedSol,claimSolFees,migrateSolLaunch} from './qx-sol-launch-client.mjs';
const $=id=>document.getElementById('qss-'+id);
const pendingKey='qhooks:sol-config:pending:'+C.treasury;
// solcfg2 (2026-11-21): once a config is live, the page offers the next fee policy (policy 2: 15-second anti-snipe and
// a base-fee first buy). Only the treasury wallet can create it: the server registers it only with the treasury-signed
// createConfig transaction. The current config keeps serving every existing coin.
if(new URLSearchParams(location.search).get('go')==='solana'){
 $('active').hidden=false;$('gate').hidden=true;let ready=false,busy=false,pending=null,version=0;
 const upgrade=()=>ready&&version<SOL_LAUNCH_POLICY_NEXT,target=()=>ready?SOL_LAUNCH_POLICY_NEXT:1;
 // solsetup (2026-11-21): the saved create is only a hint. It never blocks Create unless its config account or its
 // transaction is on chain; ?reset=1 or "Clear saved transaction" drops it. Fee and graduate messages have their own line.
 const params=new URLSearchParams(location.search),dropPending=()=>{pending=null;try{localStorage.removeItem(pendingKey);}catch{}};
 if(params.get('reset')==='1'){try{localStorage.removeItem(pendingKey);}catch{}params.delete('reset');try{history.replaceState(null,'',location.pathname+'?'+params+location.hash);}catch{}}
 else try{pending=JSON.parse(localStorage.getItem(pendingKey)||'null');}catch{}
 if(pending&&(typeof pending!=='object'||typeof pending.address!=='string'))dropPending();
 const status=text=>{$('status').textContent=text;},feeStatus=text=>{($('fee-status')||$('status')).textContent=text;};
 const NEVER_LANDED='The earlier config transaction never reached the chain. Nothing was created. Create the config again.';
 // 'landed': the config account exists (Register can finish). 'gone': failed or expired, cleared. 'unknown': still in flight.
 async function checkPending(){
  if(!pending)return 'gone';const r=await solRuntime(),c=r.connection;
  if(await c.getAccountInfo(new r.PublicKey(pending.address),'confirmed'))return 'landed';
  const st=pending.signature?(await c.getSignatureStatuses([pending.signature],{searchTransactionHistory:true}))?.value?.[0]:null;
  if(st?.err){dropPending();return 'failed';}
  if(st)return 'unknown';
  const lv=Number(pending.lastValidBlockHeight);
  if(Number.isSafeInteger(lv)?await c.getBlockHeight('confirmed')>lv+32:Date.now()-(Number(pending.at)||0)>180000){dropPending();return 'gone';}
  return 'unknown';
 }
 async function reviewPending(){
  if(!pending)return;status('Checking the saved config transaction on chain…');
  try{const s=await checkPending();
   status(s==='landed'?'The config transaction landed. Tap Register confirmed config.':s==='failed'?'The earlier config transaction failed on chain. Nothing was created. Create the config again.':s==='gone'?NEVER_LANDED:'The config transaction is still in flight. Check again in a minute, or clear it to start over.');
  }catch(e){status(solLaunchError(e,'Could not check the saved config transaction. Please try again.'));}
  render();
 }
 const rules=document.createElement('dl');rules.className='qxc-sol-rules';$('rules').append(rules);
 const paintRules=()=>{rules.replaceChildren();for(const[k,v]of solReviewLines(solPolicy(target()))){const a=document.createElement('dt'),b=document.createElement('dd');a.textContent=k;b.textContent=v;rules.append(a,b);}};paintRules();
 const TREASURY_SHORT=solTreasuryReady()?C.treasury.slice(0,4)+'…'+C.treasury.slice(-4):'pending';
 const renderWallet=setupSolWallet($,status,()=>busy);
 const treasuryGuard=()=>{if(solTreasuryReady())return true;status(SOL_TREASURY_WAIT);return false;};
 function render(){const me=solAddress();renderWallet();
  $('create').disabled=busy||(ready&&!upgrade())||!!pending;$('create').hidden=ready&&!upgrade();$('create').textContent=upgrade()?'Create launch config v2':'Create the fixed config';
  $('claim').disabled=busy||(solTreasuryReady()&&(!ready||me!==C.treasury||!$('coins').value));
  if(ready&&me&&me!==C.treasury)$('claim').title='Connect the treasury wallet '+TREASURY_SHORT;
  $('graduate').disabled=busy||!ready||!me||!$('coins').value;$('register').hidden=!pending;$('register').disabled=busy;$('register').textContent=busy&&pending?'Working…':'Register confirmed config';const cl=$('clear');if(cl){cl.hidden=!pending;cl.disabled=busy;}}
 async function refresh(){try{const c=await solApi('config');ready=solTreasuryReady()&&c.ready;version=ready?Number(c.policyVersion||1):0;paintRules();$('config').textContent=ready?'Verified config v'+version+' · '+c.config+(upgrade()?' · v2 is ready to create: 15-second anti-snipe, first buy at the base fee. Coins on this config keep working.':''):'';if(ready){const list=await solApi('launches');$('coins').replaceChildren(...list.launches.map(l=>{const o=document.createElement('option');o.value=l.token;o.textContent=l.symbol+' · '+l.token;return o;}));}}catch(e){status(solLaunchError(e,'Could not complete this step. Please try again.'));}render();}
 async function register(){if(!treasuryGuard())return;status('Registering config v'+(pending.policy||1)+'… checking its transaction on chain.');await solApi('config',{config:pending.address,policy:pending.policy||1,...(pending.policy>1?{signature:pending.signature}:{})});try{localStorage.removeItem(pendingKey);}catch{}pending=null;status(version>=1?'Config v'+SOL_LAUNCH_POLICY_NEXT+' verified. New Solana launches use it; existing coins keep their config.':'Config verified. Solana launches are open.');await refresh();}
 $('create').onclick=async()=>{if(busy||!treasuryGuard())return;if(!solAddress()){status(solWallets().length?'Tap Connect Solana wallet first.':'No Solana wallet found. Use Open in Phantom or Open in Solflare.');return;}const want=target();if(want>1&&solAddress()!==C.treasury){status('Connect the treasury wallet '+TREASURY_SHORT+' to create config v'+want+'.');return;}busy=true;render();try{
  status('Building and simulating the fixed config…');const r=await solRuntime(),key=r.Keypair.generate(),payer=new r.PublicKey(solAddress());
  const tx=await r.client.partner.createConfig({...r.buildSolLaunchParameters(solPolicy(want)),config:key.publicKey,feeClaimer:new r.PublicKey(C.treasury),leftoverReceiver:new r.PublicKey(C.treasury),quoteMint:new r.PublicKey(C.quoteMint),payer});
  const prepared=await prepareSolTransaction(r,tx,[key]);status('Simulation passed. Approve the config transaction in your wallet.');const sent=await sendPreparedSol(r,prepared);
  pending={address:key.publicKey.toBase58(),signature:sent.signature,policy:want,at:Date.now(),lastValidBlockHeight:prepared.last?.lastValidBlockHeight};try{localStorage.setItem(pendingKey,JSON.stringify(pending));}catch{}status('Waiting for final confirmation…');await sent.confirm();await register();
 }catch(e){const msg=solLaunchError(e,'Could not complete setup. Please try again.');status(msg);if(pending){busy=false;try{const s=await checkPending();status(s==='landed'?msg+' The config is on chain: tap Register confirmed config.':s==='unknown'?msg+' Check again in a minute, or clear it to start over.':s==='failed'?'The config transaction failed on chain. Nothing was created. Create the config again.':NEVER_LANDED);}catch{}}}finally{busy=false;render();}};
 $('register').onclick=async()=>{if(busy)return;if(!pending){status('Nothing to register. Create the config first.');render();return;}if(!treasuryGuard())return;busy=true;render();try{await register();}catch(e){
  const code=e?.message||'';busy=false;
  if(code==='confirmation_pending'){let s='unknown';try{s=await checkPending();}catch{}status(s==='landed'?'The config is on chain but not final yet. Tap Register again in a minute.':s==='unknown'?'The config transaction is still confirming. Tap Register again in a minute.':s==='failed'?'The config transaction failed on chain. Nothing was created. Create the config again.':NEVER_LANDED);}
  else status(code==='config_already_set'?'This config level is already set. Nothing to register.':code==='config_creator_not_treasury'?'That config was not created by the treasury wallet. Clear it and create it again from '+TREASURY_SHORT+'.':code==='config_creation_not_found'?'That transaction did not create this config. Clear it and create the config again.':solLaunchError(e,'Could not register the config. Please try again.'));
  if(code==='config_already_set')dropPending();
 }finally{busy=false;render();}};
 if($('clear'))$('clear').onclick=()=>{if(busy)return;dropPending();status('Cleared the saved config transaction. You can create the config again.');render();};
 $('claim').onclick=async()=>{if(busy)return;if(!solTreasuryReady()){feeStatus(SOL_TREASURY_WAIT);return;}if(solAddress()!==C.treasury){feeStatus('Connect the treasury wallet '+TREASURY_SHORT+' to claim QHooks fees.');return;}busy=true;render();try{const signature=await claimSolFees($('coins').value,{partner:true,onStatus:feeStatus});feeStatus('QHooks fee claim confirmed · '+signature);}catch(e){feeStatus(solLaunchError(e,'Could not complete this step. Please try again.'));}finally{busy=false;render();}};
 $('graduate').onclick=async()=>{if(busy)return;busy=true;render();try{const signature=await migrateSolLaunch($('coins').value,feeStatus);feeStatus('Migration finalized · '+signature);}catch(e){feeStatus(solLaunchError(e,'Could not complete this step. Please try again.'));}finally{busy=false;render();}};
 if(!solTreasuryReady())status(SOL_TREASURY_WAIT);
 $('treasury').textContent=solTreasuryReady()?C.treasury:SOL_TREASURY_WAIT;
 $('coins').onchange=render;onSolChange(render);void refresh().then(reviewPending);
}
