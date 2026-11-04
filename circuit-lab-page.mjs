import {bindConfiguredLabPage} from './configured-lab-page.mjs';
import {buildCircuitDraft,circuitFields} from './circuit-lab-draft.mjs';
import {readCircuitForm,circuitExample,renderCircuitSummary} from './circuit-lab-form.mjs';
const definition={base:'/api/lab/circuit',prefix:'cr-',sourceCount:64,controllerName:'ConfiguredCircuitRecoveryController',
  normalize:buildCircuitDraft,fields:()=>circuitFields,readForm:readCircuitForm,example:circuitExample,
  slug:()=> 'circuit',downloadSlug:'circuit',storageKey:()=> 'qhooks.lab.circuit.v1',
  matchesSaved:()=>true,renderSummary:renderCircuitSummary,hookName:()=> 'GovernedCircuitRecoveryHook'};
export function bindCircuitLabPage(options){return bindConfiguredLabPage(options,definition);}
