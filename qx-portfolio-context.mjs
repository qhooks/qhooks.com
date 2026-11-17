// Reading holdings needs a verified wallet identity and DOM helpers, not the
// trading codec or signer. The existing hub remains the sole connected owner.
import {getWalletHub} from './wallet-hub.mjs';
import {shownKids} from './qx-shown.mjs';
export const h=(tag,attrs={},...kids)=>{const node=document.createElement(tag);for(const [key,value] of Object.entries(attrs||{})){if(value==null)continue;if(key==='class')node.className=value;else if(key.startsWith('on'))node.addEventListener(key.slice(2),value);else if(key in node)node[key]=value;else node.setAttribute(key,value);}node.append(...shownKids(kids));return node;};
export function connectedAddress(){let owner;try{owner=getWalletHub(window).snapshot()?.current?.owner;}catch{}return /^0x[0-9a-f]{40}$/i.test(owner||'')?owner.toLowerCase():null;}
export function onWalletChange(callback){let prior=connectedAddress();const changed=()=>{const next=connectedAddress();if(next!==prior){prior=next;callback(next);}};try{return getWalletHub(window).subscribe(changed);}catch{return()=>{};}}
