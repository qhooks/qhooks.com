import{discoveryExcludedAsset}from'./qx-major-assets.mjs';
import {chainById} from './chains.mjs';
import {stockPair} from './full-launch/packages/multichain-launch/stock-pairs.mjs';
import {WINDOWS} from './qx-discovery-model.mjs';

const key=r=>String(r.chainId)+':'+(r.chainId==='solana'?r.token?.address:String(r.token?.address||'').toLowerCase());
const SOL_QUOTES=new Set(['So11111111111111111111111111111111111111112','EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v','Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB']);
const number=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;

// These assets remain searchable. They do not occupy meme-discovery slots: exact majors,
// Robinhood stock pairs, Coinbase-wrapped assets and tokenized stocks (qx-major-assets.mjs).
export function discoveryCandidate(row){
 const chain=String(row.chainId),address=row.token?.address;
 if(!address||stockPair(chain,address)||discoveryExcludedAsset(row))return false;
 if(chain==='solana')return !SOL_QUOTES.has(address);
 const c=chainById(chain),a=address.toLowerCase();
 return ![c?.wrappedNative,c?.usdc,c?.quote?.address].some(q=>q&&q.toLowerCase()===a);
}

// Use an observed window, never a scaled estimate of a longer one. A known zero
// stays zero; an absent window can use the largest available shorter window.
export function observedActivity(row,window='h24'){
 const duration=WINDOWS.find(([k])=>k===window)?.[2]||86400;
 for(const [w,,seconds] of [...WINDOWS].reverse()){
  if(seconds>duration)continue;
  const t=row.txns?.[w],buys=number(t?.buys),sells=number(t?.sells);
  if(buys!==null&&sells!==null)return buys+sells;
 }
 return null;
}

const finite=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
const explicitRange=value=>value!==null&&value!==undefined&&String(value).trim()!==''&&Number.isFinite(Number(value))&&Number(value)>=0;
export function trendingCandidate(row,{window='h24',filters={}}={}){
 if(!discoveryCandidate(row))return false;
 const liquidity=number(row.liquidityUsd),floor=explicitRange(filters.liquidityMin)||explicitRange(filters.liquidityMax)?0:1000;
 if(liquidity===null||liquidity<floor)return false;
 return ![finite(row.change?.h24),finite(row.change?.[window])].some(move=>move!==null&&move<-.9);
}

// ---- D2 trending score (2026-11-18) -------------------------------------------------------------
// One score per window, computed over the candidate set:
//   0.35·z(log txns_w) + 0.25·z(log vol_w) + 0.20·z(log makers_w) + 0.10·clamp(change_w, −50%, +300%) + 0.10·acceleration
// z-scores are taken among the rows that carry the input; a row without an input gets 0 for that term (never invented).
// Absent window fields fall back to the nearest observed SHORTER window, then the nearest longer one (a shorter window
// under-reads, a longer one would inflate); `inputs` records which window each term used.
// Acceleration compares txns at the window used with the per-window average of the rest of the next longer observed window.
// Rows older than 30 days lose AGE_DECAY per doubling of age past 30 days. Boosts never enter the score.
export const TREND_WEIGHTS=Object.freeze({txns:.35,volume:.25,makers:.20,change:.10,acceleration:.10});
// D1 ranking rules (2026-11-18, lead-approved), all per chain cohort:
//  - wash: 24 h volume above washTurnover× liquidity, or txns per maker above washMakerRatio× the chain median (when
//    makers exist), keeps only washFactor of its positive activity terms;
//  - copycat: a contract whose name+ticker matches an older, deeper contract on the same chain loses copycatPenalty,
//    unless it has more unique makers than that contract;
//  - age decay applies only to tokens older than 30 days whose window txns are at or below the chain median
//    (an established token that is actively trading is legitimate trending, as on DexScreener).
//  - fake volume: 24 h volume per trade above washTicket× the chain median (e.g. $50M on zero trades) is wash too.
// Per-chain cohort values where a chain's trending population differs (lead call, 2026-11-18): Robinhood Chain's
// established names (CASHCAT, PONS, HOOKR …) trade steadily against hundreds of bot-made launches, so RH weights depth
// more and decays only tokens below its median; elsewhere only tokens below the 90th percentile of their chain decay,
// which keeps All's top 20 young (≤3 older than 30 days on the 11-17 fixtures).
export const RANK_TUNING=Object.freeze({washTurnover:60,washMakerRatio:3,washTicket:50,washFactor:.5,copycatPenalty:.75,
 liquidity:Object.freeze({default:.15,'4663':.6}),activeQuantile:Object.freeze({default:.9,'4663':.5}),
 makers:Object.freeze({shift:.15,churnCap:3,churnRatio:3,churnPenalty:.25,churnMax:1,youngHours:24,young:Object.freeze({txns:.10,volume:.15,makers:.45,breadth:.10}),repeat:.05,liquidityBreadth:.5})});
