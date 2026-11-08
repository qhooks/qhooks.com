import {abiEncode} from './full-launch/packages/launchpad/abi-encode.mjs';
import {keccak_256} from './full-launch/prototypes/qpools/client/vendor/hashes/sha3.js';

// Published ABI references, not runtime/venue-origin or execution admission:
// github.com/Uniswap/v4-core/blob/main/src/interfaces/IPoolManager.sol
// github.com/Uniswap/v4-core/blob/main/src/types/PoolId.sol
// github.com/Uniswap/v4-core/blob/main/src/libraries/Hooks.sol
// github.com/Uniswap/v3-core/blob/main/contracts/interfaces/IUniswapV3Factory.sol
const EVM=/^0x[0-9a-f]{40}$/i,WORD=/^0x[0-9a-f]{64}$/i,ZERO='0x'+'0'.repeat(40);
const ensure=(ok,label)=>{if(!ok)throw new TypeError('Invalid Elysium pool '+label);};
const hex=bytes=>'0x'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const bytes=value=>Uint8Array.from(value.slice(2).match(/../g)||[],v=>parseInt(v,16));
const hash=value=>hex(keccak_256(bytes(value)));
const topic=value=>hex(keccak_256(new TextEncoder().encode(value)));
export const eventTopics=Object.freeze({
 v4Initialize:topic('Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)'),
 v3PoolCreated:topic('PoolCreated(address,address,uint24,int24,address)')
});
const permissionNames=Object.freeze(['beforeInitialize','afterInitialize','beforeAddLiquidity','afterAddLiquidity','beforeRemoveLiquidity','afterRemoveLiquidity','beforeSwap','afterSwap','beforeDonate','afterDonate','beforeSwapReturnDelta','afterSwapReturnDelta','afterAddLiquidityReturnDelta','afterRemoveLiquidityReturnDelta']);
function address(value,label,{zero=true}={}){
 ensure(typeof value==='string'&&EVM.test(value),label);const out=value.toLowerCase();ensure(zero||out!==ZERO,label);return out;
}
export function hookPermissions(value){
 const hook=address(value,'hook'),mask=Number(BigInt(hook)&16383n),flags=Object.fromEntries(permissionNames.map((name,index)=>[name,!!(mask&(1<<(13-index)))]));
 // These are callback/address bits, never a safety, bytecode or hook-admission verdict.
 return {address:hook,mask,flags,enabled:permissionNames.filter(name=>flags[name])};
}
function word(value,label){ensure(typeof value==='string'&&WORD.test(value),label);return value.toLowerCase();}
function uint(value,bits,label){const n=BigInt(word(value,label));ensure(n<(1n<<BigInt(bits)),label+' padding or bounds');return n;}
function int(value,bits,label){
 const n=BigInt(word(value,label)),width=1n<<BigInt(bits),low=n&(width-1n),signed=low&(width>>1n)?low-width:low;
 ensure(n===(signed<0?(1n<<256n)+signed:signed),label+' sign padding or bounds');return Number(signed);
}
function addressWord(value,label){const w=word(value,label);ensure(/^0x0{24}[0-9a-f]{40}$/.test(w),label+' padding');return '0x'+w.slice(-40);}
function quantity(value,label){
 ensure(typeof value==='string'&&/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(value),label);const n=BigInt(value);
 ensure(n<=BigInt(Number.MAX_SAFE_INTEGER),label+' bounds');return Number(n);
}
function proof(log){
 const tx=word(log.transactionHash,'transaction hash'),blockHash=word(log.blockHash,'block hash');
 ensure(BigInt(tx)!==0n&&BigInt(blockHash)!==0n,'mined transaction/block hash');
 ensure(log.removed===undefined||log.removed===false,'removed flag');
 if(log.chainId!==undefined)ensure(log.chainId===99901||log.chainId==='99901'||log.chainId==='0x1863d','chain');
 return {blockNumber:quantity(log.blockNumber,'block number'),blockHash,tx,logIndex:quantity(log.logIndex,'log index')};
}
// null means unrelated/removed. A matching but malformed event throws so a
// bounded scanner can count rejected logs without turning them into no activity.
export function decodeElysiumPoolLog(log,venue){
 ensure(venue&&typeof venue==='object'&&String(venue.chainId)==='99901','venue chain');
 const v4=venue.protocol==='uniswap-v4'||venue.protocol==='v4',v3=['uniswap-v3','uniswap-v3-fork','v3'].includes(venue.protocol);
 if(!v4&&!v3)return null;
 const namespace=address(v4?venue.manager:venue.factory,v4?'venue manager':'venue factory',{zero:false});
 ensure(log&&typeof log==='object'&&!Array.isArray(log),'log');if(log.removed===true)return null;
 if(typeof log.address!=='string'||!EVM.test(log.address))throw new TypeError('Invalid Elysium pool log address');
 if(log.address.toLowerCase()!==namespace)return null;
 ensure(Array.isArray(log.topics)&&log.topics.length>0,'topics');
 if(typeof log.topics[0]!=='string'||log.topics[0].toLowerCase()!==(v4?eventTopics.v4Initialize:eventTopics.v3PoolCreated))return null;
 ensure(log.topics.length===4,'topic count');log.topics.forEach((t,i)=>word(t,'topic '+i));
 ensure(typeof log.data==='string'&&new RegExp('^0x[0-9a-f]{'+(v4?320:128)+'}$','i').test(log.data),'event data length');
 const data=Array.from({length:v4?5:2},(_,i)=>'0x'+log.data.slice(2+i*64,66+i*64));
 const currency0=addressWord(log.topics[v4?2:1],'currency0'),currency1=addressWord(log.topics[v4?3:2],'currency1');
 ensure(BigInt(currency0)<BigInt(currency1)&&(v4||currency0!==ZERO),'currency order');
 const fee=Number(uint(v4?data[0]:log.topics[3],24,'fee')),tickSpacing=int(v4?data[1]:data[0],24,'tick spacing');
 ensure(tickSpacing>0&&(!v4||tickSpacing<=32767),'tick spacing');
 const base={chainId:'99901',protocol:v4?'uniswap-v4':'uniswap-v3',venueId:typeof venue.id==='string'?venue.id:null,attribution:'unattributed',currency0,currency1,fee,tickSpacing,...proof(log)};
 if(v4){
  const hook=addressWord(data[2],'hook');ensure(uint(data[3],160,'sqrt price')>0n,'sqrt price');int(data[4],24,'initial tick');
  const poolId=word(log.topics[1],'pool ID'),calculated=hash(abiEncode(['address','address','uint24','int24','address'],[currency0,currency1,String(fee),String(tickSpacing),hook]));
  ensure(poolId===calculated,'PoolKey hash');
  const matchedPublishedHook=venue.hook===undefined?null:address(venue.hook,'published hook')===hook;
  return {...base,manager:namespace,hook,poolId,matchedPublishedHook};
 }
 const poolAddress=address(addressWord(data[1],'pool address'),'pool address',{zero:false});
 return {...base,factory:namespace,hook:null,poolAddress};
}
