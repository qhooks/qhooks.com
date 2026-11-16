import {filterDiscovery,lifecycle} from './qx-discovery-model.mjs';
export const PULSE_COLUMNS=Object.freeze([['new','New'],['bonding','Near bond'],['migrated','Migrated']]);
const columns=PULSE_COLUMNS.map(([id])=>id);
export const pulseIdentity=row=>String(row.chainId)+':'+(String(row.chainId)==='solana'?String(row.token?.address||''):String(row.token?.address||'').toLowerCase());
// Destination evidence wins over a completed curve; no migration is inferred from price or market cap.
export function pulseRows(records,{filters={},chain='all',window='h6',now=Date.now(),factsOf}={}){
 const raw=id=>Array.isArray(records[id]?.data?.rows)?records[id].data.rows:[],all=columns.flatMap(raw);
 const migrated=new Set(all.filter(r=>lifecycle(r).stage==='migrated').map(pulseIdentity));
 const bonding=new Set(all.filter(r=>{const s=lifecycle(r);return s.stage==='bonding'&&s.progress>=.8&&!migrated.has(pulseIdentity(r));}).map(pulseIdentity));
 return Object.fromEntries(columns.map(id=>{const seen=new Set();const rows=filterDiscovery(raw(id),{tab:id,window,filters,now,factsOf}).filter(r=>{
  const key=pulseIdentity(r);if(chain!=='all'&&String(r.chainId)!==String(chain)||seen.has(key))return false;
  if(id==='new'&&(migrated.has(key)||bonding.has(key))||id==='bonding'&&migrated.has(key))return false;
  seen.add(key);return true;
 });return [id,rows];}));
}
// One existing loader, one in-flight read. Desktop fills three sources serially, then a single staggered refresh.
// This controller owns no polling timer. The page's existing visible-list scheduler calls refreshNext().
export function createPulseController({makeLoader,onChange=()=>{},visible=()=>true,now=Date.now,minRefreshMs=30000}={}){
 let active=false,epoch=0,context={chain:'all',window:'h6',filters:{}},contextKey='',displayKey='',mobile=false,selected='new',flight=null,request=null,cursor=0,lastStart=-Infinity;
 const holds=new Set(),records=Object.fromEntries(columns.map(id=>[id,{loading:false,data:null,error:null}])),pending=new Map();
 const publish=()=>onChange({records,paused:holds.size>0,manual:holds.has('manual'),mobile,selected,context});
 const loader=makeLoader({changed:update=>{const asked=request;if(!active||!asked||asked.epoch!==epoch||!visible())return;
  if(typeof update.key==='string'&&!update.key.startsWith(asked.tab+':'+context.chain+':'+context.window))return;
  const next={...records[asked.tab],...update};
  if(holds.size&&records[asked.tab].data?.rows?.length)pending.set(asked.tab,next);else{records[asked.tab]=next;publish();}
 }});
 async function run(tab){
  if(!active||holds.size||!visible()||flight)return false;
  const mine=epoch;lastStart=now();request={tab,epoch:mine};
  const work=Promise.resolve().then(()=>loader.load(tab,context.chain,context.window,context.filters));flight=work;
  try{await work;return active&&epoch===mine;}catch{return false;}
  finally{if(flight===work){flight=null;request=null;}}
 }
 async function fill(){const mine=epoch;for(const tab of mobile?[selected]:columns){if(epoch!==mine||!active||holds.size||!visible())return;if(!records[tab].data&&!records[tab].error&&!await run(tab))return;}}
 function stop(){epoch++;loader.cancel();flight=null;request=null;pending.clear();for(const reason of ['pointer','focus','press'])holds.delete(reason);}
 return {
  configure(next={}){
   const value={chain:String(next.chain||'all'),window:next.window||'h6',filters:next.filters||{}},key=JSON.stringify({...value,filters:Object.fromEntries(Object.entries(value.filters).filter(([k])=>['liquidityMin','liquidityMax','capMin','capMax','volumeMin','transactionsMin','ageMinHours','ageMaxHours','venue','hasSocials'].includes(k)))}),viewKey=JSON.stringify(value),size=!!next.mobile,tab=columns.includes(next.selected)?next.selected:selected;
   const dataChanged=key!==contextKey,changed=viewKey!==displayKey||dataChanged||size!==mobile||size&&tab!==selected;
   if(!changed&&active)return;
   stop();active=true;context=value;contextKey=key;displayKey=viewKey;mobile=size;selected=tab;cursor=0;
   if(dataChanged)for(const id of columns)records[id]={loading:false,data:null,error:null};
   else for(const id of columns)records[id]={...records[id],loading:false};
   publish();void fill();
  },
  setActive(value){if(!value){active=false;stop();for(const id of columns)records[id]={...records[id],loading:false};return;}if(!active){active=true;void fill();}},
  setHold(reason,value){if(value)holds.add(reason);else holds.delete(reason);if(!holds.size&&pending.size){for(const [id,next]of pending)records[id]=next;pending.clear();}publish();if(!holds.size&&active)void fill();},
  refreshNext(){if(!active||holds.size||!visible()||flight||now()-lastStart<minRefreshMs)return Promise.resolve(false);const tab=mobile?selected:columns[cursor++%columns.length];return run(tab);},
  refreshColumn:tab=>columns.includes(tab)?run(tab):Promise.resolve(false),
  snapshot:()=>({records,paused:holds.size>0,manual:holds.has('manual'),mobile,selected,context}),
  dispose(){active=false;stop();holds.clear();},
 };
}
