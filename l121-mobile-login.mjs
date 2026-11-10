import {getWalletHub} from './wallet-hub.mjs';
import {networkProfiles as allProfiles,networkProfile} from '/full-launch/packages/multichain/profiles.mjs';
import {visibleChains} from './chains.mjs';
// Phone-wallet networks: only visible chains (Elysium Testnet and other test rows stay off public lists), 2026-11-09.
const shown=new Set(visibleChains().map(c=>c.id)),networkProfiles=allProfiles.filter(p=>shown.has(String(p.id)));
import {mobileStatus} from './l121-mobile-status.mjs';
import {mobileWalletProvider,MOBILE_RDNS,MOBILE_UUID} from './l121-mobile-provider.mjs';

export function bindMetaMaskMobile({document:d=document,target=window,hub=getWalletHub(target),load=()=>import('/metamask/entry.js')}={}){
 const $=id=>d.getElementById('qhc-'+id),button=$('mobile-login');if(!button)return;
 const bridge=mobileWalletProvider(target);let client=null,loading=null,dead=false,phase='idle',epoch=0,working=false,wasCurrent=false;
 const show=()=>{if(!dead&&!$('dialog').open)$('dialog').showModal();};
 function render(next=phase){
  if(dead)return;phase=next;const s=mobileStatus(phase),current=hub.snapshot().current?.entry.rdns===MOBILE_RDNS;
  button.textContent=s.label;button.disabled=s.busy;$('mobile-status').textContent=s.note;$('mobile-chain').disabled=s.busy;
  $('mobile-disconnect').hidden=!client;$('mobile-disconnect').disabled=phase==='disconnecting';
 }
 async function initialize(){
  if(client)return client;if(loading)return loading;
  loading=(async()=>{const {createMobileClient}=await load();if(dead)throw Error('Page closed');const next=await createMobileClient();if(dead)throw Error('Page closed');
   if(!next||!['connect','disconnect','getProvider','switchChain'].every(k=>typeof next[k]==='function'))throw TypeError('Mobile client unavailable');
   client=next;return client;
  })().finally(()=>{loading=null;});return loading;
 }
 async function connect(){
  if(dead||working)return;working=true;const version=++epoch;
  try{
   const selected=networkProfile($('mobile-chain').value);render('loading');const sdk=await initialize();if(dead||version!==epoch)return;
   // Close the native top-layer dialog so the SDK's pairing modal can receive taps.
   $('dialog').close();render('pairing');
   const ordered=[selected.hexId,...networkProfiles.filter(p=>p.id!==selected.id).map(p=>p.hexId)];
   await sdk.connect({chainIds:ordered});if(dead||version!==epoch)return;
   bridge.set(sdk.getProvider());bridge.announce();await hub.connect(MOBILE_UUID);
   if(dead||version!==epoch)return;
   const current=hub.snapshot().current;
   if(current?.entry.rdns!==MOBILE_RDNS||current.chainId!==selected.id){if(current?.entry.rdns===MOBILE_RDNS)hub.disconnect();throw Error('Selected network changed');}
   render('connected');$('dialog').close();
  }catch{if(!dead&&version===epoch){render('error');show();}}
  finally{if(version===epoch)working=false;}
 }
 async function disconnect(){
  if(dead||phase==='disconnecting')return;epoch++;working=false;render('disconnecting');bridge.revoke();if(hub.snapshot().current?.entry.rdns===MOBILE_RDNS||hub.preference()?.rdns===MOBILE_RDNS)hub.disconnect();
  try{await client?.disconnect();client=null;if(!dead)render('idle');}catch{if(!dead)render('error');}
 }
 button.addEventListener('click',connect);$('mobile-disconnect').addEventListener('click',disconnect);
 for(const p of networkProfiles){const o=d.createElement('option');o.value=p.id;o.textContent=p.name+' · '+p.nativeSymbol;$('mobile-chain').append(o);}
 const preference=hub.preference(),wanted=preference?.rdns===MOBILE_RDNS?preference.chainId:new URLSearchParams(target.location.search).get('chain')||'8453';
 $('mobile-chain').value=networkProfiles.some(p=>p.id===wanted)?wanted:'8453';
 const unsubscribe=hub.subscribe(s=>{
  const current=s.current?.entry.rdns===MOBILE_RDNS;
  if(current){wasCurrent=true;$('mobile-chain').value=s.current.chainId;if(!working)render('connected');}
  else if(wasCurrent){wasCurrent=false;if(!working)render('idle');}
 });
 // The public preference is not authority. The hub compares restored account/chain.
 if(preference?.rdns===MOBILE_RDNS){const version=epoch;void initialize().then(sdk=>{if(dead||version!==epoch)return;bridge.set(sdk.getProvider());return hub.restore();}).catch(()=>{if(!dead&&version===epoch)render('error');});}
 const forgotten=e=>{if(e.detail?.rdns===MOBILE_RDNS)void disconnect();};target.addEventListener('qhooks:wallet-disconnected',forgotten);
 render();
 function dispose(){if(dead)return;dead=true;epoch++;working=false;unsubscribe();bridge.dispose();button.removeEventListener('click',connect);$('mobile-disconnect').removeEventListener('click',disconnect);target.removeEventListener('qhooks:wallet-disconnected',forgotten);target.removeEventListener('pagehide',dispose);}
 target.addEventListener('pagehide',dispose);return Object.freeze({dispose,disconnect});
}
if(typeof document!=='undefined')bindMetaMaskMobile();
