import {solLaunchError} from './qx-sol-launch-errors.mjs';
import {SOL_LAUNCH_CONFIG as C} from './qx-sol-launch-config.mjs';
import {solReviewLines} from './qx-sol-launch-values.mjs';
import {solAddress,solWallets,connectSol,onSolChange} from './qx-solana.mjs';
import {solApi,solRuntime,prepareSolTransaction,sendPreparedSol,claimSolFees,migrateSolLaunch} from './qx-sol-launch-client.mjs';
const $=id=>document.getElementById('qss-'+id);
if(new URLSearchParams(location.search).get('go')==='solana'){
 $('active').hidden=false;$('gate').hidden=true;let ready=false,busy=false,pending=null;
 try{pending=JSON.parse(localStorage.getItem('qhooks:sol-config:pending')||'null');}catch{}
 const status=text=>{$('status').textContent=text;};
 const rules=document.createElement('dl');rules.className='qxc-sol-rules';for(const[k,v]of solReviewLines()){const a=document.createElement('dt'),b=document.createElement('dd');a.textContent=k;b.textContent=v;rules.append(a,b);}$('rules').append(rules);
 const TREASURY_SHORT='CEAC…3MfV';
 { const here=encodeURIComponent(location.href),ref=encodeURIComponent(location.origin);
   $('phantom').href='https://phantom.app/ul/browse/'+here+'?ref='+ref;$('solflare').href='https://solflare.com/ul/v1/browse/'+here+'?ref='+ref; }
 function render(){const me=solAddress(),found=solWallets();
  $('wallet').textContent=me?'Connected · '+me.slice(0,4)+'…'+me.slice(-4)+(me===C.treasury?' (treasury)':''):'No Solana wallet connected.';
  $('open').hidden=!!me||found.length>0;
  $('wallets').replaceChildren(...(me?[]:found.map(w=>{const b=document.createElement('button');b.type='button';b.className='qxc-primary';b.textContent='Connect Solana wallet · '+w.name;b.disabled=busy;b.onclick=async()=>{try{await connectSol(w.name);}catch(e){status(solLaunchError(e,'Could not connect. Please try again.'));}};return b;})));
  $('create').disabled=busy||ready||!!pending;$('create').hidden=ready;
  $('claim').disabled=busy||!ready||me!==C.treasury||!$('coins').value;
  if(ready&&me&&me!==C.treasury)$('claim').title='Connect the treasury wallet '+TREASURY_SHORT;
  $('graduate').disabled=busy||!ready||!me||!$('coins').value;$('register').hidden=!pending;$('register').disabled=busy;}
 async function refresh(){try{const c=await solApi('config');ready=c.ready;$('config').textContent=c.ready?'Verified config · '+c.config:'';if(ready){const list=await solApi('launches');$('coins').replaceChildren(...list.launches.map(l=>{const o=document.createElement('option');o.value=l.token;o.textContent=l.symbol+' · '+l.token;return o;}));}}catch(e){status(solLaunchError(e,'Could not complete this step. Please try again.'));}render();}
 async function register(){await solApi('config',{config:pending.address});try{localStorage.removeItem('qhooks:sol-config:pending');}catch{}pending=null;status('Config verified. Solana launches are open.');await refresh();}
 $('create').onclick=async()=>{if(busy)return;if(!solAddress()){status(solWallets().length?'Tap Connect Solana wallet first.':'No Solana wallet found. Use Open in Phantom or Open in Solflare.');return;}busy=true;render();try{
  status('Building and simulating the fixed config…');const r=await solRuntime(),key=r.Keypair.generate(),payer=new r.PublicKey(solAddress());
  const tx=await r.client.partner.createConfig({...r.buildSolLaunchParameters(),config:key.publicKey,feeClaimer:new r.PublicKey(C.treasury),leftoverReceiver:new r.PublicKey(C.treasury),quoteMint:new r.PublicKey(C.quoteMint),payer});
  const prepared=await prepareSolTransaction(r,tx,[key]);status('Simulation passed. Approve the config transaction in your wallet.');const sent=await sendPreparedSol(r,prepared);
  pending={address:key.publicKey.toBase58(),signature:sent.signature};try{localStorage.setItem('qhooks:sol-config:pending',JSON.stringify(pending));}catch{}status('Waiting for final confirmation…');await sent.confirm();await register();
 }catch(e){status(solLaunchError(e,'Could not complete setup. Please try again.')+(pending?' Register the confirmed config to retry.':''));}finally{busy=false;render();}};
 $('register').onclick=async()=>{if(!pending||busy)return;busy=true;render();try{await register();}catch(e){status(solLaunchError(e,'Could not complete this step. Please try again.'));}finally{busy=false;render();}};
 $('claim').onclick=async()=>{if(busy)return;if(solAddress()!==C.treasury){status('Connect the treasury wallet '+TREASURY_SHORT+' to claim QHooks fees.');return;}busy=true;render();try{const signature=await claimSolFees($('coins').value,{partner:true,onStatus:status});status('QHooks fee claim confirmed · '+signature);}catch(e){status(solLaunchError(e,'Could not complete this step. Please try again.'));}finally{busy=false;render();}};
 $('graduate').onclick=async()=>{if(busy)return;busy=true;render();try{const signature=await migrateSolLaunch($('coins').value,status);status('Migration finalized · '+signature);}catch(e){status(solLaunchError(e,'Could not complete this step. Please try again.'));}finally{busy=false;render();}};
 $('coins').onchange=render;onSolChange(render);void refresh();
}
