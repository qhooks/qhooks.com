import {bindFeeLabPage} from './fee-lab-page.mjs';
bindFeeLabPage({document, target:window, fetch:window.fetch.bind(window)});
// Deploy to a public chain. One panel per fee template; the one matching the template chosen above shows.
import {mountLabDeploy} from './lab-deploy.mjs';
{
  const host=document.getElementById('lab-deploy'),form=document.getElementById('fl-form'),field=n=>form.elements.namedItem(n).value.trim();
  if(host){
    const dyn=document.createElement('div'),dir=document.createElement('div');host.replaceChildren(dyn,dir);
    mountLabDeploy({container:dyn,template:'dynamic-fee',readConfig(){
      if(field('template')!=='dynamic')throw new Error('Choose Dynamic Fees above to deploy it.');
      return {projectName:field('projectName'),tickSpacing:field('tickSpacing'),initialLpFee:field('initialLpFee'),maxLpFee:field('maxLpFee')};
    }});
    mountLabDeploy({container:dir,template:'directional-fee',readConfig(){
      if(field('template')!=='directional')throw new Error('Choose Directional Fees above to deploy it.');
      return {projectName:field('projectName'),tickSpacing:field('tickSpacing'),initialFee0For1:field('initialFee0For1'),initialFee1For0:field('initialFee1For0'),maxLpFee:field('maxLpFee')};
    }});
    const show=()=>{dyn.hidden=field('template')!=='dynamic';dir.hidden=field('template')!=='directional';};
    form.elements.namedItem('template').addEventListener('change',show);show();
  }
}
