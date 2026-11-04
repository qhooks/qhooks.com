// Explicit public-only introduction. Never auto-fill a restored draft or touch authority.
import {readTokenBrief} from './l170-token-brief.mjs';
import {launchJourneyStatus} from './l164-journey-status.mjs';
export function bindTokenBrief({document:d=document,target=window,snapshot=()=>({}),blocked=false}={}){
 const panel=d.getElementById('q170-intro'),summary=d.getElementById('q170-intro-summary'),button=d.getElementById('q170-intro-apply'),status=d.getElementById('q170-intro-status'),chain=d.getElementById('ql-chain'),name=d.getElementById('ql-name'),symbol=d.getElementById('ql-symbol');
 if(!panel||!summary||!button||!status||!chain||!name||!symbol)throw Error('Missing token introduction controls');
 let brief=null,dead=false,lastHash=null;
 function refresh(){
  if(dead)return;const hash=target.location.hash||'';if(hash===lastHash)return;
  lastHash=hash;brief=null;panel.hidden=!hash.startsWith('#brief=');button.disabled=true;summary.textContent='';status.textContent='';
  if(panel.hidden)return;
  try{if(blocked)throw Error('Invalid launch route.');brief=readTokenBrief(hash,chain.value);summary.textContent=brief.name+' ('+brief.symbol+')';button.disabled=false;}
  catch{summary.textContent='This token introduction could not be read.';status.textContent='Return to the homepage and choose a supported chain. Your existing configuration is unchanged.';}
 }
 const apply=()=>{
  refresh();if(dead||!brief||blocked||button.disabled)return;
  const s=snapshot()||{},v=launchJourneyStatus(s);
  if(!v.canConfigure||s.connected||s.launch||s.wrap||chain.value!==brief.chainId||name.disabled||symbol.disabled){status.textContent='Keep your current launch unchanged. Apply new token details only before connecting or starting a launch, on the matching chain.';return;}
  name.value=brief.name;symbol.value=brief.symbol;
  for(const n of [name,symbol])n.dispatchEvent(new (target.Event||Event)('input',{bubbles:true}));
  status.textContent='Token details applied. Review supply, liquidity and pool rules below.';button.disabled=true;name.focus();
 };
 button.addEventListener('click',apply);
 function dispose(){if(dead)return;dead=true;button.removeEventListener('click',apply);target.removeEventListener('hashchange',refresh);target.removeEventListener('pagehide',dispose);}
 target.addEventListener('hashchange',refresh);target.addEventListener('pagehide',dispose);refresh();return Object.freeze({dispose});
}
