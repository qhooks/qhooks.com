import {COMPETE_BOARDS,WEEK,weekId} from './compete-core.mjs';
import {REWARDS_BUDGET_ID,FIXED_BOARD_QHOOKS} from './rewards-budget.mjs';
export const PRIZE_COPY='Fixed QHOOKS allocations. QDrops claims have no post-claim token lock.';
export const PRIZE_POOL=Object.freeze({chainId:'4663',token:'0x20429af7ca3b0ce4d99edbaa0693f26c5df05195',poolId:'0x007d77e43164a5d7d1251457f47f556c2be7f865942c7ec7a91c3cbbf50e53fe',quote:'ETH',decimals:18});
export const QUOTE_MAX_AGE=300000;
const E18=10n**18n,E36=E18*E18;
// USD configuration is deliberately rejected; it cannot approve the replacement plan.
export function prizeSchedule(env={}){
 const fallback={version:2,policyId:REWARDS_BUDGET_ID,budgetId:REWARDS_BUDGET_ID,confirmed:false,currency:'QHOOKS',decimals:18,lockDays:0,lockSupported:false,distributionMode:'qdrops',lockStatus:'unsupported_in_qdrops',boards:{},source:'configuration_required'};
 if(env.QHOOKS_COMPETE_PRIZE_USD)return {...fallback,invalid:true,source:'superseded_usd_configuration'};
 if(!env.QHOOKS_COMPETE_PRIZE_QHOOKS)return {...fallback,invalid:true};
 try{const raw=JSON.parse(env.QHOOKS_COMPETE_PRIZE_QHOOKS);if(!raw||Object.keys(raw).length!==3||!COMPETE_BOARDS.every(b=>Array.isArray(raw[b.id])&&raw[b.id].length===3&&raw[b.id].every((v,i)=>v===FIXED_BOARD_QHOOKS[i])))throw Error();
  return {...fallback,confirmed:env.QHOOKS_COMPETE_PRIZES_CONFIRMED==='on',source:'configured_fixed_qhooks',boards:Object.fromEntries(COMPETE_BOARDS.map(b=>[b.id,[...raw[b.id]]]))};
 }catch{return {...fallback,invalid:true,source:'invalid_configuration'};}
}
export function validSchedule(s){return s?.version===2&&s.policyId===REWARDS_BUDGET_ID&&s.budgetId===REWARDS_BUDGET_ID&&s.currency==='QHOOKS'&&s.decimals===18&&s.lockDays===0&&s.lockSupported===false&&s.distributionMode==='qdrops'&&s.lockStatus==='unsupported_in_qdrops'&&!s.invalid&&COMPETE_BOARDS.every(b=>Array.isArray(s.boards?.[b.id])&&s.boards[b.id].length===3&&s.boards[b.id].every((n,i)=>n===FIXED_BOARD_QHOOKS[i]));}
export function rankQhooksRaw(schedule,board,rank,{share=1}={}){
 if(!validSchedule(schedule)||!COMPETE_BOARDS.some(b=>b.id===board)||!Number.isInteger(rank)||rank<1||rank>3||!Number.isSafeInteger(share)||share<1)return null;
 return (BigInt(schedule.boards[board][rank-1])*E18/BigInt(share)).toString();
}
// Preserve decimal/scientific notation from stored REAL values without floating-point summation.
export function decimal18(value){
 if(typeof value!=='number'||!Number.isFinite(value)||value<=0)throw Error('invalid_price');
 const [mantissa,exp='0']=String(value).toLowerCase().split('e'),[whole,frac='']=mantissa.split('.'),shift=18+Number(exp)-frac.length,digits=BigInt(whole+frac);
 const n=shift>=0?digits*10n**BigInt(shift):digits/10n**BigInt(-shift);if(n<=0n)throw Error('price_precision');return n;
}
export function integratePrizeTwap({from,to,through,events,quotes,coverage}){
 if(!Number.isSafeInteger(from)||new Date(from).getUTCDay()!==1||from%86400000!==0||to!==from+WEEK||!Number.isSafeInteger(through)||through<=from||through>to||coverage?.complete!==true)throw Error('twap_coverage');
 const ordered=[...events].sort((a,b)=>a.at-b.at||a.block-b.block||a.idx-b.idx),rates=[...quotes].sort((a,b)=>a.at-b.at);
 if(!ordered.length||!rates.length||ordered[0].at>from||rates[0].at>from)throw Error('twap_boundary');
 if(ordered.some((e,i)=>!Number.isSafeInteger(e.at)||!Number.isSafeInteger(e.block)||!Number.isSafeInteger(e.idx)||(i&&e.at===ordered[i-1].at&&e.block===ordered[i-1].block&&e.idx===ordered[i-1].idx))||rates.some((q,i)=>!Number.isSafeInteger(q.at)||(i&&q.at===rates[i-1].at)))throw Error('twap_order');
 let ei=0,qi=0,at=from,area=0n;
 while(at<through){
  while(ei+1<ordered.length&&ordered[ei+1].at<=at)ei++;
  while(qi+1<rates.length&&rates[qi+1].at<=at)qi++;
  const e=ordered[ei],q=rates[qi],end=Math.min(through,ordered[ei+1]?.at??through,rates[qi+1]?.at??through);
  if(e.at>at||q.at>at||end<=at||end-q.at>QUOTE_MAX_AGE)throw Error('twap_quote_gap');
  // Pool prices are exact sqrtPrice-derived decimals at capture; never trade execution ratios.
  const price=typeof e.priceE18==='string'&&/^[1-9]\d{0,77}$/.test(e.priceE18)?BigInt(e.priceE18):decimal18(e.price);
  area+=price*decimal18(q.price)*BigInt(end-at);at=end;
 }
 const duration=through-from;if(area<=0n)throw Error('invalid_twap');
 return {version:1,...PRIZE_POOL,week:weekId(from),from,to,through,durationMs:duration,areaUsdE36Ms:area.toString(),priceUsd:Number(area)/Number(E36)/duration,fullWeek:through===to,status:through===to?'closed':'provisional',coverage};
}
export function validPrizeTwap(t,{from,to,full=false}={}){
 return t?.version===1&&t.chainId===PRIZE_POOL.chainId&&t.token===PRIZE_POOL.token&&t.poolId===PRIZE_POOL.poolId&&t.from===from&&t.to===to&&to===from+WEEK&&t.through>from&&t.through<=to&&t.durationMs===t.through-from&&t.coverage?.complete===true&&typeof t.areaUsdE36Ms==='string'&&/^[1-9]\d{0,99}$/.test(t.areaUsdE36Ms)&&(!full||t.fullWeek===true&&t.through===to&&t.status==='closed');
}
export function prizeQhooksRaw(usdCents,twap,{from=twap?.from,to=twap?.to,share=1,full=false}={}){
 if(!Number.isSafeInteger(usdCents)||usdCents<=0||!Number.isSafeInteger(share)||share<1||!validPrizeTwap(twap,{from,to,full}))return null;
 // Divide the USD rank prize equally first; only the final atomic-token result is floored.
 return (BigInt(usdCents)*E18*E36*BigInt(twap.durationMs)/(100n*BigInt(share)*BigInt(twap.areaUsdE36Ms))).toString();
}
export function prizeView(plan,board){
 const schedule=plan?.schedule,usable=validSchedule(schedule);
 return {schedule,usable,twap:null,ranks:usable?schedule.boards[board]?.map((qhooks,i)=>({rank:i+1,qhooks,qhooksRaw:rankQhooksRaw(schedule,board,i+1)}))||[]:[]};
}
