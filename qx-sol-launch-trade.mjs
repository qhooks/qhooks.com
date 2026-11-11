// Direct DBC fallback when Jupiter cannot route a newly opened curve. No wallet library.
import {SOL_LAUNCH_CONFIG as C} from './qx-sol-launch-config.mjs';
import {solApi,solRuntime,prepareSolTransaction,sendPreparedSol} from './qx-sol-launch-client.mjs';
import {solAddress} from './qx-solana.mjs';
export async function directDbcOrder({input,output,amount,taker,slippageBps}){
 const buy=input===C.quoteMint,mint=buy?output:input;
 if((buy?input:output)!==C.quoteMint||taker!==solAddress()||!/^\d+$/.test(String(amount))||BigInt(amount)<=0n||!Number.isInteger(slippageBps)||slippageBps<1||slippageBps>5000)throw Error('A direct bonding-curve trade uses SOL and your connected wallet.');
 const [status,cfg,r]=await Promise.all([solApi('token/'+mint),solApi('config'),solRuntime()]);
 if(!cfg.ready||status.config!==cfg.config||status.graduated)throw Error('No direct DBC route for this trade. Retry Jupiter after graduation.');
 const pool=new r.PublicKey(status.pool),virtualPool=await r.client.state.getPool(pool),config=await r.client.state.getPoolConfig(new r.PublicKey(cfg.config));
 if(!virtualPool||virtualPool.poolState.config.toBase58()!==cfg.config||virtualPool.poolState.baseMint.toBase58()!==mint)throw Error('Pool config mismatch.');
 const slot=await r.connection.getSlot('confirmed'),time=await r.connection.getBlockTime(slot);if(!Number.isSafeInteger(time))throw Error('Chain time is unavailable. Refresh the quote.');
 const quote=r.client.pool.swapQuote({virtualPool,config,amountIn:new r.BN(String(amount)),swapBaseForQuote:!buy,slippageBps,hasReferral:false,eligibleForFirstSwapWithMinFee:false,currentPoint:new r.BN(time)});
 if(!quote.minimumAmountOut||quote.minimumAmountOut.isZero())throw Error('Trade is too small or the curve has reached graduation.');
 const tx=await r.client.pool.swap({owner:new r.PublicKey(taker),pool,swapBaseForQuote:!buy,amountIn:new r.BN(String(amount)),minimumAmountOut:quote.minimumAmountOut,referralTokenAccount:null});
 const prepared=await prepareSolTransaction(r,tx,[],taker);
 return {route:'dbc',runtime:r,prepared,mint,trader:taker,transaction:prepared.serialized,outAmount:quote.outputAmount.toString(),minOut:quote.minimumAmountOut.toString(),priceImpact:null};
}
export async function executeDirectDbc(order){const sent=await sendPreparedSol(order.runtime,order.prepared);await sent.confirm();await solApi('rewards',{signature:sent.signature,mint:order.mint,trader:order.trader}).catch(()=>{});return {status:'Success',signature:sent.signature};}
