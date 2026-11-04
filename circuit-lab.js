import {bindCircuitLabPage} from './circuit-lab-page.mjs';
import {mountLabDeploy} from './lab-deploy.mjs';
bindCircuitLabPage({document,target:window,fetch:window.fetch.bind(window)});
// Public-chain deploy: the same settings on a real chain's PoolManager, governed by the owner wallet and an SLH-DSA key.
const host=document.getElementById('lab-deploy-circuit-host');
if(host)mountLabDeploy({container:host,template:'circuit',readConfig(){
  const v=k=>document.getElementById('cr-'+k).value.trim();
  return {projectName:v('projectName'),poolFee:v('poolFee'),tickSpacing:v('tickSpacing'),cooldownSeconds:v('cooldownSeconds'),initialThreshold0For1:v('initialThreshold0For1'),initialThreshold1For0:v('initialThreshold1For0')};
}});
