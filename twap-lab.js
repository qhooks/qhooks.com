import {bindTwapLabPage} from './twap-lab-page.mjs';
import {mountLabDeploy} from './lab-deploy.mjs';
bindTwapLabPage({document,target:window,fetch:window.fetch.bind(window)});
// Public-chain deploy: the same configuration, built for the chosen chain's PoolManager. No owner and no keys.
const host=document.getElementById('lab-deploy-twap-host');
// The build service validates the request (and, unlike the local draft, accepts native ETH/BNB as token 0).
if(host)mountLabDeploy({container:host,template:'twap',keyless:true,readConfig(){
  const v=k=>document.getElementById('tw-'+k).value.trim();
  return {projectName:v('projectName'),currency0:v('currency0').toLowerCase(),currency1:v('currency1').toLowerCase(),poolFee:v('poolFee'),tickSpacing:v('tickSpacing'),maxTickMove:v('maxTickMove'),cardinality:v('cardinality')};
}});
