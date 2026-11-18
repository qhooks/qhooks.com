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
/** Pure: scores every row of `rows` against the others for `window`. Returns one entry per row, in input order:
 * {row, score, fresh, terms:{txns,volume,makers,change,acceleration,age}, inputs:{txns,volume,makers,change,acceleration}}.
 * `counts` (Map chainId:address → indexed trade count) fills txns only when the row carries no txns window. */
export function trendingScores(rows,{window='h24',now=Date.now(),counts=new Map()}={}){
 const read=rows.map(row=>{
  const inputs={},raw={};
  for(const field of ['txns','volume','makers','change']){const {value,window:w}=nearest(row,field,window);raw[field]=value;inputs[field]=w;}
  if(raw.txns===null){const indexed=number(counts.get?.(key(row)));if(indexed!==null){raw.txns=indexed;inputs.txns='indexed';}}
  const acc=inputs.txns&&inputs.txns!=='indexed'?acceleration(row,inputs.txns):{value:null,window:null};raw.acceleration=acc.value;inputs.acceleration=acc.window;
  return {row,raw,inputs};
 });
 const z={};for(const field of ['txns','volume','makers'])z[field]=zScores(read.map(x=>x.raw[field]===null?null:Math.log1p(x.raw[field])));
 return read.map((x,i)=>{
  const terms={txns:TREND_WEIGHTS.txns*z.txns[i],volume:TREND_WEIGHTS.volume*z.volume[i],makers:TREND_WEIGHTS.makers*z.makers[i],
   change:x.raw.change===null?0:TREND_WEIGHTS.change*Math.max(-.5,Math.min(3,x.raw.change)),
   acceleration:x.raw.acceleration===null?0:TREND_WEIGHTS.acceleration*x.raw.acceleration,age:-ageDecay(x.row,now)};
  const score=Object.values(terms).reduce((a,b)=>a+b,0);
  return {row:x.row,score,fresh:freshness(x.row,now),terms,inputs:x.inputs};
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
