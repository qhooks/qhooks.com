import {compatibleWalletProvider} from './wallet-rpc-compat.mjs';
// Provider names and reverse-DNS identifiers are self-asserted display/selection hints.
// They are never authentication, and no provider request is made by discovery.
// Wallets that only inject window.ethereum and never announce through EIP-6963 (Phantom's in-app browser on phones,
// some other in-app browsers) still say who they are through provider flags. Without an id the hub cannot remember the
// connection, so every page change (each bottom tab is its own page) asked the trader to connect again. The flag gives
// the same well-known id the wallet announces on desktop, so a remembered connection restores with eth_accounts
// (read-only, no popup) like any announced wallet. Most specific first: several wallets also set isMetaMask.
const LEGACY_IDS=Object.freeze([
 ['isPhantom','app.phantom','Phantom'],['isCoinbaseWallet','com.coinbase.wallet','Coinbase Wallet'],['isTrust','com.trustwallet.app','Trust Wallet'],
 ['isTrustWallet','com.trustwallet.app','Trust Wallet'],['isRabby','io.rabby','Rabby'],['isOkxWallet','com.okex.wallet','OKX Wallet'],
 ['isOKExWallet','com.okex.wallet','OKX Wallet'],['isBraveWallet','com.brave.wallet','Brave Wallet'],['isRainbow','me.rainbow','Rainbow'],
 ['isZerion','io.zerion.wallet','Zerion'],['isMetaMask','io.metamask','MetaMask']]);
export function legacyIdentity(p){
 try{for(const [flag,rdns,name] of LEGACY_IDS)if(p&&p[flag]===true)return Object.freeze({rdns,name});}catch{/* A hostile getter cannot break discovery. */}
 return null;
}
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
   if(previous?.rdns&&!previous.inferred||entries.has(uuid)&&entries.get(uuid).provider!==provider||entries.size>=8&&!previous)return;
   if(previous)entries.delete(previous.uuid);
   const id=typeof rdns==='string'&&rdns.length<=253&&/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/.test(rdns)?rdns:null;
   // The wallet's own announcement wins over a window.ethereum entry whose flags named the same wallet (one entry per id).
   if(id)for(const e of [...entries.values()])if(e.inferred&&e.rdns===id)entries.delete(e.uuid);
   entries.set(uuid,Object.freeze({uuid,name,provider,rdns:id}));emit();
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
    const uuid='injected-'+(++serial),known=legacyIdentity(rawProvider),id=known&&![...entries.values()].some(e=>e.rdns===known.rdns)?known:null;
    entries.set(uuid,Object.freeze(id?{uuid,name:id.name,provider,rdns:id.rdns,inferred:true}:{uuid,name:'Browser wallet'+(providers.length>1?' '+serial:''),provider,rdns:null}));
   }
  }catch{/* Some browsers do not expose an injected provider. */}
  emit();
 }
 target.addEventListener('eip6963:announceProvider',announce);target.addEventListener('ethereum#initialized',scan);
 scan();const timer=target.setTimeout(scan,750);
 return Object.freeze({scan,stop(){if(stopped)return;stopped=true;target.clearTimeout(timer);target.removeEventListener('eip6963:announceProvider',announce);target.removeEventListener('ethereum#initialized',scan);entries.clear();}});
}