// Batch F (2026-11-18): unique traders ("makers": GeckoTerminal unique_traders, buyers, sellers per window), all per chain
// cohort, and only where a row carries makers for the window its txns came from. A row without makers scores exactly as
// rank v2 (nothing is invented):
//  - churn-capped trades: txns count at most churnCap× (makers × the chain's median trades-per-trader), so one bot
//    looping 5,000 swaps through a few wallets counts like a busy token, not like 5,000 traders;
//  - makers weigh more where known: `shift` of the txns weight moves to the makers term;
//  - launches younger than youngHours rank by unique traders and buyer breadth (young weights; breadth = 2·buyers/
//    (buyers+sellers) − 1, so a launch everyone is selling scores below one people are buying);
//  - churn penalty: trades-per-trader above churnRatio× the chain median costs churnPenalty per doubling (≤ churnMax);
//  - depth needs traders: with makers known, the liquidity term scales by makers / the chain's median makers (≤1,
//    as sqrt(makers / median) with liquidityBreadth=.5), so $5M of "liquidity" that five wallets trade no longer outranks live tokens;
//  - repeat buying is only a SECONDARY signal: the source has no per-wallet data, so buys-per-buyer (≤2× counts, capped)
//    adds at most `repeat`, and never on a churned row.
// Wash, copycat, liquidity and conditional-age rules from rank v2 are unchanged.
// Offline tuning only (lead/ux-d1/tools/rank-gates.mjs); production never calls this.
let tuningOverride=null;export function setRankTuningForTests(t){tuningOverride=t||null;}

export const AGE_DECAY_DAYS=30,AGE_DECAY=.6;
const DURATION=new Map(WINDOWS.map(([k,,s])=>[k,s]));
const FRESH_MS=300000;
const txnsAt=(row,w)=>{const t=row.txns?.[w],b=number(t?.buys),s=number(t?.sells);return b!==null&&s!==null?b+s:null;};
const FIELDS={
 txns:txnsAt,
 volume:(row,w)=>number(row.volumeUsd?.[w]),
 makers:(row,w)=>number(row.makers?.[w]),
 change:(row,w)=>finite(row.change?.[w]),
};
// The requested window, else the nearest shorter observed window, else the nearest longer one.
function nearest(row,field,window){
 const target=DURATION.get(window)||86400,read=FIELDS[field];
 const order=[...WINDOWS.filter(([,,s])=>s<=target).reverse(),...WINDOWS.filter(([,,s])=>s>target)];
 for(const [w] of order){const v=read(row,w);if(v!==null)return {value:v,window:w};}
 return {value:null,window:null};
}
function acceleration(row,window){
 const d=DURATION.get(window)||86400,now=txnsAt(row,window);
 if(now===null)return {value:null,window:null};
 for(const [w,,s] of WINDOWS){
  if(s<=d)continue;const long=txnsAt(row,w);if(long===null||long<now)continue;
  const prior=(long-now)/(s/d-1);
  if(prior===0)return {value:now>0?1:0,window:w};
  return {value:Math.max(-1,Math.min(1,Math.log2(now/prior)/2)),window:w};
 }
 return {value:null,window:null};
}
const createdMillis=row=>{const v=row.createdAt,at=typeof v==='number'?v:typeof v==='string'&&v.trim()?Date.parse(v):NaN;return Number.isFinite(at)&&at>0?at<1e12?at*1000:at:null;};
export function ageDecay(row,now=Date.now()){
 const at=createdMillis(row);if(at===null||at>now)return 0;
 const days=(now-at)/86400000;return days>AGE_DECAY_DAYS?AGE_DECAY*Math.log2(days/AGE_DECAY_DAYS):0;
}
function freshness(row,now){const at=number(row.priceAt??row.observedAt);return row.stale!==true&&row.pricesRefreshing!==true&&at!==null&&at>0&&at<=now+5000&&now-at<=FRESH_MS?1:0;}
const zScores=values=>{const known=values.filter(v=>v!==null),n=known.length;if(n<2)return values.map(v=>v===null?0:0);const mean=known.reduce((a,b)=>a+b,0)/n,sd=Math.sqrt(known.reduce((a,b)=>a+(b-mean)**2,0)/n);return values.map(v=>v===null||!sd?0:(v-mean)/sd);};
const identity=v=>typeof v==='string'?v.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g,'').normalize('NFKC').replace(/\s+/g,' ').trim().toUpperCase():'';
const quantile=(list,q=.5)=>{const v=list.filter(x=>x!==null).sort((a,b)=>a-b);if(!v.length)return null;const p=(v.length-1)*q,lo=Math.floor(p),hi=Math.ceil(p);return v[lo]+(v[hi]-v[lo])*(p-lo);};
const median=list=>quantile(list,.5);
/** Pure: scores every row of `rows` against the others for `window`. Returns one entry per row, in input order:
 * {row, score, fresh, terms:{txns,volume,makers,change,acceleration,liquidity,age,copycat}, inputs, flags:{wash,copycat}}.
 * `counts` (Map chainId:address → indexed trade count) fills txns only when the row carries no txns window. */
