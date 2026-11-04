// Lead-owned packaging boundary. Metadata and files only, never transaction execution.
import {describeConstructor} from './integration-constructor.mjs';
import {renderIntegrationGuide} from './integration-guide.mjs';
const profiles = Object.freeze({
  'qdynamic-fee-pq-governance': ['ConfiguredFeeController','GovernedDynamicFeeHook',4096,65],
  'qdirectional-fees-pq-schedules': ['ConfiguredFeeController','GovernedDirectionalFeeHook',128,65],
  'qprice-band-pq-governance': ['ConfiguredPriceBandController','GovernedPriceBandHook',4160,64],
  'qvolume-epochs-pq-renewal': ['ConfiguredVolumeEpochController','GovernedVolumeEpochHook',4160,64],
  'qcircuit-recovery-pq-resume': ['ConfiguredCircuitRecoveryController','GovernedCircuitRecoveryHook',4288,64]
});
const names = ['helper_','manager_','owner_','policyHash_','authEpoch_','rawPublicKey_','currency0_','currency1_','hookSalt_'];
const types = ['address','address','address','bytes32','uint64','bytes','address','address','bytes32'];
const requireValue = condition => {if(!condition)throw new TypeError('Unsupported integration build');};
const digest = value => typeof value==='string' && /^[a-f0-9]{64}$/.test(value);
export function buildIntegrationKit(artifact) {
  const config=artifact?.configuration, integration=artifact?.integration;
  const expected=config && Object.hasOwn(profiles,config.templateId) ? profiles[config.templateId] : null;
  requireValue(artifact?.schemaVersion===1 && artifact.kind==='qhooks-compiled-project' && artifact.compiled===true && artifact.deployed===false);
  requireValue(expected && config.chainId==='31337' && config.profile==='ML-DSA-65' && typeof config.projectName==='string' && config.projectName.length>0 && config.projectName.length<=64);
  requireValue(digest(artifact.projectInputSha256) && digest(artifact.sourceInputSha256));
  requireValue(artifact.sourceCount===expected[3] && artifact.contracts?.controller?.name===expected[0] && artifact.contracts?.hook?.name===expected[1]);
  requireValue(integration?.profile==='ML-DSA-65' && integration.hookPermissionFlags===expected[2] && integration.requiresPermissionSalt===true);
  requireValue(integration.configurationEvmTested===false && integration.deploymentEnabled===false && integration.transactionSubmissionEnabled===false);
  const constructor=describeConstructor(artifact.contracts.controller);
  requireValue(constructor.stateMutability==='nonpayable' && constructor.inputs.length===names.length);
  requireValue(constructor.inputs.every((input,index)=>input.name===names[index] && input.type===types[index]));
  requireValue(typeof artifact.contracts.controller.bytecode==='string' && /^0x(?:[a-fA-F0-9]{2})+$/.test(artifact.contracts.controller.bytecode));
  const manifest=Object.freeze({
    schemaVersion:1, kind:'qhooks-integration-kit', templateId:config.templateId,
    projectName:config.projectName, chainId:config.chainId, profile:config.profile,
    projectInputSha256:artifact.projectInputSha256, sourceInputSha256:artifact.sourceInputSha256,
    constructor, hookPermissionFlags:expected[2], deployed:false, transactionSubmissionEnabled:false
  });
  const publicInputs={...constructor,encoding:'ABI constructor order',values:constructor.inputs.map(input=>({...input,value:null,status:'supply-public-value'}))};
  const files=Object.freeze({
    'README.md':renderIntegrationGuide(manifest),
    'constructor.json':JSON.stringify(publicInputs,null,2)+'\n',
    'configuration.json':JSON.stringify(config,null,2)+'\n',
    'build.json':JSON.stringify(artifact,null,2)+'\n'
  });
  return Object.freeze({...manifest,files});
}
