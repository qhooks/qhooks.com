import {bindConfiguredLabPage} from './configured-lab-page.mjs';
import {buildPriceBandDraft,priceBandFields} from './price-band-draft.mjs';
import {readPriceBandForm,priceBandExample,renderPriceBandSummary} from './price-band-lab-form.mjs';
const definition={base:'/api/lab/price-band',prefix:'pb-',sourceCount:64,controllerName:'ConfiguredPriceBandController',
  normalize:buildPriceBandDraft,fields:()=>priceBandFields,readForm:readPriceBandForm,example:priceBandExample,
  slug:()=> 'price-band',downloadSlug:'price-band',storageKey:()=> 'qhooks.lab.price-band.v1',
  matchesSaved:()=>true,renderSummary:renderPriceBandSummary,hookName:()=> 'GovernedPriceBandHook'};
export function bindPriceBandLabPage(options){return bindConfiguredLabPage(options,definition);}
