import {keccak_256} from './full-launch/prototypes/qpools/client/vendor/hashes/sha3.js';
import {abiEncode} from './full-launch/packages/launchpad/abi-encode.mjs';

// IPoolManager.Swap: https://github.com/Uniswap/v4-core/blob/main/src/interfaces/IPoolManager.sol
// These are pool event observations, not wallet fills, holder history or executable quotes.
const ADDRESS=/^0x[0-9a-f]{40}$/i,HASH=/^0x[0-9a-f]{64}$/i,Q=/^0x(?:0|[1-9a-f][0-9a-f]*)$/;
const ensure=(ok,field)=>{if(!ok)throw TypeError('Invalid Elysium swap '+field);};
const hex=bytes=>'0x'+Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');
export const ELYSIUM_SWAP_TOPIC=hex(keccak_256(new TextEncoder().encode('Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)')));
const word=value=>{ensure(typeof value==='string'&&HASH.test(value),'ABI word');return BigInt(value);};
function uint(value,bits){const n=word(value);ensure(n<(1n<<BigInt(bits)),'uint padding/bounds');return n;}
function signed(value,bits){const n=word(value),size=1n<<BigInt(bits),low=n&(size-1n),out=low&(size>>1n)?low-size:low;ensure(n===(out<0n?(1n<<256n)+out:out),'signed padding/bounds');return out;}
function quantity(value){ensure(typeof value==='string'&&Q.test(value),'quantity');const n=BigInt(value);ensure(n<=BigInt(Number.MAX_SAFE_INTEGER),'quantity bounds');return Number(n);}
export function elysiumPoolKeyId(pool){
  ensure(pool&&[pool.currency0,pool.currency1,pool.hook].every(value=>typeof value==='string'&&ADDRESS.test(value)),'pool currencies/hook');
  ensure(BigInt(pool.currency0)<BigInt(pool.currency1)&&Number.isInteger(pool.fee)&&pool.fee>=0&&pool.fee<=0xffffff&&Number.isInteger(pool.tickSpacing)&&pool.tickSpacing>0&&pool.tickSpacing<=32767,'pool key');
  const encoded=abiEncode(['address','address','uint24','int24','address'],[pool.currency0,pool.currency1,String(pool.fee),String(pool.tickSpacing),pool.hook]);
  return hex(keccak_256(Uint8Array.from(encoded.slice(2).match(/../g),value=>parseInt(value,16))));
}
export function decodeElysiumSwapLog(log,{manager,poolId}){
  ensure(typeof manager==='string'&&ADDRESS.test(manager)&&BigInt(manager)!==0n&&typeof poolId==='string'&&HASH.test(poolId)&&BigInt(poolId)!==0n,'subject');
  ensure(log&&typeof log==='object'&&!Array.isArray(log),'log');
  if(log.removed===true)return null;
  if(typeof log.address!=='string'||log.address.toLowerCase()!==manager.toLowerCase()||log.topics?.[0]?.toLowerCase()!==ELYSIUM_SWAP_TOPIC||log.topics?.[1]?.toLowerCase()!==poolId.toLowerCase())return null;
  ensure(log.removed===false,'removed flag');
  ensure(Array.isArray(log.topics)&&log.topics.length===3&&log.topics.every(value=>typeof value==='string'&&HASH.test(value)),'topics');
  ensure(/^0x0{24}[0-9a-f]{40}$/i.test(log.topics[2]),'caller padding');const caller='0x'+log.topics[2].slice(-40).toLowerCase();ensure(BigInt(caller)!==0n,'caller');
  ensure(typeof log.data==='string'&&/^0x[0-9a-f]{384}$/i.test(log.data),'data length');
  const words=Array.from({length:6},(_,i)=>'0x'+log.data.slice(2+i*64,66+i*64)),amount0=signed(words[0],128),amount1=signed(words[1],128),sqrtPriceX96=uint(words[2],160),liquidity=uint(words[3],128),tick=signed(words[4],24),fee=uint(words[5],24);
  ensure(sqrtPriceX96>=4295128739n&&sqrtPriceX96<1461446703485210103287273052203988822378723970342n,'sqrt price');ensure(tick>=-887272n&&tick<=887272n&&fee<=1000000n,'tick/LP fee');
  ensure(typeof log.transactionHash==='string'&&HASH.test(log.transactionHash)&&BigInt(log.transactionHash)!==0n&&typeof log.blockHash==='string'&&HASH.test(log.blockHash)&&BigInt(log.blockHash)!==0n,'mined identity');
  if(log.chainId!==undefined)ensure(['99901',99901,'0x1863d'].includes(log.chainId),'chain');
  return{chainId:'99901',protocol:'uniswap-v4',manager:manager.toLowerCase(),poolId:poolId.toLowerCase(),caller,amount0:amount0.toString(),amount1:amount1.toString(),sqrtPriceX96:sqrtPriceX96.toString(),liquidity:liquidity.toString(),tick:Number(tick),fee:Number(fee),blockNumber:quantity(log.blockNumber),blockHash:log.blockHash.toLowerCase(),tx:log.transactionHash.toLowerCase(),logIndex:quantity(log.logIndex)};
}
export function elysiumSwapPrice(sqrtPriceX96,{decimals0,decimals1}={}){
  if(![decimals0,decimals1].every(value=>Number.isInteger(value)&&value>=0&&value<=36)||typeof sqrtPriceX96!=='string'||!/^\d{1,49}$/.test(sqrtPriceX96))return null;
  const sqrt=BigInt(sqrtPriceX96);if(sqrt<4295128739n||sqrt>=1461446703485210103287273052203988822378723970342n)return null;
  // Human currency0 per currency1. Numbers remain finite over the admitted uint160/decimal bounds.
  const value=Number((1n<<192n)*10n**BigInt(decimals1))/Number(sqrt*sqrt*10n**BigInt(decimals0));
  return Number.isFinite(value)&&value>0?value:null;
}
