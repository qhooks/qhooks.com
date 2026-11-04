import {bindVolumeEpochLabPage} from './volume-epoch-lab-page.mjs';
import {mountLabDeploy} from './lab-deploy.mjs';
bindVolumeEpochLabPage({document,target:window,fetch:window.fetch.bind(window)});
// Public-chain deploy: the same settings on a real chain's PoolManager, governed by the owner wallet and an SLH-DSA key.
const host=document.getElementById('lab-deploy-volume-epoch-host');
if(host)mountLabDeploy({container:host,template:'volume-epoch',readConfig(){
  const v=k=>document.getElementById('ve-'+k).value.trim();
  return {projectName:v('projectName'),poolFee:v('poolFee'),tickSpacing:v('tickSpacing'),epochSeconds:v('epochSeconds'),initialStartsAt:v('initialStartsAt'),initialEndsAt:v('initialEndsAt'),initialCap0For1:v('initialCap0For1'),initialCap1For0:v('initialCap1For0')};
}});
