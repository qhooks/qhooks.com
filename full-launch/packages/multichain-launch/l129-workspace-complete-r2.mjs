// L129 additive candidate; not the current public entry.
// Public live-page entry. Production dependencies and services remain fixed.
import {createLaunchWorkspaceCore} from './l129-workspace-complete-core-r2.mjs';
import {createLaunchDependencies} from './dependencies.mjs';
import {selectedPair} from './stock-pairs.mjs';
import {createTokenDeployment} from '../token-launch/deployment.mjs';
import {createLaunchDeployment} from './deployment.mjs';
import {createConnectedLaunchAction} from './actions/l129-connected-r2.mjs';
export async function createLaunchWorkspace({provider,session,chainId,owner,fields,publicKey,signer=null,saved=null,save,onChange,clock,toolkitText,metadataText,tokenText,policyText}){
 const services={dependencies:id=>createLaunchDependencies({chainId:id,policyText,quote:selectedPair(id)}),token:createTokenDeployment,deployment:createLaunchDeployment,action:args=>createConnectedLaunchAction({...args,policyText})};
 return createLaunchWorkspaceCore({provider,session,chainId,owner,fields,publicKey,signer,saved,save,onChange,clock,toolkitText,metadataText,tokenText,services});
}
