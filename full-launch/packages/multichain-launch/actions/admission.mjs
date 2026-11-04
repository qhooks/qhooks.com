// Public production boundary: fixed official manager/quote identities and exact
// QLaunchToken runtime/metadata. A successful read is not a security audit.
import {requireLaunchActionContext} from './context.mjs';
import {createLaunchDependencies} from '../dependencies.mjs';
import {createLaunchRuntime} from '../runtime.mjs';
import {normalizeTokenFields} from '../../token-launch/token-fields.mjs';
import {tokenViewExpectations,ensure,freeze} from '../../token-launch/artifact.mjs';
export async function createLaunchActionAdmission({context,policyText,toolkitText,metadataText,tokenFields}){
 const {plan}=requireLaunchActionContext(context),fields=normalizeTokenFields(tokenFields);
 const deps=await createLaunchDependencies({chainId:plan.chainId,policyText,quote:plan.graph.quote});
 ensure(plan.graph.manager===deps.profile.contracts.PoolManager.address&&plan.graph.quote===deps.profile.quote.address,'Launch must use the admitted chain manager and quote');
 const assets=[plan.constructor.currency0,plan.constructor.currency1],token=assets.find(a=>a!==plan.graph.quote);ensure(assets.includes(plan.graph.quote)&&token,'Launch token/quote pair required');
 const runtime=await createLaunchRuntime({toolkitText,metadataText}),word=n=>'0x'+BigInt(n).toString(16).padStart(64,'0');
 const expected=runtime.expected('token',{decimals:word(fields.decimals),totalSupply:word(fields.totalSupply)});
 return Object.freeze({async verify({request,live}){
  const observation=await deps.verify({request,live}),tag=observation.blockNumber;
  const rpc=async(method,params)=>{await live();const result=await request(method,params);await live();return result;};
  ensure(await rpc('eth_getCode',[token,tag])===expected,'Launch token runtime changed');
  for(const[data,value]of Object.entries(tokenViewExpectations(fields)))ensure(await rpc('eth_call',[{to:token,data},tag])===value,'Launch token metadata/supply changed');
  const block=await rpc('eth_getBlockByNumber',[tag,false]);ensure(block?.number===tag&&block?.hash===observation.blockHash,'Admission observation reorganized');
  return freeze({...observation,token,tokenFields:fields});
 }});
}
