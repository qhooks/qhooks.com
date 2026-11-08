// Display/default/navigation checks only. Transaction preflight stays in the runner.
import {chainById} from './chains.mjs';
import {human,units} from './qx-create-plan.mjs';

export const defaultStartingLiquidity=chainId=>chainById(chainId).quote.wrapNative?'0.02':'50';
// Planning floors until a network estimate is available: 0.0005 ETH on L2s,
// 0.01 ETH on L1, 0.005 BNB, 0.01 HYPE and 1 native USDC on Arc.
// Reserve the larger of this floor and the existing costSummary network estimate.
export function liquidityGasReserve(chainId,cost=null){
 const chain=chainById(chainId),floor=units(chain.id==='1'?'0.01':({ETH:'0.0005',BNB:'0.005',HYPE:'0.01',USDC:'1'}[chain.native]||'0.01'));
 const estimate=cost?.networkGasWei==null?0n:BigInt(cost.networkGasWei);
 return estimate>floor?estimate:floor;
}
export function roundLiquidityDown(raw){
 const amount=BigInt(raw);if(amount<=0n)return 0n;
 const step=10n**BigInt(Math.max(0,amount.toString().length-2));return amount/step*step;
}
export function liquidityDraftState(config,saved=null){
 const defaultValue=typeof saved?.defaultValue==='string'?saved.defaultValue:defaultStartingLiquidity(config.chainId);
 return {userEdited:saved?.userEdited===true||config.liquidity!==defaultValue,defaultValue};
}
export function liquidityChainHandoff(config,chainId,saved=null){
 const state=liquidityDraftState(config,saved);if(config.chainId===chainId)return {liquidity:config.liquidity,liquidityState:state};
 const defaultValue=defaultStartingLiquidity(chainId),reset=config.liquidity===state.defaultValue;
 return {liquidity:reset?defaultValue:config.liquidity,liquidityState:{userEdited:!reset,defaultValue}};
}
const balance=value=>value===null||value===undefined?null:BigInt(value);
// Display only: round DOWN to 6 decimals so a balance is never overstated.
const show=(raw,decimals=18)=>{const v=BigInt(raw),step=decimals>6?10n**BigInt(decimals-6):1n;return human(v/step*step,decimals);};
export function liquidityAffordability(config,{nativeBalance=null,quoteBalance=null,cost=null}={}){
 const chain=chainById(config.chainId),native=balance(nativeBalance),quote=balance(quoteBalance);
 if(native===null||quote===null||native<0n||quote<0n)return {known:false,blocked:false,suggestion:null,message:'Connect a wallet to check your balance.'};
 const gas=liquidityGasReserve(config.chainId,cost),overhead=BigInt(chain.launchFeeWei)+gas;
 let available=quote;
 if(chain.quote.wrapNative)available=native<overhead?0n:native+quote-overhead;
 if(chain.family==='arc')available=native>overhead?(native-overhead)/10n**BigInt(18-chain.quote.decimals):0n;
 const suggested=roundLiquidityDown((available>0n?available:0n)*4n/5n),cap=units(defaultStartingLiquidity(config.chainId),chain.quote.decimals);
 const suggestion=human(suggested>cap?cap:suggested,chain.quote.decimals);
 let needed;try{needed=units(config.liquidity,chain.quote.decimals);}catch{return {known:true,blocked:true,suggestion,message:'Enter a plain starting liquidity amount with at most '+chain.quote.decimals+' decimals.'};}
 const shortfall=needed>quote?needed-quote:0n;
 const nativeLiquidity=chain.family==='arc'?units(config.liquidity,18):chain.quote.wrapNative?shortfall:0n;
 const requiredNative=overhead+nativeLiquidity;
 let message;
 if(native<requiredNative)message='Not enough '+chain.native+': you have '+show(native)+'. Keep at least '+human(requiredNative)+' for this launch (fee, gas and a small gas reserve'+(nativeLiquidity>0n?', plus liquidity':'')+'). Lower the starting liquidity or add '+chain.native+'.';
 else if(!chain.quote.wrapNative&&quote<needed)message='Not enough '+chain.quote.symbol+': you have '+human(quote,chain.quote.decimals)+', this needs '+config.liquidity+'. Lower the starting liquidity or add '+chain.quote.symbol+'.';

 // One source with the review: the needed figure is launch fee + the same network gas estimate (cost.networkGasWei).
 // The gas floor stays the affordability rule and is shown separately as the amount to keep on hand.
 else{const estGas=cost?.networkGasWei==null?null:BigInt(cost.networkGasWei),shown=estGas===null?requiredNative:BigInt(chain.launchFeeWei)+estGas+nativeLiquidity;
  message='You have '+show(native)+' '+chain.native+' on '+chain.name+'. '+(estGas===null?'Checking network gas. Keep at least '+human(requiredNative)+' '+chain.native:'This launch needs about '+human(shown)+' '+chain.native)+(chain.quote.wrapNative||chain.family==='arc'?' (liquidity + fee + gas).':' (fee + gas), plus '+config.liquidity+' '+chain.quote.symbol+' for liquidity. You have '+human(quote,chain.quote.decimals)+' '+chain.quote.symbol+'.');
  if(estGas!==null&&requiredNative>shown)message+=' Keep at least '+human(requiredNative)+' '+chain.native+' so a gas spike can\u2019t stop a step.';}
 if(chain.quote.wrapNative&&quote>0n)message+=' You also have '+human(quote,chain.quote.decimals)+' '+chain.quote.symbol+' for liquidity.';
 if(needed===0n&&native>=requiredNative)message+=' Enter starting liquidity greater than 0.';
 return {known:true,blocked:needed===0n||native<requiredNative||!chain.quote.wrapNative&&quote<needed,suggestion,message,requiredNative:requiredNative.toString(),gasReserveWei:gas.toString()};
}

// Reuse the page's configured RPC transport, including its selected launch chain.
export async function readLiquidityBalances(chainId,owner,rpcRead){
 const chain=chainById(chainId),data='0x70a08231'+owner.slice(2).padStart(64,'0');
 const [native,quote]=await Promise.all([rpcRead('eth_getBalance',[owner,'latest'],chainId),rpcRead('eth_call',[{to:chain.quote.address,data},'latest'],chainId)]);
 if(native==null||quote==null)throw Error('Balance unavailable.');
 return {nativeBalance:BigInt(native).toString(),quoteBalance:BigInt(quote).toString()};
}
