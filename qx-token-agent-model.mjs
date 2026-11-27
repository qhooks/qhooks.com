// Pure shared form/rule vocabulary. No signing, storage or transport.
export const USER_SIGNAL_SOURCES=Object.freeze(['tracked-wallets','callers','launchpad','pulse']);
export const AGENT_AVATARS=Object.freeze([{id:'orbit',label:'Orbit',glyph:'◉'},{id:'prism',label:'Prism',glyph:'◇'},{id:'wave',label:'Wave',glyph:'≋'},{id:'spark',label:'Spark',glyph:'✦'},{id:'leaf',label:'Leaf',glyph:'❧'}]);
export const ORBIO_KEY_MESSAGE='Orbio API key · chain 4663 · epoch 0';
const address=s=>typeof s==='string'&&/^0x[0-9a-f]{40}$/i.test(s);
const list=v=>Array.isArray(v)&&v.length>0&&v.length<=20&&v.every(address);
export function validUserSelection(source,f={}){
 if(!USER_SIGNAL_SOURCES.includes(source))return false;
 if(source==='tracked-wallets')return list(f.wallets);
 if(source==='callers')return list(f.callers);
 if(source==='launchpad')return Array.isArray(f.events)&&f.events.length>0&&f.events.every(e=>['graduation','migration','dex-paid','lp-lock','lp-burn'].includes(e));
 return (typeof f.volumeSurgePct==='number'&&Number.isFinite(f.volumeSurgePct)&&f.volumeSurgePct>0)||(typeof f.holderSurgePct==='number'&&Number.isFinite(f.holderSurgePct)&&f.holderSurgePct>0);
}
export function selectedSignal(source,f,s){
 if(!validUserSelection(source,f))return false;
 if(source==='tracked-wallets')return f.wallets.map(w=>w.toLowerCase()).includes(s.wallet?.toLowerCase());
 if(source==='callers')return f.callers.map(w=>w.toLowerCase()).includes(s.caller?.toLowerCase());
 if(source==='launchpad')return f.events.includes(s.event);
 return (f.volumeSurgePct>0&&s.volumeSurgePct>=f.volumeSurgePct)||(f.holderSurgePct>0&&s.holderSurgePct>=f.holderSurgePct);
}
export function ruleWords(r){
 const size=r.amountIn??'',threshold=l=>l.multiple?l.multiple+'× average cost':l.mcapUsd?'$'+l.mcapUsd+' market cap':'$'+l.priceUsd;
 switch(r.type){
 case 'buy_ladder':return r.levels?r.levels.map(l=>'Buy '+l.amountIn+' native at or below '+threshold(l)).join('; '):'Buy '+size+' native every '+r.dipPct+'% dip, down to $'+(r.floorPriceUsd??r.floorMcapUsd)+(r.floorMcapUsd?' market cap':'');
 case 'dca':return 'Buy '+size+' native every '+(r.intervalMs/3600000)+' hours, '+r.count+' times';
 case 'sell_levels':return r.levels.map(l=>'Sell '+l.pctOfPosition+'% at '+threshold(l)).join('; ');
 case 'trailing_stop':return 'Trail '+r.trailPct+'% after a '+r.armPct+'% rise';
 case 'stop_loss':return r.lossPct?'Exit at a '+r.lossPct+'% loss from average cost':'Exit below $'+r.priceUsd;
 case 'grid':return 'Buy the '+r.bottom+' bottom and sell the '+r.top+' top'+(r.repeat?', repeating':'');
 case 'time_exit':return r.afterMs!==undefined?'Exit after '+(r.afterMs/86400000)+' days':'Exit at '+new Date(r.atMs).toISOString();
 case 'signalEntry':return 'Buy '+size+' native from your selected '+r.source+' signals';
 default:return 'Rule unavailable';
 }
}
export function pnlTone(n){return n<0?'loss':n>0?'gain':'flat';}
export function mintFormValues(form){
 const brain=form.brain,plan={limits:{perTradeUsd:+form.perTradeUsd,perDayUsd:+form.perDayUsd,totalUsd:+form.totalUsd,maxOpenPositions:+form.maxOpenPositions,onePositionPerToken:true},chainId:form.chainId,token:form.token};
 if(brain==='levels')plan.text=form.strategy;
 if(brain==='ai'){plan.strategy=form.strategy;plan.userTokens=form.token?[{chainId:form.chainId,token:form.token}]:[];plan.callsPerHour=+form.callsPerHour;}
 if(brain==='signal'){
  const filters={chains:[form.chainId]},source=form.source;
  if(source==='tracked-wallets')filters.wallets=form.selection.split(/[\s,]+/).filter(Boolean);
  if(source==='callers')filters.callers=form.selection.split(/[\s,]+/).filter(Boolean);
  if(source==='launchpad')filters.events=form.selection.split(/[\s,]+/).filter(Boolean);
  if(source==='pulse')filters.volumeSurgePct=+form.selection;
  plan.rules=[{id:'entry',type:'signalEntry',source,filters,amountIn:+form.amountIn},{id:'stop',type:'stop_loss',lossPct:40}];
 }
 return {name:form.name,avatar:form.avatar,brain,plan};
}
