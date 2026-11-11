import {solLaunchError} from './qx-sol-launch-errors.mjs';
import {solAddress,solWallets,connectSol,onSolChange} from './qx-solana.mjs';
import {solApi,claimSolFees} from './qx-sol-launch-client.mjs';
const target=document.getElementById('qa-sol-launch-fees');
if(target){let revision=0;const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');const controls=document.createElement('div'),list=document.createElement('div');target.append(controls,list,status);
 async function refresh(){const mine=++revision,owner=solAddress();controls.replaceChildren();for(const w of solWallets()){const b=document.createElement('button');b.type='button';b.textContent=(owner?'Use ':'Connect ')+w.name;b.onclick=()=>connectSol(w.name).catch(e=>status.textContent=solLaunchError(e,'Could not load or claim your fees. Please try again.'));controls.append(b);}list.replaceChildren();if(!owner){status.textContent='Connect your Solana wallet to view your coins and claim creator trading fees.';return;}
 try{const data=await solApi('launches?creator='+encodeURIComponent(owner));if(mine!==revision)return;status.textContent=data.launches.length?'':'No QHooks Solana launches for this wallet.';for(const l of data.launches){const row=document.createElement('p'),a=document.createElement('a'),b=document.createElement('button');a.href='/terminal#t=solana:'+l.token;a.textContent=l.name+' · '+l.symbol;b.type='button';b.textContent='Claim creator trading fees';b.onclick=async()=>{b.disabled=true;try{const sig=await claimSolFees(l.token,{onStatus:text=>status.textContent=text});status.textContent='Fee claim confirmed · '+sig;}catch(e){status.textContent=solLaunchError(e,'Could not load or claim your fees. Please try again.');}finally{b.disabled=false;}};row.append(a,' ',b);list.append(row);}}
 catch(e){status.textContent=solLaunchError(e,'Could not load or claim your fees. Please try again.');}}
 onSolChange(()=>void refresh());void refresh();
}
