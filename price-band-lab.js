import {bindPriceBandLabPage} from './price-band-lab-page.mjs';
import {mountLabDeploy} from './lab-deploy.mjs';
bindPriceBandLabPage({document,target:window,fetch:window.fetch.bind(window)});
// Public-chain deploy: the same settings on a real chain's PoolManager, governed by the owner wallet and an SLH-DSA key.
const host=document.getElementById('lab-deploy-price-band-host');
if(host)mountLabDeploy({container:host,template:'price-band',readConfig(){
  const v=k=>document.getElementById('pb-'+k).value.trim();
  return {projectName:v('projectName'),poolFee:v('poolFee'),tickSpacing:v('tickSpacing'),minSqrtPriceX96:v('minSqrtPriceX96'),maxSqrtPriceX96:v('maxSqrtPriceX96')};
}});
