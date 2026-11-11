// Decode the actual launch call before asking the wallet to send it.
import {LAUNCH_SELECTOR,LAUNCH_SELECTOR_PQ,LAUNCH_PAIRED_SELECTOR,LAUNCH_MULTI_SELECTOR,checkSteps,pairQuotes,pairsFactory,multiQuotes,multiFactory,multiLive,startCapFactory,START_TIERS,capAtSteps,usdShort} from './qx-quick-launch-core.mjs';
import {chainById} from './chains.mjs';
import {readFactoryStart} from './qx-guided-start.mjs';
import {START_PRICE_HOLD} from './qx-guided-start-core.mjs';
const ensure=ok=>{if(!ok)throw Error(START_PRICE_HOLD);};
export function decodeQuickStart(data){
 try{
  ensure(typeof data==='string'&&/^0x(?:[0-9a-f]{2})+$/i.test(data));const selector=data.slice(0,10).toLowerCase();
  ensure([LAUNCH_SELECTOR,LAUNCH_SELECTOR_PQ,LAUNCH_PAIRED_SELECTOR,LAUNCH_MULTI_SELECTOR].includes(selector));
  const paired=selector===LAUNCH_PAIRED_SELECTOR,multi=selector===LAUNCH_MULTI_SELECTOR,pq=selector!==LAUNCH_SELECTOR,body=data.slice(10);
  const word=at=>{ensure(Number.isSafeInteger(at)&&at>=0&&at%32===0);const value=body.slice(at*2,at*2+64);ensure(value.length===64);return BigInt('0x'+value);};
  const offset=word(0);ensure(offset===BigInt(multi?128:paired?64:32));const tuple=Number(offset);word(tuple+(pq?12:10)*32);
  const packed=word(tuple+8*32);ensure(packed<1n<<32n);
  let quoteIndex=paired?Number(word(32)):0;ensure(!paired||quoteIndex>0&&quoteIndex<=255);
  if(multi){
   const array=at=>{const offset=Number(word(at));ensure(offset>=tuple+13*32);const count=Number(word(offset));ensure(count>=1&&count<=8);return Array.from({length:count},(_,i)=>word(offset+(i+1)*32));};
   const quotes=array(32),ticks=array(64),weights=array(96);ensure(quotes.length===ticks.length&&quotes.length===weights.length&&quotes[0]<=255n);
   // The page always uses the selected table entry for the main pool; an override would change its cap.
   ensure(ticks[0]===0n);quoteIndex=Number(quotes[0]);
  }
  return {steps:checkSteps(Number(packed>>16n)),quoteIndex,snipeSeconds:Number(packed&65535n),paired,pq,...(multi?{multi:true}:{})};
 }catch{throw Error(START_PRICE_HOLD);}
}
export const startTierLabel=(id,standardUsd)=>{const label=START_TIERS.find(t=>t[0]===id)?.[1]||'';return label+(id==='standard'&&standardUsd>0?' · ~'+usdShort(standardUsd):'');};
export const startCapText=(standardUsd,steps)=>standardUsd>0?'~'+usdShort(capAtSteps(standardUsd,steps)):'';
export async function assertQuickStart({chainId,transaction,expectedFactory,expectedSteps,expectedQuoteIndex=0,shownCapUsd,selectedCapUsd=shownCapUsd,quoteUsd,request}){
 try{
  const decoded=decodeQuickStart(transaction.data);ensure(decoded.steps===Number(expectedSteps)&&decoded.quoteIndex===Number(expectedQuoteIndex));
  const useMulti=multiLive(chainId)&&transaction.to?.toLowerCase()===multiFactory(chainId);ensure(!decoded.multi||useMulti);
  const factory=useMulti?multiFactory(chainId):decoded.paired?pairsFactory(chainId):startCapFactory(chainId);
  ensure(factory&&transaction.to?.toLowerCase()===factory&&factory===expectedFactory?.toLowerCase());
  const quote=decoded.quoteIndex?(useMulti?multiQuotes(chainId):pairQuotes(chainId)).find(p=>p.index===decoded.quoteIndex):chainById(chainId)?.quote;
  ensure(quote&&Number.isFinite(shownCapUsd)&&shownCapUsd>0&&Number.isFinite(selectedCapUsd)&&selectedCapUsd>0&&Number.isFinite(quoteUsd)&&quoteUsd>0);
  const exact=await readFactoryStart({chainId,quote,factory,steps:decoded.steps,request,quoteUsd});
  ensure(Math.abs(exact.capUsd/shownCapUsd-1)<=.02&&Math.abs(exact.capUsd/selectedCapUsd-1)<=.02);
  return {...decoded,...exact};
 }catch{throw Error(START_PRICE_HOLD);}
}
