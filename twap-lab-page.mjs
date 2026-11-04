import {bindConfiguredLabPage} from './configured-lab-page.mjs';
import {buildTwapDraft,twapFields} from './twap-draft.mjs';
import {readTwapForm,twapExample,renderTwapSummary} from './twap-lab-form.mjs';
// A regular v4 hook (no controller, no keys): the build's main contract is the hook itself.
const definition={base:'/api/lab/twap',prefix:'tw-',sourceCount:48,controllerName:'ConfiguredTwapOracleHook',contractKey:'hook',
  normalize:buildTwapDraft,fields:()=>twapFields,readForm:readTwapForm,example:twapExample,
  slug:()=> 'twap-oracle',downloadSlug:'twap-oracle',storageKey:()=> 'qhooks.lab.twap.v1',
  matchesSaved:()=>true,renderSummary:renderTwapSummary,hookName:()=> 'ConfiguredTwapOracleHook'};
export function bindTwapLabPage(options){return bindConfiguredLabPage(options,definition);}
