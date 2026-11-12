// Callout scoring core. Pure functions, no I/O. Points split the daily pool (10% of terminal fees).
// v3 (Randall 2026-11-12, "pattern pumpfun model … improve it a little"): 1 point = 1 US cent of weighted followers'
// profit. A follower is a wallet that bought the called token because of the call within 24 h: through the call's Buy
// button or call link (recorded per call), or a wallet following the caller. The caller's own stake gain is shown on
// the card as information and never counts. Ours on top: ×1.25 while the caller still holds the called token (read on
// chain at scoring), no points on your own launch, the low-cap weight, full weight for the first 3 calls a day only.
import {splitByWeight} from './qdrops-core.mjs';
export const CALLOUT_RULES=Object.freeze({
 id:'qhooks-callouts-v3',
 ownStakeCapUsd:1000,        // information only: the stake shown on the card counts up to this much USD at the call price
 windowMs:86400000,          // followers' buys within 24 h of the call count
 refSlackMs:60000,           // a call-link buyer's buys count from a minute before they opened the link
 fullWeightCalls:3,          // calls 1-3 of a caller's UTC day count fully; call n>3 counts 1/(n-2)
 tinyCapUsd:[[25000,0.25],[100000,0.5]], // market cap at the call below these counts less
 diamondUsd:[[10000000,2],[1000000,1.5]],// "Diamond" multiplier for high-cap calls (highest first)
 holderMultiplier:1.25,      // the caller still holds the called token when the day is scored (balanceOf on chain)
 minCostUsd:10,              // a follower's buys in the window must cost at least this (real deposits)
 minFollowAgeMs:86400000,    // a follow must be at least 24 h old at the buy (call-link buyers need no follow)
 minWalletAgeMs:7*86400000,  // follower wallet first seen at least 7 days before the buy
 dailyCapPoints:100000,      // per caller per day ($1,000 of weighted follower profit)
 shareCap:0.25,              // one caller's share of a day's pool; the rest is shared again (see poolShares)
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
// calls: [{id,caller,marketKey,at,mcapUsd,held,creator,holds,own}]
//   held: a holding was proven at the call (unheld calls score 0); creator: the caller (or a wallet linked to them)
//   created the token, so 0 points; holds: still holds the called token now (true/false, null = couldn't read);
//   own: {stakeUsd, gainUsd} | null, shown on the card only.
// follows: Map caller -> [{follower,since}] ; refs: Map callId -> [{follower,seenAt}] (opened this call's Buy/link)
// tradesOf(marketKey, follower) -> [{ts,buy,token,quote,price}] ; mark(marketKey) -> {price, quoteUsd}
// excluded(caller, follower) -> reason|null (same person, funded from the caller, unchecked lineage)
// firstSeen(follower) -> ms|null
export function scoreCalls({calls,follows,refs=new Map(),tradesOf,mark,excluded=()=>null,firstSeen=()=>null,markAt,rules=CALLOUT_RULES}){
 const ranks=new Map(),rankOf=new Map();
 for(const c of [...calls].sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id))){const k=c.caller+'|'+utcDay(c.at),n=(ranks.get(k)||0)+1;ranks.set(k,n);rankOf.set(c.id,n);}
 const byCaller=new Map();
 for(const c of calls){
  const row={id:c.id,marketKey:c.marketKey,at:c.at,rank:rankOf.get(c.id),followersCounted:0,viaLink:0,followersSkipped:{},profitUsd:0,stakeUsd:null,ownGainUsd:0,weight:0,points:0,labels:[]};
  if(c.own){row.stakeUsd=Math.round(c.own.stakeUsd*100)/100;row.ownGainUsd=Math.round(c.own.gainUsd*100)/100;}
  const skip=r=>{row.followersSkipped[r]=(row.followersSkipped[r]||0)+1;};
  if(!c.held)row.labels.push('not_held');
  else if(c.creator)row.labels.push('creator');
  else{
   const m=mark(c.marketKey)||{},usd=m.quoteUsd>0?m.quoteUsd:0,end=c.at+rules.windowMs;
   // Who bought because of this call: call-link buyers (from when they opened it) and followers (follow at least 24 h old).
   const cand=new Map();
   for(const r of refs.get(c.id)||[])if(r.seenAt<end)cand.set(r.follower,{from:Math.max(c.at,r.seenAt-rules.refSlackMs),link:true});
   for(const f of follows.get(c.caller)||[])if(!cand.has(f.follower))cand.set(f.follower,{from:c.at,since:f.since,link:false});
   let net=0;
   for(const [follower,how] of cand){
    if(follower===c.caller){skip('self');continue;}
    const p=positionProfit(tradesOf(c.marketKey,follower)||[],{from:how.from,to:end,markAt,markPrice:m.price});
    if(!p)continue;
    if(!how.link&&how.since>p.firstBuyAt-rules.minFollowAgeMs){skip('new_follow');continue;}
    const seen=firstSeen(follower);if(!(seen>0)||seen>p.firstBuyAt-rules.minWalletAgeMs){skip('new_wallet');continue;}
    if(p.cost*usd<rules.minCostUsd){skip('small_buy');continue;}
    const why=excluded(c.caller,follower);if(why){skip(why);continue;}
    row.followersCounted++;if(how.link)row.viaLink++;net+=p.profit*usd;
   }
   row.profitUsd=Math.round(net*100)/100;
   const cap=capWeight(c.mcapUsd,rules);if(cap.label)row.labels.push(cap.label);
   if(c.holds===true)row.labels.push('still_holds');else if(c.holds==null)row.labels.push('hold_unchecked');
   row.weight=frequencyWeight(row.rank,rules)*cap.weight*(c.holds===true?rules.holderMultiplier:1);
   row.points=Math.max(0,Math.floor(Math.round(Math.max(0,row.profitUsd)*100)*row.weight+1e-9));
  }
  if(!byCaller.has(c.caller))byCaller.set(c.caller,[]);byCaller.get(c.caller).push(row);
 }
 const callers=[...byCaller].map(([caller,rows])=>{const raw=rows.reduce((s,r)=>s+r.points,0);return{caller,points:Math.min(raw,rules.dailyCapPoints),capped:raw>rules.dailyCapPoints,calls:rows};})
  .sort((a,b)=>b.points-a.points||a.caller.localeCompare(b.caller));
 const shares=poolShares(callers,rules.shareCap);for(const c of callers)c.poolShare=shares.get(c.caller)||0;
 return{method:rules.id,markAt,callers,totalPoints:callers.reduce((s,c)=>s+c.points,0)};
}
/// Each caller's share of the day's pool, the same split QDrops pays (splitByWeight with redistribute + remainder):
/// by points, at most shareCap each while others can take the rest, and the whole pool when everyone is at the cap.
export function poolShares(callers,shareCap=CALLOUT_RULES.shareCap){
 const SCALE=1000000000000n,out=new Map();
 const rows=callers.filter(c=>c.points>0).map(c=>({account:c.caller,weight:BigInt(c.points)}));
 for(const r of splitByWeight(rows,SCALE,{shareCap,redistribute:true,remainder:true}))out.set(r.account,Math.round(Number(r.amount*1000000n/SCALE))/1000000);
 return out;
}
/// The caller's own stake result. atUnits: tokens held at the call; nowUnits: held now (same base units); callUsd / nowUsd:
/// USD per whole token at the call and now. Only what they still hold counts, and the stake counts up to the cap.
export function ownResult({atUnits,nowUnits,decimals=18,callUsd,nowUsd},rules=CALLOUT_RULES){
 const at=Number(BigInt(atUnits||0))/10**decimals,now=Number(BigInt(nowUnits||0))/10**decimals;
 if(!(at>0)||!(callUsd>0)||!(nowUsd>0))return null;
 const heldShare=Math.min(1,now/at),stakeUsd=Math.min(at*callUsd,rules.ownStakeCapUsd),move=nowUsd/callUsd;
 return{stakeUsd,heldShare,move,gainUsd:stakeUsd*heldShare*(move-1)};
}
// Phase 2 helper: split `pool` (integer base units) by points, largest-remainder, never over `pool`.
export function splitPool(callers,pool,{shareCap=0.25}={}){
 const total=callers.reduce((s,c)=>s+c.points,0);if(!total||pool<=0n)return[];
 const capUnits=BigInt(Math.floor(Number(pool)*shareCap));
 return callers.filter(c=>c.points>0).map(c=>{let amount=pool*BigInt(c.points)/BigInt(total);if(amount>capUnits)amount=capUnits;return{caller:c.caller,amount};});
}
