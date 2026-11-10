// Shared wording for the versioned profile, ranking and call record views.
const number=value=>Number.isSafeInteger(value)&&value>=0?String(value):'—';
export function scoreCoverageText(score){
 if(score?.version!==2)return'Timed checkpoints count from newer calls.';
 if(!score.coverage?.completeRecordSet)return'Incomplete record set · '+number(score.sample?.loaded)+' records loaded at the '+number(score.coverage?.recordLimit)+' record bound. Percentages and rank are withheld.';
 const statuses=score.sample?.dayStatuses||{},labels={'legacy-untimed':'market price only',late:'quote came late',missing:'refreshing',unavailable:'refreshing','index-incomplete':'refreshing',pending:'scoring after 24h'};
 const unknown=Object.entries(labels).filter(([key])=>statuses[key]>0).map(([key,label])=>number(statuses[key])+' '+label);
 return number(score.sample?.observed24h)+' observed / '+number(score.sample?.eligible)+' eligible / '+number(score.sample?.total)+' recorded calls'+(unknown.length?' · '+unknown.join(' · '):'');
}
export function scoreHeadline(score){
 if(score?.version!==2)return'Caller record';
 if(!score.coverage?.completeRecordSet)return'Caller record · scoring';
 return'Caller record · '+number(score.hits)+' hits / '+number(score.counted)+' timed 24h outcomes'+(score.hitRate==null?'':' · '+Math.round(score.hitRate*100)+'%');
}
// Public card states only: no internal method names. Before the checkpoint: "Scoring after 24h/7d". After it with
// no timed quote yet: "Refreshing…". A market price without a timed quote is shown but not counted.
export function checkpointView(call,horizon){
 const key=horizon==='day'?'price24h':'price7d',name=horizon==='day'?'24h':'7d',point=call?.scoreV2?.checkpoints?.[horizon];
 if(point?.status==='observed')return{label:name,price:point.price,status:'observed',observedAt:point.observedAt,note:'Observed '+new Date(point.observedAt).toLocaleString(),provenance:point.provenance};
 if(point?.status==='pending')return{label:name,price:null,status:'pending',observedAt:null,note:'Scoring after '+name};
 const market=call?.[key]??null;
 if(point?.status==='late'&&point.price>0)return{label:name,price:point.price,status:'late',observedAt:point.observedAt,note:'Quote came late · not counted'};
 if(market!=null)return{label:name,price:market,status:point?.status||'market',observedAt:null,note:'Market price · not counted'};
 return{label:name,price:null,status:point?.status||'refreshing',observedAt:null,note:'Refreshing…'};
}
