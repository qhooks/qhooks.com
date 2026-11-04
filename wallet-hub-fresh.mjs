import {createWalletSession} from '/full-launch/prototypes/qwallet/client/wallet-session.mjs';
import {discoverWallets} from './wallet-discovery.mjs';
import {readWalletPreference,walletPreferenceText} from './wallet-preference.mjs';
export const WALLET_PREFERENCE_KEY='qhooks:wallet-connection:v1';
const hubs=new WeakMap();

// The accepted session's connect guards are reused, but this facade CANNOT request
// wallet permission, signatures, transactions or a chain switch. Only reads pass.
export function passiveProvider(provider){
 return Object.freeze({
  request(args){if(!['eth_requestAccounts','eth_accounts','eth_chainId'].includes(args?.method))throw Error('Connection restore is read-only');return provider.request({method:args.method==='eth_requestAccounts'?'eth_accounts':args.method});},
  on:(event,fn)=>provider.on(event,fn),removeListener:(event,fn)=>provider.removeListener(event,fn)
 });
}
export function createWalletHub(target,{discover=discoverWallets}={}){
 let entries=[],current=null,session=null,busy=false,dead=false,epoch=0,automatic=false,timer=null,attempted=null,remembered=false,allowRestore=true;
 const watchers=new Set(),walletWatchers=new Set();let open=()=>{};
 const stored=()=>{try{return readWalletPreference(target.localStorage.getItem(WALLET_PREFERENCE_KEY));}catch{return null;}};
 const snapshot=()=>Object.freeze({current,busy,remembered,wallets:Object.freeze([...entries])});
 const publish=()=>{for(const fn of [...watchers])try{fn(snapshot());}catch{/* One view must not break invalidation. */}};
 function forget(){remembered=false;try{target.localStorage.removeItem(WALLET_PREFERENCE_KEY);if(target.localStorage.getItem(WALLET_PREFERENCE_KEY)!==null)target.localStorage.setItem(WALLET_PREFERENCE_KEY,'');return stored()===null;}catch{return false;}}
 function reset({forgetSelection=false}={}){epoch++;current=null;automatic=false;const old=session;session=null;busy=false;const forgotten=forgetSelection?forget():true;old?.dispose();publish();return forgotten;}
 function save(entry,c){
  remembered=false;if(!entry.rdns)return;
  try{const text=walletPreferenceText({rdns:entry.rdns,owner:c.owner,chainId:c.chainId});target.localStorage.setItem(WALLET_PREFERENCE_KEY,text);remembered=target.localStorage.getItem(WALLET_PREFERENCE_KEY)===text;}catch{/* Connecting remains usable without browser storage. */}
 }
 async function establish(entry,expected=null){
  if(dead||busy||!entries.includes(entry))throw Error('Wallet connection unavailable. Try again.');
  reset();busy=true;const revision=epoch;publish();let next,granted;
  try{
   // MetaMask emits accountsChanged while approving a NEW connection. Obtain that
   // explicit permission first, then start the normal fail-closed read-only session.
   // Restores skip this permission request entirely.
   if(!expected){
    const accounts=await entry.provider.request({method:'eth_requestAccounts'});
    if(!Array.isArray(accounts)||!accounts.length||accounts.length>100||accounts.some(a=>typeof a!=='string'||!/^0x[0-9a-f]{40}$/i.test(a)||/^0x0{40}$/i.test(a)))throw Error('Wallet did not authorize an account');
    granted=accounts[0].toLowerCase();
   }
   if(dead||revision!==epoch||!entries.includes(entry))throw Error('Wallet changed during connection');
   next=createWalletSession(passiveProvider(entry.provider),()=>{if(current&&session===next)reset({forgetSelection:true});});session=next;
   const c=await next.connect();
   if(dead||revision!==epoch||session!==next||!entries.includes(entry))throw Error('Wallet changed during connection');
   if(granted&&c.owner!==granted)throw Error('Authorized account changed. Reconnect your wallet.');
   if(expected&&(c.owner!==expected.owner||c.chainId!==expected.chainId||entries.filter(e=>e.rdns===expected.rdns).length!==1))throw Error('Saved wallet no longer matches');
   await next.refresh(c);
   if(dead||revision!==epoch||session!==next)throw Error('Wallet changed during connection');
   current=Object.freeze({entry,owner:c.owner,chainId:c.chainId});automatic=!!expected;save(entry,c);busy=false;publish();return current;
  }catch(error){if(revision===epoch){reset();if(expected)forget();}next?.dispose();throw error;}
 }
 async function restore(){
  if(dead||busy||current||!allowRestore)return;const preference=stored();if(!preference)return;
  const matches=entries.filter(e=>e.rdns===preference.rdns);if(matches.length!==1)return;
  const identity=JSON.stringify(preference);if(attempted===identity)return;attempted=identity;
  try{await establish(matches[0],preference);}catch{/* Remain disconnected; only an explicit click may request access. */}
 }
 const discovery=discover(target,found=>{
  entries=[...found];
  if(automatic&&current&&entries.filter(e=>e.rdns===current.entry.rdns).length!==1)reset({forgetSelection:true});
  for(const fn of [...walletWatchers])fn(Object.freeze([...entries]));publish();
  target.clearTimeout(timer);timer=target.setTimeout(()=>{void restore();},200);
 });
 function storageChanged(event){if(event.key!==WALLET_PREFERENCE_KEY&&event.key!==null)return;const p=stored();if(busy||current&&(!p||p.owner!==current.owner||p.chainId!==current.chainId||p.rdns!==current.entry.rdns))reset();}
 target.addEventListener('storage',storageChanged);
 function resumeView(){if(!current||!session)return;const selected=session,revision=epoch;void selected.refresh(selected.current).then(()=>{if(revision===epoch)publish();}).catch(()=>{if(session===selected)reset({forgetSelection:true});});}
 target.addEventListener('focus',resumeView);target.addEventListener('pageshow',resumeView);
 return Object.freeze({
  snapshot,preference:stored,restore,scan:()=>discovery.scan(),
  connect(uuid){const entry=entries.find(e=>e.uuid===uuid);if(!entry)return Promise.reject(Error('Select an installed EVM wallet'));allowRestore=true;forget();return establish(entry);},
  disconnect(){const rdns=current?.entry.rdns||stored()?.rdns;allowRestore=false;attempted=null;const result=reset({forgetSelection:true});if(rdns&&typeof target.CustomEvent==='function')target.dispatchEvent(new target.CustomEvent('qhooks:wallet-disconnected',{detail:{rdns}}));return result;},
  subscribe(fn){watchers.add(fn);fn(snapshot());return()=>watchers.delete(fn);},
  subscribeWallets(fn){walletWatchers.add(fn);fn(Object.freeze([...entries]));return()=>walletWatchers.delete(fn);},
  setOpen(fn){open=fn;},open(){open();},
  dispose(){if(dead)return;dead=true;reset();discovery.stop();target.clearTimeout(timer);target.removeEventListener('storage',storageChanged);target.removeEventListener('focus',resumeView);target.removeEventListener('pageshow',resumeView);watchers.clear();walletWatchers.clear();}
 });
}
export function getWalletHub(target){if(!hubs.has(target))hubs.set(target,createWalletHub(target));return hubs.get(target);}
export function discoverConnectedWallets(target,fn){const stop=getWalletHub(target).subscribeWallets(fn);return Object.freeze({stop});}

