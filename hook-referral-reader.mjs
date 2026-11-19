// Bounded, native capability proof. Unknown hooks are not opted in by permission
// flags or untrusted market metadata. Every accepted runtime is source-pinned.
import {hookReferralFactories} from './hook-referral-config.mjs';
import {keccak_256} from './full-launch/prototypes/qpools/client/vendor/hashes/sha3.js';

const ZERO='0x'+'0'.repeat(40), ADDRESS=/^0x[0-9a-f]{40}$/i, HASH=/^0x[0-9a-f]{64}$/i;
const word=v=>BigInt(v).toString(16).padStart(64,'0');
const addr=w=>/^0{24}[0-9a-f]{40}$/i.test(w)?'0x'+w.slice(24).toLowerCase():null;
const split=(v,n)=>typeof v==='string'&&new RegExp('^0x[0-9a-f]{'+(64*n)+'}$','i').test(v)?v.slice(2).toLowerCase().match(/.{64}/g):null;
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
export function hookReferralFactory(chainId,hook,factories=hookReferralFactories){
 return factories.find(v=>String(v.chainId)===String(chainId)&&same(v.hook,hook))||null;
}
export async function runtimeSha256(code){
 if(typeof code!=='string'||!/^0x(?:[0-9a-f]{2})+$/i.test(code)||code.length>131074)throw Error('Invalid runtime');
 const bytes=Uint8Array.from(code.slice(2).match(/../g),v=>parseInt(v,16));
 return '0x'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
}
function keyWords(k){
 if(!k||![k.currency0,k.currency1,k.hooks].every(v=>ADDRESS.test(v||''))||BigInt(k.currency0)>=BigInt(k.currency1)||
 !Number.isInteger(k.fee)||k.fee<0||k.fee>=2**24||!Number.isInteger(k.tickSpacing)||k.tickSpacing<=0||k.tickSpacing>=2**23)throw Error('Invalid key');
 return [word(k.currency0),word(k.currency1),word(k.fee),word(k.tickSpacing),word(k.hooks)];
}
export function hookReferralPoolId(key){
 const hex=keyWords(key).join('');
 return '0x'+Array.from(keccak_256(Uint8Array.from(hex.match(/../g),v=>parseInt(v,16))),v=>v.toString(16).padStart(2,'0')).join('');
}
/** rpc accepts one ordered array of [method,params] and returns raw results. */
export async function readHookReferralSupport({chainId,manager,poolId,key,rpc,now=Date.now(),factories=hookReferralFactories}={}){
 const family=hookReferralFactory(chainId,key?.hooks,factories);
 if(!family)return {state:'unsupported',reason:'unrecognized_hook'};
 try{
  if(!ADDRESS.test(manager||'')||!HASH.test(poolId||'')||typeof rpc!=='function')throw Error('Invalid context');
  const expectedKey=keyWords(key);
  if(!same(hookReferralPoolId(key),poolId))throw Error('Pool ID does not match key');
  const [head]=await rpc([['eth_getBlockByNumber',['latest',false]]]);
  if(!head||!/^0x[0-9a-f]+$/i.test(head.number||'')||!HASH.test(head.hash||'')||!/^0x[0-9a-f]+$/i.test(head.timestamp||''))throw Error('Missing head');
  const age=now/1000-Number(BigInt(head.timestamp));if(!Number.isFinite(age)||age < -30||age>120)throw Error('Stale head');
  const block=head.number;
  const concrete=family.lookup==='blocks-getter';
  const discovery=[['eth_getCode',[key.hooks,block]],['eth_call',[{to:key.hooks,data:concrete?family.blocksGetterSelector:'0xd4bf17c5'+poolId.slice(2)},block]]];
  if(concrete)discovery.push(['eth_call',[{to:key.hooks,data:family.blocksActiveSelector},block]]);
  const [hookCode,launch,active]=await rpc(discovery);
  if(await runtimeSha256(hookCode)!==family.runtimeSha256)throw Error('Hook runtime changed');
  const l=split(launch,concrete?1:9);if(!l)throw Error('Invalid launch record');
  if(concrete){const a=split(active,1);if(!a||BigInt('0x'+a[0])>1n)throw Error('Invalid active state');if(BigInt('0x'+a[0])===0n)return {state:'unsupported',reason:'blocks_not_active'};}
  const blocks=addr(l[concrete?0:6]);if(!blocks||blocks===ZERO) return {state:'unsupported',reason:'no_blocks'};
  if(concrete&&!same(blocks,family.blocksAddress))throw Error('Blocks binding changed');
  const [clone,config,hook,reportedManager,poolKey]=await rpc([
   ['eth_getCode',[blocks,block]],['eth_call',[{to:blocks,data:'0x79502c55'},block]],
   ['eth_call',[{to:blocks,data:'0x7f5a7c7b'},block]],['eth_call',[{to:blocks,data:'0x481c6a75'},block]],
   ['eth_call',[{to:blocks,data:'0x182148ef'},block]]
  ]);
  if(concrete){if(await runtimeSha256(clone)!==family.blocksRuntimeSha256)throw Error('Blocks runtime changed');}
  else{
   const match=/^0x363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3$/i.exec(clone||'');
   if(!match||!same('0x'+match[1],family.blocksImplementation))throw Error('Unrecognized blocks implementation');
   const [implementationCode]=await rpc([['eth_getCode',[family.blocksImplementation,block]]]);
   if(await runtimeSha256(implementationCode)!==family.implementationRuntimeSha256)throw Error('Blocks runtime changed');
  }
  const h=split(hook,1),m=split(reportedManager,1),pk=split(poolKey,5),c=split(config,66);
  if(!h||!m||!pk||!c||!same(addr(h[0]),key.hooks)||!same(addr(m[0]),manager)||pk.some((v,i)=>v!==expectedKey[i]))throw Error('Pool binding mismatch');
  const token=addr(c[0]),quote=addr(c[4]);
  if(!token||!quote||!concrete&&!same(addr(l[0]),token)||!same(token,key.currency0)&&!same(token,key.currency1)||!same(quote,token===key.currency0.toLowerCase()?key.currency1:key.currency0))throw Error('Currency mismatch');
  const mask=BigInt('0x'+c[1]),shareBps=Number(BigInt('0x'+c[47]));
  if(mask>=1n<<19n||shareBps>10000)throw Error('Invalid referral config');
  const referralsEnabled=(mask&(1n<<17n))!==0n;
  if(referralsEnabled&&shareBps===0)throw Error('Invalid enabled referral');
  const payees=c.slice(50,58).map((v,i)=>({address:addr(v),bps:Number(BigInt('0x'+c[58+i]))}));
  if(payees.some(p=>!p.address||p.bps>10000||(p.address===ZERO)!==(p.bps===0))||payees.reduce((n,p)=>n+p.bps,0)!==10000)throw Error('Invalid payees');
  return {state:'verified',referralsEnabled,shareBps,contract:blocks,hook:key.hooks.toLowerCase(),pool:poolId.toLowerCase(),
   pin:{chainId:String(chainId),blockNumber:String(BigInt(block)),blockHash:head.hash.toLowerCase()},
   protocolAddresses:[key.hooks.toLowerCase(),blocks,...(concrete?[]:[family.blocksImplementation]),manager.toLowerCase()],
   evidence:{source:'native',codeVerified:true,configVerified:true,family:family.family,hookRuntimeSha256:family.runtimeSha256,...(concrete?{blocksRuntimeSha256:family.blocksRuntimeSha256}:{implementationRuntimeSha256:family.implementationRuntimeSha256})},
   quote,token,payees:payees.filter(v=>v.address!==ZERO),claim:{to:blocks,data:'0x4e71d92d',requires:'referrer-wallet'},allocationFinal:false};
 }catch{return {state:'unavailable',reason:'native_hook_capability_unavailable'};}
}
