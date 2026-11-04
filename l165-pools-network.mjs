// Inert six-chain routing only. No wallet, RPC, crypto, signing or liquidity actions.
import {launchChain} from './chain-catalog.mjs';

const custodyCopy=Object.freeze({
 '8453':'Protect Base native ETH and the ERC20 contracts admitted when you create the QWallet.',
 '4663':'Protect Robinhood Chain native ETH and the ERC20 contracts admitted when you create the QWallet.',
 '1':'Protect Ethereum native ETH and the ERC20 contracts admitted when you create the QWallet.',
 '42161':'Protect Arbitrum One native ETH and the ERC20 contracts admitted when you create the QWallet.',
 '56':'Protect BNB Chain native BNB and the ERC20 contracts admitted when you create the QWallet.',
 '5042':'Protect Arc native USDC and admitted ERC20 contracts. Use native USDC, not its ERC20 alias.'
});

export function bindPoolsNetwork({document:d=document,location=window.location}={}){
 const buttons=[...d.querySelectorAll('[data-pool-chain]')],selection=d.getElementById('pools-selection'),title=d.getElementById('pools-title'),copy=d.getElementById('pools-copy'),custody=d.getElementById('pools-custody'),launch=d.getElementById('pools-launch');
 function select(id,focus=false){
  const chain=launchChain(id);
  buttons.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.poolChain===id)));
  title.textContent=chain.name;copy.textContent=custodyCopy[id];
  custody.href='qwallets.html?chain='+id;launch.href='qtoken-studio.html?chain='+id;
  selection.hidden=false;if(focus)title.focus();
 }
 buttons.forEach(button=>button.addEventListener('click',()=>select(button.dataset.poolChain,true)));
 const params=new URLSearchParams(location.search);
 if(params.getAll('chain').length===1){try{select(params.get('chain'));}catch{/* Unknown links remain unselected. */}}
 return Object.freeze({select});
}

if(typeof document!=='undefined')bindPoolsNetwork();