export function trendingScores(rows,{window='h24',now=Date.now(),counts=new Map(),tuning={}}={}){
 const T={...RANK_TUNING,...(tuningOverride||{}),...tuning};
 const read=rows.map(row=>{
  const inputs={},raw={};
  for(const field of ['txns','volume','makers','change']){const {value,window:w}=nearest(row,field,window);raw[field]=value;inputs[field]=w;}
  if(raw.txns===null){const indexed=number(counts.get?.(key(row)));if(indexed!==null){raw.txns=indexed;inputs.txns='indexed';}}
  const acc=inputs.txns&&inputs.txns!=='indexed'?acceleration(row,inputs.txns):{value:null,window:null};raw.acceleration=acc.value;inputs.acceleration=acc.window;
  raw.liquidity=number(row.liquidityUsd);
  // Makers count toward churn/breadth only when they describe the same window the txns came from.
  const mw=inputs.makers&&inputs.makers===inputs.txns?inputs.makers:null;
  raw.tpm=mw&&raw.makers>0?raw.txns/raw.makers:null;
  const b=mw?number(row.buyers?.[mw]):null,s=mw?number(row.sellers?.[mw]):null,buys=mw?number(row.txns?.[mw]?.buys):null;
  raw.breadth=b!==null&&s!==null&&b+s>0?2*b/(b+s)-1:null;raw.bpb=b>0&&buys!==null?buys/b:null;
  return {row,raw,inputs,chain:String(row.chainId)};
 });
 const M={...RANK_TUNING.makers,...(T.makers||{})};
 // per-chain cohort medians
 const cohort=new Map();for(const x of read){if(!cohort.has(x.chain))cohort.set(x.chain,[]);cohort.get(x.chain).push(x);}
 const tpmMed=new Map([...cohort].map(([c,list])=>[c,median(list.map(x=>x.raw.tpm))]));
 const makersMed=new Map([...cohort].map(([c,list])=>[c,median(list.map(x=>x.raw.tpm!==null?x.raw.makers:null))]));
 // churn-capped trades (rows with makers only; a row without makers keeps its txns as in rank v2)
 for(const x of read){const t=tpmMed.get(x.chain);x.raw.txnsRanked=x.raw.tpm!==null&&t>0?Math.min(x.raw.txns,x.raw.makers*t*M.churnCap):x.raw.txns;}
 const z={};for(const field of ['txns','volume','makers','liquidity'])z[field]=zScores(read.map(x=>{const v=field==='txns'?x.raw.txnsRanked:x.raw[field];return v===null?null:Math.log1p(v);}));
 const tx24=x=>observedActivity(x.row,'h24'),ticket=x=>{const v=number(x.row.volumeUsd?.h24),t=tx24(x);return v!==null&&t!==null?v/Math.max(1,t):null;};
 const med=new Map([...cohort].map(([c,list])=>[c,{txns:quantile(list.map(x=>x.raw.txns),typeof T.activeQuantile==='object'?(T.activeQuantile[c]??T.activeQuantile.default??.5):T.activeQuantile),ticket:median(list.map(ticket)),perMaker:tpmMed.get(c)}]));
 // copycats: same chain + name + ticker as an older, deeper contract
 const groups=new Map();for(const x of read){const sym=identity(x.row.token?.symbol);if(!sym||sym==='?')continue;const k=x.chain+'\u0000'+identity(x.row.token?.name)+'\u0000'+sym;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(x);}
 const copycat=new Set();
 for(const list of groups.values())if(list.length>1)for(const x of list){const at=createdMillis(x.row);if(at===null)continue;
  if(list.some(o=>o!==x&&(o.raw.liquidity??0)>(x.raw.liquidity??0)&&createdMillis(o.row)!==null&&createdMillis(o.row)<at&&!(x.raw.makers!==null&&o.raw.makers!==null&&x.raw.makers>o.raw.makers)))copycat.add(x);}
 return read.map((x,i)=>{
  const m=med.get(x.chain),vol24=number(x.row.volumeUsd?.h24);
  const tk=ticket(x),wash=(vol24!==null&&x.raw.liquidity>0&&vol24>T.washTurnover*x.raw.liquidity)||(m.perMaker!==null&&x.raw.tpm!==null&&x.raw.tpm>T.washMakerRatio*m.perMaker)||(tk!==null&&m.ticket>0&&tk>T.washTicket*m.ticket);
  const act=v=>wash&&v>0?v*T.washFactor:v;
  const ageDays=(()=>{const at=createdMillis(x.row);return at===null||at>now?null:(now-at)/86400000;})();
  const quiet=x.raw.txns===null||m.txns===null||x.raw.txns<=m.txns;
  // weights: rank v2 without makers; makers-weighted with them; young launches by unique traders + buyer breadth
  const hasM=x.raw.tpm!==null,young=hasM&&ageDays!==null&&ageDays*24<M.youngHours;
  const W=young?{...TREND_WEIGHTS,...M.young}:hasM?{...TREND_WEIGHTS,txns:TREND_WEIGHTS.txns-M.shift,makers:TREND_WEIGHTS.makers+M.shift}:TREND_WEIGHTS;
  const churned=hasM&&m.perMaker>0&&x.raw.tpm>M.churnRatio*m.perMaker;
  const mm=makersMed.get(x.chain),depthBreadth=hasM&&mm>0&&M.liquidityBreadth&&z.liquidity[i]>0?Math.min(1,(x.raw.makers/mm)**M.liquidityBreadth):1;
  const terms={txns:act(W.txns*z.txns[i]),volume:act(W.volume*z.volume[i]),makers:act(W.makers*z.makers[i]),
   change:x.raw.change===null?0:TREND_WEIGHTS.change*Math.max(-.5,Math.min(3,x.raw.change)),
   acceleration:x.raw.acceleration===null?0:TREND_WEIGHTS.acceleration*x.raw.acceleration,liquidity:wash?0:(typeof T.liquidity==="object"?(T.liquidity[x.chain]??T.liquidity.default):T.liquidity)*z.liquidity[i]*depthBreadth,
   age:ageDays!==null&&ageDays>AGE_DECAY_DAYS&&quiet?-ageDecay(x.row,now):0,copycat:copycat.has(x)?-T.copycatPenalty:0};
  if(hasM){
   terms.breadth=young&&x.raw.breadth!==null?act(W.breadth*x.raw.breadth):0;
   terms.churn=churned?-Math.min(M.churnMax,M.churnPenalty*Math.log2(x.raw.tpm/(M.churnRatio*m.perMaker))):0;
   terms.repeat=!churned&&x.raw.bpb!==null?M.repeat*Math.max(0,Math.min(1,x.raw.bpb-1)):0;
  }
  const score=Object.values(terms).reduce((a,b)=>a+b,0);
  return {row:x.row,score,fresh:freshness(x.row,now),terms,inputs:x.inputs,flags:{wash,copycat:copycat.has(x),...(hasM?{makers:true,young,churn:churned}:{})}};
 });
}
const byScore=(a,b)=>b.fresh-a.fresh||b.score-a.score||a.i-b.i;
/** Rows in trending order (fresh observations first, then score). Pure; input order breaks exact ties. */
export function orderByTrendingScore(rows,options={}){return trendingScores(rows,options).map((x,i)=>({...x,i})).sort(byScore).map(x=>x.row);}
// Pairwise "Hot now" for callers without the set: scores the pair against itself.
export function compareHotNow(a,b,options={}){const [x,y]=trendingScores([a,b],options);return byScore({...x,i:0},{...y,i:1});}

