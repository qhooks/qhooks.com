import {bindGraduationPage} from './graduation-page.mjs';
bindGraduationPage({
 loadModules:async()=>{
  const [setup,wallet,signer]=await Promise.all([
   import('/graduation-client/prototypes/pq-graduation/client/graduation-setup.mjs'),
   import('/graduation-client/prototypes/qwallet/client/wallet-session.mjs'),
   import('/graduation-client/prototypes/pq-graduation/client/signer.mjs')
  ]);return {...setup,...wallet,...signer};
 },
 getArtifacts:async()=>{
  const texts=await Promise.all(['ops/q47-normal-artifact.json','ops/q49-launch-token-artifact.json'].map(async p=>{const r=await fetch('/graduation-client/'+p,{cache:'no-store'});if(!r.ok)throw Error('Toolkit unavailable');return r.text();}));
  return {graduationText:texts[0],tokenText:texts[1]};
 }
});
