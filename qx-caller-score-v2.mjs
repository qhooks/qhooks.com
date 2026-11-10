// Price outcomes and observed indexed sales are independent. No wallet authority.
export const CALLER_SCORE_METHOD=Object.freeze({id:'qhooks-caller-price-v2',version:2,minimumObserved:5,maxLatenessMs:3600000,scope:'existing published call records',horizons:Object.freeze({day:86400000,week:604800000})});
const finite=value=>typeof value==='number'&&Number.isFinite(value),positive=value=>finite(value)&&value>0;
export function timedCheckpoint({at,horizon,observation=null,source='native-index',index=null,now=Date.now()}={}){
 const targetAt=at+horizon,latestAllowedAt=targetAt+CALLER_SCORE_METHOD.maxLatenessMs,base={targetAt,latestAllowedAt,observedAt:null,price:null,source,status:'unavailable',provenance:null};
 if(!Number.isSafeInteger(at)||at<=0||!Number.isSafeInteger(targetAt))return base;
 if(now<targetAt)return{...base,status:'pending'};
 if(source==='legacy-untimed')return{...base,status:'legacy-untimed'};
 if(!observation)return{...base,status:index?.available?index.gaps===0?'missing':'index-incomplete':'unavailable'};
 const observedAt=Math.round(Number(observation.ts)*1000),price=Number(observation.price);
 if(!Number.isSafeInteger(observedAt)||observedAt<targetAt||observedAt>now||!positive(price))return base;
 // Outside tokens: the call's main pool read on chain at the checkpoint by the call-quotes cron (block, no single trade).
 if(source==='pool-read'){const provenance={marketKey:observation.marketKey,pool:observation.pool,block:observation.block};if(!Number.isSafeInteger(provenance.block)||provenance.block<0||!/^0x[0-9a-f]{40}$/i.test(provenance.pool||''))return base;const observed={...base,observedAt,price,provenance};return observedAt>latestAllowedAt?{...observed,status:'late'}:{...observed,status:'observed'};}
 const provenance={marketKey:observation.marketKey,block:observation.block,index:observation.idx,transaction:observation.tx};
 if(!Number.isSafeInteger(provenance.block)||provenance.block<0||!Number.isSafeInteger(provenance.index)||provenance.index<0||!/^0x[0-9a-f]{64}$/i.test(provenance.transaction||''))return base;
 const observed={...base,observedAt,price,provenance};
 if(observedAt>latestAllowedAt)return{...observed,status:'late'};
 if(!index?.available||!Number.isSafeInteger(index.cursor)||index.cursor<provenance.block||index.gaps!==0)return{...observed,status:'index-incomplete'};
 return{...observed,status:'observed'};
}
export function callerOutcomeV2(record,{now=Date.now()}={}){
 const entryPrice=Number(record.entryPrice),at=Number(record.at),labels=Array.isArray(record.labels)?record.labels:[],excluded=labels.includes('creator_call')?'creator':labels.includes('linked')?'linked':null;
 const source=record.kind==='token'?'legacy-untimed':record.kind==='pool-read-token'?'pool-read':'native-index',entryValid=positive(entryPrice)&&Number.isSafeInteger(at)&&at>0&&at<=now;
 const checkpoint=horizon=>timedCheckpoint({at,horizon,observation:record[horizon===CALLER_SCORE_METHOD.horizons.day?'day':'week'],source,index:record.index,now});
 const day=checkpoint(CALLER_SCORE_METHOD.horizons.day),week=checkpoint(CALLER_SCORE_METHOD.horizons.week),eligible=entryValid&&!excluded;
 return{method:CALLER_SCORE_METHOD.id,version:2,id:record.id,marketKey:record.marketKey,entry:{price:entryValid?entryPrice:null,publishedAt:entryValid?at:null,observedAt:null,source:'stored-publication-record'},eligible,excluded:entryValid?excluded:'invalid-entry',checkpoints:{day,week},hit:eligible&&day.status==='observed'?day.price>entryPrice:null,indexedFirstDaySales:record.indexedFirstDaySales||{status:record.kind==='token'?'unsupported':'unavailable'},relationship:{labels:labels.filter(label=>['creator_call','linked'].includes(label)),coverage:record.kind==='token'?'unsupported':'legacy-publication-labels; absence is not attested independence'}};
}
export function callerSummaryV2(outcomes,{complete=true,limit=2000,now=Date.now()}={}){
 const eligible=outcomes.filter(row=>row.eligible),day=eligible.filter(row=>row.checkpoints.day.status==='observed'),quality=day.filter(row=>row.checkpoints.week.status==='observed'),hits=day.filter(row=>row.hit===true).length,clamp=value=>Math.max(-1,Math.min(2,value));
 const moves=quality.map(row=>(clamp(row.checkpoints.day.price/row.entry.price-1)+clamp(row.checkpoints.week.price/row.entry.price-1))/2).sort((a,b)=>a-b),middle=Math.floor(moves.length/2);
 const statuses={};for(const row of eligible){const status=row.checkpoints.day.status;statuses[status]=(statuses[status]||0)+1;}
 return{method:CALLER_SCORE_METHOD.id,version:2,generatedAt:now,state:complete?'complete-record-set':'incomplete-record-set',rankEligible:complete&&day.length>=CALLER_SCORE_METHOD.minimumObserved,calls:complete?outcomes.length:null,eligible:complete?eligible.length:null,counted:day.length,hits,hitRate:complete&&day.length?hits/day.length:null,quality:complete&&moves.length?(moves.length%2?moves[middle]:(moves[middle-1]+moves[middle])/2):null,qualityN:quality.length,sample:{total:complete?outcomes.length:null,eligible:complete?eligible.length:null,loaded:outcomes.length,eligibleInLoadedSet:eligible.length,observed24h:day.length,completedQuality:quality.length,excludedCreator:outcomes.filter(row=>row.excluded==='creator').length,excludedLinked:outcomes.filter(row=>row.excluded==='linked').length,invalidEntry:outcomes.filter(row=>row.excluded==='invalid-entry').length,dayStatuses:statuses},coverage:{completeRecordSet:complete,recordLimit:limit,scope:CALLER_SCORE_METHOD.scope,checkpointCoverageComplete:eligible.every(row=>['observed','pending'].includes(row.checkpoints.day.status))}};
}
