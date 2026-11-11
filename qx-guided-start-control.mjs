import {START_TIERS,START_STEPS_MAX} from './qx-quick-launch-core.mjs';
import {startTierLabel,startCapText} from './qx-quick-start-check.mjs';
import {readGuidedStart} from './qx-guided-start.mjs';
import {chainById} from './chains.mjs';
// Native select and range support keyboard and touch without a separate interaction path.
export function mountGuidedStart({document:d,container,prefix,getState,onChange,request,resolveStart=readGuidedStart}){
 const field=d.createElement('label'),label=d.createElement('span'),select=d.createElement('select'),range=d.createElement('input'),custom=d.createElement('input'),output=d.createElement('p');
 label.textContent='Starting market cap';select.id=prefix+'start-tier';select.setAttribute('aria-label','Starting market cap');
 for(const[id,name]of START_TIERS){const option=d.createElement('option');option.value=id;option.textContent=name;select.append(option);}
 range.id=prefix+'start-steps';range.type='range';range.min='0';range.max=String(START_STEPS_MAX);range.step='1';range.setAttribute('aria-label','Custom starting market cap');
 custom.id=prefix+'start-usd';custom.type='text';custom.inputMode='decimal';custom.maxLength=32;custom.placeholder='Market cap in USD';custom.setAttribute('aria-label','Custom starting market cap in USD');
 output.id=prefix+'start-readout';output.setAttribute('role','status');output.setAttribute('aria-live','polite');
 field.append(label,select,custom,range,output);container.append(field);
 let identity='',run=0,dead=false;
 const read=request|| (async(method,params,chainId)=>{const r=await fetch(chainById(chainId).rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});if(!r.ok)throw Error();const j=await r.json();if(j.error||j.result==null)throw Error();return j.result;});
 function refresh(){
  if(dead)return;const s=getState(),c=chainById(s.chainId);select.value=s.startTier||'standard';range.value=s.startSteps||'0';custom.value=s.startUsd||'';custom.hidden=range.hidden=select.value!=='custom';select.disabled=range.disabled=custom.disabled=!!s.disabled;
  const quote=s.quote||c?.quote,key=JSON.stringify([s.chainId,quote?.address,select.value,range.value,custom.value]);if(key===identity)return;identity=key;const id=++run;
  output.textContent='Checking starting market cap…';
  void resolveStart({chainId:s.chainId,quote,tier:select.value,steps:range.value,customUsd:custom.value,request:(m,p)=>read(m,p,s.chainId)}).then(p=>{if(id!==run||dead)return;for(const option of select.options)option.textContent=startTierLabel(option.value,p.standardUsd);
   range.value=String(p.steps);identity=JSON.stringify([s.chainId,quote?.address,select.value,range.value,custom.value]);
   if(String(s.startSteps||'0')!==range.value)onChange({startTier:select.value,startSteps:range.value,startUsd:custom.value});
   output.textContent='Starts at '+startCapText(p.standardUsd,p.steps)+'. No quote liquidity required.';},()=>{if(id===run&&!dead)output.textContent='Starting price unavailable. Check again before launching.';});
 }
 select.addEventListener('change',()=>{onChange({startTier:select.value,startSteps:range.value,startUsd:custom.value});refresh();});range.addEventListener('input',()=>{custom.value='';onChange({startTier:select.value,startSteps:range.value,startUsd:custom.value});refresh();});
 custom.addEventListener('input',()=>{onChange({startTier:select.value,startSteps:range.value,startUsd:custom.value});refresh();});
 refresh();return {refresh,dispose(){dead=true;run++;}};
}
