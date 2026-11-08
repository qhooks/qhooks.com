// Callout scoring core. Pure functions, no I/O. Phase 1 turns the result into points; phase 2 uses the same
// numbers to split the daily pool. 1 point = 1 US cent of follower profit after weights.
export const CALLOUT_RULES=Object.freeze({
 id:'qhooks-callouts-v1',
 windowMs:86400000,          // followers' buys within 24 h of the call count
 fullWeightCalls:3,          // calls 1-3 of a caller's UTC day count fully; call n>3 counts 1/(n-2)
 tinyCapUsd:[[25000,0.25],[100000,0.5]], // market cap at the call below these counts less
 diamondUsd:[[10000000,2],[1000000,1.5]],// "Diamond" multiplier for high-cap calls (highest first)
 holderMultiplier:1.25,      // QHOOKS holders: QFlywheel.isHolder, i.e. at least holderMin (1M at launch)
 minCostUsd:10,              // a follower's buys in the window must cost at least this (real deposits)
 minFollowAgeMs:86400000,    // follow must be at least 24 h old at the buy
 minWalletAgeMs:7*86400000,  // follower wallet first seen at least 7 days before the buy
 dailyCapPoints:100000,      // per caller per day ($1,000 of weighted follower profit)
});
const DAY=86400000;
export const utcDay=ms=>new Date(Math.floor(ms/DAY)*DAY).toISOString().slice(0,10);
export const dayBounds=day=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(day||''))throw Error('invalid_day');const start=Date.parse(day+'T00:00:00Z');if(!Number.isFinite(start))throw Error('invalid_day');return{start,end:start+DAY};};
export function frequencyWeight(rank,rules=CALLOUT_RULES){return rank<=rules.fullWeightCalls?1:1/(rank-rules.fullWeightCalls+1);}
export function capWeight(mcapUsd,rules=CALLOUT_RULES){
 if(!(mcapUsd>0))return{weight:rules.tinyCapUsd[0][1],label:'unknown_cap'};
 for(const [min,w]of rules.diamondUsd)if(mcapUsd>=min)return{weight:w,label:'diamond'};
 for(const [max,w]of rules.tinyCapUsd)if(mcapUsd<max)return{weight:w,label:'small_cap'};
 return{weight:1,label:null};
}
// Profit of one follower's position opened in the call window, marked at `markPrice` (quote per token).
// Sells after the first counted buy realize part of the bought tokens (average cost); sells beyond the
// bought amount are ignored (they sell tokens bought outside the call).
export function positionProfit(trades,{from,to,markAt,markPrice}){
 let bought=0,cost=0,sold=0,proceeds=0,first=null;
 for(const t of [...trades].sort((a,b)=>a.ts-b.ts)){
  if(t.ts>markAt)break;
  if(t.buy){if(t.ts>=from&&t.ts<to){bought+=t.token;cost+=t.quote;first??=t.ts;}continue;}
  if(first===null||t.ts<first)continue;
  const open=bought-sold;if(open<=0)continue;const n=Math.min(open,t.token);sold+=n;proceeds+=t.quote*(n/t.token);
 }
 if(!bought)return null;
 const held=bought-sold,marked=held*(markPrice>0?markPrice:0);
 return{bought,cost,sold,realized:proceeds,marked,profit:proceeds+marked-cost,firstBuyAt:first};
}
// calls: [{id,caller,marketKey,at,mcapUsd,held,scored}] (scored=false for boards without a trade index)
// follows: Map caller -> [{follower,since}]
// tradesOf(marketKey, follower) -> [{ts,buy,token,quote,price}]
// mark(marketKey) -> {price, quoteUsd}
// excluded(caller, follower) -> reason|null (same person, funded from the caller, unchecked lineage)
// firstSeen(follower) -> ms|null ; holder(caller) -> boolean
export function scoreCalls({calls,follows,tradesOf,mark,excluded=()=>null,firstSeen=()=>null,holder=()=>false,markAt,rules=CALLOUT_RULES}){
 const ranks=new Map(),rankOf=new Map();
 for(const c of [...calls].sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id))){const k=c.caller+'|'+utcDay(c.at),n=(ranks.get(k)||0)+1;ranks.set(k,n);rankOf.set(c.id,n);}
 const byCaller=new Map();
 for(const c of calls){
  const row={id:c.id,marketKey:c.marketKey,at:c.at,rank:rankOf.get(c.id),followersCounted:0,followersSkipped:{},profitUsd:0,weight:0,points:0,labels:[]};
  const skip=r=>{row.followersSkipped[r]=(row.followersSkipped[r]||0)+1;};
  if(!c.held)row.labels.push('not_held');else if(c.scored===false)row.labels.push('not_tracked');
  else{
   const m=mark(c.marketKey)||{};const usd=m.quoteUsd>0?m.quoteUsd:0;let net=0;
   for(const f of follows.get(c.caller)||[]){
    if(f.follower===c.caller){skip('self');continue;}
    const trades=tradesOf(c.marketKey,f.follower)||[];
    const p=positionProfit(trades,{from:c.at,to:c.at+rules.windowMs,markAt,markPrice:m.price});
    if(!p)continue;
    if(f.since>p.firstBuyAt-rules.minFollowAgeMs){skip('new_follow');continue;}
    const seen=firstSeen(f.follower);if(!(seen>0)||seen>p.firstBuyAt-rules.minWalletAgeMs){skip('new_wallet');continue;}
    if(p.cost*usd<rules.minCostUsd){skip('small_buy');continue;}
    const why=excluded(c.caller,f.follower);if(why){skip(why);continue;}
    row.followersCounted++;net+=p.profit*usd;
   }
   row.profitUsd=Math.round(net*100)/100;
   const cap=capWeight(c.mcapUsd,rules);if(cap.label)row.labels.push(cap.label);
   row.weight=frequencyWeight(row.rank,rules)*cap.weight*(holder(c.caller)?rules.holderMultiplier:1);
   if(holder(c.caller))row.labels.push('holder');
   row.points=Math.max(0,Math.floor(row.profitUsd*100*row.weight));
  }
  if(!byCaller.has(c.caller))byCaller.set(c.caller,[]);byCaller.get(c.caller).push(row);
 }
 const callers=[...byCaller].map(([caller,rows])=>{const raw=rows.reduce((s,r)=>s+r.points,0);return{caller,points:Math.min(raw,rules.dailyCapPoints),capped:raw>rules.dailyCapPoints,calls:rows};})
  .sort((a,b)=>b.points-a.points||a.caller.localeCompare(b.caller));
 return{method:rules.id,markAt,callers,totalPoints:callers.reduce((s,c)=>s+c.points,0)};
}
// Phase 2 helper: split `pool` (integer base units) by points, largest-remainder, never over `pool`.
export function splitPool(callers,pool,{shareCap=0.25}={}){
 const total=callers.reduce((s,c)=>s+c.points,0);if(!total||pool<=0n)return[];
 const capUnits=BigInt(Math.floor(Number(pool)*shareCap));
 return callers.filter(c=>c.points>0).map(c=>{let amount=pool*BigInt(c.points)/BigInt(total);if(amount>capUnits)amount=capUnits;return{caller:c.caller,amount};});
}
