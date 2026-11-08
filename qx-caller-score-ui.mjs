// Shared wording for the versioned profile, ranking and call record views.
const number=value=>Number.isSafeInteger(value)&&value>=0?String(value):'—';
export function scoreCoverageText(score){
 if(score?.version!==2)return'Legacy calculation · checkpoint timing is unavailable.';
 if(!score.coverage?.completeRecordSet)return'Incomplete record set · '+number(score.sample?.loaded)+' records loaded at the '+number(score.coverage?.recordLimit)+' record bound. Percentages and rank are withheld.';
 const statuses=score.sample?.dayStatuses||{},labels={'legacy-untimed':'legacy untimed',late:'late',missing:'not observed',unavailable:'source unavailable','index-incomplete':'index incomplete',pending:'pending'};
 const unknown=Object.entries(labels).filter(([key])=>statuses[key]>0).map(([key,label])=>number(statuses[key])+' '+label);
 return number(score.sample?.observed24h)+' observed / '+number(score.sample?.eligible)+' eligible / '+number(score.sample?.total)+' recorded calls'+(unknown.length?' · '+unknown.join(' · '):'');
}
export function scoreHeadline(score){
 if(score?.version!==2)return'Legacy caller record';
 if(!score.coverage?.completeRecordSet)return'Caller record v2 · score withheld';
 return'Caller record v2 · '+number(score.hits)+' hits / '+number(score.counted)+' timed 24h outcomes'+(score.hitRate==null?'':' · '+Math.round(score.hitRate*100)+'%');
}
export function checkpointView(call,horizon){
 const key=horizon==='day'?'price24h':'price7d',name=horizon==='day'?'24h':'7d',point=call?.scoreV2?.checkpoints?.[horizon];
 if(point?.status==='observed')return{label:name,price:point.price,status:'observed',observedAt:point.observedAt,note:'Observed '+new Date(point.observedAt).toLocaleString(),provenance:point.provenance};
 if(!point||point.status==='legacy-untimed')return{label:'Legacy '+name,price:call?.[key]??null,status:'legacy-untimed',observedAt:null,note:'Timing unavailable · unscored in v2'};
 return{label:name,price:null,status:point.status,observedAt:point.observedAt,note:({late:'Late observation · unscored',pending:'Checkpoint pending',missing:'No timed quote observed',unavailable:'Source unavailable','index-incomplete':'Index coverage incomplete'})[point.status]||'Timing unavailable'};
}
