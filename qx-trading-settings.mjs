import {chainById} from './chains.mjs';
import {createTradingProfiles,TRADING_PROFILE_KEY} from './qx-trading-preferences.mjs';
import {EXIT_CHAINS,consentRead,consentWrite} from './qx-profile-exit.mjs';
export function mountTradingSettings({h,storage,legacyTolerance,onChange=()=>{},onError=()=>{}}){
 let legacyTpsl;try{legacyTpsl=JSON.parse(storage?.getItem('qhooks:terminal:tpsl')||'null');}catch{}const profiles=createTradingProfiles(storage,{legacyTolerance,legacyTpsl});let chain='8453',blocked=false,editing=null,revision=0,conditionals=[],amountUnits=['usd','eth'];
 const select=h('select',{ariaLabel:'Trading profile'}),summary=h('summary',{},'Settings');
 const form=h('div',{class:'qxt-settings-form'}),details=h('details',{class:'qxt-settings'},summary,form);
 const message=h('p',{class:'qxt-muted',role:'status',ariaLive:'polite'});
 const scope=h('span',{},'Profile');
 summary.replaceChildren(scope,h('span',{class:'qxt-profile-edit'},'· Edit'));
 const profileChoice=h('label',{},h('span',{},'Saved profile'),select);
 const element=h('div',{class:'qxt-profile-bar'},details);
 const split=x=>x.split(/[,\s]+/).filter(Boolean);
 const label=(name,input)=>h('label',{},h('span',{},name),input);
 const input=(name,value)=>h('input',{type:'text',value,ariaLabel:name,autocomplete:'off'});
 function changed(){render();onChange();document.dispatchEvent(new CustomEvent('qhooks:trading-profile'));}
 function editor(fresh=false){
  const state=profiles.snapshot(chain);conditionals=[];revision=state.revision;editing=fresh?profiles.duplicate(chain):state.profile;
  const name=input('Profile name',editing.name),fields={};
  const rows=[profileChoice,label('Profile name',name)];
  for(const side of ['buy','sell']){
   const title=side==='buy'?'Buy':'Sell',mode=h('select',{ariaLabel:title+' slippage mode'},h('option',{value:'auto'},'Auto'),h('option',{value:'manual'},'Manual'));mode.value=editing[side].mode;
   const max=input(title+' slippage maximum (%)',String(editing[side].maxBps/100)),manual=input(title+' manual slippage (%)',String(editing[side].manualBps/100));
   const sync=()=>{max.disabled=blocked||mode.value!=='auto';manual.disabled=blocked||mode.value!=='manual';};mode.addEventListener('change',sync);conditionals.push(sync);sync();fields[side]={mode,max,manual};
   rows.push(h('fieldset',{},h('legend',{},title+' slippage'),label('Mode',mode),label('Auto maximum, %',max),label('Manual, %',manual)));
  }
  const amounts={};for(const unit of ['usd','eth','bnb','sol','hype']){amounts[unit]=input(unit.toUpperCase()+' buy amounts',editing.amounts[unit].join(', '));if(amountUnits.includes(unit))rows.push(label(unit.toUpperCase()+' buy amounts',amounts[unit]));}
  const exitFields={};for(const [key,label]of [['takeProfitPct','Take profit, % up · 0 off'],['stopLossPct','Stop loss, % down · 0 off'],['minimumBps',EXIT_CHAINS.includes(chain)?'Stop sells at no less than, % under':'Exit floor tolerance, %'],['executorTipBps','QHooks executor tip, %']]){exitFields[key]=input(label,String(editing.exit[key]/(key.endsWith('Bps')?100:1)));if((chain!=='solana'||!key.endsWith('Bps'))&&!(key==='executorTipBps'&&EXIT_CHAINS.includes(chain)))rows.push(h('label',{},h('span',{},label),exitFields[key]));}

  // ordersready (2026-11-13): on chains with signed orders, a profile can set its TP/SL after each buy (one signature per leg).
  const exitAuto=EXIT_CHAINS.includes(chain)?h('input',{type:'checkbox',checked:editing.exit.autoAfterBuy===true&&consentRead(storage,chain),ariaLabel:'Set this TP/SL after each buy'}):null;
  if(exitAuto)rows.push(h('label',{class:'qxt-check'},exitAuto,h('span',{},'Set this TP/SL after each buy')));
  rows.push(h('p',{class:'qxt-muted'},exitAuto?'When on, each buy here asks your wallet to sign the take-profit and stop for what you bought. Whichever fills first cancels the other. Nothing is placed until you sign.':'Saved TP/SL levels are preferences. Saving a profile does not place an order.'));
  const sells=input('Sell percentages',editing.sellPercentages.join(', '));rows.push(label('Sell percentages · last is 100%',sells));
  const save=h('button',{type:'button',class:'qxt-context-action'},'Save profile'),newProfile=h('button',{type:'button',class:'qxt-context-action'},'New profile'),remove=h('button',{type:'button',class:'qxt-context-action',disabled:state.profiles.length<2},'Delete profile');
  save.addEventListener('click',()=>{if(blocked)return;try{const next={...editing,name:name.value,amounts:Object.fromEntries(Object.entries(amounts).map(([k,v])=>[k,split(v.value)])),sellPercentages:split(sells.value).map(Number),exit:{...Object.fromEntries(Object.entries(exitFields).map(([k,v])=>{if(!/^\d{1,6}(?:\.\d{1,2})?$/.test(v.value.trim()))throw Error('Use exit percentages with at most two decimal places.');return [k,k.endsWith('Bps')?Math.round(Number(v.value)*100):Number(v.value)];})),autoAfterBuy:!!exitAuto?.checked}};for(const side of ['buy','sell']){const bps=v=>{if(!/^\d{1,3}(?:\.\d{1,2})?$/.test(v.trim()))throw Error('Use slippage percentages with at most two decimal places.');return Math.round(Number(v)*100);};next[side]={mode:fields[side].mode.value,maxBps:bps(fields[side].max.value),manualBps:bps(fields[side].manual.value)};}if(chain==='solana'&&['buy','sell'].some(side=>next[side].mode==='manual'&&next[side].manualBps>5000))throw Error('Jupiter manual slippage is limited to 50%.');profiles.save(chain,next,revision);if(exitAuto)consentWrite(storage,chain,exitAuto.checked);message.textContent='';details.open=false;changed();}catch(error){message.textContent=error.message;onError(error);}});
  newProfile.addEventListener('click',()=>{if(!blocked)editor(true);});remove.addEventListener('click',()=>{if(blocked)return;try{profiles.remove(chain,editing.id,revision);details.open=false;changed();}catch(error){message.textContent=error.message;}});
  conditionals.push(()=>{remove.disabled=blocked||state.profiles.length<2||!state.profiles.some(p=>p.id===editing.id);});
  form.replaceChildren(...rows,h('p',{class:'qxt-muted'},'Auto adapts to recently received prices within your maximum. A settings change requires a fresh quote.'),h('p',{class:'qxt-muted'},chain==='solana'?'Network priority and MEV delivery are managed by the Jupiter route.':'Network fees are confirmed by your wallet and the selected route.'),h('div',{class:'qxt-settings-actions'},save,newProfile,remove),message);lock(blocked);details.scrollTop=0;
 }
 function render(){element.dataset.chain=chain;const s=profiles.snapshot(chain);scope.textContent='Profile: '+s.profile.name;summary.setAttribute('aria-label','Profile: '+s.profile.name+' · Edit · '+(chain==='solana'?'Solana':chainById(chain)?.short||chain));select.replaceChildren(...s.profiles.map(p=>h('option',{value:p.id},p.name)));select.value=s.active;select.disabled=blocked;}
 function lock(value){blocked=value;select.disabled=value;for(const el of form.querySelectorAll('input,select,button'))el.disabled=value;if(!value)conditionals.forEach(sync=>sync());}
 select.addEventListener('change',()=>{if(blocked)return;try{profiles.select(chain,select.value,profiles.snapshot(chain).revision);changed();if(details.open)editor();}catch(error){onError(error);render();}});
 details.addEventListener('keydown',event=>{if(event.key==='Escape'&&details.open){event.preventDefault();event.stopPropagation();details.open=false;summary.focus();}});
 details.addEventListener('toggle',()=>{summary.querySelector('.qxt-profile-edit').textContent=details.open?'· Close':'· Edit';if(details.open&&!blocked)editor();});
 const crossTab=event=>{if(event.key===TRADING_PROFILE_KEY){if(details.open)message.textContent='Profiles changed in another tab. Reopen settings to load them.';render();onChange();}};
 const localExit=()=>{render();onChange();};document.addEventListener('qhooks:trading-profile-edit',localExit);window.addEventListener('storage',crossTab);render();
 return {element,summary,profile:()=>profiles.snapshot(chain).profile,
  setTolerance(side,value){if(blocked||chain==='solana'&&value!=='auto'&&Number(value)>5000)return false;const s=profiles.snapshot(chain),profile=s.profile;if(value==='auto')profile[side].mode='auto';else{if(!/^\d{1,5}$/.test(String(value))||Number(value)<1||Number(value)>10000)return false;profile[side]={...profile[side],mode:'manual',manualBps:Number(value)};}profiles.save(chain,profile,s.revision);changed();return true;},
  setChain(value,units=['usd','eth']){const next=[...new Set(units.filter(unit=>['usd','eth','bnb','sol','hype'].includes(unit)))];if(chain===String(value)&&next.join()===amountUnits.join())return;chain=String(value);amountUnits=next;details.open=false;render();},lock,destroy(){document.removeEventListener('qhooks:trading-profile-edit',localExit);window.removeEventListener('storage',crossTab);element.remove();}};
}
