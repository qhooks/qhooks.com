// Lead-owned outer public schema; imported confirmations are never authority.
import {assertGraduationSetupStage} from './graduation-setup-stage.mjs';
import {makeGraduationSetupProfile,setupIds,ownFields,ensure,freeze} from './graduation-setup-plan.mjs';
export function parseGraduationSetupJournal(text){
 ensure(typeof text==='string'&&text.length>0&&text.length<=500000,'Public setup journal text');
 const root=ownFields(JSON.parse(text),['schemaVersion','kind','profile','stages']);
 ensure(root.schemaVersion===1&&root.kind==='qhooks-graduation-setup-journal','Setup journal kind');
 const profile=makeGraduationSetupProfile(root.profile),s=root.stages;
 ensure(s&&typeof s==='object'&&!Array.isArray(s)&&Object.getPrototypeOf(s)===Object.prototype,'Stage object');
 ensure(Object.keys(s).every(id=>setupIds.includes(id)),'Unknown stage');
 let ended=false,tail=false;const stages={};
 for(const id of setupIds){
  if(!Object.hasOwn(s,id)){ended=true;continue;}
  ensure(!ended&&!tail,'Journal stages must be an ordered prefix');
  stages[id]=assertGraduationSetupStage(s[id],profile.owner);
  tail=!['submitted','confirmed','reverted'].includes(s[id].status);
 }
 return freeze({...root,profile,stages});
}
