// Public metadata preview only; no wallet, persistent storage or transaction API.
import {normalizeTokenBrief,tokenBriefLink} from './l170-token-brief.mjs';
const chainNotes=Object.freeze({'8453':['Base','ETH'],'4663':['Robinhood Chain','ETH'],'1':['Ethereum','ETH'],'42161':['Arbitrum One','ETH'],'56':['BNB Chain','BNB'],'5042':['Arc','USDC']});
export function bindLaunchDesk({document:d=document,target=window}={}){
 const form=d.getElementById('q170-brief-form'),name=d.getElementById('q170-name'),symbol=d.getElementById('q170-symbol'),chain=d.getElementById('q170-chain'),note=d.getElementById('q170-chain-note'),status=d.getElementById('q170-brief-status');
 if(!form||!name||!symbol||!chain||!note||!status)throw Error('Missing launch desk controls');
 const links=[...d.querySelectorAll('[data-q170-studio]')];let dead=false;
 const values=()=>({chainId:chain.value,name:name.value,symbol:symbol.value});
 function sync(){
  const c=chainNotes[chain.value];note.textContent=c?'Launch on '+c[0]+' · Gas: '+c[1]+'.':'Choose a supported chain.';
  try{const href=tokenBriefLink(values());for(const link of links)link.setAttribute('href',href);status.textContent='';status.dataset.error='false';}
  catch{for(const link of links)link.removeAttribute('href');status.textContent='Enter a token name and a ticker of 1–10 letters or numbers.';status.dataset.error='true';}
 }
 const submit=event=>{event.preventDefault();if(dead)return;try{const brief=normalizeTokenBrief(values());target.location.assign(tokenBriefLink(brief));}catch(error){status.textContent=error.message||'Check your token details.';status.dataset.error='true';name.focus();}};
 const click=event=>{if(!event.currentTarget.getAttribute('href')){event.preventDefault();form.requestSubmit();}};
 for(const n of [name,symbol,chain])n.addEventListener('input',sync);chain.addEventListener('change',sync);form.addEventListener('submit',submit);for(const link of links)link.addEventListener('click',click);sync();
 function dispose(){if(dead)return;dead=true;for(const n of [name,symbol,chain])n.removeEventListener('input',sync);chain.removeEventListener('change',sync);form.removeEventListener('submit',submit);for(const link of links)link.removeEventListener('click',click);target.removeEventListener('pagehide',dispose);}
 target.addEventListener('pagehide',dispose);return Object.freeze({dispose});
}
