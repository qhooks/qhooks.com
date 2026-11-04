// Production-shaped boundary; no service overrides or arbitrary call targets.
// Not exported to the public site before isolated swap/periphery acceptance.
import {createLaunchActionContext} from '../multichain-launch/actions/context.mjs';
import {createSwapMarket} from './market-chains.mjs';
import {createSwapExecutionCore} from './execution-core.mjs';

export async function createConnectedSwap({provider,session,launch,policyText,toolkitText,metadataText,tokenFields,fields,saved=null,save,onChange=()=>{},clock=Date.now}){
 const context=await createLaunchActionContext({...launch,toolkitText,metadataText});
 const market=await createSwapMarket({context,policyText,toolkitText,metadataText,tokenFields,clock});
 return createSwapExecutionCore({provider,session,market,fields,saved,save,onChange,clock});
}
