// Revocable view of the already-paired SDK provider. Identity is a display hint.
// Only the explicit mobile button calls SDK.connect; discovery/restore never do.
export const MOBILE_RDNS='io.qhooks.metamask-mobile';
export const MOBILE_UUID='47e2b32a-55dc-49ca-92f9-6a8da648349c';
export function mobileWalletProvider(target){
 let current=null,revision=0,dead=false;const listeners=new Map(),relays=new Map();
 const disconnected=()=>Object.assign(Error('Connect MetaMask Mobile again.'),{code:4900});
 const emit=(event,value)=>{for(const fn of [...(listeners.get(event)||[])])try{fn(value);}catch{/* All views must receive invalidation. */}};
 const provider=Object.freeze({
  async request(args){
   if(dead||!current)throw disconnected();
   if(!args||typeof args.method!=='string')throw TypeError('Wallet request required');
   const source=current,version=revision;
   const request=args.method==='eth_requestAccounts'?{method:'eth_accounts'}:args;
   const result=await source.request(request);
   if(dead||current!==source||version!==revision)throw disconnected();return result;
  },
  on(event,fn){if(typeof fn!=='function')throw TypeError('Listener required');if(!listeners.has(event))listeners.set(event,new Set());listeners.get(event).add(fn);return provider;},
  removeListener(event,fn){listeners.get(event)?.delete(fn);return provider;}
 });
 function announce(){if(dead||!current)return;target.dispatchEvent(new target.CustomEvent('eip6963:announceProvider',{detail:Object.freeze({info:Object.freeze({uuid:MOBILE_UUID,name:'MetaMask Mobile',rdns:MOBILE_RDNS,icon:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E'}),provider})}));}
 function revoke(){revision++;const old=current;current=null;if(old)for(const[e,fn]of relays)old.removeListener(e,fn);relays.clear();emit('accountsChanged',[]);emit('disconnect',{code:4900,message:'Mobile connection ended'});}
 function set(next){
  if(dead)throw disconnected();if(next===current)return;
  if(next&&!['request','on','removeListener'].every(k=>typeof next[k]==='function'))throw TypeError('EIP-1193 provider required');
  revoke();if(!next)return;current=next;
  for(const event of ['accountsChanged','chainChanged','disconnect']){const fn=value=>{if(current!==next)return;if(event==='disconnect'||event==='accountsChanged'&&Array.isArray(value)&&value.length===0){revoke();return;}revision++;emit(event,value);};relays.set(event,fn);next.on(event,fn);}announce();
 }
 target.addEventListener('eip6963:requestProvider',announce);
 return Object.freeze({provider,set,announce,revoke,dispose(){if(dead)return;revoke();dead=true;target.removeEventListener('eip6963:requestProvider',announce);listeners.clear();}});
}
