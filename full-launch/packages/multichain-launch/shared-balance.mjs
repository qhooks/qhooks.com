// Pure L79 shared-balance policy. No RPC, signing, or state mutation.
const MAX_UINT256=(1n<<256n)-1n;
const ARC_CHAIN_ID='5042';
const ARC_QUOTE_ADDRESS='0x3600000000000000000000000000000000000000';
const ARC_QUOTE_DECIMALS=6;
const NATIVE_DECIMALS=18;
const QUOTE_TO_NATIVE_SCALE=10n**12n;
const FORWARD_GAS_LIMIT=7_000_000n;
const SUPPORTED_CHAIN_IDS=new Set(['8453','4663','1','42161','56','5042','99801']);
const INPUT_KEYS=['chainId','quote','reservedQuoteRaw','maximumFee','maxFeePerGas','nativeBalance'];
const QUOTE_KEYS=['address','decimals','nativeSharedBalance'];

const fail=message=>{throw new TypeError(message);};
function exactRecord(value,keys,label){
 if(value===null||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)fail('Exact '+label+' record required');
 const descriptors=Object.getOwnPropertyDescriptors(value),names=Object.keys(descriptors);
 if(Object.getOwnPropertySymbols(value).length||names.length!==keys.length||!keys.every(key=>Object.hasOwn(descriptors,key)))fail('Exact '+label+' fields required');
 for(const key of keys){const descriptor=descriptors[key];if(!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))fail('Plain '+label+' fields required');}
 return Object.fromEntries(keys.map(key=>[key,descriptors[key].value]));
}
function uint(raw,label){
 const match=typeof raw==='string'?raw.match(/^(?:0|[1-9][0-9]*)$/):null;
 if(typeof raw!=='string'||raw.length>78||match?.[0]!==raw)fail('Canonical '+label+' uint256 required');
 const value=BigInt(raw);if(value>MAX_UINT256)fail(label+' exceeds uint256');return value;
}
function chain(raw){uint(raw,'chainId');if(!SUPPORTED_CHAIN_IDS.has(raw))fail('Supported canonical chainId required');return raw;}
function address(raw){
 const match=typeof raw==='string'?raw.match(/^0x[0-9a-f]{40}$/):null;
 if(typeof raw!=='string'||raw.length!==42||match?.[0]!==raw||raw==='0x'+'0'.repeat(40))fail('Canonical quote address required');
 return raw;
}
function add(left,right,label){if(right>MAX_UINT256-left)fail(label+' overflow');return left+right;}
function multiply(left,right,label){if(left!==0n&&right>MAX_UINT256/left)fail(label+' overflow');return left*right;}
function profile(chainId,quote){
 const q=exactRecord(quote,QUOTE_KEYS,'quote');
 const quoteAddress=address(q.address);
 if(!Number.isInteger(q.decimals)||q.decimals<0||q.decimals>255)fail('Canonical quote decimals required');
 if(typeof q.nativeSharedBalance!=='boolean')fail('Canonical nativeSharedBalance required');
 if(chainId===ARC_CHAIN_ID){
  if(quoteAddress!==ARC_QUOTE_ADDRESS||q.decimals!==ARC_QUOTE_DECIMALS||q.nativeSharedBalance!==true)fail('Arc shared quote profile mismatch');
 }else if(q.nativeSharedBalance!==false||quoteAddress===ARC_QUOTE_ADDRESS){
  fail('Shared native quote is Arc-only');
 }
 return q;
}
function frozenSummary(input,enforce){
 const fields=exactRecord(input,INPUT_KEYS,'shared-balance input');
 const chainId=chain(fields.chainId),quote=profile(chainId,fields.quote);
 const reservedQuote=uint(fields.reservedQuoteRaw,'reservedQuoteRaw');
 const maximumFee=uint(fields.maximumFee,'maximumFee');
 const maxFeePerGas=uint(fields.maxFeePerGas,'maxFeePerGas');
 const nativeBalance=uint(fields.nativeBalance,'nativeBalance');
 const applies=chainId===ARC_CHAIN_ID;
 let reservedNative=0n,forwardGasReserve=0n,requiredNative=0n;
 if(applies){
  reservedNative=multiply(reservedQuote,QUOTE_TO_NATIVE_SCALE,'Reserved quote scaling');
  forwardGasReserve=multiply(FORWARD_GAS_LIMIT,maxFeePerGas,'Forward gas reserve');
  requiredNative=add(add(reservedNative,maximumFee,'Principal and current fee'),forwardGasReserve,'Total shared balance');
 }
 const funded=!applies||nativeBalance>=requiredNative;
 const summary=Object.freeze({
  chainId,applies,quoteAddress:quote.address,quoteDecimals:quote.decimals,
  nativeDecimals:NATIVE_DECIMALS,nativeSharedBalance:quote.nativeSharedBalance,
  reservedQuoteRaw:fields.reservedQuoteRaw,quoteToNativeScale:QUOTE_TO_NATIVE_SCALE.toString(),
  reservedNative:reservedNative.toString(),maximumFee:fields.maximumFee,
  maxFeePerGas:fields.maxFeePerGas,forwardGasLimit:FORWARD_GAS_LIMIT.toString(),
  forwardGasReserve:forwardGasReserve.toString(),requiredNative:requiredNative.toString(),
  nativeBalance:fields.nativeBalance,funded,balanceAccounting:'single-native-balance',
  reserveScope:'one-capped-protected-call'
 });
 if(enforce&&applies&&!funded)fail('Insufficient shared Arc balance');
 return summary;
}

export function sharedBalanceSummary(input){return frozenSummary(input,false);}
export function enforceSharedBalance(input){return frozenSummary(input,true);}
