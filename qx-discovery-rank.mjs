import {chainById} from './chains.mjs';
import {stockPair} from './full-launch/packages/multichain-launch/stock-pairs.mjs';
import {WINDOWS,lifecycle} from './qx-discovery-model.mjs';

const key=r=>String(r.chainId)+':'+(r.chainId==='solana'?r.token?.address:String(r.token?.address||'').toLowerCase());
const SOL_QUOTES=new Set(['So11111111111111111111111111111111111111112','EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v','Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB']);
const number=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;

// These exact assets remain searchable. They do not occupy token-discovery slots.
export function discoveryCandidate(row){
 const chain=String(row.chainId),address=row.token?.address;
 if(!address||stockPair(chain,address))return false;
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
 return 0;
}

export function rankDiscovery(rows,{window='h24',counts=new Map(),now=Date.now(),chain='all',limit=Infinity}={}){
 const scored=rows.filter(discoveryCandidate).map((r,i)=>{
  const activity=Math.max(observedActivity(r,window),number(counts.get(key(r)))||0);
  const at=number(r.observedAt),fresh=r.stale!==true&&at!==null&&at<=now&&now-at<=300000;
  const liquid=number(r.liquidityUsd)>=1000&&number(r.priceUsd)>0;
  const curve=lifecycle(r).stage==='bonding'&&number(r.indexedActivity?.volume5)>0;
  const tier=fresh&&activity>0&&(liquid||curve)?2:fresh&&liquid?1:0;
  return {r,i,tier,activity};
 }).sort((a,b)=>b.tier-a.tier||b.activity-a.activity||a.i-b.i);
 if(chain!=='all'||!Number.isFinite(limit))return scored.slice(0,limit).map(x=>x.r);
 // Reserve space for each available chain before filling remaining slots by activity.
 const perChain=Math.max(1,Math.floor(limit/4)),balanced=[];
 for(const tier of [2,1,0]){
  const used=new Map(),first=[],rest=[];
  for(const x of scored.filter(x=>x.tier===tier)){const c=String(x.r.chainId),n=used.get(c)||0;(n<perChain?first:rest).push(x.r);used.set(c,n+1);}
  balanced.push(...first,...rest);
 }
 return balanced.slice(0,limit);
}
