import {createWalletSession} from './full-launch/prototypes/qwallet/client/wallet-session.mjs';
import {chainById} from './chains.mjs';
import {discoverWallets} from './wallet-discovery.mjs';
import {readWalletPreference,walletPreferenceText} from './wallet-preference.mjs';
export const WALLET_PREFERENCE_KEY='qhooks:wallet-connection:v1';
// The main app (new/app.*.js, wallet-connect.js) reads and writes this same key, so both halves of the site share one choice.
const ANNOUNCE_GRACE_MS=600,RESTORE_WINDOW_MS=1500;
const hubs=new WeakMap();

// The accepted session's connect guards are reused, but this facade CANNOT request
// wallet permission, signatures, transactions or a chain switch. Only reads pass.
export function passiveProvider(provider){
 return Object.freeze({
  request(args){if(!['eth_requestAccounts','eth_accounts','eth_chainId'].includes(args?.method))throw Error('Connection restore is read-only');return provider.request({method:args.method==='eth_requestAccounts'?'eth_accounts':args.method});},
  on:(event,fn)=>provider.on(event,fn),removeListener:(event,fn)=>provider.removeListener(event,fn)
 });
}
export function createWalletHub(target,{discover=discoverWallets,settle=()=>new Promise(resolve=>setTimeout(resolve,750))}={}){
 let entries=[],current=null,session=null,busy=false,dead=false,epoch=0,automatic=false,timer=null,attempted=null,remembered=false,allowRestore=true;
 let requestedSwitch=null;
 // Only chain events matching our own switch bypass the original session reset.
 // A short grace also covers Privy's same-chain provider re-issue after the switch.
 function sessionProvider(provider){
  const listeners=new Map();
  return {request:args=>passiveProvider(provider).request(args),on(event,fn){
   const wrapped=event==='chainChanged'?value=>{
    let id;try{id=BigInt(value).toString();}catch{}
    if(requestedSwitch?.provider===provider&&requestedSwitch.id===id&&Date.now()<requestedSwitch.until)return;
    fn(value);
   }:fn;
   if(!listeners.has(event))listeners.set(event,new Map());listeners.get(event).set(fn,wrapped);provider.on(event,wrapped);
  },removeListener(event,fn){provider.removeListener(event,listeners.get(event)?.get(fn)||fn);listeners.get(event)?.delete(fn);}};
 }
 const watchers=new Set(),walletWatchers=new Set();let open=()=>{};
 const stored=()=>{try{return readWalletPreference(target.localStorage.getItem(WALLET_PREFERENCE_KEY));}catch{return null;}};
 // walletpersist (2026-11-27). Desktop Phantom puts window.ethereum on the page at once but announces itself (EIP-6963)
 // only after DOMContentLoaded. The restore used to start on the flag-named window.ethereum entry, the announcement
 // replaced that entry mid-restore ("Wallet changed during connection") and the failed restore FORGOT the saved wallet,
 // so every later page (and the main app) showed it disconnected. Now: a flag-named entry waits briefly for the wallet's
 // own announcement; a failed restore keeps the choice and retries (only another account, or Disconnect, forgets);
 // a wallet that unlocks later rejoins on its accountsChanged; the header says "Connecting…" while a restore is due.
 const now=()=>{try{return target.performance?.now?.()??Date.now();}catch{return Date.now();}};
 let graceUntil=now()+ANNOUNCE_GRACE_MS,retries=0,waking=null,restoreTimer=null;
 try{const doc=target.document;if(doc?.readyState==='loading'){graceUntil=Infinity;doc.addEventListener('DOMContentLoaded',()=>{graceUntil=now()+ANNOUNCE_GRACE_MS;target.clearTimeout(restoreTimer);restoreTimer=target.setTimeout(publish,ANNOUNCE_GRACE_MS+RESTORE_WINDOW_MS);},{once:true});}}catch{/* No document: start the grace now. */}
 const graceLeft=()=>graceUntil===Infinity?ANNOUNCE_GRACE_MS:Math.max(0,graceUntil-now());
 const restoring=()=>!dead&&!current&&!busy&&allowRestore&&(graceUntil===Infinity||now()<graceUntil+RESTORE_WINDOW_MS)&&!!stored();
 const snapshot=()=>Object.freeze({current,busy,remembered,restoring:restoring(),wallets:Object.freeze([...entries])});
 const publish=()=>{for(const fn of [...watchers])try{fn(snapshot());}catch{/* One view must not break invalidation. */}};
 if(graceUntil!==Infinity)restoreTimer=target.setTimeout(publish,ANNOUNCE_GRACE_MS+RESTORE_WINDOW_MS); // "Connecting…" ends with the restore window
 function forget(){remembered=false;try{target.localStorage.removeItem(WALLET_PREFERENCE_KEY);if(target.localStorage.getItem(WALLET_PREFERENCE_KEY)!==null)target.localStorage.setItem(WALLET_PREFERENCE_KEY,'');return stored()===null;}catch{return false;}}
 function reset({forgetSelection=false}={}){epoch++;current=null;automatic=false;requestedSwitch=null;const old=session;session=null;busy=false;const forgotten=forgetSelection?forget():true;old?.dispose();publish();return forgotten;}
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
   next=createWalletSession(sessionProvider(entry.provider),()=>{if(current&&session===next)rejoin();});session=next;
   const c=await next.connect();
   if(dead||revision!==epoch||session!==next||!entries.includes(entry))throw Error('Wallet changed during connection');
   if(granted&&c.owner!==granted)throw Error('Authorized account changed. Reconnect your wallet.');
   if(expected&&c.owner!==expected.owner)throw Object.assign(Error('Saved wallet no longer matches'),{mismatch:true});
   if(expected&&entries.filter(e=>e.rdns===expected.rdns).length!==1)throw Error('Saved wallet no longer matches');
   await next.refresh(c);
   if(dead||revision!==epoch||session!==next)throw Error('Wallet changed during connection');
   current=Object.freeze({entry,owner:c.owner,chainId:c.chainId});automatic=!!expected;save(entry,c);busy=false;publish();return current;
  }catch(error){if(revision===epoch){reset();if(expected&&error?.mismatch)forget();}next?.dispose();throw error;}
 }
 // Network changes, a wallet's own events and phone browsers resuming a tab used to forget the remembered wallet, so the
 // next page (each bottom tab is its own page) showed the trader disconnected (trader report 2026-11-24, Phantom on a
 // phone). Now the live session still ends at once (fail-closed), the remembered choice stays, and a read-only restore
 // (eth_accounts, never a popup) rejoins when the wallet still shares the same account. If it shares another account the
 // restore fails and forgets the choice; if it shares none (locked, not ready) the choice stays (walletpersist, above).
 // An explicit Disconnect still forgets at once.
 function rejoin(){reset();attempted=null;retries=0;target.clearTimeout(timer);timer=target.setTimeout(()=>{void restore();},300);}
 async function restore(){
  if(dead||busy||current||!allowRestore)return;const preference=stored();if(!preference)return;
  const matches=entries.filter(e=>e.rdns===preference.rdns);if(matches.length!==1)return;const entry=matches[0];
  // A flag-named window.ethereum entry: give the wallet's own EIP-6963 announcement a moment to arrive first.
  if(entry.inferred&&graceLeft()>0){target.clearTimeout(timer);timer=target.setTimeout(()=>{void restore();},graceLeft()+20);return;}
  const identity=JSON.stringify(preference)+'|'+entry.uuid;if(attempted===identity)return;attempted=identity;
  try{await establish(entry,preference);retries=0;unwake();}
  catch(error){
   // Remain disconnected; only an explicit click may request access. Keep the choice unless another account answered.
   if(error?.mismatch||dead||current||!allowRestore||!stored())return;
   wake(entry);
   // A wallet event mid-handshake (state sync on load) fails the first try: retry almost at once, then once more later.
   if(retries<2){retries++;target.clearTimeout(timer);timer=target.setTimeout(()=>{if(attempted===identity)attempted=null;void restore();},retries===1?150:900);}
   else publish();
  }
 }
 // A locked wallet shares its account again when it unlocks: rejoin then (read-only), without waiting for the next page.
 function wake(entry){
  if(waking?.entry===entry)return;unwake();
  const fn=accounts=>{if(Array.isArray(accounts)&&accounts.length&&!current&&!busy&&!dead&&allowRestore){unwake();attempted=null;retries=0;void restore();}};
  try{entry.provider.on('accountsChanged',fn);waking={entry,fn};}catch{/* The wallet may not emit events. */}
 }
 function unwake(){if(!waking)return;try{waking.entry.provider.removeListener('accountsChanged',waking.fn);}catch{/* Already gone. */}waking=null;}
 const discovery=discover(target,found=>{
  entries=[...found];
  if(automatic&&current&&entries.filter(e=>e.rdns===current.entry.rdns).length!==1)reset({forgetSelection:true});
  // The wallet's own announcement replaced the flag-named entry this connection runs on: rejoin on the announced one.
  else if(current&&!busy&&!entries.includes(current.entry)&&current.entry.rdns&&entries.filter(e=>e.rdns===current.entry.rdns).length===1)rejoin();
  for(const fn of [...walletWatchers])fn(Object.freeze([...entries]));publish();
  target.clearTimeout(timer);timer=target.setTimeout(()=>{void restore();},200);
 });
 // Another tab changed the remembered wallet (the main app writes this key too since walletpersist): end this session at
 // once as before, then restore the new choice read-only (nothing to restore after a Disconnect there).
 function storageChanged(event){if(event.key!==WALLET_PREFERENCE_KEY&&event.key!==null)return;const p=stored();if(busy||current&&(!p||p.owner!==current.owner||p.chainId!==current.chainId||p.rdns!==current.entry.rdns))rejoin();else if(!current&&p)void restore();}
 target.addEventListener('storage',storageChanged);
 function resumeView(){if(busy||!current||!session)return;const selected=session,revision=epoch;void selected.refresh(selected.current).then(()=>{if(revision===epoch)publish();}).catch(()=>{if(session===selected)rejoin();});}
 target.addEventListener('focus',resumeView);target.addEventListener('pageshow',resumeView);
 async function switchChain(chainId){
  const chain=chainById(chainId),before=current;
  if(!chain)throw Error('Choose a supported launch network.');
  if(dead||busy||!before)throw Error('Connect your wallet before switching networks.');
  if(before.chainId===chain.id)return before;
  const revision=epoch,p=before.entry.provider;
  requestedSwitch={provider:p,id:chain.id,until:Date.now()+120000};busy=true;publish();
  if(typeof target.CustomEvent==='function')target.dispatchEvent(new target.CustomEvent('qhooks:chain-switch',{detail:{chainId:chain.id}}));
  let next;
  try{
   try{await p.request({method:'wallet_switchEthereumChain',params:[{chainId:chain.hex}]});}
   // MetaMask Mobile and WalletConnect peers answer an unknown chain with -32603 / "Unrecognized chain ID", not 4902 (Monad, 2026-11-11).
   catch(e){if(Number(e?.code)!==4902&&!/unrecognized|not added|unknown chain|not been added|no chain with/i.test(e?.message||''))throw e;
    await p.request({method:'wallet_addEthereumChain',params:[{chainId:chain.hex,chainName:chain.name,nativeCurrency:{name:chain.native,symbol:chain.native,decimals:18},rpcUrls:[chain.rpc],...(chain.explorer?{blockExplorerUrls:[chain.explorer]}:{})}]});
    await p.request({method:'wallet_switchEthereumChain',params:[{chainId:chain.hex}]});
   }
   // Embedded SDKs re-issue their handle after returning from the switch. Let
   // that handoff finish before any workspace opens its own guarded session.
   await settle();
   if(dead||epoch!==revision||current!==before)throw Error('Wallet changed. Connect it again.');
   next=createWalletSession(sessionProvider(p),()=>{if(current&&session===next)rejoin();});
   const c=await next.connect();await next.refresh(c);
   if(dead||epoch!==revision||current!==before||c.owner!==before.owner||c.chainId!==chain.id)throw Error('Your wallet is still on the wrong network. Try switching again.');
   const old=session;session=next;old?.dispose();
   current=Object.freeze({...before,chainId:c.chainId});save(before.entry,c);
   requestedSwitch.until=Date.now()+2000;return current;
  }catch(e){next?.dispose();
   // A declined switch must retain the connection. Any actual unexpected network
   // change remains subject to the original reset behaviour.
   if(epoch===revision&&Number(e?.code)===4001){requestedSwitch=null;throw Object.assign(Error('Network switch was cancelled in your wallet. Try again when ready.'),{code:4001});}
   if(epoch===revision&&current===before){try{await session?.refresh(session.current);}catch{/* refresh resets stale connections */}}
   throw e;
  }finally{if(epoch===revision){busy=false;if(requestedSwitch)requestedSwitch.until=Math.min(requestedSwitch.until,Date.now()+2000);publish();}}
 }
 return Object.freeze({
  snapshot,preference:stored,restore,switchChain,scan:()=>discovery.scan(),
  connect(uuid){const entry=entries.find(e=>e.uuid===uuid);if(!entry)return Promise.reject(Error('Select an installed EVM wallet'));allowRestore=true;forget();return establish(entry);},
  disconnect(){const rdns=current?.entry.rdns||stored()?.rdns;allowRestore=false;attempted=null;const result=reset({forgetSelection:true});if(rdns&&typeof target.CustomEvent==='function')target.dispatchEvent(new target.CustomEvent('qhooks:wallet-disconnected',{detail:{rdns}}));return result;},
  subscribe(fn){watchers.add(fn);fn(snapshot());return()=>watchers.delete(fn);},
  subscribeWallets(fn){walletWatchers.add(fn);fn(Object.freeze([...entries]));return()=>walletWatchers.delete(fn);},
  setOpen(fn){open=fn;},open(){open();},
  dispose(){if(dead)return;dead=true;reset();unwake();discovery.stop();target.clearTimeout(timer);target.clearTimeout(restoreTimer);target.removeEventListener('storage',storageChanged);target.removeEventListener('focus',resumeView);target.removeEventListener('pageshow',resumeView);watchers.clear();walletWatchers.clear();}
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
   let c=hub.snapshot().current;if(!c||hub.snapshot().busy)return;
   const chain=chainId();if(!chain)return;
   if(chain!==c.chainId){opening=true;try{note('Switching your wallet to the launch network…');c=await hub.switchChain(chain);}finally{opening=false;}}
   const identity=c.entry.provider;const key=c.owner+':'+c.chainId+':'+chain;
   if(attempt?.provider===identity&&attempt.key===key)return;attempt={provider:identity,key};opening=true;
   providerSelect.value=c.entry.uuid;
   try{await onConnect(c);}finally{opening=false;}
  }).catch(error=>{opening=false;note(error?.message||'Reconnect your wallet.',true);});
 }
 function render(){if(dead)return;const s=hub.snapshot();connectButton.disabled=busy()||s.busy||hasSession();disconnectButton.disabled=busy()||(!hasSession()&&!s.current);pump();}
 // walletpersist (WATT, 2026-11-27): every new hub connection (page-load restore, a rejoin after a wallet event, a reconnect
 // from the header) gets one automatic join. The attempt key (provider + owner + chain) used to stay set after the first
 // join, so once a wallet event ended the workspace session the rejoined wallet never joined again: the header showed it
 // connected while the key backup controls (create, restore, passphrase, file) stayed disabled until the page's own
 // Connect wallet button was used.
 function update(s){if(dead)return;if(lastCurrent&&lastCurrent!==s.current&&hasSession())onDisconnect();if(s.current&&s.current!==lastCurrent)attempt=null;lastCurrent=s.current;render();}
 async function connect(){
  if(dead||busy())return;const s=hub.snapshot();if(s.busy)return;
  const entry=s.wallets.find(e=>e.uuid===providerSelect.value);
  if(!entry){hub.open();note('No EVM wallet detected. Open qhooks.com in your wallet-enabled browser.');return;}
  try{attempt=null;await hub.connect(entry.uuid);}catch(error){note(error?.message||'Wallet connection was declined.',true);}render();
 }
 function disconnect(){if(dead||busy())return;const forgotten=hub.disconnect();if(hasSession())onDisconnect();attempt=null;render();if(!forgotten)note('Disconnected here. Browser storage is locked; clear site data to forget the saved selection permanently.',true);}
 const preference=hub.preference();if(preference&&!new URLSearchParams(target.location?.search||'').has('chain'))selectChain?.(preference.chainId);
 connectButton.addEventListener('click',connect);disconnectButton.addEventListener('click',disconnect);
 const unsubscribe=hub.subscribe(update);
 return Object.freeze({render,dispose(){dead=true;unsubscribe();connectButton.removeEventListener('click',connect);disconnectButton.removeEventListener('click',disconnect);}});
}

