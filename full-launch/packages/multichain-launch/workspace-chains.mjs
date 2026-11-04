// Public six-chain dispatcher. The five accepted non-shared-balance paths are
// unchanged; Arc adds a native/USDC combined reserve gate. No service overrides.
import {createLaunchWorkspace as createStandardWorkspace} from './workspace-complete.mjs';
import {createLaunchWorkspaceCore as createArcWorkspace} from './workspace-arc-core.mjs';
import {createLaunchDependencies} from './dependencies.mjs';
import {createTokenDeployment} from '../token-launch/deployment.mjs';
import {createLaunchDeployment} from './deployment.mjs';
import {createConnectedLaunchAction} from './actions/connected.mjs';
export async function createLaunchWorkspace({provider,session,chainId,owner,fields,publicKey,signer=null,saved=null,save,onChange,clock,toolkitText,metadataText,tokenText,policyText}){
 const options={provider,session,chainId,owner,fields,publicKey,signer,saved,save,onChange,clock,toolkitText,metadataText,tokenText};
 if(chainId!=='5042')return createStandardWorkspace({...options,policyText});
 const services={dependencies:id=>createLaunchDependencies({chainId:id,policyText}),token:createTokenDeployment,deployment:createLaunchDeployment,action:args=>createConnectedLaunchAction({...args,policyText})};
 return createArcWorkspace({...options,services});
}
