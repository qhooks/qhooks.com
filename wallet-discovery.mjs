import {compatibleWalletProvider} from './wallet-rpc-compat.mjs';
// Provider names and reverse-DNS identifiers are self-asserted display/selection hints.
// They are never authentication, and no provider request is made by discovery.
export function discoverWallets(target,onChange){
 const entries=new Map();let stopped=false,serial=0;
 const valid=p=>p&&['request','on','removeListener'].every(k=>typeof p[k]==='function');
 const emit=()=>{if(!stopped)onChange(Object.freeze([...entries.values()]));};
 function announce(event){
  if(stopped)return;
  try{
   const {info,provider:rawProvider}=event.detail||{}, {uuid,name,rdns}=info||{};if(!valid(rawProvider))return;const provider=compatibleWalletProvider(rawProvider);
   if(!valid(provider)||typeof uuid!=='string'||!uuid||uuid.length>80||typeof name!=='string'||!name.trim()||name.length>80)return;
   const previous=[...entries.values()].find(e=>e.provider===provider);
   if(previous?.rdns||entries.has(uuid)&&entries.get(uuid).provider!==provider||entries.size>=8&&!previous)return;
   if(previous)entries.delete(previous.uuid);
   entries.set(uuid,Object.freeze({uuid,name,provider,rdns:typeof rdns==='string'&&rdns.length<=253&&/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/.test(rdns)?rdns:null}));emit();
  }catch{/* Malformed announcements cannot prevent other wallets being discovered. */}
 }
 function scan(){
  if(stopped)return;
  target.dispatchEvent(new Event('eip6963:requestProvider'));
  try{
   const legacy=target.ethereum,providers=Array.isArray(legacy?.providers)?legacy.providers.slice(0,8):[legacy];
   for(const rawProvider of providers){
    if(!valid(rawProvider))continue;const provider=compatibleWalletProvider(rawProvider);
    if(!valid(provider)||[...entries.values()].some(e=>e.provider===provider)||entries.size>=8)continue;
    const uuid='injected-'+(++serial);entries.set(uuid,Object.freeze({uuid,name:'Browser wallet'+(providers.length>1?' '+serial:''),provider,rdns:null}));
   }
  }catch{/* Some browsers do not expose an injected provider. */}
  emit();
 }
 target.addEventListener('eip6963:announceProvider',announce);target.addEventListener('ethereum#initialized',scan);
 scan();const timer=target.setTimeout(scan,750);
 return Object.freeze({scan,stop(){if(stopped)return;stopped=true;target.clearTimeout(timer);target.removeEventListener('eip6963:announceProvider',announce);target.removeEventListener('ethereum#initialized',scan);entries.clear();}});
}
