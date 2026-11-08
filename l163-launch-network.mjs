// Inert navigation picker: no wallet, RPC, signing, switching, or crypto imports.
import {launchChain} from './chain-catalog.mjs';
const copy=Object.freeze({
 '8453':'Use USDC for launch liquidity and retain ETH separately for network gas.',
 '4663':'Use WETH for launch liquidity and retain ETH separately for network gas.',
 '1':'Use USDC for launch liquidity and retain ETH separately for network gas.',
 '42161':'Use USDC for launch liquidity and retain ETH separately for network gas.',
 '56':'Use WBNB for launch liquidity and retain BNB separately for network gas.',
 '5042':'Use USDC for launch liquidity. Arc uses USDC for network gas as well; quote and gas are distinct requirements.',
 '99801':'Use WHYPE for launch liquidity. Elysium uses HYPE for network gas.'
});
export function bindCompleteNetworkPicker({document:d=document,location=window.location,history=window.history}={}){
 const buttons=[...d.querySelectorAll('[data-chain]')],panel=d.getElementById('network-selection'),title=d.getElementById('network-title'),detail=d.getElementById('network-copy'),launch=d.getElementById('network-launch'),wallet=d.getElementById('network-wallet');
 function select(id,focus=false){const chain=launchChain(id);buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.chain===id)));title.textContent=chain.name;detail.textContent=copy[id];launch.href='/qtoken-studio?chain='+id;wallet.href='/qwallets?chain='+id;panel.hidden=false;if(focus)title.focus();}
 buttons.forEach(button=>button.addEventListener('click',()=>select(button.dataset.chain,true)));
 const params=new URLSearchParams(location.search);if(params.getAll('chain').length===1){try{select(params.get('chain'));}catch{/* Invalid links intentionally select nothing. */}}
 return Object.freeze({select});
}
if(typeof document!=='undefined')bindCompleteNetworkPicker();
