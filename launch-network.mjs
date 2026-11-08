// Chain selection only: no wallet discovery, RPC, signature or automatic switch.
import {launchChain} from './chain-catalog.mjs';
export function bindNetworkPicker({document,location,history}){
 const buttons=[...document.querySelectorAll('[data-chain]')],panel=document.getElementById('chain-selection'),title=document.getElementById('chain-selected-title'),description=document.getElementById('chain-selected-description'),link=document.getElementById('chain-core-link');
 function select(id,focus=false){
  const chain=launchChain(id);buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.chain===id)));
  title.textContent=chain.name;description.textContent=chain.coreHref?'You can deploy the verifier and empty native-ETH QPool core on Base. Token launching and account actions are separate integrations.':chain.name+' wallet, QPool, and token-launch integration is underway. No transactions are enabled for this route yet.';
  link.hidden=!chain.coreHref;if(chain.coreHref)link.setAttribute('href',chain.coreHref);else link.removeAttribute('href');
  panel.hidden=false;history.replaceState(null,'','/launch-network?chain='+id);if(focus)title.focus();
 }
 buttons.forEach(b=>b.addEventListener('click',()=>select(b.dataset.chain,true)));
 const params=new URLSearchParams(location.search);if(params.getAll('chain').length===1){try{select(params.get('chain'));}catch{/* Unknown chain never falls back to a different network. */}}
 return Object.freeze({select});
}
if(typeof document!=='undefined')bindNetworkPicker({document,location:window.location,history:window.history});