// Each workspace still owns its original session, chain guards, journals and keys.
// Site authorization only permits a fresh read-only connection into that workspace.
export function bindWalletWorkspace({target,connectButton,disconnectButton,providerSelect,chainId,selectChain,hasSession,busy,onConnect,onDisconnect,note,hub=getWalletHub(target)}){
 let dead=false,attempt=null,queued=false,opening=false,lastCurrent=null;
 function pump(){
  if(dead||queued||opening)return;queued=true;
  Promise.resolve().then(async()=>{
   queued=false;if(dead||opening||busy()||hasSession())return;
   const c=hub.snapshot().current;if(!c)return;
   const chain=chainId();if(!chain||chain!==c.chainId){if(chain)note('Wallet connected on chain '+c.chainId+'. Select the required network in your wallet.');return;}
   const identity=c.entry.provider;const key=c.owner+':'+c.chainId+':'+chain;
   if(attempt?.provider===identity&&attempt.key===key)return;attempt={provider:identity,key};opening=true;
   providerSelect.value=c.entry.uuid;
   try{await onConnect(c);}finally{opening=false;}
  }).catch(error=>{opening=false;note(error?.message||'Reconnect your wallet.',true);});
 }
 function render(){if(dead)return;const s=hub.snapshot();connectButton.disabled=busy()||s.busy||hasSession();disconnectButton.disabled=busy()||(!hasSession()&&!s.current);pump();}
 function update(s){if(dead)return;if(lastCurrent&&lastCurrent!==s.current&&hasSession())onDisconnect();lastCurrent=s.current;render();}
 async function connect(){
  if(dead||busy())return;const s=hub.snapshot();if(s.busy)return;
  const entry=s.wallets.find(e=>e.uuid===providerSelect.value);
  if(!entry){hub.open();note('No EVM wallet detected. Open qhooks.com in your wallet-enabled browser.');return;}
  try{attempt=null;await hub.connect(entry.uuid);}catch(error){note(error?.message||'Wallet connection was declined.',true);}render();
 }
 function disconnect(){if(dead||busy())return;const forgotten=hub.disconnect();if(hasSession())onDisconnect();attempt=null;render();if(!forgotten)note('Disconnected here. Browser storage is locked; clear site data to forget the saved selection permanently.',true);}
 const preference=hub.preference();if(preference)selectChain?.(preference.chainId);
 connectButton.addEventListener('click',connect);disconnectButton.addEventListener('click',disconnect);
 const unsubscribe=hub.subscribe(update);
 return Object.freeze({render,dispose(){dead=true;unsubscribe();connectButton.removeEventListener('click',connect);disconnectButton.removeEventListener('click',disconnect);}});
}

