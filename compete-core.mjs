export const DAY=86400000,WEEK=7*DAY;
export const COMPETE_BOARDS=Object.freeze([{id:'pnl',name:'Biggest PnL ($)',metric:'Realized PnL'},{id:'return',name:'Best return (%)',metric:'Realized return'},{id:'perps',name:'Perps',metric:'Realized fill PnL'}]);
export const FAIR_PLAY_RULES=Object.freeze(['One person, one entry. Linked wallets merge.','Creator wash patterns go under review.','Clear linked-wallet self-trades go under review.','Tokens with less than $5K liquidity excluded.','Team and treasury wallets excluded.','Perps count verified QHooks-builder fills only, after actual trading fees; funding and unrealized PnL are excluded.','Native perps need $5K visible order-book depth on each side at first indexing.','Review top 10 before payout. Wash trading and manipulation disqualified. Agents follow the same Fair Play rules.','Void where prohibited.']);
export const APPROVED_COMPETE_POLICY=Object.freeze({returnCapital:'realized-basis',profitDenominator:'positive-realized'});
export const PRIZE_WORDING=Object.freeze(['USD prizes per board, converted at the main pool’s 7-day average.','Prizes in USD, paid in QHOOKS locked 30 days','One person, one entry; linked wallets merge.','Ties share rank and split that prize equally.','Review and freeze Monday 18:00 UTC; claim by Wednesday 23:59 UTC.','Unclaimed prizes roll to the following week.']);
// An explicit runtime cutoff governs production. Unset supports historical/offline fixtures.
export function firstPrizeWeek(value){
 if(value===undefined||value===null||value==='')return null;
 const from=typeof value==='number'?value:typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?Date.parse(value+'T00:00:00Z'):NaN;
 if(!Number.isSafeInteger(from)||from<0||new Date(from).getUTCDay()!==1||from%DAY||typeof value==='string'&&new Date(from).toISOString().slice(0,10)!==value)throw Error('invalid_first_prize_week');
 return from;
}
export function isPrizeWeek(period,firstWeekStart=null){const cutoff=firstPrizeWeek(firstWeekStart);return period?.id==='week'&&Number.isSafeInteger(period.from)&&period.from>=0&&period.from%DAY===0&&new Date(period.from).getUTCDay()===1&&period.to===period.from+WEEK&&(cutoff===null||period.from>=cutoff);}
export function competePeriods(now=Date.now(),firstWeekStart=null){
 const d=new Date(now),today=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()),monday=today-((d.getUTCDay()+6)%7)*DAY,cutoff=firstPrizeWeek(firstWeekStart),from=cutoff===null?monday:Math.max(monday,cutoff),started=cutoff===null||now>=cutoff;
 return [{id:'today',label:'Today',from:today,to:today+DAY,minVolumeUsd:50,minTrades:2,prizes:false},{id:'week',label:'This week',from,to:from+WEEK,minVolumeUsd:250,minTrades:5,prizes:started,...(cutoff===null?{}:{firstWeekStart:cutoff,status:started?'live':'upcoming'})},{id:'30d',label:'30 days',from:Math.max(0,now-30*DAY),to:now+1,minVolumeUsd:500,minTrades:10,prizes:false},{id:'all',label:'All time',from:0,to:now+1,minVolumeUsd:500,minTrades:10,prizes:false}];
}
export const weekId=from=>'week:'+new Date(from).toISOString().slice(0,10);
export const rollupKey=(period,board)=>(period.id==='week'?weekId(period.from):period.id)+':'+board;
export function archiveWeek(id,firstWeekStart=null){if(!/^\d{4}-\d{2}-\d{2}$/.test(id||''))return null;const from=Date.parse(id+'T00:00:00Z');if(!Number.isFinite(from)||new Date(from).toISOString().slice(0,10)!==id||new Date(from).getUTCDay()!==1)return null;const cutoff=firstPrizeWeek(firstWeekStart);if(cutoff!==null&&from<cutoff)return null;return {id:'week',label:'Past week',from,to:from+WEEK,minVolumeUsd:250,minTrades:5,prizes:true,...(cutoff===null?{}:{firstWeekStart:cutoff})};}
export function weekSchedule(from){return {winnersDay:new Date(from+WEEK).toISOString().slice(0,10),claimByDay:new Date(from+WEEK+2*DAY).toISOString().slice(0,10),closesAt:from+WEEK,holderSnapshotAt:from+WEEK,reviewFreezeAt:from+WEEK+18*3600000,claimByAt:from+WEEK+3*DAY-60000,unclaimed:'roll-to-next-week'};}
export function countdown(until,now=Date.now()){const seconds=Math.max(0,Math.floor((until-now)/1000));return {days:Math.floor(seconds/86400),hours:Math.floor(seconds/3600)%24,minutes:Math.floor(seconds/60)%60,seconds:seconds%60};}
