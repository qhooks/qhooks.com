import {ELYSIUM_NETWORK} from './qx-elysium-registry.mjs';

const ADDRESS=/^0x[0-9a-f]{40}$/i,ZERO='0x'+'0'.repeat(40);
const WORD=/^0x[0-9a-f]{64}$/i,HEX=/^0x(?:[0-9a-f]{2})*$/i;
const utf8=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
function decodedSymbol(value){
 if(typeof value!=='string'||value.length>258||!HEX.test(value))return null;
 const raw=value.slice(2).toLowerCase();let payload;
 if(raw.length===64)payload=raw.replace(/(?:00)+$/,'');
 else{
  if(raw.length<128||BigInt('0x'+raw.slice(0,64))!==32n)return null;
  const size=BigInt('0x'+raw.slice(64,128));if(size>64n)return null;
  const length=Number(size),end=128+length*2,total=128+Math.ceil(length/32)*64;
  if(raw.length!==total||!/^[0]*$/.test(raw.slice(end)))return null;
  payload=raw.slice(128,end);
 }
 if(!payload)return null;
 try{
  const symbol=utf8.decode(Uint8Array.from(payload.match(/../g)||[],byte=>parseInt(byte,16)));
  // Preserve readable Unicode verbatim, but not controls, format/bidi marks,
  // surrogate/private/unassigned characters or line/paragraph separators.
  if(!symbol.trim()||Array.from(symbol).length>32||/[\p{C}\p{Zl}\p{Zp}]/u.test(symbol))return null;
  return symbol;
 }catch{return null;}
}
function decodedDecimals(value){
 if(typeof value!=='string'||!WORD.test(value))return null;
 const n=BigInt(value);return n<=36n?Number(n):null;
}
function observedBlock(value){
 if(typeof value!=='string'||!/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(value))return null;
 const n=BigInt(value);return n<(1n<<64n)?'0x'+n.toString(16):null;
}
// Only identity and bounded metadata from a fixed-chain observation. A token's
// symbol is a display label; it never aliases addresses or grants authority.
export function decodeElysiumAsset(value,metadata={},context={}){
 if(typeof value!=='string'||!ADDRESS.test(value))throw new TypeError('Invalid Elysium asset address.');
 const address=value.toLowerCase(),native=address===ZERO;
 const observedAt=Number.isSafeInteger(context?.observedAt)&&context.observedAt>0&&context.observedAt<=8640000000000000?context.observedAt:null;
 return {chainId:'99901',address,symbol:native?ELYSIUM_NETWORK.native:decodedSymbol(metadata?.symbol),
  decimals:native?ELYSIUM_NETWORK.nativeDecimals:decodedDecimals(metadata?.decimals),blockNumber:observedBlock(context?.blockNumber),observedAt,
  source:native?'chain-native':'token-contract'};
}
