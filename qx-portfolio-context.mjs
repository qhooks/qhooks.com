// Reading holdings needs a verified wallet identity and DOM helpers, not the
// trading codec or signer. The existing hub remains the sole connected owner.
import {getWalletHub} from './wallet-hub.mjs';
import {shownKids} from './qx-shown.mjs';
import {readWalletPreference} from './wallet-preference.mjs';
export const h=(tag,attrs={},...kids)=>{const node=document.createElement(tag);for(const [key,value] of Object.entries(attrs||{})){if(value==null)continue;if(key==='class')node.className=value;else if(key.startsWith('on'))node.addEventListener(key.slice(2),value);else if(key in node)node[key]=value;else node.setAttribute(key,value);}node.append(...shownKids(kids));return node;};
export function connectedAddress(){let owner;try{owner=getWalletHub(window).snapshot()?.current?.owner;}catch{}return /^0x[0-9a-f]{40}$/i.test(owner||'')?owner.toLowerCase():null;}
// A remembered address is a display-only cache selection, never a connection.
export function savedPortfolioAddress({storage,target=globalThis.window}={}){try{storage??=target?.localStorage;return readWalletPreference(storage?.getItem('qhooks:wallet-connection:v1'))?.owner||null;}catch{return null;}}
export function onWalletChange(callback,{storage,target=globalThis.window,hub}={}){
 try{hub??=getWalletHub(target);}catch{return()=>{};}
 const owner=()=>{const value=hub.snapshot()?.current?.owner;return /^0x[\da-f]{40}$/i.test(value||'')?value.toLowerCase():null;};
 let prior=owner(),saved=savedPortfolioAddress({storage,target}),queued=false,disposed=false;
 const check=()=>{if(disposed)return;const next=owner(),remembered=savedPortfolioAddress({storage,target});if(next!==prior||remembered!==saved){prior=next;saved=remembered;callback(next);}};
 // A failed passive restore publishes its reset before removing the remembered
 // record. Recheck once after that same turn; no timer or identity polling.
 const changed=()=>{check();if(!queued){queued=true;queueMicrotask(()=>{queued=false;check();});}};
 const stop=hub.subscribe(changed),storageChanged=event=>{if(event.key===null||event.key==='qhooks:wallet-connection:v1')changed();};target?.addEventListener?.('storage',storageChanged);
 return()=>{disposed=true;stop();target?.removeEventListener?.('storage',storageChanged);};
}
