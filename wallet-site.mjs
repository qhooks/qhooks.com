import {getWalletHub} from './wallet-hub.mjs';
import {launchChains} from './chain-catalog.mjs';
export function bindSiteWallet({document:d=document,target=window,hub=getWalletHub(target)}={}){
 const $=id=>d.getElementById('qhc-'+id),trigger=$('trigger'),dialog=$('dialog');if(!trigger||!dialog)return;
 const label=id=>launchChains.find(c=>c.id===id)?.name||'Chain '+id;
 let dead=false;
 // Phones have no wallet extensions: offer to reopen this page inside a wallet app's own browser, where the wallet is detected.
 if(target.matchMedia?.('(pointer:coarse)').matches&&$('empty')&&!$('apps')){
  const here=target.location.href,enc=encodeURIComponent(here),apps=d.createElement('div');apps.id='qhc-apps';apps.className='qhc-apps';
  const title=d.createElement('p');title.textContent='Or open this page in your wallet app:';apps.append(title);
  for(const [name,url] of [['MetaMask','https://metamask.app.link/dapp/'+here.replace(/^https?:\/\//,'')],['Coinbase Wallet','https://go.cb-w.com/dapp?cb_url='+enc],['Trust Wallet','https://link.trustwallet.com/open_url?coin_id=60&url='+enc],['Phantom','https://phantom.app/ul/browse/'+enc+'?ref='+encodeURIComponent(target.location.origin)]]){
   const link=d.createElement('a');link.className='qhc-choice';link.href=url;link.rel='noopener';link.textContent=name;apps.append(link);
  }
  // The desktop hints (Chrome extension, in-app preview) don't apply on a phone.
  for(const p of [...$('empty').querySelectorAll(':scope>p')].slice(1))p.hidden=true;
  $('empty').append(apps);
 }
 function render(s){
  if(dead)return;const c=s.current;
  trigger.textContent=s.busy?'Connecting…':c?c.owner.slice(0,6)+'…'+c.owner.slice(-4):'Connect wallet';
  trigger.setAttribute('aria-label',c?'Wallet '+c.owner+' on '+label(c.chainId):'Connect wallet');
  trigger.disabled=false;$('account').hidden=!c;$('choices').hidden=!!c;
  $('address').textContent=c?.owner||'';$('chain').textContent=c?label(c.chainId):'';
  $('remembered').textContent=c?(s.remembered?'Connection remembered on this browser. Your wallet must stay unlocked and authorized.':'Connected for this page. This wallet or browser does not support remembering this selection.') :'';
  $('wallets').replaceChildren();
  for(const entry of s.wallets){const button=d.createElement('button');button.type='button';button.className='qhc-choice';button.textContent=entry.name;button.disabled=s.busy;button.addEventListener('click',async()=>{try{$('status').textContent='Confirm the connection in your wallet.';await hub.connect(entry.uuid);$('status').textContent='Connected. No signature or transaction was requested.';dialog.close();}catch(error){$('status').textContent=error?.message||'Connection was not approved. Try again.';}});$('wallets').append(button);}
  $('empty').hidden=s.wallets.length>0;$('rescan').disabled=s.busy;
 }
 function show(){hub.scan();$('status').textContent='';if(!dialog.open)dialog.showModal();}
 function close(){dialog.close();}
 function forget(){const cleared=hub.disconnect();$('status').textContent=cleared?'Disconnected. This site has forgotten your wallet selection. Public transaction progress is preserved.':'Disconnected here. Browser storage is locked; clear site data to forget the saved selection permanently.';}
 trigger.addEventListener('click',show);$('close').addEventListener('click',close);$('forget').addEventListener('click',forget);$('rescan').addEventListener('click',()=>{hub.scan();$('status').textContent='Wallet detection refreshed.';});
 hub.setOpen(show);const unsubscribe=hub.subscribe(render);
 // wallet-early.js opened the dialog for taps made before this module was ready; take over from here.
 target.__qhcReady=true;if(dialog.open)hub.scan();
 function dispose(){if(dead)return;dead=true;unsubscribe();hub.dispose();target.removeEventListener('pagehide',dispose);}
 target.addEventListener('pagehide',dispose);return Object.freeze({dispose});
}
if(typeof document!=='undefined')bindSiteWallet();
