// Public qToken settings. The existing launch recipe and contracts remain authoritative.
import {bindSelectedGraduationStudio} from './l141-graduation-studio-page.mjs';
import {qTokenPresetValues} from './l162-qtoken-presets.mjs';

export function bindQTokenDesigner({document:d=document,target=window,bindStudio=bindSelectedGraduationStudio}={}){
 const $=id=>d.getElementById(id),preset=$('qtd-preset');
 if(!preset)throw new TypeError('Missing qToken preset selector');
 const studio=bindStudio({document:d,target});
 if(studio.blocked){preset.disabled=true;return Object.freeze({blocked:true,dispose:()=>studio.dispose()});}
 const fields={mode:'mode',fee:'fee',notice:'notice',destinationFee:'destination-fee',threshold:'threshold'};
 const nodes=Object.fromEntries(Object.entries(fields).map(([key,id])=>[key,$('ql-'+id)]));
 const chain=$('ql-chain'),feedback=$('ql-feedback');
 if(!chain||!feedback||Object.values(nodes).some(node=>!node))throw new TypeError('Missing qToken settings');
 let dead=false,applying=false;const listeners=[];
 const listen=(node,type,handler)=>{node.addEventListener(type,handler);listeners.push([node,type,handler]);};
 const custom=()=>{if(!dead&&!applying)preset.value='custom';};
 const apply=()=>{
  if(dead||preset.disabled||preset.value==='custom')return;
  try{
   const settings=qTokenPresetValues(chain.value,preset.value);
   applying=true;
   for(const[key,node]of Object.entries(nodes))node.value=settings[key];
   nodes.mode.dispatchEvent(new (target.Event||Event)('change',{bubbles:true}));
   feedback.textContent='Pool preset applied. Customize the settings, then preview your qToken.';
   feedback.dataset.error='false';
  }catch{preset.value='custom';feedback.textContent='Choose a supported chain and pool preset.';feedback.dataset.error='true';}
  finally{applying=false;}
 };
 listen(preset,'change',apply);
 listen(chain,'change',custom);
 for(const node of Object.values(nodes))for(const type of ['input','change'])listen(node,type,custom);
 for(const id of ['ql-example','ql-restore','ql-import'])listen($(id),'click',custom);
 function dispose(){if(dead)return;dead=true;for(const[node,type,handler]of listeners)node.removeEventListener(type,handler);target.removeEventListener('pagehide',dispose);studio.dispose();}
 target.addEventListener('pagehide',dispose);
 return Object.freeze({dispose});
}
