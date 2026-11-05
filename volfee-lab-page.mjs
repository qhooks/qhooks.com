import {bindConfiguredLabPage} from './configured-lab-page.mjs';
import {buildVolfeeDraft,volfeeFields} from './volfee-draft.mjs';
import {readVolfeeForm,volfeeExample,renderVolfeeSummary} from './volfee-lab-form.mjs';
// A regular v4 hook (no controller, no keys): the build's main contract is the hook itself.
const definition={base:'/api/lab/volfee',prefix:'vf-',sourceCount:48,controllerName:'ConfiguredVolatilityFeeHook',contractKey:'hook',
  normalize:buildVolfeeDraft,fields:()=>volfeeFields,readForm:readVolfeeForm,example:volfeeExample,
  slug:()=> 'volatility-fee',downloadSlug:'volatility-fee',storageKey:()=> 'qhooks.lab.volfee.v1',
  matchesSaved:()=>true,renderSummary:renderVolfeeSummary,hookName:()=> 'ConfiguredVolatilityFeeHook'};
export function bindVolfeeLabPage(options){return bindConfiguredLabPage(options,definition);}
