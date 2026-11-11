// Read-only factory/price adapter shared by guided Create, Studio and their pre-sign guard.
import {chainById} from './chains.mjs';
import {startCapFactory,startAtCall,readStartAt,pairsFactory,pairQuotes,multiFactory,multiQuotes,pairStartAtCall,readPairStartAt,usdFromSqrt} from './qx-quick-launch-core.mjs';
import {readCreateNativeUSD} from './qx-create-prices.mjs';
import {chooseStart,selectedStart,START_PRICE_HOLD} from './qx-guided-start-core.mjs';
export async function readGuidedQuoteUsd(chainId,quote,request,{readUsd=readCreateNativeUSD}={}){
 const chain=chainById(chainId);
 if(quote.address===chain?.quote.address)return /USD/.test(quote.symbol)?1:readUsd(quote.symbol.replace(/^W/,''));
 const quotes=[...pairQuotes(chainId),...multiQuotes(chainId)],pair=quotes.find(p=>p.address===quote.address),stable=quotes.find(p=>p.risk==='stable');
 if(pair?.risk==='stable')return 1;
 if(pair?.risk==='weth')return readUsd(quote.symbol.replace(/^W/,''));
 if(!pair?.usdPool||!stable)throw Error(START_PRICE_HOLD);
 const result=await request('eth_call',[{to:chain.contracts.stateView,data:'0xc815641c'+pair.usdPool.slice(2)},'latest']);
 return usdFromSqrt('0x'+result.slice(2,66),pair.address,stable.address);
}
export async function readFactoryStart({chainId,quote,factory,steps=0,request,quoteUsd,readUsd}){
 try{
  const chain=chainById(chainId),multi=!!factory&&factory.toLowerCase()===multiFactory(chainId),pair=quote.address===chain?.quote.address?null:(multi?multiQuotes(chainId):pairQuotes(chainId)).find(p=>p.address===quote.address);
  if(!factory||quote.address!==chain?.quote.address&&!pair)throw Error();
  // v4 has no startAt view: even the standard quote uses pairStartAt(0, steps).
  const [raw,usd]=await Promise.all([request('eth_call',[{to:factory,data:pair||multi?pairStartAtCall(pair?.index||0,steps):startAtCall(steps)},'latest']),quoteUsd===undefined?readGuidedQuoteUsd(chainId,quote,request,{readUsd}):quoteUsd]);
  const value=pair||multi?readPairStartAt(raw):readStartAt(raw);if(!value||!(usd>0)||!Number.isFinite(usd))throw Error();
  return {...value,quoteUsd:usd,capUsd:Number(value.startCapWei)/10**quote.decimals*usd};
 }catch{throw Error(START_PRICE_HOLD);}
}
export async function readGuidedStart({chainId,quote,tier='standard',steps='0',customUsd='',request,readUsd,factory:chosenFactory}){
 try{
  const chain=chainById(chainId),pair=quote.address===chain?.quote.address?null:pairQuotes(chainId).find(p=>p.address===quote.address),factory=chosenFactory||(pair?pairsFactory(chainId):startCapFactory(chainId));
  const base=await readFactoryStart({chainId,quote,factory,steps:0,request,readUsd});
  const selection=selectedStart({tier,steps,customUsd,standardUsd:base.capUsd});
  const start=selection.steps===0?base:await readFactoryStart({chainId,quote,factory,steps:selection.steps,request,quoteUsd:base.quoteUsd});
  return {...chooseStart({tier,steps:selection.steps,customUsd,base,start,quoteUsd:base.quoteUsd,quoteDecimals:quote.decimals}),factory,quote:quote.address};
 }catch{throw Error(START_PRICE_HOLD);}
}
