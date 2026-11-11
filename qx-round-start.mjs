// Contributor-round price authority is the immutable launchTerms() read from that round.
import {readFactoryStart} from './qx-guided-start.mjs';
import {chainById} from './chains.mjs';
import {checkSteps,capAtSteps,startCapFactory} from './qx-quick-launch-core.mjs';
import {START_PRICE_HOLD,selectedStart} from './qx-guided-start-core.mjs';
const ensure=ok=>{if(!ok)throw Error(START_PRICE_HOLD);};
export function decodeRoundTerms(raw){
 try{
  ensure(typeof raw==='string'&&/^0x[0-9a-f]+$/i.test(raw)&&raw.length<=40000&&(raw.length-2)%64===0);
  const words=raw.slice(2).match(/.{64}/g).map(w=>BigInt('0x'+w));
  // Solidity supports a returned struct tuple or nine separate return values for this getter.
  const base=words[0]===32n?1:0;ensure(words.length>=base+9);
  for(let i=0;i<3;i++){const offset=words[base+i];ensure(offset>=288n&&offset%32n===0n&&offset/32n+BigInt(base)<BigInt(words.length));const at=base+Number(offset/32n);ensure(words[at]<=4096n&&BigInt(at*32+32)+words[at]<=BigInt((raw.length-2)/2));}
  const packed=words[base+6];ensure(packed<1n<<32n);const steps=checkSteps(Number(packed>>16n));
  return {steps,snipeSeconds:String(packed),reserveBps:String(words[base+8])};
 }catch{throw Error(START_PRICE_HOLD);}
}
async function factoryStart({chainId,factory,steps,request,readUsd}){
 const chain=chainById(chainId),legacy=(typeof chain.simpleLaunch==='string'?chain.simpleLaunch:chain.simpleLaunch?.address)?.toLowerCase();
 if(factory!==legacy)return readFactoryStart({chainId,quote:chain.quote,factory,steps,request,readUsd});
 // The published contributor round uses the old fixed-Standard factory. Keep its Standard launch usable,
 // but compare its immutable cap with today's one-tap table rather than inventing a startAt interface.
 ensure(steps===0);const [raw,reference]=await Promise.all([request('eth_call',[{to:factory,data:'0xc763e5a1'},'latest']),readFactoryStart({chainId,quote:chain.quote,factory:startCapFactory(chainId),steps:0,request,readUsd})]);
 ensure(/^0x[0-9a-f]{448}$/i.test(raw));const startCapWei=BigInt('0x'+raw.slice(2+6*64,2+7*64)),capUsd=Number(startCapWei)/10**chain.quote.decimals*reference.quoteUsd;
 ensure(startCapWei>0n&&Math.abs(capUsd/reference.capUsd-1)<=.02);
 return {startCapWei,capUsd,quoteUsd:reference.quoteUsd,tick0:null,legacyFixed:true,standardUsd:reference.capUsd};
}
export async function readRoundStart({chainId,round,request,readUsd}){
 try{
  const [factoryRaw,raw]=await Promise.all([request('eth_call',[{to:round,data:'0xc45a0155'},'latest']),request('eth_call',[{to:round,data:'0xdec5b3a2'},'latest'])]);
  ensure(/^0x[0-9a-f]{64}$/i.test(factoryRaw)&&BigInt(factoryRaw)<1n<<160n);const factory='0x'+factoryRaw.slice(-40).toLowerCase(),terms=decodeRoundTerms(raw);
  const base=await factoryStart({chainId,factory,steps:0,request,readUsd}),exact=terms.steps===0?base:await factoryStart({chainId,factory,steps:terms.steps,request,readUsd});
  const standardUsd=base.standardUsd||base.capUsd;ensure(Math.abs(exact.capUsd/capAtSteps(standardUsd,terms.steps)-1)<=.02);
  return {...exact,...terms,factory,round,standardUsd};
 }catch{throw Error(START_PRICE_HOLD);}
}
export async function assertRoundStart({shown,...options}){
 const fresh=await readRoundStart(options);ensure(shown&&fresh.factory===shown.factory&&fresh.snipeSeconds===shown.snipeSeconds&&Math.abs(fresh.capUsd/shown.capUsd-1)<=.02);return fresh;
}
// Only new round construction can choose different steps; existing round terms cannot be rewritten.
export async function readNewRoundStart(options){
 try{
 const {chainId,factory,tier='standard',steps='0',customUsd='',request,readUsd}=options;
 const base=await factoryStart({chainId,factory,steps:0,request,readUsd}),standardUsd=base.standardUsd||base.capUsd;
 const selection=selectedStart({tier,steps,customUsd,standardUsd}),exact=selection.steps===0?base:await factoryStart({chainId,factory,steps:selection.steps,request,readUsd});
 ensure(Math.abs(exact.capUsd/selection.selectedCapUsd-1)<=.02);
 return {...exact,...selection,tier,standardUsd,startCapWei:String(exact.startCapWei)};
 }catch{throw Error(START_PRICE_HOLD);}
}
