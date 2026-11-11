import {solAddress,solWallets,connectSol} from './qx-solana.mjs';
import {QHOOKS_SOL_TREASURY} from './qx-sol-treasury.mjs';
import {solLaunchError} from './qx-sol-launch-errors.mjs';
// Shared wallet buttons and mobile browser links for the two one-time setup pages.
export function setupSolWallet($,status,isBusy){
 const here=encodeURIComponent(location.href),ref=encodeURIComponent(location.origin);
 $('phantom').href='https://phantom.app/ul/browse/'+here+'?ref='+ref;
 $('solflare').href='https://solflare.com/ul/v1/browse/'+here+'?ref='+ref;
 return function renderWallet(){
  const me=solAddress(),found=solWallets();
  $('wallet').textContent=me?'Connected · '+me+(me===QHOOKS_SOL_TREASURY?' (treasury)':''):'No Solana wallet connected.';
  $('open').hidden=!!me||found.length>0;
  $('wallets').replaceChildren(...(me?[]:found.map(w=>{const b=document.createElement('button');b.type='button';b.className='qxc-primary';b.textContent='Connect Solana wallet · '+w.name;b.disabled=isBusy();b.onclick=async()=>{try{await connectSol(w.name);}catch(e){status(solLaunchError(e,'Could not connect. Please try again.'));}};return b;})));
 };
}
