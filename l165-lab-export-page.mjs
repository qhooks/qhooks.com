import {admittedFamilyIds,labExportRoute,launchProfiles,selectedLaunchChain} from './l165-lab-route.mjs';
import {hookIntegration} from './l125-hook-integrations.mjs';

export function bindLabExportPage({document:d=document,target=window}={}){
 const $=id=>d.getElementById(id),family=$('l141-family'),chain=$('l141-chain'),summary=$('l141-summary'),primary=$('l141-primary'),download=$('l141-download');
 if(!family||!chain||!summary||!primary||!download)throw new TypeError('Missing L141 Lab export controls');
 for(const id of admittedFamilyIds){const model=hookIntegration(id),option=d.createElement('option');option.value=id;option.textContent=model.name;family.append(option);}
 for(const profile of launchProfiles){const option=d.createElement('option');option.value=profile.id;option.textContent=profile.name+' · '+profile.nativeSymbol+' gas';chain.append(option);}
 try{chain.value=selectedLaunchChain(target.location?.search||'');}catch(error){
  family.disabled=true;chain.disabled=true;primary.removeAttribute?.('href');download.removeAttribute?.('href');primary.textContent='Invalid launch selection';download.textContent='No export available';summary.replaceChildren();const message=d.createElement('p');message.textContent=error.message+'; return through the Lab and choose one supported chain.';summary.append(message);summary.dataset.mode='blocked';
  return Object.freeze({blocked:true,dispose(){},route:()=>null});
 }
 function render(){
  const model=hookIntegration(family.value),route=labExportRoute(family.value,chain.value);
  chain.disabled=!route.launchEnabled;
  primary.href=route.builderHref;primary.textContent=route.launchEnabled?'Configure '+route.chainName+' qToken':'Open local source builder';
  download.href=route.downloadHref;download.download='';
  summary.replaceChildren();const title=d.createElement('strong'),text=d.createElement('p'),state=d.createElement('p');
  title.textContent=model.name+' · '+route.profile;text.textContent=route.notice;state.textContent=route.launchEnabled?'Token, pool rules, key backup and launch review in one Studio.':'Local source kit.';
  summary.append(title,text,state);summary.dataset.mode=route.kind;
 }
 family.addEventListener('change',render);chain.addEventListener('change',render);render();
 return Object.freeze({dispose(){family.removeEventListener('change',render);chain.removeEventListener('change',render);},route:()=>labExportRoute(family.value,chain.value)});
}
