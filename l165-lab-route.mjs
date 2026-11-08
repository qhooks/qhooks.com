// Public routing only. Existing family eligibility and chain validation remain authoritative.
import {labExportRoute as legacyRoute,graduationFamilyId} from './l141-lab-export-route.mjs';
export {admittedFamilyIds,launchProfiles,selectedLaunchChain} from './l141-lab-export-route.mjs';

export function labExportRoute(familyId,chainId){
 const route=legacyRoute(familyId,chainId);
 if(familyId!==graduationFamilyId)return route;
 return Object.freeze({...route,builderHref:'/qtoken-studio?chain='+encodeURIComponent(route.chainId),notice:'Configure your '+route.chainName+' token and pool rules, then continue through key backup and launch review in the same Studio.'});
}
