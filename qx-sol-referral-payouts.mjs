import {QHOOKS_SOL_TREASURY} from './qx-sol-treasury.mjs';
import {solAddress,onSolChange} from './qx-solana.mjs';
import {setupSolWallet} from './qx-sol-setup-wallet.mjs';
import {solReferralRuntime} from './qx-sol-referral-client.mjs';
import {sendReferralPayout} from './qx-sol-referral-payout-client.mjs';
import {requirePayoutWallet,requirePayoutReview,payoutAmount} from './qx-sol-referral-payout-core.mjs';
const $=id=>document.getElementById('qsp-'+id),symbol=m=>m==='So11111111111111111111111111111111111111112'?'SOL':'USDC';
const key='qhooks:sol-referral-payout:pending:v2';
if(new URLSearchParams(location.search).get('go')==='solana'){
 $('active').hidden=false;$('gate').hidden=true;$('treasury').textContent=QHOOKS_SOL_TREASURY;
 let busy=false,batch=null,pending=null;try{pending=JSON.parse(localStorage.getItem(key)||'null');}catch{}
 const status=t=>{$('status').textContent=t;},wallets=setupSolWallet($,status,()=>busy);
 function render(){wallets();$('refresh').disabled=busy||solAddress()!==QHOOKS_SOL_TREASURY;$('pay').disabled=busy||!!pending||!batch?.items?.length||batch.expired||batch.expiresAt<=Date.now()||solAddress()!==QHOOKS_SOL_TREASURY;$('record').hidden=!pending;$('record').disabled=busy;}
 async function api(path,body){const r=await fetch('/api/sol-referral-payouts/'+path,{cache:'no-store',...(body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})}),j=await r.json();$('fee-setup').hidden=j.error!=='referral_fee_accounts_not_ready';if(!r.ok)throw Error(j.error==='referral_fee_accounts_not_ready'?'Create the missing referral fee accounts before a payout.':j.error||'Payout request failed.');return j;}
 const line=(tag,t)=>{const e=document.createElement(tag);e.textContent=t;return e;};
 async function review(){requirePayoutWallet(solAddress());batch=await api('preview');const nodes=[];
  for(const i of batch.items){const row=document.createElement('article');row.append(line('h3',payoutAmount(i.amount,i.mint)+' '+symbol(i.mint)),line('p','Referrer: '+i.referrer),line('p','Destination: '+i.destination),line('p','Mint: '+i.mint));nodes.push(row);}
  for(const t of batch.totals)nodes.push(line('p','Total: '+payoutAmount(t.amount,t.mint)+' '+symbol(t.mint)));
  for(const a of batch.available)nodes.push(line('p','Jupiter account '+a.account+': '+payoutAmount(a.amount,a.mint)+' '+symbol(a.mint)+' held; '+payoutAmount(a.withdrawable,a.mint)+' '+symbol(a.mint)+' to treasury after Jupiter’s share.'));
  if(batch.items.length)nodes.push(line('p','ATA rent: '+payoutAmount(batch.rentLamports,'So11111111111111111111111111111111111111112')+' SOL. Network fee: '+payoutAmount(batch.networkLamports,'So11111111111111111111111111111111111111112')+' SOL. Transaction: '+batch.packetBytes+' / 1232 bytes.'),line('p','Preview fixed until '+new Date(batch.expiresAt).toLocaleTimeString()+'.'));
  else nodes.push(line('p','No referral rewards meet the minimum yet.'));
  $('preview').replaceChildren(...nodes);status(batch.expired?'This preview expired. If it was sent, use Check and record payout. The reserved batch needs reconciliation before another payout.':'Exact amounts ready to review.');render();
 }
 async function record(){if(!pending)return;const result=await api('record',pending);if(result.pending){status('Waiting for final confirmation. Tap Check and record payout again.');return;}pending=null;try{localStorage.removeItem(key);}catch{}batch=null;$('preview').replaceChildren();status('Referral rewards paid and recorded.');}
 async function run(fn){if(busy)return;busy=true;render();try{await fn();}catch(e){status(e.message||'Could not complete the payout. Retry.');}finally{busy=false;render();}}
 $('refresh').onclick=()=>void run(review);
 $('record').onclick=()=>void run(record);
 $('pay').onclick=()=>void run(async()=>{requirePayoutReview(batch,solAddress());const r=await solReferralRuntime();requirePayoutReview(batch,solAddress());const sent=await sendReferralPayout(batch,{runtime:r,onStatus:status});pending={signature:sent.signature,batchId:batch.batchId};try{localStorage.setItem(key,JSON.stringify(pending));}catch{}status('Waiting for final confirmation…');await sent.confirm();await record();});
 onSolChange(render);if(pending)status('A sent payout is waiting to be recorded. Tap Check and record payout.');render();
}
