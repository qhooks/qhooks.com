import {bindVolfeeLabPage} from './volfee-lab-page.mjs';
import {mountLabDeploy} from './lab-deploy.mjs';
bindVolfeeLabPage({document,target:window,fetch:window.fetch.bind(window)});
// Public-chain deploy: the same configuration, built for the chosen chain's PoolManager. No owner and no keys.
// The build service validates the request (and, unlike the local draft, accepts native ETH/BNB as token 0).
const host=document.getElementById('lab-deploy-volfee-host');
if(host)mountLabDeploy({container:host,template:'volfee',keyless:true,readConfig(){
  const v=k=>document.getElementById('vf-'+k).value.trim();
  return {projectName:v('projectName'),currency0:v('currency0').toLowerCase(),currency1:v('currency1').toLowerCase(),tickSpacing:v('tickSpacing'),baseFee:v('baseFee'),maxFee:v('maxFee'),feePerTickCentiPips:v('feePerTickCentiPips'),halfLife:v('halfLife')};
}});
