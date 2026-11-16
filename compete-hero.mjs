import {validSchedule} from './compete-prizes.mjs';
import {COMPETE_BOARDS,competePeriods,countdown} from './compete-core.mjs';
import {usdPrize} from './compete-prize-card.mjs';
export function boardPrizeAmounts(schedule,board){return validSchedule(schedule)?schedule.boards[board].map(usdPrize):null;}
export function competitionHero(config,summary,now=Date.now()){
 let week;try{week=competePeriods(now,config?.firstWeekStart)[1];}catch{return {pool:null,poolLabel:'Prize pool refreshing',poolNote:'Refreshing',joined:null,countdown:'—',phase:'Refreshing'};}
 const schedule=config?.prizeSchedule,valid=validSchedule(schedule),amounts=valid?COMPETE_BOARDS.flatMap(b=>schedule.boards[b.id]):[],total=amounts.reduce((a,b)=>a+b,0),perps=valid?schedule.boards.perps.reduce((a,b)=>a+b,0):0;
 const live=config?.perps?.attribution==='enabled'&&Number.isSafeInteger(config.perps.openedAt)&&config.perps.openedAt>=0&&config.perps.openedAt<=now;
 const c=countdown(week.to,now),joined=summary?.weekFrom===week.from&&!summary?.refreshing&&Number.isSafeInteger(summary?.joinedTraders)&&summary.joinedTraders>=0?summary.joinedTraders:null;
 return {pool:valid?usdPrize(total):null,poolLabel:valid&&schedule.confirmed!==true?'Proposed week pool':"This week’s prize pool",poolNote:valid?(live?'3 boards · QHOOKS locked 30 days':`Spot ${usdPrize(total-perps)} · Perps ${usdPrize(perps)} when live`):'Prize configuration refreshing',joined,countdown:config?`${c.days}d ${String(c.hours).padStart(2,'0')}h ${String(c.minutes).padStart(2,'0')}m`:'—',phase:week.status==='upcoming'?'Opens Monday 00:00 UTC':'Week ends Monday 00:00 UTC',week};
}

// A confirmed weekly snapshot pins the runtime configuration that actually funds that week.
export function weeklyDisplayConfig(config,snapshots,now=Date.now()){
 let week;try{week=competePeriods(now,config?.firstWeekStart)[1];}catch{return config;}
 const plans=snapshots.filter(s=>s?.period?.id==='week'&&s.period.from===week.from&&s.period.to===week.to&&s.prizePlan?.from===week.from&&s.prizePlan?.to===week.to&&s.prizePlan.schedule?.confirmed===true&&validSchedule(s.prizePlan.schedule)).map(s=>s.prizePlan.schedule);
 if(!plans.length)return config;const same=s=>JSON.stringify(COMPETE_BOARDS.map(b=>s.boards[b.id]));
 return {...config,prizeSchedule:plans.every(p=>same(p)===same(plans[0]))?plans[0]:{invalid:true}};
}