export function rankDiscovery(rows,{window='h24',counts=new Map(),now=Date.now(),chain='all',limit=Infinity,filters={}}={}){
 // All: no per-chain quota (D2). The z-scores span every chain, so a chain's share follows its observed activity.
 const ordered=orderByTrendingScore(rows.filter(r=>trendingCandidate(r,{window,filters})),{window,counts,now});
 return Number.isFinite(limit)?ordered.slice(0,limit):ordered;
}
/** New pairs hides a row only when it is PROVEN copycat wash: 24 h volume above washTurnover× liquidity AND an older
 *  contract with the same name+ticker on the same chain. Unknown liquidity, volume or age passes. Pure. */
export function provenCopycatWash(rows,{tuning={}}={}){
 const T={...RANK_TUNING,...(tuningOverride||{}),...tuning},oldest=new Map(),out=new Set();
 const k=r=>{const sym=identity(r.token?.symbol);return sym&&sym!=='?'?String(r.chainId)+'\u0000'+identity(r.token?.name)+'\u0000'+sym:null;};
 for(const r of rows){const g=k(r),at=createdMillis(r);if(g&&at!==null&&(!oldest.has(g)||at<oldest.get(g)))oldest.set(g,at);}
 for(const r of rows){const g=k(r),at=createdMillis(r),vol=number(r.volumeUsd?.h24),liq=number(r.liquidityUsd);
  if(g&&at!==null&&oldest.get(g)<at&&vol!==null&&liq>0&&vol>T.washTurnover*liq)out.add(key(r));}
 return out;
}
