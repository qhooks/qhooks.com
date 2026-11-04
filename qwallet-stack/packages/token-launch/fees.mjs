// Reuse the accepted chain-specific fee adapters; do not raise their bounds.
import {networkProfile} from '../multichain/profiles.mjs';
import {nextChainFeePolicy,quoteNextChain,recheckNextChain} from '../multichain/fees.mjs';
import {quoteBaseCreation,recheckBaseQuote} from '../../apps/marketplace-preview/mainnet-fees.mjs';
import {formatNative} from '../multichain/fee-math.mjs';
const issued=new WeakMap();
export function tokenFeePolicy(chainId){const p=networkProfile(chainId);return chainId==='8453'?Object.freeze({chainId,hexId:p.hexId,nativeSymbol:p.nativeSymbol,maxGas:7000000n,maxPrice:1000000000n}):nextChainFeePolicy(chainId);}
export async function quoteTokenCreation({chainId,request,owner,data,clock=Date.now}){
 const policy=tokenFeePolicy(chainId),base=chainId==='8453';
 const inner=base?await quoteBaseCreation({request,owner,data,clock}):await quoteNextChain({chainId,request,owner,call:{data,value:'0x0'},clock});
 const result=Object.freeze({...inner,chainId,nativeSymbol:policy.nativeSymbol,maximumFee:base?inner.totalWei:inner.maximumFee,maximumFeeNative:base?formatNative(inner.totalWei):inner.maximumFeeNative,funded:base?true:inner.funded});
 issued.set(result,{chainId,inner});return result;
}
export async function recheckTokenCreation({request,quote,clock=Date.now}){
 const record=issued.get(quote);if(!record)throw new TypeError('Locally issued token quote required');
 if(record.chainId==='8453')await recheckBaseQuote(request,record.inner,clock);else await recheckNextChain({request,quote:record.inner,clock});
 return quote.transaction;
}
