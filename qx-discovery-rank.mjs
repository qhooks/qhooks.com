import{majorAsset}from'./qx-major-assets.mjs';
import {chainById} from './chains.mjs';
import {stockPair} from './full-launch/packages/multichain-launch/stock-pairs.mjs';
import {WINDOWS} from './qx-discovery-model.mjs';

const key=r=>String(r.chainId)+':'+(r.chainId==='solana'?r.token?.address:String(r.token?.address||'').toLowerCase());
const SOL_QUOTES=new Set(['So11111111111111111111111111111111111111112','EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v','Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB']);
const number=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;

// These exact assets remain searchable. They do not occupy token-discovery slots.
export function discoveryCandidate(row){
 const chain=String(row.chainId),address=row.token?.address;
 if(!address||stockPair(chain,address)||majorAsset(chain,address))return false;
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
function metrics(row,{window='h24',counts=new Map(),now=Date.now()}={}){
 const observed=observedActivity(row,window),indexed=number(counts.get(key(row))),activity=observed===null?indexed:indexed===null?observed:Math.max(observed,indexed);
 const at=number(row.priceAt??row.observedAt),fresh=row.stale!==true&&row.pricesRefreshing!==true&&at!==null&&at>0&&at<=now+5000&&now-at<=300000;
 const move=finite(row.change?.[window]),momentum=move===null?0:move>0?2:move===0?1:-1;
 return {fresh:fresh?1:0,momentum,move,volume:number(row.volumeUsd?.h24),activity};
}
const knownDesc=(a,b)=>a===null?b===null?0:1:b===null?-1:b-a;
const compare=(a,b)=>b.fresh-a.fresh||b.momentum-a.momentum||knownDesc(a.volume,b.volume)||knownDesc(a.activity,b.activity)||knownDesc(a.move,b.move);
export function compareHotNow(a,b,options={}){return compare(metrics(a,options),metrics(b,options));}

export function rankDiscovery(rows,{window='h24',counts=new Map(),now=Date.now(),chain='all',limit=Infinity,filters={}}={}){
 const options={window,counts,now},scored=rows.filter(r=>trendingCandidate(r,{window,filters})).map((r,i)=>({r,i,metrics:metrics(r,options)}))
  .sort((a,b)=>compare(a.metrics,b.metrics)||a.i-b.i);
 if(chain!=='all'||!Number.isFinite(limit))return scored.slice(0,limit).map(x=>x.r);
 // Keep chain breadth inside each freshness/momentum band, never lift a falling
 // token ahead of a positive one merely to fill a chain's allocation.
 const perChain=Math.max(1,Math.floor(limit/4)),balanced=[];
 for(const fresh of[1,0])for(const momentum of[2,1,0,-1]){
  const used=new Map(),first=[],rest=[];
  for(const x of scored.filter(x=>x.metrics.fresh===fresh&&x.metrics.momentum===momentum)){const c=String(x.r.chainId),n=used.get(c)||0;(n<perChain?first:rest).push(x.r);used.set(c,n+1);}
  balanced.push(...first,...rest);
 }
 return balanced.slice(0,limit);
}
