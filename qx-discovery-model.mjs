// Provider-independent market views. Missing history never becomes a zero return.
export const WINDOWS=[['m5','5m',300],['m15','15m',900],['h1','1h',3600],['h6','6h',21600],['h12','12h',43200],['h24','24h',86400],['d7','1w',604800]];
export const DISCOVERY_TABS=[['trending','Trending'],['new','New pairs'],['bonding','Near bond'],['migrated','Migrated'],['gainers','Gainers'],['losers','Losers'],['volume','Volume']];
export const finite=value=>typeof value==='number'&&Number.isFinite(value)?value:null;
export function lifecycle(row){
 const value=row.lifecycle||row.launchpadDetails||row.launchpad_details;
 if(!value||typeof value!=='object')return {stage:'unknown',progress:null,destination:null};
 const percent=finite(value.graduation_percentage),progress=finite(value.progress)??(percent===null?null:percent/100);
 const destination=typeof (value.destination||value.migrated_destination_pool_address)==='string'?(value.destination||value.migrated_destination_pool_address):null;
 // A completed curve alone does not prove a migration destination exists.
 const migrated=(value.stage==='migrated'||value.completed===true)&&!!destination;
 const bonding=!migrated&&(value.stage==='bonding'||value.completed===false)&&progress!==null&&progress>=0&&progress<1;
 return {stage:migrated?'migrated':bonding?'bonding':value.completed===true||value.stage==='completed'?'completed':'unknown',progress:progress!==null&&progress>=0&&progress<=1?progress:null,destination,venue:typeof value.venue==='string'?value.venue:null};
}
export function changeAt(row,window){return finite(row.change?.[window]);}
export function validateDiscoveryFilters(raw={}){
 const out={};
 for(const key of ['liquidityMin','capMin','capMax','volumeMin','transactionsMin','ageMaxHours']){
  const text=String(raw[key]??'').trim();if(!text){out[key]='';continue;}
  if(!/^\d{1,15}(?:\.\d{1,8})?$/.test(text)||!Number.isFinite(Number(text)))throw Error('Use positive numbers in market filters.');
  out[key]=text;
 }
 if(out.capMin&&out.capMax&&Number(out.capMin)>Number(out.capMax))throw Error('Minimum market cap exceeds maximum.');
 out.venue=String(raw.venue||'').trim().slice(0,60);return out;
}
export function filterDiscovery(rows,{tab='trending',window='h24',filters={},now=Date.now()}={}){
 const f=validateDiscoveryFilters(filters),lower=(v,key)=>!f[key]||(finite(v)!==null&&v>=Number(f[key]));
 let result=rows.filter(row=>{
  const stage=lifecycle(row);if(tab==='bonding'&&!(stage.stage==='bonding'&&stage.progress>=.8))return false;
  if(tab==='migrated'&&stage.stage!=='migrated')return false;
  const move=changeAt(row,window);if(tab==='gainers'&&!(move>0)||tab==='losers'&&!(move<0))return false;
  const cap=finite(row.marketCapUsd)>0?row.marketCapUsd:row.fdvUsd;
  const tx=row.txns?.h24,transactions=finite(tx?.buys)!==null&&finite(tx?.sells)!==null?tx.buys+tx.sells:null;
  if(!lower(row.liquidityUsd,'liquidityMin')||!lower(cap,'capMin')||!lower(row.volumeUsd?.h24,'volumeMin')||!lower(transactions,'transactionsMin'))return false;
  if(f.capMax&&(finite(cap)===null||cap>Number(f.capMax)))return false;
  if(f.ageMaxHours){const at=typeof row.createdAt==='number'?(row.createdAt<1e12?row.createdAt*1000:row.createdAt):Date.parse(row.createdAt);if(!Number.isFinite(at)||at>now||now-at>Number(f.ageMaxHours)*3600000)return false;}
  return !f.venue||String(row.dex||'').toLowerCase().includes(f.venue.toLowerCase());
 });
 if(tab==='gainers'||tab==='losers')result.sort((a,b)=>(changeAt(a,window)-changeAt(b,window))*(tab==='gainers'?-1:1));
 else if(tab==='bonding')result.sort((a,b)=>lifecycle(b).progress-lifecycle(a).progress);
 else if(tab==='new')result.sort((a,b)=>(Date.parse(b.createdAt)||Number(b.createdAt)||0)-(Date.parse(a.createdAt)||Number(a.createdAt)||0));
 return result;
}
const VIEW_KEY='qhooks:terminal:market-views:v1';
export function createMarketViews(storage){
 const read=()=>{try{const v=JSON.parse(storage?.getItem(VIEW_KEY)||'[]');return Array.isArray(v)?v.slice(0,12).filter(x=>x&&typeof x.name==='string'&&x.name.length<=32&&DISCOVERY_TABS.some(([k])=>k===x.tab)&&WINDOWS.some(([k])=>k===x.window)).map(x=>({...x,filters:validateDiscoveryFilters(x.filters)})):[];}catch{return [];}};
 const write=rows=>{if(!storage?.setItem)throw Error('This device cannot save views.');storage.setItem(VIEW_KEY,JSON.stringify(rows));return rows;};
 return {list:read,save(raw){const name=String(raw.name||'').trim();if(!name||name.length>32)throw Error('Name this view with 1–32 characters.');if(!DISCOVERY_TABS.some(([k])=>k===raw.tab)||!WINDOWS.some(([k])=>k===raw.window))throw Error('Choose a market view and time window.');const row={name,tab:raw.tab,window:raw.window,chain:String(raw.chain),filters:validateDiscoveryFilters(raw.filters)},rows=read(),i=rows.findIndex(x=>x.name.toLowerCase()===name.toLowerCase());if(i<0){if(rows.length>=12)throw Error('Keep at most twelve market views.');rows.push(row);}else rows[i]=row;return write(rows);},remove(name){return write(read().filter(x=>x.name!==name));}};
}
