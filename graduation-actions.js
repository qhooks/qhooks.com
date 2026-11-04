import {bindGraduationActionsPage} from './graduation-actions-page.mjs';
bindGraduationActionsPage({
 loadModules:async()=>{
  const modules=await Promise.all([
   import('/graduation-client/prototypes/qwallet/client/wallet-session.mjs'),
   import('/graduation-client/prototypes/pq-graduation/client/signer.mjs'),
   import('/graduation-client/prototypes/pq-graduation/client/graduation-setup.mjs'),
   import('/graduation-client/prototypes/pq-graduation/client/graduation-setup-plan.mjs'),
   import('/graduation-client/prototypes/pq-graduation/client/graduation-descriptor.mjs'),
   import('/graduation-client/prototypes/pq-graduation/client/graduation-state.mjs'),
   import('/graduation-client/prototypes/pq-graduation/client/graduation-execution.mjs')
  ]);return Object.assign({},...modules);
 },
 getArtifacts:async()=>{
  const texts=await Promise.all(['ops/q47-normal-artifact.json','ops/q49-launch-token-artifact.json'].map(async p=>{const r=await fetch('/graduation-client/'+p,{cache:'no-store'});if(!r.ok)throw Error('Toolkit unavailable');return r.text();}));
  return {graduationText:texts[0],tokenText:texts[1]};
 }
});
