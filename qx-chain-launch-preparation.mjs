import {reviewChainLaunchPackage} from './qx-chain-launch-packages.mjs';
import {CHAIN_LAUNCH_SOURCE_BUILDS} from './qx-chain-launch-builds.mjs';
import {encode,keccak} from './lab-deploy-core.mjs';
const freeze=o=>{if(o&&typeof o==='object'){Object.values(o).forEach(freeze);Object.freeze(o);}return o;};
// Source-bound initialization bytes for review/export only. No registry admission,
// deterministic address, token allowance, signer, provider or send entry point.
export function prepareChainLaunchSourcePackage(value,options){
 const review=reviewChainLaunchPackage(value,options),contracts=review.proposals.map(({id,part,proposal})=>{
  const name=part==='revenue'?'QDecreaseOnlyQuoteFeeHook':proposal.source.contractName,build=CHAIN_LAUNCH_SOURCE_BUILDS.contracts[name];
  const constructorData=part==='revenue'?proposal.constructorData:'0x'+encode(proposal.constructor.inputs[0].components.map(c=>c.type),proposal.constructor.inputs[0].components.map(c=>proposal.configuration[c.name]));
  const initcode=build.creationBytecode+constructorData.slice(2),initcodeBytes=(initcode.length-2)/2;if(initcodeBytes>49152)throw Error('Prepared initialization exceeds the EVM creation limit.');
  return{id,part,contractName:name,source:build.source,sourceSha256:build.sourceSha256,sourceClosureSha256:build.sourceClosureSha256,receiptSha256:build.receiptSha256,compiler:build.compiler,abi:build.abi,constructorData,initcode,initcodeHash:keccak(initcode),initcodeBytes,runtimeBytes:build.runtimeBytes,createsFeeFundedBidwall:part==='revenue',hookFlags:part==='revenue'?'204':null,target:null,executionEnabled:false};
 });
 return freeze({kind:'qhooks-chain-launch-source-preparation',schemaVersion:1,review,contracts,issues:review.issues,poolTransitionAutomatic:false,executionEnabled:false,requiredNextChecks:['Qualify exact chain, plain ERC20 assets, manager and authorization controller','Bind original source, full dependency closure and initialized runtime','Simulate funding, claims and complete pool transition at current chain state','Preserve QHooks second-key policy wherever creator authority applies']});
}
