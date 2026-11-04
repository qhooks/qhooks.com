// Six-chain adapter over unchanged accepted fee boundaries.
import {tokenFeePolicy,quoteTokenCreation,recheckTokenCreation} from '../token-launch/fees.mjs';
import {quoteNextChain,recheckNextChain} from '../multichain/fees.mjs';
import {quoteNativeCall,recheckNativeCall} from '../../prototypes/mainnet-account/native-call-fees.mjs';
import {formatNative} from '../multichain/fee-math.mjs';
const calls=new WeakMap();
export const walletFeePolicy=tokenFeePolicy;
export async function quoteWalletCreation({chainId,request,owner,call,clock=Date.now}){
 if(!call||Object.getPrototypeOf(call)!==Object.prototype)throw new TypeError('Creation call required');
 const d=Object.getOwnPropertyDescriptors(call),keys=Reflect.ownKeys(d);
 if(keys.length!==2||!keys.every(k=>['data','value'].includes(k)&&d[k].enumerable&&Object.hasOwn(d[k],'value'))||d.value.value!=='0x0')throw new TypeError('Exact zero-value creation required');
 return quoteTokenCreation({chainId,request,owner,data:d.data.value,clock});
}
export const recheckWalletCreation=recheckTokenCreation;
export async function quoteWalletCall({chainId,request,owner,call,clock=Date.now}){
 const p=walletFeePolicy(chainId),base=chainId==='8453';
 const inner=base?await quoteNativeCall({request,owner,call,clock}):await quoteNextChain({chainId,request,owner,call,clock});
 const quote=Object.freeze({...inner,chainId,nativeSymbol:p.nativeSymbol,maximumFee:base?inner.totalWei:inner.maximumFee,maximumFeeNative:base?formatNative(inner.totalWei):inner.maximumFeeNative,funded:base?true:inner.funded});
 calls.set(quote,{chainId,inner});return quote;
}
export async function recheckWalletCall({request,quote,clock=Date.now}){
 const record=calls.get(quote);if(!record)throw new TypeError('Locally issued wallet call quote required');
 if(record.chainId==='8453')await recheckNativeCall(request,record.inner,clock);else await recheckNextChain({request,quote:record.inner,clock});
 return quote.transaction;
}
