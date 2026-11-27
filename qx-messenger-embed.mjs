import {chainById} from './chains.mjs';
import {createMessenger,messageButton,enabled,verifiedTokenRecipient} from './qx-messenger-core.mjs';
import {resolveProfileAddress} from './qx-profile-address.mjs';
const script=document.querySelector('script[data-qmembed]');
if(script?.dataset.qmembed==='check'){try{const response=await fetch('/api/qmessenger-config',{credentials:'omit',cache:'no-store'}),config=response.ok?await response.json():null;script.dataset.qmembed=config?.enabled?'1':'0';if(config?.official)script.dataset.official=config.official;}catch{script.dataset.qmembed='0';}}
if(script&&enabled(script.dataset.qmembed)){
 let storage,session;try{storage=window.localStorage;}catch{}try{session=window.sessionStorage;}catch{}
 let count=0;
 const controller=createMessenger({location,history,storage,session,fetcher:fetch,visible:()=>document.visibilityState==='visible',onCount:value=>{count=value;for(const badge of document.querySelectorAll('[data-qm-unread]')){badge.textContent=value?String(value):'';badge.hidden=!value;}}});
 controller.acceptReturn();
 const add=(host,recipient='',label='Message')=>{
  if(/^0x[a-fA-F0-9]{40}$/.test(recipient))recipient='evm:'+recipient;
  if(!host||host.querySelector('[data-qm-message]'))return;
  const button=messageButton(document,{enabled:true,recipient,label,open:controller.open});host.append(button);
  if(label==='Messages'){const badge=document.createElement('span');badge.dataset.qmUnread='';badge.setAttribute('aria-label','Unread messages');badge.textContent=count?String(count):'';badge.hidden=!count;button.append(badge);}
 };
 let profilePending=false,profileAddress='',tokenAddress='',tokenRevision=0;
 async function refresh(){
  add(document.querySelector('.qwm-links'),'','Messages');
  // New app (qhooks.com main): hosts placed by the app shell; a recipient means a Message button for that wallet.
  for(const host of document.querySelectorAll('.q-msg-host')){const r=/^evm:0x[a-f0-9]{40}$/.test(host.dataset.qmRecipient||'')?host.dataset.qmRecipient:'';add(host,r,r?'Message':'Messages');}
  const profile=document.getElementById('qp-member-identity');
  if(profile&&!profilePending&&profileAddress!==location.href){profilePending=true;const current=location.href;try{const value=await resolveProfileAddress(location,{readWalletHandle:false});if(current===location.href&&value.wallet){profile.querySelector('[data-qm-message]')?.remove();add(profile,value.wallet);profileAddress=current;}}catch{}finally{profilePending=false;}}
  const agent=/^\/agents\/(0x[a-fA-F0-9]{40})\/?$/.exec(location.pathname);if(agent)add(document.querySelector('.ag-profile-hero'),'evm:'+agent[1]);
  if(script.dataset.official)add(document.querySelector('#contact'),script.dataset.official);
  const match=/^#(?:m|t)=(\d+|solana):([A-Za-z0-9]+)$/.exec(location.hash);
  const card=document.getElementById('qxt-token-profile');
  if(match&&card&&tokenAddress!==location.hash){tokenAddress=location.hash;const turn=++tokenRevision;card.querySelector('[data-qm-message]')?.remove();try{
   const response=await fetch('/api/token-profiles/'+match[1]+'/'+match[2],{credentials:'omit',cache:'no-store'}),body=response.ok?await response.json():null;
   // Verify the indexed creator or the listed controller getter; never use profile links/publisher.
   const recipient=await verifiedTokenRecipient(body,{chain:match[1],controller:match[2],rpc:chainById(match[1])?.rpc,fetcher:fetch});
   if(turn===tokenRevision&&document.getElementById('qxt-token-profile')===card&&location.hash===tokenAddress&&recipient)add(card,recipient);
  }catch{}}
 }
 let queued=false;const queue=()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;void refresh();});};
 new MutationObserver(queue).observe(document.body,{childList:true,subtree:true});
 addEventListener('hashchange',()=>{tokenAddress='';tokenRevision++;queue();});addEventListener('popstate',queue);document.addEventListener('visibilitychange',()=>void controller.poll());
 setInterval(()=>void controller.poll(),60000);void controller.poll();queue();
}
