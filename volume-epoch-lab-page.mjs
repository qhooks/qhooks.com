import {bindConfiguredLabPage} from './configured-lab-page.mjs';
import {buildVolumeEpochDraft,volumeEpochFields} from './volume-epoch-draft.mjs';
import {readVolumeEpochForm,volumeEpochExample,renderVolumeEpochSummary} from './volume-epoch-lab-form.mjs';
const definition={base:'/api/lab/volume-epoch',prefix:'ve-',sourceCount:64,controllerName:'ConfiguredVolumeEpochController',
  normalize:buildVolumeEpochDraft,fields:()=>volumeEpochFields,readForm:readVolumeEpochForm,example:volumeEpochExample,
  slug:()=> 'volume-epoch',downloadSlug:'volume-epoch',storageKey:()=> 'qhooks.lab.volume-epoch.v1',
  matchesSaved:()=>true,renderSummary:renderVolumeEpochSummary,hookName:()=> 'GovernedVolumeEpochHook'};
export function bindVolumeEpochLabPage(options){return bindConfiguredLabPage(options,definition);}
