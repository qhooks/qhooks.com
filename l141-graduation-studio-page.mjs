// Query selection is applied before the established L124 recipe binder takes ownership.
import {bindGraduationStudio} from '/trade-client/apps/marketplace-preview/l124-studio-page.mjs';
import {selectedLaunchChain} from './l141-lab-export-route.mjs';

export function bindSelectedGraduationStudio({document:d=document,target=window,bind=bindGraduationStudio}={}){
 const select=d.getElementById('ql-chain');
 if(!select)throw new TypeError('Missing recipe chain selector');
 try{select.value=selectedLaunchChain(target.location?.search||'');}catch(error){
  select.disabled=true;for(const id of ['ql-preview','ql-save','ql-restore','ql-download','ql-import','ql-continue','ql-example']){const control=d.getElementById(id);if(control)control.disabled=true;}
  const feedback=d.getElementById('ql-feedback');if(feedback){feedback.textContent=error.message+'; return through the Lab and choose one supported chain.';feedback.dataset.error='true';}
  return Object.freeze({blocked:true,dispose(){}});
 }
 return bind({document:d,target});
}
