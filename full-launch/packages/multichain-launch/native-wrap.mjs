// No caller-supplied route, target or dependency override on the public entry.
import {createLaunchDependencies} from './dependencies.mjs';
import {createNativeWrapCore} from './wrap-core.mjs';
export async function createNativeWrap({provider,session,chainId,amount,saved=null,save,onChange,clock,policyText}){
 const dependencies=await createLaunchDependencies({chainId,policyText});
 return createNativeWrapCore({provider,session,chainId,dependencies,amount,saved,save,onChange,clock});
}
