// Lead-owned read-only identity boundary for official managers and launch quotes.
// A passing observation is not a token-behavior audit or permission to transact.
import {networkProfile,requireRpcChain} from '../multichain/profiles.mjs';
import {STOCK_PAIRS,stockPair} from './stock-pairs.mjs';
export const LAUNCH_DEPENDENCY_POLICY_SHA='7eebb70c350880038ff4e0b750248ec5018b74165e47dd8f8da627ebf0b799a8';
const ensure=(ok,m)=>{if(!ok)throw new TypeError(m);};
const freeze=o=>{if(o&&typeof o==='object'){Object.values(o).forEach(freeze);Object.freeze(o);}return o;};
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
const quantity=x=>typeof x==='string'&&x.length<=66&&/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(x)&&'0x'+BigInt(x).toString(16)===x;
const hash=x=>typeof x==='string'&&x.length===66&&/^0x[0-9a-f]{64}$/.test(x);
async function codeMatches(code,identity){
 ensure(typeof code==='string'&&code.length===identity.runtimeBytes*2+2&&code.startsWith('0x')&&code.length<=49154&&!/[^0-9a-f]/.test(code.slice(2)),'Dependency runtime size or encoding changed');
 const bytes=Uint8Array.from(code.slice(2).match(/../g),b=>parseInt(b,16));
 ensure(await sha(bytes)===identity.runtimeSha256,'Dependency runtime changed');
}
// `quote` (optional): a launch pair other than the chain's policy quote; only a vetted stock (stock-pairs.mjs) is accepted,
// and it is verified by its proxy, beacon and implementation code instead of the policy's fixed quote identity.
export async function createLaunchDependencies({chainId,policyText,quote=null}){
 const network=networkProfile(chainId);
 ensure(typeof policyText==='string'&&policyText.length<=40000,'Fixed bounded launch dependency policy required');
 ensure(await sha(new TextEncoder().encode(policyText))===LAUNCH_DEPENDENCY_POLICY_SHA,'Launch dependency policy identity mismatch');
 const policy=JSON.parse(policyText);ensure(policy.schemaVersion===1&&policy.kind==='qhooks-launch-dependency-policy','Launch dependency schema');
 const base=policy.chains.find(c=>c.chainId===chainId);ensure(base,'Launch chain dependency profile missing');
 const stock=quote&&quote!==base.quote.address?stockPair(chainId,quote):null;ensure(!quote||quote===base.quote.address||stock,'Launch pair is not an admitted quote');
 const profile=freeze(stock?{...base,quote:{address:stock.address,symbol:stock.symbol,decimals:stock.decimals,name:stock.name,nativeSharedBalance:false,wrapNative:false,stock:true}}:base);
 return Object.freeze({profile,network,
  async verify({request,live=()=>{}}){
   ensure(typeof request==='function'&&typeof live==='function','Read-only dependency request required');
   const rpc=async(method,params=[])=>{await live();const value=await request(method,params);await live();return value;};
   requireRpcChain(chainId,await rpc('eth_chainId'));
   const head=await rpc('eth_getBlockByNumber',['latest',false]);ensure(head&&quantity(head.number)&&hash(head.hash),'Canonical dependency block required');
   // Snapshot untrusted responses before awaits; no provider-owned mutable object
   // can alter which block subsequent reads are bound to.
   const blockNumber=head.number,blockHash=head.hash;
   for(const c of [...Object.values(profile.contracts),...(stock?[]:[profile.quote,...profile.quote.implementations])]){
    await codeMatches(await rpc('eth_getCode',[c.address,blockNumber]),c);await live();
   }
   const call=data=>rpc('eth_call',[{to:profile.quote.address,data},blockNumber]);
   if(stock){
    // A stock pair: the proxy, its beacon and the beacon's implementation must all be the vetted code.
    const set=STOCK_PAIRS[chainId],word=a=>'0x'+a.slice(2).padStart(64,'0');
    await codeMatches(await rpc('eth_getCode',[stock.address,blockNumber]),set.proxy);await live();
    ensure(await rpc('eth_getStorageAt',[stock.address,set.beaconSlot,blockNumber])===word(set.beacon.address),'Stock beacon changed');
    await codeMatches(await rpc('eth_getCode',[set.beacon.address,blockNumber]),set.beacon);await live();
    ensure(await rpc('eth_call',[{to:set.beacon.address,data:'0x5c60da1b'},blockNumber])===word(set.implementation.address),'Stock implementation changed');
    await codeMatches(await rpc('eth_getCode',[set.implementation.address,blockNumber]),set.implementation);await live();
    const sym=await call('0x95d89b41'),n=sym.length>=194?Number(BigInt('0x'+sym.slice(66,130))):0;
    ensure(n>0&&n<=16&&new TextDecoder().decode(Uint8Array.from(sym.slice(130,130+n*2).match(/../g),b=>parseInt(b,16)))===stock.symbol,'Stock symbol changed');
   }else{
    for(const[slot,value]of Object.entries(profile.quote.proxySlots))ensure(await rpc('eth_getStorageAt',[profile.quote.address,slot,blockNumber])===value,'Quote implementation slot changed');
    ensure(await call('0x95d89b41')===profile.quote.symbolAbi,'Quote symbol changed');
   }
   ensure(await call('0x313ce567')==='0x'+BigInt(profile.quote.decimals).toString(16).padStart(64,'0'),'Quote decimals changed');
   const again=await rpc('eth_getBlockByNumber',[blockNumber,false]);ensure(again?.number===blockNumber&&again?.hash===blockHash,'Dependency observation reorganized');
   requireRpcChain(chainId,await rpc('eth_chainId'));await live();
   return freeze({chainId,blockNumber,blockHash,policySha256:LAUNCH_DEPENDENCY_POLICY_SHA,manager:profile.contracts.PoolManager.address,quote:profile.quote.address,quoteDecimals:profile.quote.decimals,quoteSymbol:profile.quote.symbol,nativeSharedBalance:profile.quote.nativeSharedBalance,wrapNative:profile.quote.wrapNative,scope:'runtime-and-units-observation',transactionAuthorized:false});
  }
 });
}
