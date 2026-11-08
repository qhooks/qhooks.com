// A revocable, stable EIP-1193 view. No secrets or authentication tokens cross it.
export const EMBEDDED_RDNS='io.qhooks.privy';
export const EMBEDDED_UUID='a5a1c026-7eb1-4317-89a9-340dca71c881';
const ACTIONS=new Set(['eth_sendTransaction','eth_signTypedData_v4','personal_sign','wallet_switchEthereumChain','wallet_addEthereumChain']);
// The SDK's own RPC can answer quantities as numbers or as padded/uppercase hex; the launch code requires canonical
// lowercase quantities. Only these numeric reads (and numeric block fields) are rewritten, value-preserving.
const QUANTITY_READS=new Set(['eth_chainId','eth_blockNumber','eth_gasPrice','eth_maxPriorityFeePerGas','eth_getTransactionCount','eth_estimateGas','eth_getBalance']);
const BLOCK_FIELDS=['number','baseFeePerGas','gasLimit','gasUsed','timestamp','size','difficulty','totalDifficulty','l1BlockNumber'];
export function canonicalQuantity(v){
 if(typeof v==='bigint'&&v>=0n)return '0x'+v.toString(16);
 if(typeof v==='number'&&Number.isSafeInteger(v)&&v>=0)return '0x'+v.toString(16);
 if(typeof v==='string'&&/^0[xX][0-9a-fA-F]{1,64}$/.test(v))return '0x'+BigInt('0x'+v.slice(2)).toString(16);
 return v;
}
export function canonicalRead(method,result){
 if(QUANTITY_READS.has(method))return canonicalQuantity(result);
 if((method==='eth_getBlockByNumber'||method==='eth_getBlockByHash')&&result&&typeof result==='object'&&!Array.isArray(result)){const out={...result};for(const k of BLOCK_FIELDS)if(Object.hasOwn(out,k))out[k]=canonicalQuantity(out[k]);return out;}
 return result;
}
export const PHONE_UUID='5d0c7e7a-2f49-4c1e-9a7e-6a1f00c0a1b2';
export const PHONE_RDNS='io.qhooks.walletconnect';
/// `identity` lets a second view carry another SDK-held wallet (the WalletConnect phone wallet).
export function embeddedWalletProvider(target,identity={uuid:EMBEDDED_UUID,name:'QHooks · Email / Google',rdns:EMBEDDED_RDNS}){
 let current=null,revision=0,session=0,disposed=false;const listeners=new Map(),relays=new Map();
 const error=()=>Object.assign(new Error('Sign in to your QHooks wallet again.'),{code:4900});
 const emit=(event,value)=>{for(const fn of [...(listeners.get(event)||[])])try{fn(value);}catch{/* One view cannot prevent invalidation of other views. */}};
 const provider=Object.freeze({
  async request(args){if(disposed||!current)throw error();const captured=current,version=revision,signedIn=session,result=await captured.request(args);
   // A signature or transaction the wallet already approved stands while the same sign-in lasts, even if the SDK
   // re-issued its provider for a network change meanwhile; reporting it as failed would invite a second send.
   if(disposed||signedIn!==session||!ACTIONS.has(args?.method)&&(current!==captured||version!==revision))throw error();return canonicalRead(args?.method,result);},
  on(event,fn){if(typeof fn!=='function')throw TypeError('Listener required');if(!listeners.has(event))listeners.set(event,new Set());listeners.get(event).add(fn);return provider;},
  removeListener(event,fn){listeners.get(event)?.delete(fn);return provider;}
 });
 function announce(){if(disposed||!current)return;target.dispatchEvent(new target.CustomEvent('eip6963:announceProvider',{detail:Object.freeze({info:Object.freeze({uuid:identity.uuid,name:identity.name,rdns:identity.rdns,icon:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E'}),provider})}));}
 function revoke(){revision++;session++;const old=current;current=null;if(old)for(const[e,fn]of relays)old.removeListener(e,fn);relays.clear();emit('accountsChanged',[]);emit('disconnect',{code:4900,message:'QHooks sign-in ended'});}
 function bind(next){
 for(const event of ['accountsChanged','chainChanged','disconnect']){const fn=value=>{if(current!==next)return;if(event==='disconnect'||event==='accountsChanged'&&Array.isArray(value)&&!value.length){revoke();return;}revision++;emit(event,value);};relays.set(event,fn);next.on(event,fn);}}
 /// Same sign-in, new SDK handle (the SDK re-issues its provider when the wallet's network changes): rebinds without
 /// ending the session, so the page stays connected. Reads in flight are still invalidated; approved actions are not.
 function swap(next,chainId){
  if(disposed)throw error();if(!current)return set(next);if(next===current)return;
  if(!['request','on','removeListener'].every(k=>typeof next?.[k]==='function'))throw TypeError('Embedded EVM provider required');
  for(const[e,fn]of relays)current.removeListener(e,fn);relays.clear();current=next;revision++;bind(next);
  if(chainId)emit('chainChanged','0x'+Number(chainId).toString(16));
 }
 function set(next){
  if(disposed)throw error();if(next===current)return;
  if(next&& !['request','on','removeListener'].every(k=>typeof next[k]==='function'))throw TypeError('Embedded EVM provider required');
  revoke();if(!next)return;current=next;
  bind(next);announce();
 }
 target.addEventListener('eip6963:requestProvider',announce);
 return Object.freeze({provider,set,swap,announce,revoke,dispose(){if(disposed)return;revoke();disposed=true;target.removeEventListener('eip6963:requestProvider',announce);listeners.clear();}});
}
