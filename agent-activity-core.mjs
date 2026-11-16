export const AGENT_ACTIVITY_MINIMUM=20;
export function agentActivityView(value,{now=Date.now()}={}){
 const a=value?.activity;
 if(value?.status!=='ok'||value?.coverage?.lowerBound||!a||a.window!=='utc-week'||!/^\d{4}-\d{2}-\d{2}$/.test(a.from||'')||!/^\d{4}-\d{2}-\d{2}$/.test(a.through||''))return null;
 const sampled=Date.parse(value.sampledAt),today=new Date(now).toISOString().slice(0,10),day=new Date(now);day.setUTCHours(0,0,0,0);day.setUTCDate(day.getUTCDate()-(day.getUTCDay()+6)%7);
 if(!Number.isFinite(sampled)||sampled>now+15000||now-sampled>900000||a.from!==day.toISOString().slice(0,10)||a.through!==today)return null;
 const fields=['quotesServed','launchesPrepared','tradesPrepared','qproofChecks'];if(fields.some(k=>!Number.isSafeInteger(a[k])||a[k]<0))return null;
 if(fields.reduce((n,k)=>n+a[k],0)<AGENT_ACTIVITY_MINIMUM)return null;
 return {from:a.from,through:a.through,includesTests:value.coverage?.includesTests===true,metrics:fields.map((key,i)=>({key,count:a[key],label:['quotes served','launch plans','trade plans','QProof checks'][i]}))};
}
