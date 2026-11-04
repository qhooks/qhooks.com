// L129 additive candidate; not the current public entry.
// The public entry point has no dependency-guard override or skip option.
import {createLaunchActionAdmission} from './admission.mjs';
import {createLaunchActionExecution} from './l129-execution-core-r2.mjs';
export async function createConnectedLaunchAction({provider,session,context,policyText,toolkitText,metadataText,tokenFields,fields,signer=null,saved=null,save,onChange,clock}){
 const admission=await createLaunchActionAdmission({context,policyText,toolkitText,metadataText,tokenFields});
 return createLaunchActionExecution({provider,session,context,admission,fields,signer,saved,save,onChange,clock});
}
