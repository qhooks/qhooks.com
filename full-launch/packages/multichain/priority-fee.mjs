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
export async function readPriorityFee(request){
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
