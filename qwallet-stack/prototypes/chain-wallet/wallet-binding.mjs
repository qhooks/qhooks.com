// Asset policy is bound to exact deployment receipts and full fixed contract runtime.
import {readMainnetToolkit,TOOLKIT_SHA} from '../../apps/marketplace-preview/mainnet-deploy.mjs';
import {ensure,address,bytes} from '../../apps/marketplace-preview/mainnet-fees.mjs';
import {createWalletDeployment} from '../../packages/chain-wallet/deployment.mjs';
import {walletFeePolicy} from '../../packages/chain-wallet/fees.mjs';
import {normalizeWalletAssets} from '../../packages/chain-wallet/wallet-assets.mjs';
import {encodePoolConstructor} from '../qpools/client/pool-constructor.mjs';
import {requireRpcChain} from '../../packages/multichain/profiles.mjs';
const bindings=new WeakSet();
export function assertWalletBinding(binding){ensure(bindings.has(binding),'Reconcile the exact wallet asset deployment first');return binding;}
export async function bindWalletPool({chainId,provider,owner,tokens,toolkitText,deploymentText,live}){
 walletFeePolicy(chainId);const assets=normalizeWalletAssets(chainId,tokens);
 ensure(typeof deploymentText==='string'&&typeof live==='function','Wallet deployment progress and live connection required');await live();
 const toolkit=await readMainnetToolkit(toolkitText);await live();
 const setup=await createWalletDeployment({chainId,provider,owner,tokens:assets,toolkitText,saved:deploymentText,save:async()=>{}});
 try{
  const result=await setup.reconcile();await live();ensure(result.status==='complete'&&address(result.pool)&&address(result.verifier),'Confirm the selected-chain wallet deployments');
  const data=toolkit.contracts.pool.bytecode+encodePoolConstructor(result.verifier,assets).slice(2);
  const poolCode=await provider.request({method:'eth_call',params:[{from:owner,data,gas:'0x6acfc0'},'latest']});await live();
  ensure(bytes(poolCode)&&poolCode.length===toolkit.contracts.pool.runtimeBytes*2+2,'Fixed wallet pool runtime required');
  const assetCodes={};for(const t of assets){const code=await provider.request({method:'eth_getCode',params:[t,'latest']});await live();ensure(bytes(code)&&code.length<=49154,'Supported token runtime required');assetCodes[t]=code;}
  const binding=Object.freeze({owner,chainId,tokens:assets,assetCodes:Object.freeze(assetCodes),pool:result.pool,verifier:result.verifier,poolCode,verifierCode:toolkit.contracts.verifier.deployedBytecode,artifactSha256:TOOLKIT_SHA});
  await checkWalletRuntime(provider,binding,live);bindings.add(binding);return binding;
 }finally{setup.dispose();}
}
export async function checkWalletRuntime(provider,binding,live,block='latest'){
 requireRpcChain(binding.chainId,await provider.request({method:'eth_chainId'}));await live();
 for(const[target,expected]of [[binding.pool,binding.poolCode],[binding.verifier,binding.verifierCode],...Object.entries(binding.assetCodes)]){
  ensure(await provider.request({method:'eth_getCode',params:[target,block]})===expected,'Wallet or supported asset runtime changed');await live();
 }
}
