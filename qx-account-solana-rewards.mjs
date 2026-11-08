// Persistent My QHooks Solana rewards, independent of the EVM account loader.
import {solAddress,solWallets,connectSol,disconnectSol,onSolChange} from './qx-solana.mjs';
import {renderSolanaRewards} from './qx-solana-rewards.mjs';

const controls=document.getElementById('qa-solana-connect');
const target=document.getElementById('qa-solana-panel');
const status=document.getElementById('qa-solana-status');
const el=(tag,text)=>{const node=document.createElement(tag);node.textContent=text;return node;};
const short=value=>value.slice(0,6)+'…'+value.slice(-4);
let pending=false;
async function run(action){
 if(pending)return;
 pending=true;status.textContent='';renderControls();
 try{await action();}catch(error){status.textContent=error.message||'The wallet did not connect. Try again.';}
 finally{pending=false;renderControls();}
}
function button(label,action){const node=el('button',label);node.type='button';node.className='qa-btn';node.disabled=pending;node.addEventListener('click',()=>void run(action));return node;}
function renderControls(){
 const wallet=solAddress();
 if(wallet){controls.replaceChildren(el('span','Receiving wallet: '+short(wallet)),button('Disconnect Solana',disconnectSol));return;}
 const wallets=solWallets();
 controls.replaceChildren(el('p',wallets.length?'Choose your Solana wallet.':'No Solana wallet found. Use Phantom, Solflare or Backpack in this browser.'),...wallets.map(wallet=>button('Connect '+wallet.name,()=>connectSol(wallet.name))));
}
function refresh(){renderControls();renderSolanaRewards(target,{buttonClass:'qa-btn'});}
if(controls&&target&&status){onSolChange(refresh);refresh();}
