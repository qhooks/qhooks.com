// Public preferences only. No wallet identity, permissions, orders or execution.
export const TRADING_PROFILE_KEY='qhooks:terminal:profiles:v1';
export const PROFILE_CHAINS=['8453','1','42161','56','4663','99901','solana'];
const copy=x=>JSON.parse(JSON.stringify(x));
const ensure=(ok,message)=>{if(!ok)throw new TypeError(message);};
const integer=(n,min,max)=>Number.isInteger(n)&&n>=min&&n<=max;
const plain=x=>x&&typeof x==='object'&&!Array.isArray(x);
export const defaultExitSettings=()=>({takeProfitPct:100,stopLossPct:30,minimumBps:500,executorTipBps:30,autoAfterBuy:false});
export function validateExitSettings(raw=defaultExitSettings()){
 const percent=(v,max)=>Number.isFinite(v)&&v>=0&&v<=max&&Math.abs(v*100-Math.round(v*100))<1e-6;
 ensure(plain(raw)&&percent(raw.takeProfitPct,100000)&&percent(raw.stopLossPct,99.99)&&integer(raw.minimumBps,1,5000)&&integer(raw.executorTipBps,0,100)&&typeof raw.autoAfterBuy==='boolean','Use valid TP/SL percentages, a 0.01–50% floor tolerance and a 0–1% executor tip.');
 ensure(!raw.autoAfterBuy||raw.takeProfitPct>0||raw.stopLossPct>0,'Set a target or stop before enabling TP/SL after a buy.');
 return {takeProfitPct:raw.takeProfitPct,stopLossPct:raw.stopLossPct,minimumBps:raw.minimumBps,executorTipBps:raw.executorTipBps,autoAfterBuy:raw.autoAfterBuy};
}
export function defaultTradingProfile(){return {id:'default',name:'Default',buy:{mode:'auto',manualBps:100,maxBps:100},sell:{mode:'auto',manualBps:100,maxBps:100},amounts:{usd:['10','50','100','500'],eth:['0.01','0.05','0.1','0.5'],bnb:['0.05','0.1','0.5','1'],sol:['0.1','0.25','0.5','1'],hype:['0.1','0.5','1','5']},sellPercentages:[25,50,75,100],exit:defaultExitSettings()};}
export function validateTradingProfile(raw){
 ensure(plain(raw),'A profile is required.');
 ensure(typeof raw.id==='string'&&/^[a-z0-9-]{1,64}$/.test(raw.id),'Invalid profile identity.');
 ensure(typeof raw.name==='string'&&raw.name.trim().length>=1&&raw.name.trim().length<=32&&!/[\u0000-\u001f]/.test(raw.name),'Use a profile name of 1–32 characters.');
 const side=key=>{const x=raw[key];ensure(plain(x)&&['auto','manual'].includes(x.mode)&&integer(x.manualBps,1,10000)&&integer(x.maxBps,1,5000),'Auto maximum must be 0.01–50%; manual tolerance must be 0.01–100%.');return {mode:x.mode,manualBps:x.manualBps,maxBps:x.maxBps};};
 const amounts={};
 // hype (Elysium, 2026-11-09) is optional so profiles saved before it keep validating; missing = the default.
 for(const unit of ['usd','eth','bnb','sol','hype']){const a=unit==='hype'&&raw.amounts?.hype===undefined?defaultTradingProfile().amounts.hype:raw.amounts?.[unit];ensure(Array.isArray(a)&&a.length===4&&a.every(v=>typeof v==='string'&&/^(?:0|[1-9]\d{0,11})(?:\.\d{1,18})?$/.test(v)&&/[1-9]/.test(v)),'Enter four positive amounts for '+unit.toUpperCase()+'.');ensure(new Set(a).size===4,'Use four different amounts for '+unit.toUpperCase()+'.');amounts[unit]=[...a];}
 const sell=raw.sellPercentages;ensure(Array.isArray(sell)&&sell.length===4&&sell.every((v,i)=>integer(v,1,100)&&(!i||v>sell[i-1]))&&sell[3]===100,'Sell presets must increase and end at 100%.');
 return {id:raw.id,name:raw.name.trim(),buy:side('buy'),sell:side('sell'),amounts,sellPercentages:[...sell],exit:validateExitSettings(raw.exit)};
}
export function resolveTradingTolerance(settings,samples=[],now=Date.now()){
 ensure(settings&&['auto','manual'].includes(settings.mode),'Choose Auto or manual slippage.');
 const cap=settings.mode==='manual'?settings.manualBps:settings.maxBps;
 ensure(integer(cap,1,settings.mode==='manual'?10000:5000),'Invalid slippage maximum.');
 if(settings.mode==='manual')return {bps:cap,mode:'manual',capBps:cap,samples:0};
 const prices=samples.filter(x=>Number.isFinite(x?.price)&&x.price>0&&Number.isFinite(x.at)&&x.at<=now&&now-x.at<=120000).slice(-12).map(x=>x.price);
 // A bounded heuristic based on recently received prices. It does not predict
 // fills or silently widen a reviewed quote. First read uses 0.5%, below cap.
 const move=prices.length>1?(Math.max(...prices)-Math.min(...prices))/Math.min(...prices)*10000:0;
 return {bps:Math.min(cap,Math.max(1,Math.ceil(50+move))),mode:'auto',capBps:cap,samples:prices.length};
}
export function createTradingProfiles(storage,{legacyTolerance=null,legacyTpsl=null,id=()=>crypto.randomUUID()}={}){
 const initial=()=>({version:1,revision:0,chains:{}});
 const read=()=>{try{const text=storage?.getItem(TRADING_PROFILE_KEY);if(!text||text.length>80000)return initial();const value=JSON.parse(text);if(value.version!==1||!integer(value.revision,0,Number.MAX_SAFE_INTEGER)||!plain(value.chains))return initial();return value;}catch{return initial();}};
 function chainState(record,chain){
  ensure(PROFILE_CHAINS.includes(String(chain)),'Choose a supported trading chain.');
  const raw=record.chains[chain],fallback=defaultTradingProfile();
  if(/^\d{1,5}$/.test(String(legacyTolerance))&&integer(Number(legacyTolerance),1,10000))for(const key of ['buy','sell'])fallback[key]={mode:'manual',manualBps:Number(legacyTolerance),maxBps:Math.min(5000,Number(legacyTolerance))};
  if(plain(legacyTpsl)){try{fallback.exit=validateExitSettings({takeProfitPct:Number(legacyTpsl.tp??100),stopLossPct:Number(legacyTpsl.sl??30),minimumBps:Number(legacyTpsl.floor??500),executorTipBps:Number(legacyTpsl.tip??30),autoAfterBuy:legacyTpsl.auto===true});}catch{}}
  if(!raw||!Array.isArray(raw.profiles)||raw.profiles.length>12)return {active:'default',profiles:[fallback]};
  try{const profiles=raw.profiles.map(validateTradingProfile);ensure(profiles.length&&new Set(profiles.map(p=>p.id)).size===profiles.length,'Duplicate profiles.');return {active:profiles.some(p=>p.id===raw.active)?raw.active:profiles[0].id,profiles};}catch{return {active:'default',profiles:[fallback]};}
 }
 function snapshot(chain){const record=read(),state=chainState(record,String(chain));return copy({...state,revision:record.revision,profile:state.profiles.find(p=>p.id===state.active)});}
 function write(chain,expected,change){
  chain=String(chain);const record=read();ensure(record.revision===expected,'Profiles changed in another tab. Reopen settings before saving.');
  ensure(record.revision<Number.MAX_SAFE_INTEGER,'Profile revision limit reached.');
  const state=chainState(record,chain);change(state);record.chains[chain]=state;record.revision++;
  ensure(storage?.setItem,'Profile storage is unavailable.');storage.setItem(TRADING_PROFILE_KEY,JSON.stringify(record));return snapshot(chain);
 }
 return Object.freeze({snapshot,
  select(chain,profileId,revision){return write(chain,revision,state=>{ensure(state.profiles.some(p=>p.id===profileId),'That profile is no longer available.');state.active=profileId;});},
  save(chain,raw,revision){const profile=validateTradingProfile(raw);return write(chain,revision,state=>{ensure(!state.profiles.some(p=>p.id!==profile.id&&p.name.toLowerCase()===profile.name.toLowerCase()),'Use a different profile name.');const at=state.profiles.findIndex(p=>p.id===profile.id);if(at<0){ensure(state.profiles.length<12,'Keep at most twelve profiles per chain.');state.profiles.push(profile);}else state.profiles[at]=profile;state.active=profile.id;});},
  remove(chain,profileId,revision){return write(chain,revision,state=>{ensure(state.profiles.length>1,'Keep at least one profile.');ensure(state.profiles.some(p=>p.id===profileId),'That profile is no longer available.');state.profiles=state.profiles.filter(p=>p.id!==profileId);if(state.active===profileId)state.active=state.profiles[0].id;});},
  duplicate(chain){const value=snapshot(chain).profile;return {...value,id:id(),name:value.name==='Default'?'My profile':(value.name+' copy').slice(0,32)};}
 });
}
