// Fee-specific presentation atop the shared public-config build lifecycle.
import {bindConfiguredLabPage} from './configured-lab-page.mjs';
import {buildFeeDraft} from './fee-draft.mjs';
import {feeFieldNames} from './fee-input.mjs';
import {readFeeForm,feeExample} from './fee-lab-form.mjs';
import {renderFeeBuildSummary} from './fee-build-summary.mjs';
const definition={
  base:'/api/lab/fees',prefix:'fl-',sourceCount:65,controllerName:'ConfiguredFeeController',
  normalize:buildFeeDraft,fields:d=>feeFieldNames(d.template),readForm:readFeeForm,
  example:$=>feeExample($('template').value),slug:d=>d.template,downloadSlug:'fee',
  storageKey:$=>'qhooks.lab.fees.'+$('template').value+'.v1',
  matchesSaved:(input,$)=>input?.template===$('template').value,
  renderSummary:renderFeeBuildSummary,
  hookName:d=>d.template==='dynamic'?'GovernedDynamicFeeHook':'GovernedDirectionalFeeHook',
  selector:'template',
  initialize($,target){const t=new URLSearchParams(target.location.search).get('template');if(['dynamic','directional'].includes(t))$('template').value=t;},
  renderFields($){
    const directional=$('template').value==='directional';
    for(const [group,field,show] of [['dynamic','initialLpFee',!directional],['direction0','initialFee0For1',directional],['direction1','initialFee1For0',directional]]){$(group).hidden=!show;$(field).disabled=!show;}
    $('direction-note').hidden=!directional;
  }
};
export function bindFeeLabPage(options){return bindConfiguredLabPage(options,definition);}
