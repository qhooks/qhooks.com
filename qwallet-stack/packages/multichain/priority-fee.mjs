// Read-only compatibility for wallets that do not expose the priority-fee RPC.
// No changed caps, remote-provider fallback, wallet permission, signing or sends.
import {feeHistoryTip} from './fee-history-tip.mjs';
const quantity=value=>typeof value==='string'&&value.length<=66&&value.match(/^0x(?:0|[1-9a-f][0-9a-f]*)$/)?.[0]===value;
const data=(o,key)=>o&&typeof o==='object'?Object.getOwnPropertyDescriptor(o,key)?.value:undefined;
function unsupported(error){
 const code=data(error,'code');
 if([-32601,-32004,4200].includes(code))return true;
 // MetaMask can preserve the RPC error inside an internal-error envelope.
 const original=data(data(error,'data'),'originalError');
 return code===-32603&&[-32601,-32004,4200].includes(data(original,'code'));
}
// Base (0x2105): wallets that suggest a ~1 gwei tip pushed launch steps past the flows' 1 gwei max fee. Base's
// usual tip is ~0.001 gwei, so the tip the flows request on Base is lowered to at most 0.1 gwei (never raised).
// Other chains are unchanged.
const BASE_TIP_CAP=100000000n;
export async function readPriorityFee(request){
 const tip=await readPriorityFeeRaw(request);
 if(BigInt(tip)<=BASE_TIP_CAP)return tip;
 const chain=await request('eth_chainId',[]);
 return chain==='0x2105'?'0x'+BASE_TIP_CAP.toString(16):tip;
}
async function readPriorityFeeRaw(request){
 if(typeof request!=='function')throw TypeError('Fee request function required');
 let direct;
 try{direct=await request('eth_maxPriorityFeePerGas',[]);}
 catch(error){
  if(!unsupported(error))throw error;
  const chain=await request('eth_chainId',[]);
  if(!quantity(chain)||chain==='0x0')throw TypeError('Invalid fee-observation chain');
  const newest=await request('eth_blockNumber',[]);
  if(!quantity(newest))throw TypeError('Invalid fee-history block');
  const history=await request('eth_feeHistory',['0x5',newest,[50]]);
  const tip=feeHistoryTip(history,newest);
  if(await request('eth_chainId',[])!==chain)throw Error('Wallet network changed during fee review');
  return tip;
 }
 if(!quantity(direct))throw TypeError('Invalid priority-fee observation');
 return direct;
}
